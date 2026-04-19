import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  ProjectsService,
  type AuditLogPublic,
  type ProjectMemberWithUserPublic,
  type TaskCommentPublic,
  type TaskProgressReportPublic,
  type TaskProofPublic,
  type TaskPublic,
  TasksService,
} from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { getAccessToken } from "@/modules/auth/tokenStore"
import { uploadTaskProgressPhoto } from "@/modules/tasks/taskProgressApi"
import { buildTaskWsUrl } from "@/modules/tasks/taskWs"
import { handleError } from "@/utils"
import { resolveBackendMediaUrl } from "@/utils/mediaUrl"

export const Route = createFileRoute("/_layout/tasks/$taskId")({
  component: TaskDetailPage,
})

/**
 * Parses worker input for reported percent; returns null if not an integer from 1 to 100.
 */
function parseProgressPercent(raw: string): number | null {
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n < 1 || n > 100) {
    return null
  }
  return n
}

/**
 * Convert datetime-local input value to ISO string.
 */
function toIsoFromLocalDateTime(raw: string): string | null {
  if (!raw.trim()) {
    return null
  }
  const normalized = raw.trim()
  const withSeconds =
    normalized.length === 16 ? `${normalized}:00` : normalized
  const parsed = new Date(withSeconds)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return withSeconds
}

/**
 * Convert ISO datetime string to datetime-local input format.
 */
function toLocalDateTimeInputValue(raw: string | undefined): string {
  if (!raw) {
    return ""
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return ""
  }
  const pad = (value: number) => String(value).padStart(2, "0")
  const yyyy = parsed.getFullYear()
  const mm = pad(parsed.getMonth() + 1)
  const dd = pad(parsed.getDate())
  const hh = pad(parsed.getHours())
  const min = pad(parsed.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

type AuditLogPublicWithActorName = AuditLogPublic & {
  actor_name?: string | null
}

/**
 * Returns an emoji icon for the given audit action.
 */
function auditActionIcon(action: string, newValue?: unknown): string {
  switch (action) {
    case "task.created":
      return "➕"
    case "task.updated":
      return "✏️"
    case "task.status_changed":
      return "🔄"
    case "task.deleted":
      return "🗑️"
    case "task.proof_uploaded":
      return "📷"
    case "task.proof_reviewed": {
      if (newValue === "approved") return "✅"
      if (newValue === "rejected") return "❌"
      return "📷"
    }
    case "task.delay_request_approved":
      return "⏳"
    case "task.delay_request_reviewed": {
      if (isPlainObject(newValue)) {
        const ap = newValue.approval_status
        if (ap === "APPROVED") return "✅"
        if (ap === "REJECTED") return "❌"
      }
      return "⏳"
    }
    case "task.deadline_cascaded_to_parent":
      return "↔️"
    default:
      return "📝"
  }
}

/**
 * Returns a Vietnamese action label for the given audit action.
 */
function auditActionLabel(action: string, newValue?: unknown): string {
  switch (action) {
    case "task.created":
      return "đã tạo công việc"
    case "task.updated":
      return "đã cập nhật thông tin"
    case "task.status_changed":
      return "đã đổi trạng thái"
    case "task.deleted":
      return "đã xoá công việc"
    case "task.proof_uploaded":
      return "đã nộp bằng chứng"
    case "task.proof_reviewed":
      if (newValue === "approved") return "bằng chứng đã được duyệt"
      if (newValue === "rejected") return "bằng chứng bị từ chối"
      return "đã xem xét bằng chứng"
    case "task.delay_request_approved":
      return "đã phê duyệt gia hạn"
    case "task.delay_request_reviewed":
      if (isPlainObject(newValue)) {
        const ap = newValue.approval_status
        if (ap === "APPROVED") return "đã duyệt gia hạn"
        if (ap === "REJECTED") return "đã từ chối gia hạn"
      }
      return "đã xem xét yêu cầu gia hạn"
    case "task.deadline_cascaded_to_parent":
      return "đã cập nhật deadline lên công việc cha"
    default:
      return action
  }
}

/**
 * Returns true if the value is a plain object (not null/array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Formats an audit old/new value into a short, readable string.
 */
function formatAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "string") {
    switch (value) {
      case "todo":
        return "Chờ xử lý"
      case "in_progress":
        return "Đang làm"
      case "done":
        return "Hoàn thành"
      case "approved":
        return "Đã duyệt"
      case "rejected":
        return "Bị từ chối"
      case "pending":
      case "PENDING":
        return "Chờ duyệt"
      case "APPROVED":
        return "Đã duyệt"
      case "REJECTED":
        return "Bị từ chối"
      default:
        return value
    }
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  if (isPlainObject(value)) {
    const status = value.status
    if (typeof status === "string") {
      return formatAuditValue(status)
    }

    const approvalStatus = value.approval_status
    if (typeof approvalStatus === "string") {
      return formatAuditValue(approvalStatus)
    }

    const endTime = value.end_time
    if (typeof endTime === "string") {
      const dt = new Date(endTime)
      if (Number.isNaN(dt.getTime())) {
        return endTime
      }
      return dt.toLocaleString("vi-VN")
    }
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Returns a formatted `old -> new` description for an audit entry.
 */
function formatAuditChange(entry: AuditLogPublicWithActorName): string | null {
  if (entry.old_value === null || entry.old_value === undefined) {
    return null
  }
  if (entry.new_value === null || entry.new_value === undefined) {
    return null
  }

  if (
    entry.action === "task.updated" &&
    isPlainObject(entry.old_value) &&
    isPlainObject(entry.new_value)
  ) {
    const oldObj = entry.old_value
    const newObj = entry.new_value

    const changedKeys = Object.keys(newObj).filter(
      (key) => JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key]),
    )

    if (changedKeys.length === 0) {
      return null
    }

    const preview = changedKeys.slice(0, 3).join(", ")
    const more = changedKeys.length > 3 ? "..." : ""
    return `Các trường thay đổi: ${preview}${more}`
  }

  const oldStr = formatAuditValue(entry.old_value)
  const newStr = formatAuditValue(entry.new_value)
  if (!oldStr || !newStr) {
    return null
  }
  return `${oldStr} → ${newStr}`
}

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const showSuccessToastRef = useRef(showSuccessToast)
  const showErrorToastRef = useRef(showErrorToast)

  const [commentDraft, setCommentDraft] = useState("")
  const [proofNote, setProofNote] = useState("")
  const [proofUrl, setProofUrl] = useState("")
  const progressPhotoInputRef = useRef<HTMLInputElement>(null)
  const [progressPhotoFile, setProgressPhotoFile] = useState<File | null>(null)
  const [progressPhotoPreview, setProgressPhotoPreview] = useState<
    string | null
  >(null)
  const [progressPercentInput, setProgressPercentInput] = useState("")
  const [progressNoteInput, setProgressNoteInput] = useState("")
  const [progressImageLightboxUrl, setProgressImageLightboxUrl] = useState<
    string | null
  >(null)
  const [progressReportPhotoFailed, setProgressReportPhotoFailed] = useState<
    Record<string, boolean>
  >({})

  const [wsConnected, setWsConnected] = useState(false)

  // Delay request state
  const [delayDialogOpen, setDelayDialogOpen] = useState(false)
  const [delayContent, setDelayContent] = useState("")
  const [delayEndTime, setDelayEndTime] = useState("")

  // Proof review state
  const [rejectProofId, setRejectProofId] = useState<string | null>(null)
  const [rejectProofNote, setRejectProofNote] = useState("")
  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false)
  const [taskDeadlineDraft, setTaskDeadlineDraft] = useState("")
  const [subtaskDialogOpen, setSubtaskDialogOpen] = useState(false)
  const [subtaskName, setSubtaskName] = useState("")
  const [subtaskDescription, setSubtaskDescription] = useState("")
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState("")
  const [subtaskStartTime, setSubtaskStartTime] = useState("")
  const [subtaskEndTime, setSubtaskEndTime] = useState("")
  const [subtaskWeightDraft, setSubtaskWeightDraft] = useState("")

  useEffect(() => {
    showSuccessToastRef.current = showSuccessToast
    showErrorToastRef.current = showErrorToast
  }, [showErrorToast, showSuccessToast])

  useEffect(() => {
    setProgressReportPhotoFailed({})
  }, [taskId])

  const taskQuery = useQuery({
    queryKey: ["task-detail", "task", taskId],
    queryFn: () => TasksService.getTask({ taskId }) as Promise<TaskPublic>,
  })

  const siblingTasksQuery = useQuery({
    enabled: Boolean(taskQuery.data?.project_id),
    queryKey: ["task-detail", "project-tasks", taskQuery.data?.project_id],
    queryFn: () =>
      TasksService.listProjectTasks({
        projectId: taskQuery.data!.project_id,
        limit: 50,
      }),
  })

  const projectQuery = useQuery({
    enabled: Boolean(taskQuery.data?.project_id),
    queryKey: ["task-detail", "project", taskQuery.data?.project_id],
    queryFn: () =>
      ProjectsService.getProject({
        projectId: taskQuery.data!.project_id,
      }),
  })

  const projectMembersQuery = useQuery({
    enabled: Boolean(taskQuery.data?.project_id),
    queryKey: ["task-detail", "project-members", taskQuery.data?.project_id],
    queryFn: () =>
      ProjectsService.getMembers({
        projectId: taskQuery.data!.project_id,
      }) as Promise<ProjectMemberWithUserPublic[]>,
  })

  const subtasksQuery = useQuery({
    enabled: Boolean(taskQuery.data?.project_id),
    queryKey: ["task-detail", "subtasks", taskId],
    queryFn: () =>
      TasksService.listProjectTasks({
        projectId: taskQuery.data!.project_id,
        parentId: taskId,
        limit: 50,
      }),
  })

  const parentTaskQuery = useQuery({
    enabled: Boolean(taskQuery.data?.parent_id),
    queryKey: ["task-detail", "parent-task", taskQuery.data?.parent_id],
    queryFn: () =>
      TasksService.getTask({
        taskId: taskQuery.data!.parent_id!,
      }) as Promise<TaskPublic>,
  })

  const progressReportsQuery = useQuery({
    queryKey: ["task-detail", "progress-reports", taskId],
    queryFn: () =>
      TasksService.listProgressReports({ taskId }) as Promise<
        TaskProgressReportPublic[]
      >,
  })

  const commentsQuery = useQuery({
    queryKey: ["task-detail", "comments", taskId],
    queryFn: () =>
      TasksService.listComments({ taskId }) as Promise<TaskCommentPublic[]>,
  })

  const proofsQuery = useQuery({
    queryKey: ["task-detail", "proofs", taskId],
    queryFn: () =>
      TasksService.listProofs({ taskId }) as Promise<TaskProofPublic[]>,
  })

  const auditQuery = useQuery({
    queryKey: ["task-detail", "audit", taskId],
    queryFn: () =>
      TasksService.getTaskAudit({ taskId }) as Promise<AuditLogPublic[]>,
  })

  const activeTasks = useMemo(() => {
    return (siblingTasksQuery.data?.data ?? [])
      .filter((task) => task.status !== "done")
      .slice(0, 8)
  }, [siblingTasksQuery.data?.data])

  const updateStatusMutation = useMutation({
    mutationFn: (status: "todo" | "in_progress" | "done") =>
      TasksService.updateTaskStatus({ taskId, requestBody: { status } }),
    onSuccess: async () => {
      showSuccessToast("Task status updated")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "project-tasks"],
      })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const clearProgressPhotoPick = () => {
    setProgressPhotoFile(null)
    setProgressPhotoPreview((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous)
      }
      return null
    })
    if (progressPhotoInputRef.current) {
      progressPhotoInputRef.current.value = ""
    }
  }

  const addProgressReportMutation = useMutation({
    mutationFn: async (payload: { pct: number; file: File }) => {
      const { photo_url } = await uploadTaskProgressPhoto({
        taskId,
        file: payload.file,
      })
      return TasksService.addProgressReport({
        taskId,
        requestBody: {
          photo_url,
          progress_percent: payload.pct,
          note: progressNoteInput.trim() || undefined,
        },
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã gửi báo cáo tiến độ")
      clearProgressPhotoPick()
      setProgressPercentInput("")
      setProgressNoteInput("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "progress-reports", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "project-tasks"],
      })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const addCommentMutation = useMutation({
    mutationFn: () =>
      TasksService.addComment({
        taskId,
        requestBody: { content: commentDraft, comment_type: "general" },
      }),
    onSuccess: async () => {
      showSuccessToast("Comment sent")
      setCommentDraft("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "comments", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const addProofMutation = useMutation({
    mutationFn: () =>
      TasksService.uploadProof({
        taskId,
        requestBody: {
          file_url: proofUrl,
          note: proofNote || undefined,
          file_type: "image",
        },
      }),
    onSuccess: async () => {
      showSuccessToast("Evidence uploaded")
      setProofUrl("")
      setProofNote("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "proofs", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const addDelayRequestMutation = useMutation({
    mutationFn: () =>
      TasksService.addComment({
        taskId,
        requestBody: {
          content: delayContent,
          comment_type: "delay_justification",
          requested_end_time: delayEndTime || undefined,
          approval_status: "PENDING",
        },
      }),
    onSuccess: async () => {
      showSuccessToast("Đã gửi yêu cầu gia hạn")
      setDelayDialogOpen(false)
      setDelayContent("")
      setDelayEndTime("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "comments", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const approveDelayMutation = useMutation({
    mutationFn: ({
      commentId,
      approval_status,
    }: {
      commentId: string
      approval_status: "APPROVED" | "REJECTED"
    }) =>
      TasksService.approveDelayRequest({
        taskId,
        commentId,
        requestBody: { approval_status },
      }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật yêu cầu gia hạn")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "comments", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const reviewProofMutation = useMutation({
    mutationFn: ({
      proofId,
      reviewStatus,
      reviewNote,
    }: {
      proofId: string
      reviewStatus: string
      reviewNote?: string
    }) =>
      TasksService.reviewProof({ taskId, proofId, reviewStatus, reviewNote }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật trạng thái bằng chứng")
      setRejectProofId(null)
      setRejectProofNote("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "proofs", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const updateDeadlineMutation = useMutation({
    mutationFn: async () => {
      const endTime = toIsoFromLocalDateTime(taskDeadlineDraft)
      if (!endTime) {
        throw new Error("Deadline không hợp lệ")
      }
      return TasksService.updateTask({
        taskId,
        requestBody: { end_time: endTime },
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật deadline task")
      setDeadlineDialogOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "project-tasks"],
      })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const createSubtaskMutation = useMutation({
    mutationFn: async () => {
      const projectId = taskQuery.data?.project_id
      if (!projectId) {
        throw new Error("Thiếu project id")
      }
      const startIso = toIsoFromLocalDateTime(subtaskStartTime)
      const endIso = toIsoFromLocalDateTime(subtaskEndTime)
      if (!startIso || !endIso) {
        throw new Error("Thời gian không hợp lệ")
      }
      const weightRaw = subtaskWeightDraft.trim()
      const weight = weightRaw ? Math.min(100, Math.max(1, parseInt(weightRaw, 10))) : undefined

      return TasksService.createChildTask({
        parentId: taskId,
        requestBody: {
          name: subtaskName.trim(),
          description: subtaskDescription.trim() || undefined,
          priority: taskQuery.data?.priority ?? "medium",
          start_time: startIso,
          end_time: endIso,
          project_id: projectId,
          assignee_id: subtaskAssigneeId,
          progress_weight: weight,
        },
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã tạo công việc con")
      setSubtaskDialogOpen(false)
      setSubtaskName("")
      setSubtaskDescription("")
      setSubtaskAssigneeId("")
      setSubtaskStartTime("")
      setSubtaskEndTime("")
      setSubtaskWeightDraft("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "subtasks", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "project-tasks"],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const task = taskQuery.data

  // Self-progress = sum of direct reports on this task (0–100, independent of children)
  const selfProgress = useMemo(
    () => (progressReportsQuery.data ?? []).reduce((acc, r) => acc + r.progress_percent, 0),
    [progressReportsQuery.data],
  )

  const delayRequests = useMemo(
    () =>
      (commentsQuery.data ?? []).filter(
        (c) => c.comment_type === "delay_justification",
      ),
    [commentsQuery.data],
  )

  const generalComments = useMemo(
    () =>
      (commentsQuery.data ?? []).filter(
        (c) => c.comment_type !== "delay_justification",
      ),
    [commentsQuery.data],
  )

  const hasPendingDelay = useMemo(
    () =>
      (commentsQuery.data ?? []).some(
        (c) =>
          c.comment_type === "delay_justification" &&
          c.approval_status === "PENDING",
      ),
    [commentsQuery.data],
  )

  const { user: currentUser } = useAuth()
  const myPermissionsQuery = useMyPermissions()
  const canApproveDelay = (myPermissionsQuery.data ?? []).includes("TASK_UPDATE")
  const canApproveProof = (myPermissionsQuery.data ?? []).includes(
    "PROOF_APPROVE",
  )
  const canUpdateTaskDeadline =
    (myPermissionsQuery.data ?? []).includes("TASK_UPDATE") &&
    Boolean(
      currentUser?.is_superuser || task?.assignor_id === currentUser?.id,
    )
  const isAssignee = task?.assignee_id === currentUser?.id
  const taskIndexById = useMemo(() => {
    const index = new Map<string, TaskPublic>()
    for (const item of siblingTasksQuery.data?.data ?? []) {
      index.set(item.id, item)
    }
    return index
  }, [siblingTasksQuery.data?.data])
  const parentBreadcrumbs = useMemo(() => {
    if (!task) {
      return []
    }
    const chain: Array<{ id: string; name: string }> = []
    const visited = new Set<string>()
    let cursorParentId = task.parent_id ?? null
    while (cursorParentId) {
      if (visited.has(cursorParentId)) {
        break
      }
      visited.add(cursorParentId)
      const parentFromIndex = taskIndexById.get(cursorParentId)
      const parentFromQuery =
        parentTaskQuery.data?.id === cursorParentId
          ? parentTaskQuery.data
          : undefined
      const parent = parentFromIndex ?? parentFromQuery
      if (!parent) {
        break
      }
      chain.unshift({ id: parent.id, name: parent.name })
      cursorParentId = parent.parent_id ?? null
    }
    return chain
  }, [parentTaskQuery.data, task, taskIndexById])
  const subtaskRows = subtasksQuery.data?.data ?? []

  // Total weight allocated to child tasks (sum of progress_weight of all children)
  const totalChildWeight = useMemo(
    () => subtaskRows.reduce((acc, s) => acc + (s.progress_weight ?? 0), 0),
    [subtaskRows],
  )

  // Remaining weight reserved for direct reports at this task level
  const wReport = Math.max(0, 100 - totalChildWeight)

  // Max additional % the user can report directly (self-progress cap = 100)
  const maxRemainingProgress = Math.max(0, 100 - selfProgress)

  // Weighted contributions for display breakdown
  const directContribution = Math.round((wReport * selfProgress) / 100)
  const childContribution = Math.round(
    subtaskRows.reduce((acc, s) => acc + ((s.progress_weight ?? 0) * (s.reported_progress_total ?? 0)) / 100, 0)
  )
  const totalProgress = task?.reported_progress_total ?? 0

  useEffect(() => {
    const token = getAccessToken()
    if (!token || !taskId) return

    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(buildTaskWsUrl(taskId))
    } catch {
      return
    }
    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    ws.onerror = () => setWsConnected(false)
    ws.onmessage = (eventValue) => {
      try {
        const msg = JSON.parse(eventValue.data as string) as {
          event?: string
          data?: Record<string, string | undefined>
        }
        const d = msg.data ?? {}
        const actorId = d.actor_id
        const isOwnEvent = Boolean(actorId && actorId === currentUser?.id)
        switch (msg.event) {
          case "task.delay_requested":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "comments", taskId],
            })
            if (!isOwnEvent) {
              showSuccessToastRef.current(
                `${d.author_name ?? "Người thực hiện"} vừa xin gia hạn deadline`,
              )
            }
            break
          case "task.delay_approved":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "task", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "comments", taskId],
            })
            if (!isOwnEvent) {
              showSuccessToastRef.current(
                `Deadline đã được duyệt → ${d.new_end_time ?? ""}`,
              )
            }
            break
          case "task.delay_rejected":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "comments", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            if (!isOwnEvent) {
              showErrorToastRef.current("Yêu cầu gia hạn bị từ chối")
            }
            break
          case "task.proof_uploaded":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "proofs", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            if (!isOwnEvent) {
              showSuccessToastRef.current(
                `${d.uploader_name ?? "Người thực hiện"} vừa nộp bằng chứng`,
              )
            }
            break
          case "task.proof_approved":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "proofs", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            if (!isOwnEvent) {
              showSuccessToastRef.current("Bằng chứng đã được duyệt")
            }
            break
          case "task.proof_rejected":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "proofs", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            if (!isOwnEvent) {
              showErrorToastRef.current(`Bằng chứng bị từ chối: ${d.note ?? ""}`)
            }
            break
          case "task.status_changed":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "task", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            if (!isOwnEvent) {
              showSuccessToastRef.current(`Trạng thái → ${d.new_status ?? ""}`)
            }
            break
          case "task.updated":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "task", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "project-tasks"],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            if (!isOwnEvent) {
              showSuccessToastRef.current(
                d.message ??
                  `${d.actor_name ?? "Nhân viên"} đã cập nhật thông tin công việc "${d.task_name ?? ""}".`,
              )
            }
            break
          case "task.progress_reported":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "progress-reports", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "task", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            if (!isOwnEvent) {
              showSuccessToastRef.current(
                d.message ??
                  `${d.actor_name ?? "Nhân viên"} đã cập nhật "báo cáo tiến độ" cho công việc "${d.task_name ?? ""}".`,
              )
            }
            break
          case "task.discussion_added":
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "comments", taskId],
            })
            void queryClient.invalidateQueries({
              queryKey: ["task-detail", "audit", taskId],
            })
            if (!isOwnEvent) {
              showSuccessToastRef.current(
                d.message ??
                  `${d.actor_name ?? "Nhân viên"} đã cập nhật "thảo luận" cho công việc "${d.task_name ?? ""}".`,
              )
            }
            break
          default:
            break
        }
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      setWsConnected(false)
      ws?.close()
    }
  }, [taskId, queryClient, currentUser?.id])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-24 pt-3 sm:px-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Active Project
            </p>
            <h2 className="text-lg font-bold">
              {projectQuery.data?.name ?? "Project"}
            </h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            {wsConnected ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                Live
              </span>
            ) : null}
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Task Detail
            </span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {activeTasks.map((item) => (
            <Link
              key={item.id}
              to="/tasks/$taskId"
              params={{ taskId: item.id }}
              title={item.name}
              className={[
                "shrink-0 rounded-lg px-4 py-1.5 text-xs font-medium",
                item.id === taskId
                  ? "bg-primary text-white"
                  : "border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200",
              ].join(" ")}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Subtask indicator banner (only shown for subtasks) ── */}
      {task?.parent_id ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="shrink-0 rounded bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              Công việc con
            </span>
            {parentBreadcrumbs.length > 0 ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1 text-xs text-amber-700">
                <span className="shrink-0 text-amber-400">thuộc</span>
                {parentBreadcrumbs.map((item) => (
                  <span
                    key={item.id}
                    className="flex min-w-0 max-w-full items-center gap-1"
                  >
                    <Link
                      to="/tasks/$taskId"
                      params={{ taskId: item.id }}
                      className="min-w-0 max-w-full break-words font-semibold underline underline-offset-2"
                    >
                      {item.name}
                    </Link>
                    <span className="shrink-0 text-amber-300">/</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {task.progress_weight != null ? (
            <span className="shrink-0 text-[11px] font-semibold text-amber-700 sm:text-right">
              Mức đóng góp: {task.progress_weight}%
            </span>
          ) : null}
        </div>
      ) : parentBreadcrumbs.length > 0 ? (
        <section className="rounded-xl border bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {parentBreadcrumbs.map((item) => (
              <span key={item.id} className="flex items-center gap-1">
                <Link
                  to="/tasks/$taskId"
                  params={{ taskId: item.id }}
                  className="font-semibold text-primary underline"
                >
                  {item.name}
                </Link>
                <span className="text-muted-foreground">/</span>
              </span>
            ))}
            <span className="font-bold text-slate-700">{task?.name ?? "Task"}</span>
          </div>
        </section>
      ) : null}

      {/* ── Task / Subtask header card ── */}
      <section className={[
        "space-y-4 rounded-xl border p-5 shadow-sm",
        task?.parent_id ? "border-amber-200 bg-amber-50/40" : "bg-white",
      ].join(" ")}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            {task?.parent_id && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
                Công việc con
              </p>
            )}
            <h3 className="text-lg font-bold">{task?.name ?? "Task"}</h3>
            <p className="text-sm text-muted-foreground">
              Hạn: {task ? new Date(task.end_time).toLocaleString("vi-VN") : "-"}
            </p>
            {canUpdateTaskDeadline ? (
              <button
                type="button"
                className="text-xs font-semibold text-primary underline"
                onClick={() => {
                  setTaskDeadlineDraft(toLocalDateTimeInputValue(task?.end_time))
                  setDeadlineDialogOpen(true)
                }}
              >
                Đổi deadline
              </button>
            ) : null}
          </div>
          <span className={[
            "rounded px-2 py-1 text-[10px] font-black uppercase",
            task?.parent_id ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary",
          ].join(" ")}>
            {task?.status === "todo" ? "Chờ làm"
              : task?.status === "in_progress" ? "Đang làm"
              : task?.status === "done" ? "Hoàn thành"
              : task?.status ?? "todo"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-3 text-[10px] font-bold",
              task?.status === "todo"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => updateStatusMutation.mutate("todo")}
          >
            Chờ làm
          </button>
          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-3 text-[10px] font-bold",
              task?.status === "in_progress"
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => updateStatusMutation.mutate("in_progress")}
          >
            Đang làm
          </button>
          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-3 text-[10px] font-bold",
              task?.status === "done"
                ? "bg-green-600 text-white"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => {
              if ((task?.reported_progress_total ?? 0) < 100) {
                showErrorToast("Chưa thể đánh dấu hoàn thành khi tiến độ chưa đạt 100%")
                return
              }
              updateStatusMutation.mutate("done")
            }}
          >
            Hoàn thành
          </button>
        </div>
      </section>

      {/* ── Delay Requests ── */}
      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Yêu cầu gia hạn
          </h4>
          {isAssignee && task?.status !== "done" && !hasPendingDelay ? (
            <button
              type="button"
              className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100"
              onClick={() => setDelayDialogOpen(true)}
            >
              + Xin gia hạn
            </button>
          ) : null}
          {isAssignee && task?.status !== "done" && hasPendingDelay ? (
            <span className="text-[10px] text-muted-foreground">
              Đang có yêu cầu gia hạn chờ duyệt
            </span>
          ) : null}
        </div>

        {delayRequests.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có yêu cầu gia hạn.</p>
        ) : (
          <div className="space-y-3">
            {delayRequests.map((req) => {
              const isPending = req.approval_status === "PENDING"
              const isApproved = req.approval_status === "APPROVED"
              return (
                <div
                  key={req.id}
                  className={[
                    "rounded-lg border p-3 text-sm",
                    isPending
                      ? "border-amber-200 bg-amber-50"
                      : isApproved
                        ? "border-green-200 bg-green-50"
                        : "border-red-200 bg-red-50",
                  ].join(" ")}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {req.author_name ?? req.author_id}
                    </span>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                        isPending
                          ? "bg-amber-200 text-amber-800"
                          : isApproved
                            ? "bg-green-200 text-green-800"
                            : "bg-red-200 text-red-800",
                      ].join(" ")}
                    >
                      {isPending ? "Đang chờ" : isApproved ? "Đã duyệt" : "Từ chối"}
                    </span>
                    {req.requested_end_time && (
                      <span className="text-[10px] text-muted-foreground">
                        → {new Date(req.requested_end_time).toLocaleDateString("vi-VN")}
                      </span>
                    )}
                  </div>
                  <p className="break-words text-[13px]">{req.content}</p>
                  {isPending &&
                  canApproveDelay &&
                  (currentUser?.is_superuser ||
                    req.author_id !== currentUser?.id) ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={approveDelayMutation.isPending}
                        className="rounded-md bg-green-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                        onClick={() =>
                          approveDelayMutation.mutate({
                            commentId: req.id,
                            approval_status: "APPROVED",
                          })
                        }
                      >
                        Duyệt
                      </button>
                      <button
                        type="button"
                        disabled={approveDelayMutation.isPending}
                        className="rounded-md bg-red-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                        onClick={() =>
                          approveDelayMutation.mutate({
                            commentId: req.id,
                            approval_status: "REJECTED",
                          })
                        }
                      >
                        Từ chối
                      </button>
                    </div>
                  ) : null}
                  {isPending &&
                  canApproveDelay &&
                  !currentUser?.is_superuser &&
                  req.author_id === currentUser?.id ? (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Yêu cầu này do bạn tạo — cần người có quyền khác (không phải
                      chính bạn) duyệt hoặc từ chối.
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Người thực hiện & giao việc
        </h4>
        <p className="text-sm">
          <span className="font-semibold text-primary">Thực hiện:</span>{" "}
          {task?.assignee_name?.trim() || task?.assignee_id || "—"}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold">Giao bởi:</span>{" "}
          {task?.assignor_name?.trim() || task?.assignor_id || "—"}
        </p>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Description
        </h4>
        <div className="break-words rounded-lg bg-slate-100 p-4 text-sm leading-relaxed">
          {task?.description || "No description."}
        </div>
      </section>

      {/* Subtask section — only shown on root tasks (level 0 / no parent) */}
      {!task?.parent_id && (
      <section className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Công việc con
          </h4>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            disabled={!task?.project_id}
            onClick={() => setSubtaskDialogOpen(true)}
          >
            + Thêm công việc con
          </button>
        </div>
        {subtaskRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Chưa có công việc con nào.
          </p>
        ) : (
          <div className="space-y-2">
            {subtaskRows.map((subtask) => {
              const completionPct = subtask.reported_progress_total ?? 0
              const weight = subtask.progress_weight
              return (
                <Link
                  key={subtask.id}
                  to="/tasks/$taskId"
                  params={{ taskId: subtask.id }}
                  className="block rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-words text-sm font-bold">{subtask.name}</p>
                      <p className="break-words text-[11px] text-muted-foreground">
                        {subtask.assignee_name ?? subtask.assignee_id} · Hạn{" "}
                        {new Date(subtask.end_time).toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-row flex-wrap items-end justify-between gap-x-4 gap-y-1 sm:flex-col sm:items-end sm:justify-start sm:text-right">
                      <p className="text-[10px] font-bold uppercase text-primary">
                        {subtask.computed_status ?? subtask.status}
                      </p>
                      <p className="text-sm font-bold text-slate-800">{completionPct}%</p>
                      {weight != null ? (
                        <p className="max-w-full break-words text-left text-[10px] text-slate-400 sm:text-right">
                          đóng góp {Math.round((weight * completionPct) / 100)}/{weight}%
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-500">Chưa đặt trọng số</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <progress
                      max={100}
                      value={completionPct}
                      className="h-1.5 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Tiến độ chung
          </h4>
          <p className="text-sm font-bold text-primary">
            {totalProgress}%
            {task?.status === "done" ? " · Hoàn thành" : ""}
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <progress
            max={100}
            value={totalProgress}
            className="h-2.5 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
          />
          {/* Breakdown: only shown for root tasks with subtasks */}
          {subtaskRows.length > 0 && (
            <div className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] min-[380px]:grid-cols-2">
              <div className="min-w-0">
                <p className="break-words text-muted-foreground">Từ công việc con</p>
                <p className="font-semibold text-slate-700">{childContribution}%</p>
              </div>
              <div className="min-w-0">
                <p className="break-words text-muted-foreground">
                  Báo cáo tại đây {wReport < 100 ? `(tối đa ${wReport}%)` : ""}
                </p>
                <p className="break-words font-semibold text-slate-700">
                  {directContribution}%
                  {selfProgress > 0 && selfProgress !== directContribution ? (
                    <span className="ml-1 font-normal text-muted-foreground">
                      (đã báo {selfProgress}%)
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          )}
          {subtaskRows.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Đã báo cáo {selfProgress}/100% · Khi đạt 100% sẽ tự chuyển sang Hoàn thành.
            </p>
          )}
        </div>

        {totalChildWeight > 100 && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">
            Tổng mức đóng góp của công việc con ({totalChildWeight}%) đang vượt quá 100%. Hãy điều chỉnh lại.
          </p>
        )}
        <>
        <div className="rounded-lg border bg-white p-3">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <label
                htmlFor="progress-photo-file"
                className="text-[11px] font-semibold text-muted-foreground"
              >
                Ảnh hiện trường
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="progress-photo-file"
                  ref={progressPhotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  title="Chọn hoặc chụp ảnh báo cáo"
                  aria-label="Chọn hoặc chụp ảnh báo cáo tiến độ"
                  className="sr-only"
                  disabled={task?.status === "done"}
                  onChange={(eventValue) => {
                    const file = eventValue.target.files?.[0]
                    if (!file) {
                      return
                    }
                    if (!file.type.startsWith("image/")) {
                      showErrorToast("Chỉ chọn file ảnh")
                      return
                    }
                    setProgressPhotoFile(file)
                    setProgressPhotoPreview((previous) => {
                      if (previous) {
                        URL.revokeObjectURL(previous)
                      }
                      return URL.createObjectURL(file)
                    })
                  }}
                />
                <button
                  type="button"
                  title="Chọn hoặc chụp ảnh"
                  disabled={task?.status === "done"}
                  className="h-9 rounded-md border bg-slate-50 px-3 text-xs font-bold text-slate-700 disabled:opacity-60"
                  onClick={() => progressPhotoInputRef.current?.click()}
                >
                  Chọn / chụp ảnh
                </button>
                {progressPhotoFile ? (
                  <button
                    type="button"
                    title="Bỏ ảnh"
                    className="h-9 rounded-md border px-3 text-xs font-semibold text-muted-foreground"
                    onClick={clearProgressPhotoPick}
                  >
                    Bỏ ảnh
                  </button>
                ) : null}
              </div>
              {progressPhotoPreview ? (
                <button
                  type="button"
                  title="Phóng to ảnh"
                  className="mt-1 block max-w-full cursor-zoom-in rounded-md border-0 bg-transparent p-0 text-left"
                  onClick={() =>
                    setProgressImageLightboxUrl(progressPhotoPreview)
                  }
                >
                  <img
                    src={progressPhotoPreview}
                    alt="Xem trước ảnh báo cáo"
                    className="h-24 max-w-full rounded-md border object-cover"
                  />
                </button>
              ) : null}
            </div>
            <div className="w-full space-y-1 sm:w-32">
              <label
                htmlFor="progress-pct"
                className="text-[11px] font-semibold text-muted-foreground"
              >
                % hoàn thành (1–{maxRemainingProgress})
              </label>
              <input
                id="progress-pct"
                inputMode="numeric"
                value={progressPercentInput}
                onChange={(eventValue) =>
                  setProgressPercentInput(eventValue.target.value)
                }
                placeholder="30"
                disabled={task?.status === "done" || selfProgress >= 100}
                className="h-9 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-60"
              />
            </div>
          </div>
          <div className="mb-3 space-y-1">
            <label
              htmlFor="progress-note"
              className="text-[11px] font-semibold text-muted-foreground"
            >
              Ghi chú (tuỳ chọn)
            </label>
            <input
              id="progress-note"
              value={progressNoteInput}
              onChange={(eventValue) =>
                setProgressNoteInput(eventValue.target.value)
              }
              placeholder="Mô tả ngắn..."
              disabled={task?.status === "done"}
              className="h-9 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            title="Gửi báo cáo tiến độ"
            className="h-9 w-full rounded-md bg-primary text-sm font-bold text-white disabled:opacity-60 sm:w-auto sm:px-6"
            disabled={
              task?.status === "done" || addProgressReportMutation.isPending
            }
            onClick={() => {
              const pct = parseProgressPercent(progressPercentInput.trim())
              if (!progressPhotoFile) {
                showErrorToast("Chọn ảnh từ máy")
                return
              }
              if (pct === null) {
                showErrorToast("Nhập % từ 1 đến 100")
                return
              }
              if (pct > maxRemainingProgress) {
                showErrorToast(
                  `Tối đa ${maxRemainingProgress}% cho lần này (tổng không vượt quá 100%).`,
                )
                return
              }
              addProgressReportMutation.mutate({ pct, file: progressPhotoFile })
            }}
          >
            Gửi báo cáo
          </button>
        </div>
        <div className="space-y-3">
          {(progressReportsQuery.data ?? []).map((row) => {
            const thumbSrc = resolveBackendMediaUrl(row.photo_url)
            const thumbFailed = Boolean(progressReportPhotoFailed[row.id])
            const showThumb = Boolean(thumbSrc) && !thumbFailed
            return (
              <div
                key={row.id}
                className="flex min-w-0 gap-3 rounded-lg border bg-slate-50 p-3"
              >
                {showThumb ? (
                  <button
                    type="button"
                    title="Xem ảnh báo cáo"
                    className="h-20 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-md border-0 bg-transparent p-0"
                    onClick={() => setProgressImageLightboxUrl(thumbSrc)}
                  >
                    <img
                      src={thumbSrc}
                      alt="Ảnh báo cáo tiến độ"
                      className="h-full w-full rounded-md object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={() =>
                        setProgressReportPhotoFailed((previous) => ({
                          ...previous,
                          [row.id]: true,
                        }))
                      }
                    />
                  </button>
                ) : (
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted px-1 text-center text-[9px] font-medium leading-tight text-muted-foreground"
                    title={thumbFailed ? "Không tải được ảnh" : "Chưa có ảnh"}
                  >
                    {thumbFailed ? "Lỗi ảnh" : "—"}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-bold text-primary">
                    +{row.progress_percent}%
                  </p>
                  <p className="break-words text-[11px] text-muted-foreground">
                    {row.reporter_name ?? row.reporter_id}
                    {" · "}
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                  {row.note ? (
                    <p className="mt-1 break-words text-[13px]">{row.note}</p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
        </>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Bằng chứng hoàn thành
        </h4>

        {/* Upload form */}
        <div className="space-y-2 rounded-lg border bg-white p-4">
          <textarea
            value={proofNote}
            onChange={(eventValue) => setProofNote(eventValue.target.value)}
            placeholder="Mô tả bằng chứng..."
            className="min-h-[70px] w-full rounded-md border p-3 text-sm outline-none"
          />
          <div className="flex gap-2">
            <input
              value={proofUrl}
              onChange={(eventValue) => setProofUrl(eventValue.target.value)}
              placeholder="URL ảnh bằng chứng..."
              className="h-10 flex-1 rounded-md border px-3 text-sm outline-none"
            />
            <button
              type="button"
              disabled={addProofMutation.isPending}
              className="h-10 rounded-md bg-primary px-4 text-xs font-bold text-white disabled:opacity-60"
              onClick={() => {
                if (!proofUrl.trim()) return
                addProofMutation.mutate()
              }}
            >
              Nộp bằng chứng
            </button>
          </div>
        </div>

        {/* Proof list with review */}
        {(proofsQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có bằng chứng nào được nộp.</p>
        ) : (
          <div className="space-y-3">
            {(proofsQuery.data ?? []).map((proof) => {
              const isPending = proof.review_status === "pending"
              const isApproved = proof.review_status === "approved"
              return (
                <div
                  key={proof.id}
                  className={[
                    "rounded-lg border p-3",
                    isPending
                      ? "border-slate-200 bg-white"
                      : isApproved
                        ? "border-green-200 bg-green-50"
                        : "border-red-200 bg-red-50",
                  ].join(" ")}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                        isPending
                          ? "bg-slate-200 text-slate-700"
                          : isApproved
                            ? "bg-green-200 text-green-800"
                            : "bg-red-200 text-red-800",
                      ].join(" ")}
                    >
                      {isPending ? "Chờ duyệt" : isApproved ? "Đã duyệt" : "Bị từ chối"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(proof.uploaded_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                  {proof.note && (
                    <p className="mb-2 text-sm">{proof.note}</p>
                  )}
                  <a
                    href={proof.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-primary underline"
                  >
                    Xem file bằng chứng →
                  </a>
                  {/* Review buttons — only show for pending */}
                  {isPending && canApproveProof ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={reviewProofMutation.isPending}
                        className="rounded-md bg-green-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                        onClick={() =>
                          reviewProofMutation.mutate({
                            proofId: proof.id,
                            reviewStatus: "approved",
                          })
                        }
                      >
                        Duyệt bằng chứng
                      </button>
                      <button
                        type="button"
                        disabled={reviewProofMutation.isPending}
                        className="rounded-md border border-red-300 px-3 py-1 text-[11px] font-bold text-red-600 disabled:opacity-60"
                        onClick={() => {
                          setRejectProofId(proof.id)
                          setRejectProofNote("")
                        }}
                      >
                        Từ chối
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Discussion
        </h4>
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <div className="space-y-2">
            {generalComments.map((comment) => (
              <div
                key={comment.id}
                className="max-w-[90%] rounded-2xl border bg-slate-50 p-3 text-sm"
              >
                <p className="mb-1 text-[10px] font-bold text-muted-foreground">
                  {comment.author_name ?? comment.author_id}
                </p>
                <p>{comment.content}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={commentDraft}
              onChange={(eventValue) =>
                setCommentDraft(eventValue.target.value)
              }
              placeholder="Send a message..."
              className="h-10 flex-1 rounded-full border px-4 text-sm outline-none"
            />
            <button
              type="button"
              className="h-10 w-10 rounded-full bg-primary text-white"
              onClick={() => {
                if (!commentDraft.trim()) return
                addCommentMutation.mutate()
              }}
            >
              →
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Lịch sử
        </h4>
        <div className="space-y-3 rounded-xl border bg-white p-4">
          {auditQuery.isPending ? (
            <p className="text-xs text-muted-foreground">Đang tải lịch sử...</p>
          ) : (auditQuery.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chưa có lịch sử cho công việc này.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-[360px] overflow-y-auto pr-1 space-y-3">
                {(auditQuery.data ?? [])
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() -
                      new Date(a.created_at).getTime(),
                  )
                  .map((entry) => {
                    const typedEntry = entry as AuditLogPublicWithActorName
                    const actor = typedEntry.actor_name ?? typedEntry.actor_id
                    const time = new Date(typedEntry.created_at).toLocaleString(
                      "vi-VN",
                    )
                    const actionLabel = auditActionLabel(
                      typedEntry.action,
                      typedEntry.new_value,
                    )
                    const changeText = formatAuditChange(typedEntry)
                    return (
                      <div key={typedEntry.id} className="flex gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
                          {auditActionIcon(
                            typedEntry.action,
                            typedEntry.new_value,
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-bold text-muted-foreground">
                            {actor} {actionLabel} lúc {time}
                          </p>
                          {changeText ? (
                            <p className="mt-1 text-sm text-slate-800">
                              {changeText}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        className="w-full rounded-xl bg-primary py-4 text-base font-bold text-white"
        onClick={() => showSuccessToast("Task changes synced")}
      >
        Save & Update Task
      </button>

      {/* Delay Request Dialog */}
      <Dialog open={delayDialogOpen} onOpenChange={setDelayDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Xin gia hạn deadline</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label
                htmlFor="delay-reason"
                className="text-xs font-semibold text-muted-foreground"
              >
                Lý do xin gia hạn <span className="text-red-500">*</span>
              </label>
              <textarea
                id="delay-reason"
                value={delayContent}
                onChange={(e) => setDelayContent(e.target.value)}
                placeholder="Nêu rõ lý do cần gia hạn (thiếu vật tư, thời tiết, phát sinh kỹ thuật...)"
                className="min-h-[100px] w-full rounded-md border p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="delay-date"
                className="text-xs font-semibold text-muted-foreground"
              >
                Ngày hoàn thành đề xuất
              </label>
              <input
                id="delay-date"
                type="datetime-local"
                value={delayEndTime}
                onChange={(e) => setDelayEndTime(e.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDelayDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={
                !delayContent.trim() ||
                !delayEndTime.trim() ||
                addDelayRequestMutation.isPending
              }
              onClick={() => addDelayRequestMutation.mutate()}
            >
              Gửi yêu cầu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Proof Dialog */}
      <Dialog
        open={Boolean(rejectProofId)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectProofId(null)
            setRejectProofNote("")
          }
        }}
      >
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Từ chối bằng chứng</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <label
              htmlFor="reject-note"
              className="text-xs font-semibold text-muted-foreground"
            >
              Lý do từ chối <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reject-note"
              value={rejectProofNote}
              onChange={(e) => setRejectProofNote(e.target.value)}
              placeholder="Ví dụ: Ảnh không rõ nét, chưa đúng hạng mục yêu cầu..."
              className="min-h-[90px] w-full rounded-md border p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectProofId(null)
                setRejectProofNote("")
              }}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!rejectProofNote.trim() || reviewProofMutation.isPending}
              onClick={() => {
                if (!rejectProofId) return
                reviewProofMutation.mutate({
                  proofId: rejectProofId,
                  reviewStatus: "rejected",
                  reviewNote: rejectProofNote.trim(),
                })
              }}
            >
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Photo Lightbox */}
      <Dialog
        open={Boolean(progressImageLightboxUrl)}
        onOpenChange={(open) => {
          if (!open) {
            setProgressImageLightboxUrl(null)
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[min(95vw,56rem)] overflow-y-auto sm:max-w-3xl"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Ảnh báo cáo tiến độ</DialogTitle>
          </DialogHeader>
          {progressImageLightboxUrl ? (
            <img
              src={progressImageLightboxUrl}
              alt="Ảnh báo cáo tiến độ phóng to"
              className="mx-auto max-h-[min(70vh,80dvh)] w-full max-w-full object-contain"
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProgressImageLightboxUrl(null)}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={subtaskDialogOpen} onOpenChange={setSubtaskDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Thêm công việc con</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Tên công việc con
              </label>
              <input
                value={subtaskName}
                onChange={(eventValue) => setSubtaskName(eventValue.target.value)}
                placeholder="Ví dụ: Đi dây điện tầng 2"
                className="h-10 w-full rounded-md border px-3 text-sm outline-none"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="subtask-assignee"
                className="text-xs font-semibold text-muted-foreground"
              >
                Người thực hiện
              </label>
              <select
                id="subtask-assignee"
                title="Chọn người thực hiện"
                value={subtaskAssigneeId}
                onChange={(eventValue) =>
                  setSubtaskAssigneeId(eventValue.target.value)
                }
                className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none"
              >
                <option value="">Chọn nhân sự</option>
                {(projectMembersQuery.data ?? []).map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name?.trim() || member.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="subtask-start-time"
                className="text-xs font-semibold text-muted-foreground"
              >
                Bắt đầu
              </label>
              <input
                id="subtask-start-time"
                type="datetime-local"
                title="Chọn thời gian bắt đầu"
                value={subtaskStartTime}
                onChange={(eventValue) =>
                  setSubtaskStartTime(eventValue.target.value)
                }
                className="h-10 w-full rounded-md border px-3 text-sm outline-none"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="subtask-end-time"
                className="text-xs font-semibold text-muted-foreground"
              >
                Kết thúc
              </label>
              <input
                id="subtask-end-time"
                type="datetime-local"
                title="Chọn thời gian kết thúc"
                value={subtaskEndTime}
                onChange={(eventValue) => setSubtaskEndTime(eventValue.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none"
              />
            </div>
            <div className="flex gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Đóng góp bao nhiêu % vào công việc cha?
                  <span className="ml-1 font-normal">(1–100)</span>
                </label>
                <input
                  inputMode="numeric"
                  value={subtaskWeightDraft}
                  onChange={(e) => setSubtaskWeightDraft(e.target.value)}
                  placeholder="Ví dụ: 30"
                  className={[
                    "h-10 w-full rounded-md border px-3 text-sm outline-none",
                    totalChildWeight + (parseInt(subtaskWeightDraft || "0", 10) || 0) > 100
                      ? "border-red-400"
                      : "",
                  ].join(" ")}
                />
                <p className={[
                  "text-[10px]",
                  totalChildWeight > 100 ? "text-red-500 font-semibold" : "text-muted-foreground",
                ].join(" ")}>
                  Các công việc con đã chiếm {totalChildWeight}% · Còn lại {wReport}% cho báo cáo trực tiếp
                  {totalChildWeight > 100 && " · Vượt 100%, cần điều chỉnh!"}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Mô tả
              </label>
              <textarea
                value={subtaskDescription}
                onChange={(eventValue) =>
                  setSubtaskDescription(eventValue.target.value)
                }
                placeholder="Mô tả ngắn cho công việc con..."
                className="min-h-[80px] w-full rounded-md border p-3 text-sm outline-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSubtaskDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={
                createSubtaskMutation.isPending ||
                !subtaskName.trim() ||
                !subtaskAssigneeId ||
                !subtaskStartTime.trim() ||
                !subtaskEndTime.trim()
              }
              onClick={() => createSubtaskMutation.mutate()}
            >
              Tạo công việc con
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deadlineDialogOpen} onOpenChange={setDeadlineDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Cập nhật deadline task</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <label
              htmlFor="task-deadline-update"
              className="text-xs font-semibold text-muted-foreground"
            >
              Deadline mới
            </label>
            <input
              id="task-deadline-update"
              type="datetime-local"
              title="Chọn deadline mới cho task"
              value={taskDeadlineDraft}
              onChange={(eventValue) => setTaskDeadlineDraft(eventValue.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeadlineDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={!taskDeadlineDraft.trim() || updateDeadlineMutation.isPending}
              onClick={() => updateDeadlineMutation.mutate()}
            >
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
