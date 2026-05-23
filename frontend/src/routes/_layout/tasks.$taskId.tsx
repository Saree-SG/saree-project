import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { toIsoFromLocalDateTime, toLocalDateTimeInputValue } from "@/utils/dateTime"
import {
  auditActionIcon,
  auditActionLabel,
  formatAuditChange,
  type AuditLogWithActor,
} from "@/utils/auditLog"
import { useTaskWebSocket } from "@/hooks/useTaskWebSocket"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { addDependency, fetchProjectGantt, removeDependency } from "@/modules/gantt/ganttApi"
import {
  addTaskExtraAssignee,
  addTaskObserver,
  reassignTask,
  removeTaskExtraAssignee,
  removeTaskObserver,
  type TaskExtraAssigneePublic,
  type TaskObserverPublic,
  type TaskWithPeople,
} from "@/modules/tasks/taskApi"
import { submitProgressReport } from "@/modules/tasks/taskProgressApi"
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

function computeHeaderHeadline(task: TaskPublic): { emoji: string; text: string; cls: string } {
  const effectiveStatus = task.computed_status ?? task.status
  const end = new Date(task.end_time)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()
  const diffH = Math.floor(diffMs / 3_600_000)
  const diffD = Math.floor(diffMs / 86_400_000)

  if (task.status === "done") {
    return { emoji: "✅", text: "ĐÃ HOÀN THÀNH", cls: "text-green-700" }
  }
  if (effectiveStatus === "overdue_critical" || effectiveStatus === "overdue_local") {
    const overdueDays = Math.abs(diffD)
    return {
      emoji: effectiveStatus === "overdue_critical" ? "🔴" : "🟠",
      text: overdueDays === 0 ? "QUÁ HẠN HÔM NAY" : `QUÁ HẠN ${overdueDays} NGÀY`,
      cls: effectiveStatus === "overdue_critical" ? "text-red-700" : "text-orange-700",
    }
  }
  if (diffH <= 24) {
    if (diffH <= 0) return { emoji: "🟡", text: "HẾT HẠN HÔM NAY", cls: "text-amber-700" }
    return { emoji: "🟡", text: `CÒN ${diffH} GIỜ`, cls: "text-amber-700" }
  }
  if (diffD <= 3) return { emoji: "📌", text: `CÒN ${diffD} NGÀY`, cls: "text-blue-700" }
  if (effectiveStatus === "in_progress") return { emoji: "📋", text: "ĐANG LÀM", cls: "text-slate-600" }
  return { emoji: "📋", text: "CHỜ LÀM", cls: "text-slate-600" }
}

function formatDeadlineFull(iso: string | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Date helpers, audit formatters, and isPlainObject are imported from shared utils above.

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [commentDraft, setCommentDraft] = useState("")
  const [proofNote, setProofNote] = useState("")
  const [proofUrl, setProofUrl] = useState("")
  const progressPhotoInputRef = useRef<HTMLInputElement>(null)
  const progressSectionRef = useRef<HTMLDivElement>(null)
  const commentsSectionRef = useRef<HTMLDivElement>(null)
  const commentInputRef = useRef<HTMLInputElement>(null)
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

  // Delay request state
  const [delayDialogOpen, setDelayDialogOpen] = useState(false)
  const [delayContent, setDelayContent] = useState("")
  const [delayEndTime, setDelayEndTime] = useState("")

  // Proof review state
  const [rejectProofId, setRejectProofId] = useState<string | null>(null)
  const [rejectProofNote, setRejectProofNote] = useState("")
  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false)
  const [taskEditDialogOpen, setTaskEditDialogOpen] = useState(false)
  const [dependencyDraft, setDependencyDraft] = useState("none")
  const [taskDeadlineDraft, setTaskDeadlineDraft] = useState("")
  const [taskStartDraft, setTaskStartDraft] = useState("")
  const [taskModuleTagDraft, setTaskModuleTagDraft] = useState("")
  const [taskNameDraft, setTaskNameDraft] = useState("")
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState("")
  const [taskPriorityDraft, setTaskPriorityDraft] = useState("medium")
  const [subtaskDialogOpen, setSubtaskDialogOpen] = useState(false)
  const [subtaskName, setSubtaskName] = useState("")
  const [subtaskDescription, setSubtaskDescription] = useState("")
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState("")
  const [subtaskStartTime, setSubtaskStartTime] = useState("")
  const [subtaskEndTime, setSubtaskEndTime] = useState("")
  const [subtaskWeightDraft, setSubtaskWeightDraft] = useState("")
  const [extraAssigneeDialogOpen, setExtraAssigneeDialogOpen] = useState(false)
  const [extraAssigneeUserId, setExtraAssigneeUserId] = useState("")
  const [observerDialogOpen, setObserverDialogOpen] = useState(false)
  const [observerUserId, setObserverUserId] = useState("")
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false)
  const [reassignUserId, setReassignUserId] = useState("")
  const [activeTab, setActiveTab] = useState<"progress" | "comments" | "subtasks" | "history">("progress")
  const [perfCoeffDraft, setPerfCoeffDraft] = useState("")
  const [defectNoteDialogOpen, setDefectNoteDialogOpen] = useState(false)
  const [defectNoteDraft, setDefectNoteDraft] = useState("")

  useEffect(() => {
    setProgressReportPhotoFailed({})
  }, [taskId])

  const taskQuery = useQuery({
    queryKey: ["task-detail", "task", taskId],
    queryFn: () => TasksService.getTask({ taskId }) as Promise<TaskWithPeople>,
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
  const projectGanttQuery = useQuery({
    enabled: Boolean(taskQuery.data?.project_id),
    queryKey: ["task-detail", "gantt", taskQuery.data?.project_id],
    queryFn: () => fetchProjectGantt(taskQuery.data!.project_id),
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

  const addExtraAssigneeMutation = useMutation({
    mutationFn: (userId: string) => addTaskExtraAssignee(taskId, userId),
    onSuccess: async () => {
      showSuccessToast("Đã thêm người phối hợp")
      setExtraAssigneeUserId("")
      setExtraAssigneeDialogOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const removeExtraAssigneeMutation = useMutation({
    mutationFn: (userId: string) => removeTaskExtraAssignee(taskId, userId),
    onSuccess: async () => {
      showSuccessToast("Đã gỡ người phối hợp")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const addObserverMutation = useMutation({
    mutationFn: (userId: string) => addTaskObserver(taskId, userId),
    onSuccess: async () => {
      showSuccessToast("Đã thêm observer")
      setObserverUserId("")
      setObserverDialogOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const removeObserverMutation = useMutation({
    mutationFn: (userId: string) => removeTaskObserver(taskId, userId),
    onSuccess: async () => {
      showSuccessToast("Đã gỡ observer")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const reassignMutation = useMutation({
    mutationFn: (newAssigneeId: string) => reassignTask(taskId, newAssigneeId),
    onSuccess: async () => {
      showSuccessToast("Đã chuyển người phụ trách chính")
      setReassignUserId("")
      setReassignDialogOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["my-tasks-dashboard"],
      })
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
      return submitProgressReport({
        taskId,
        file: payload.file,
        progressPercent: payload.pct,
        note: progressNoteInput.trim() || undefined,
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

  const addDefectNoteMutation = useMutation({
    mutationFn: () =>
      TasksService.addComment({
        taskId,
        requestBody: { content: defectNoteDraft, comment_type: "defect_note" },
      }),
    onSuccess: async () => {
      showSuccessToast("Đã ghi nhận lỗi")
      setDefectNoteDraft("")
      setDefectNoteDialogOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "comments", taskId],
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
      const startTime = toIsoFromLocalDateTime(taskStartDraft)
      const requestBody: Record<string, string> = { end_time: endTime }
      if (startTime) {
        requestBody.start_time = startTime
      }
      return TasksService.updateTask({ taskId, requestBody })
    },
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật thời gian task")
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

  const updateTaskInfoMutation = useMutation({
    mutationFn: async () => {
      const startTime = toIsoFromLocalDateTime(taskStartDraft)
      const endTime = toIsoFromLocalDateTime(taskDeadlineDraft)
      if (!startTime || !endTime) {
        throw new Error("Thời gian task không hợp lệ")
      }
      const parsedCoeff = perfCoeffDraft.trim() ? parseFloat(perfCoeffDraft) : undefined
      return TasksService.updateTask({
        taskId,
        requestBody: {
          name: taskNameDraft.trim(),
          description: taskDescriptionDraft.trim() || null,
          priority: taskPriorityDraft,
          start_time: startTime,
          end_time: endTime,
          module_tag: taskModuleTagDraft || null,
          ...(parsedCoeff !== undefined && !isNaN(parsedCoeff) ? { performance_coefficient: parsedCoeff } : {}),
        } as any,
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật thông tin task")
      setTaskEditDialogOpen(false)
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
  const addDependencyMutation = useMutation({
    mutationFn: async (blockingTaskId: string) => addDependency(blockingTaskId, taskId),
    onSuccess: async () => {
      showSuccessToast("Đã thêm phụ thuộc")
      setDependencyDraft("none")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "gantt", task?.project_id],
      })
    },
    onError: handleError.bind(showErrorToast),
  })
  const removeDependencyMutation = useMutation({
    mutationFn: async (row: { blockingTaskId: string; depId: string }) =>
      removeDependency(row.blockingTaskId, row.depId),
    onSuccess: async () => {
      showSuccessToast("Đã xóa phụ thuộc")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "gantt", task?.project_id],
      })
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

  useEffect(() => {
    setTaskModuleTagDraft(task?.module_tag ?? "")
    setTaskNameDraft(task?.name ?? "")
    setTaskDescriptionDraft(task?.description ?? "")
    setTaskPriorityDraft(task?.priority ?? "medium")
    setTaskStartDraft(toLocalDateTimeInputValue(task?.start_time))
    setTaskDeadlineDraft(toLocalDateTimeInputValue(task?.end_time))
    setPerfCoeffDraft((task as any)?.performance_coefficient != null ? String((task as any).performance_coefficient) : "")
  }, [task])

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
  const canEditTask = (myPermissionsQuery.data ?? []).includes("TASK_UPDATE")
  const canEditPerfCoeff =
    Boolean(currentUser?.is_superuser) || canEditTask
  const canUpdateTaskDeadline =
    canEditTask &&
    Boolean(
      currentUser?.is_superuser || task?.assignor_id === currentUser?.id,
    )
  const canManageExtraAssignees = canEditTask
  const isAssignee = task?.assignee_id === currentUser?.id
  const canEditDependency =
    task?.status !== "done" &&
    (task?.assignor_id === currentUser?.id ||
      (myPermissionsQuery.data ?? []).includes("TASK_UPDATE"))

  const wsConnected = useTaskWebSocket(taskId, {
    queryClient,
    currentUserId: currentUser?.id,
    showSuccessToast,
    showErrorToast,
  })
  const extraAssignees = useMemo<TaskExtraAssigneePublic[]>(
    () => task?.extra_assignees ?? [],
    [task?.extra_assignees],
  )
  const observers = useMemo<TaskObserverPublic[]>(
    () => task?.observers ?? [],
    [task?.observers],
  )
  const dependencyCandidates = useMemo(() => {
    const statusLabel: Record<string, string> = {
      todo: "Chờ làm",
      in_progress: "Đang làm",
      done: "Hoàn thành",
      blocked: "Đang bị chặn",
    }
    return (projectGanttQuery.data?.tasks ?? [])
      .filter((row) => row.id !== taskId)
      .map((row) => ({
        id: row.id,
        label: `${row.name} [${statusLabel[row.status] ?? row.status}]`,
      }))
  }, [projectGanttQuery.data?.tasks, taskId])
  const dependencyRows = useMemo(() => {
    const deps = projectGanttQuery.data?.dependencies ?? []
    const tasks = projectGanttQuery.data?.tasks ?? []
    const nameById = new Map(tasks.map((row) => [row.id, row.name]))
    return deps
      .filter((row) => row.dependent_task_id === taskId && row.dependency_type === "FS")
      .map((row) => ({
        depId: row.id,
        blockingTaskId: row.blocking_task_id,
        blockingName: nameById.get(row.blocking_task_id) ?? row.blocking_task_id,
      }))
  }, [projectGanttQuery.data?.dependencies, projectGanttQuery.data?.tasks, taskId])
  const availableExtraAssignees = useMemo(() => {
    const excluded = new Set<string>([
      task?.assignee_id ?? "",
      ...extraAssignees.map((row) => row.user_id),
    ])
    return (projectMembersQuery.data ?? []).filter(
      (member) => !excluded.has(member.user_id),
    )
  }, [projectMembersQuery.data, task?.assignee_id, extraAssignees])
  const availableObservers = useMemo(() => {
    const excluded = new Set<string>([
      task?.assignee_id ?? "",
      ...extraAssignees.map((row) => row.user_id),
      ...observers.map((row) => row.user_id),
    ])
    return (projectMembersQuery.data ?? []).filter(
      (member) => !excluded.has(member.user_id),
    )
  }, [projectMembersQuery.data, task?.assignee_id, extraAssignees, observers])
  const reassignCandidates = useMemo(() => {
    return (projectMembersQuery.data ?? []).filter(
      (member) => member.user_id !== task?.assignee_id,
    )
  }, [projectMembersQuery.data, task?.assignee_id])
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-24 pt-3 sm:px-4">
      <section className="space-y-1 pt-1">
        <div className="flex items-center justify-between">
          <Link
            to="/projects/$projectId"
            params={{ projectId: task?.project_id ?? "" }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← {projectQuery.data?.name ?? "Quay lại dự án"}
          </Link>
          {wsConnected ? (
            <span className="flex items-center gap-1 text-[10px] text-green-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Trực tiếp
            </span>
          ) : null}
        </div>
      </section>

      {/* ── Header card (new compact layout) ── */}
      {task ? (() => {
        const headline = computeHeaderHeadline(task)
        const progress = task.reported_progress_total ?? 0
        const progressBarCls =
          progress >= 100 ? "bg-green-500"
            : progress >= 60 ? "bg-blue-500"
            : progress >= 30 ? "bg-amber-400"
            : "bg-slate-300"
        const canRequestDelay =
          isAssignee && task.status !== "done" && !hasPendingDelay
        return (
          <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
            {/* Status banner + manager menu */}
            <div className="flex items-center justify-between gap-2">
              <p className={["text-sm font-bold tracking-wide", headline.cls].join(" ")}>
                {headline.emoji} {headline.text} · {progress}%
              </p>
              {canEditTask && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title="Tác vụ quản lý"
                      aria-label="Tác vụ quản lý"
                      className="h-9 w-9 rounded-md border text-xl leading-none text-muted-foreground hover:bg-muted"
                    >
                      ⋯
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[220px]">
                    <DropdownMenuItem onClick={() => setTaskEditDialogOpen(true)}>
                      ✏️ Sửa thông tin việc
                    </DropdownMenuItem>
                    {canUpdateTaskDeadline && (
                      <DropdownMenuItem
                        onClick={() => {
                          setTaskStartDraft(toLocalDateTimeInputValue(task.start_time))
                          setTaskDeadlineDraft(toLocalDateTimeInputValue(task.end_time))
                          setDeadlineDialogOpen(true)
                        }}
                      >
                        🗓 Đổi thời gian
                      </DropdownMenuItem>
                    )}
                    {canManageExtraAssignees && (
                      <>
                        <DropdownMenuItem onClick={() => setReassignDialogOpen(true)}>
                          🔄 Đổi người làm chính
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setExtraAssigneeDialogOpen(true)}>
                          ➕ Thêm người làm cùng
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setObserverDialogOpen(true)}>
                          👀 Thêm người theo dõi
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem
                      disabled={task.status === "todo"}
                      onClick={() => updateStatusMutation.mutate("todo")}
                    >
                      ⏸ Đánh dấu: Chờ làm
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={task.status === "in_progress"}
                      onClick={() => updateStatusMutation.mutate("in_progress")}
                    >
                      ▶ Đánh dấu: Đang làm
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={task.status === "done"}
                      onClick={() => {
                        if ((task.reported_progress_total ?? 0) < 100) {
                          showErrorToast("Chưa thể đánh dấu hoàn thành khi tiến độ chưa đạt 100%")
                          return
                        }
                        updateStatusMutation.mutate("done")
                      }}
                    >
                      ✅ Đánh dấu: Hoàn thành
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Parent breadcrumb (subtask) */}
            {parentBreadcrumbs.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
                <span>Việc con của:</span>
                {parentBreadcrumbs.map((item, idx) => (
                  <span key={item.id} className="flex items-center gap-1">
                    <Link
                      to="/tasks/$taskId"
                      params={{ taskId: item.id }}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {item.name}
                    </Link>
                    {idx < parentBreadcrumbs.length - 1 && <span>/</span>}
                  </span>
                ))}
              </p>
            )}

            {/* Title */}
            <h1 className="flex items-center gap-2 text-xl font-extrabold leading-snug text-slate-900">
              {(task as any).color ? (
                <span
                  className="inline-block h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: (task as any).color }}
                  title={(task as any).color}
                />
              ) : null}
              {task.name}
            </h1>

            {/* Progress bar */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={["h-full rounded-full transition-all", progressBarCls].join(" ")}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>

            {/* Meta */}
            <div className="space-y-0.5 text-sm text-slate-600">
              <p>
                <span className="font-semibold">Hạn:</span>{" "}
                {formatDeadlineFull(task.end_time)}
              </p>
              <p>
                <span className="font-semibold">Người làm:</span>{" "}
                {task.assignee_name?.trim() || task.assignee_id || "—"}
              </p>
              {task.assignor_name && (
                <p>
                  <span className="font-semibold">Giao bởi:</span>{" "}
                  {task.assignor_name}
                </p>
              )}
            </div>

            {/* Blocked-by alert */}
            {(task.blocked_by?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="mb-1.5 text-sm font-bold text-amber-700">
                  ⏳ Đang chờ việc khác xong trước
                </p>
                <ul className="space-y-1">
                  {task.blocked_by!.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-sm text-amber-800">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                      <span className="font-medium">{b.name}</span>
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        {b.status === "todo" ? "Chờ làm" : b.status === "in_progress" ? "Đang làm" : b.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3 BIG ACTION BUTTONS */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-4 text-sm font-bold leading-tight text-blue-700 transition hover:bg-blue-100 active:scale-95"
                onClick={() => {
                  setActiveTab("progress")
                  setTimeout(() => progressSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
                }}
              >
                ✓ Cập nhật<br />tiến độ
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-4 text-sm font-bold leading-tight text-slate-700 transition hover:bg-slate-100 active:scale-95"
                onClick={() => {
                  setActiveTab("comments")
                  setTimeout(() => {
                    commentsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                    commentInputRef.current?.focus()
                  }, 80)
                }}
              >
                💬 Thảo luận
              </button>
              <button
                type="button"
                disabled={!canRequestDelay}
                className="rounded-xl border border-amber-200 bg-amber-50 px-2 py-4 text-sm font-bold leading-tight text-amber-700 transition hover:bg-amber-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber-50"
                onClick={() => setDelayDialogOpen(true)}
                title={
                  !isAssignee
                    ? "Chỉ người làm chính mới xin gia hạn được"
                    : task.status === "done"
                      ? "Việc đã hoàn thành"
                      : hasPendingDelay
                        ? "Đã có yêu cầu gia hạn chờ duyệt"
                        : undefined
                }
              >
                ⏰ Xin<br />gia hạn
              </button>
            </div>
          </section>
        )
      })() : null}

      {(extraAssignees.length > 0 || observers.length > 0) && (
        <section className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold text-slate-700">
            Người tham gia
          </h4>
          {extraAssignees.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-700">Người làm cùng</p>
              <div className="flex flex-wrap gap-2">
                {extraAssignees.map((row) => (
                  <span
                    key={row.id}
                    className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1 text-sm"
                  >
                    <span>{row.user_name?.trim() || row.user_id}</span>
                    {canManageExtraAssignees ? (
                      <button
                        type="button"
                        className="font-bold text-destructive"
                        disabled={removeExtraAssigneeMutation.isPending}
                        onClick={() => removeExtraAssigneeMutation.mutate(row.user_id)}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          )}
          {observers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-700">Người theo dõi</p>
              <div className="flex flex-wrap gap-2">
                {observers.map((row) => (
                  <span
                    key={`${row.task_id}-${row.user_id}`}
                    className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1 text-sm"
                  >
                    <span>{row.user_name?.trim() || row.user_id}</span>
                    {canManageExtraAssignees ? (
                      <button
                        type="button"
                        className="font-bold text-destructive"
                        disabled={removeObserverMutation.isPending}
                        onClick={() => removeObserverMutation.mutate(row.user_id)}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {task?.description ? (
        <section className="space-y-2">
          <h4 className="text-base font-bold text-slate-700">Mô tả công việc</h4>
          <div className="break-words rounded-lg bg-muted p-4 text-sm leading-relaxed">
            {task.description}
          </div>
        </section>
      ) : null}

      {/* ── Tabs navigation ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 bg-slate-100 p-1">
          <TabsTrigger value="progress" className="py-2 text-sm font-semibold">
            Tiến độ
          </TabsTrigger>
          <TabsTrigger value="comments" className="py-2 text-sm font-semibold">
            Thảo luận
          </TabsTrigger>
          <TabsTrigger value="subtasks" className="py-2 text-sm font-semibold">
            Phụ Trợ
          </TabsTrigger>
          <TabsTrigger value="history" className="py-2 text-sm font-semibold">
            Lịch sử
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Tab: Việc con ── */}
      {activeTab === "subtasks" && !task?.parent_id && (
      <section className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-base font-bold text-slate-700">
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
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, completionPct)}%` }} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
      )}

      {/* Subtask tab fallback for subtasks (cannot have grandchildren) */}
      {activeTab === "subtasks" && task?.parent_id && (
        <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
          Đây là công việc con, không thể có công việc con bên trong.
        </div>
      )}

      {/* ── Tab: Tiến độ ── */}
      {activeTab === "progress" && (
      <div className="space-y-6">
      <section ref={progressSectionRef} className="space-y-3 scroll-mt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h4 className="text-base font-bold text-slate-700">
            Tiến độ
          </h4>
          <p className="text-sm font-bold text-primary">
            {totalProgress}%
            {task?.status === "done" ? " · Hoàn thành" : ""}
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded-full bg-muted">
            <div className="h-2.5 rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, totalProgress)}%` }} />
          </div>
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
        <h4 className="text-base font-bold text-slate-700">
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
      </div>
      )}

      {/* ── Tab: Thảo luận ── */}
      {activeTab === "comments" && (
      <section ref={commentsSectionRef} className="space-y-3 scroll-mt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-slate-700">
            Thảo luận
          </h4>
          {task?.status === "done" && canEditTask && (
            <button
              type="button"
              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 ring-1 ring-red-200"
              onClick={() => setDefectNoteDialogOpen(true)}
            >
              ⚠ Ghi nhận lỗi
            </button>
          )}
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          {generalComments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có tin nhắn nào.</p>
          ) : (
            <div className="space-y-2">
              {generalComments.map((comment) => {
                const isDefect = comment.comment_type === "defect_note"
                return (
                  <div
                    key={comment.id}
                    className={[
                      "max-w-[90%] rounded-2xl border p-3 text-sm",
                      isDefect
                        ? "border-red-200 bg-red-50"
                        : "bg-muted",
                    ].join(" ")}
                  >
                    <div className="mb-1 flex items-baseline gap-2">
                      {isDefect && (
                        <span className="rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-800">
                          Lỗi
                        </span>
                      )}
                      <span className={["text-xs font-bold", isDefect ? "text-red-700" : "text-muted-foreground"].join(" ")}>
                        {comment.author_name ?? comment.author_id}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(comment.created_at).toLocaleString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className={isDefect ? "text-red-800" : ""}>{comment.content}</p>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={commentInputRef}
              value={commentDraft}
              onChange={(eventValue) => setCommentDraft(eventValue.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && commentDraft.trim()) {
                  e.preventDefault()
                  addCommentMutation.mutate()
                }
              }}
              placeholder="Nhập tin nhắn... (Enter để gửi)"
              className="h-10 flex-1 rounded-full border px-4 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90"
              onClick={() => {
                if (!commentDraft.trim()) return
                addCommentMutation.mutate()
              }}
            >
              ↑
            </button>
          </div>
        </div>
      </section>
      )}

      {/* ── Tab: Lịch sử (delay requests + audit log) ── */}
      {activeTab === "history" && (
      <div className="space-y-6">
      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-slate-700">
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
            <span className="text-[11px] text-muted-foreground">
              Đang có yêu cầu gia hạn chờ duyệt
            </span>
          ) : null}
        </div>

        {delayRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có yêu cầu gia hạn.</p>
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
                    <span className="text-xs font-bold text-muted-foreground">
                      {req.author_name ?? req.author_id}
                    </span>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-black uppercase",
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
                      <span className="text-[11px] text-muted-foreground">
                        → {new Date(req.requested_end_time).toLocaleDateString("vi-VN")}
                      </span>
                    )}
                  </div>
                  <p className="break-words text-sm">{req.content}</p>
                  {isPending &&
                  canApproveDelay &&
                  (currentUser?.is_superuser ||
                    req.author_id !== currentUser?.id) ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={approveDelayMutation.isPending}
                        className="rounded-md bg-green-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
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
                        className="rounded-md bg-red-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
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
                    <p className="mt-2 text-[11px] text-muted-foreground">
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

      <section className="space-y-3">
        <h4 className="text-base font-bold text-slate-700">
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
                    const typedEntry = entry as AuditLogWithActor
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
      </div>
      )}

      {/* Delay Request Dialog */}
      <Dialog open={taskEditDialogOpen} onOpenChange={setTaskEditDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Sửa thông tin việc</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Tên việc
              </label>
              <input
                type="text"
                value={taskNameDraft}
                onChange={(e) => setTaskNameDraft(e.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none"
                placeholder="Nhập tên việc"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Mô tả
              </label>
              <textarea
                value={taskDescriptionDraft}
                onChange={(e) => setTaskDescriptionDraft(e.target.value)}
                className="min-h-[84px] w-full rounded-md border px-3 py-2 text-sm outline-none"
                placeholder="Mô tả ngắn"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Ưu tiên
                </label>
                <select
                  value={taskPriorityDraft}
                  onChange={(e) => setTaskPriorityDraft(e.target.value)}
                  title="Chọn mức ưu tiên"
                  className="h-10 w-full rounded-md border px-2 text-sm"
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                  <option value="critical">Khẩn cấp</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Loại công việc
                </label>
                <select
                  value={taskModuleTagDraft}
                  onChange={(e) => setTaskModuleTagDraft(e.target.value)}
                  title="Chọn loại công việc"
                  className="h-10 w-full rounded-md border px-2 text-sm"
                >
                  <option value="">Chưa phân loại</option>
                  <option value="engineering">Kỹ thuật</option>
                  <option value="planning">Kế hoạch</option>
                  <option value="procurement">Mua hàng</option>
                  <option value="production">Sản xuất</option>
                  <option value="supply">Cung ứng</option>
                  <option value="installation">Lắp đặt</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Bắt đầu
                </label>
                <input
                  type="datetime-local"
                  title="Chọn thời gian bắt đầu"
                  aria-label="Chọn thời gian bắt đầu"
                  value={taskStartDraft}
                  onChange={(e) => setTaskStartDraft(e.target.value)}
                  className="h-10 w-full rounded-md border px-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Deadline
                </label>
                <input
                  type="datetime-local"
                  title="Chọn deadline task"
                  aria-label="Chọn deadline task"
                  value={taskDeadlineDraft}
                  onChange={(e) => setTaskDeadlineDraft(e.target.value)}
                  className="h-10 w-full rounded-md border px-2 text-sm"
                />
              </div>
            </div>
            {canEditPerfCoeff && (
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Hệ số nhân viên
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={perfCoeffDraft}
                  onChange={(e) => setPerfCoeffDraft(e.target.value)}
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none"
                  placeholder="VD: 1.0, 1.5, 2.0"
                />
              </div>
            )}
            {canEditDependency && (
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Cần làm xong việc nào trước
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    title="Chọn task phụ thuộc"
                    aria-label="Chọn task phụ thuộc"
                    className="h-9 min-w-[200px] flex-1 rounded-md border px-2 text-sm"
                    value={dependencyDraft}
                    onChange={(e) => setDependencyDraft(e.target.value)}
                  >
                    <option value="none">Chọn task cần hoàn thành trước</option>
                    {dependencyCandidates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={dependencyDraft === "none" || addDependencyMutation.isPending}
                    onClick={() => addDependencyMutation.mutate(dependencyDraft)}
                  >
                    Thêm
                  </Button>
                </div>
                {dependencyRows.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {dependencyRows.map((row) => (
                      <div
                        key={row.depId}
                        className="flex items-center justify-between rounded border bg-white px-2 py-1.5 text-sm"
                      >
                        <span className="text-slate-700">{row.blockingName}</span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-600 hover:underline"
                          onClick={() => removeDependencyMutation.mutate(row)}
                          disabled={removeDependencyMutation.isPending}
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Chưa có task phụ thuộc nào.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTaskEditDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={updateTaskInfoMutation.isPending || !taskNameDraft.trim()}
              onClick={() => updateTaskInfoMutation.mutate()}
            >
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={delayDialogOpen} onOpenChange={setDelayDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Xin gia hạn</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label
                htmlFor="delay-reason"
                className="text-sm font-semibold text-slate-700"
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
                className="text-sm font-semibold text-slate-700"
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
              className="text-sm font-semibold text-slate-700"
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

      <Dialog
        open={extraAssigneeDialogOpen}
        onOpenChange={setExtraAssigneeDialogOpen}
      >
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Thêm người làm cùng</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label
              htmlFor="extra-assignee-user"
              className="text-sm font-semibold text-slate-700"
            >
              Thành viên dự án
            </label>
            <select
              id="extra-assignee-user"
              title="Chọn người làm cùng"
              value={extraAssigneeUserId}
              onChange={(eventValue) =>
                setExtraAssigneeUserId(eventValue.target.value)
              }
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none"
            >
              <option value="">Chọn nhân sự</option>
              {availableExtraAssignees.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name?.trim() || member.email}
                </option>
              ))}
            </select>
            {availableExtraAssignees.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Không còn thành viên phù hợp để thêm.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExtraAssigneeDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={
                addExtraAssigneeMutation.isPending ||
                !extraAssigneeUserId
              }
              onClick={() => addExtraAssigneeMutation.mutate(extraAssigneeUserId)}
            >
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={observerDialogOpen} onOpenChange={setObserverDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Thêm người theo dõi</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label
              htmlFor="observer-user"
              className="text-sm font-semibold text-slate-700"
            >
              Thành viên dự án
            </label>
            <select
              id="observer-user"
              title="Chọn người theo dõi"
              value={observerUserId}
              onChange={(eventValue) => setObserverUserId(eventValue.target.value)}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none"
            >
              <option value="">Chọn nhân sự</option>
              {availableObservers.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name?.trim() || member.email}
                </option>
              ))}
            </select>
            {availableObservers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Không còn thành viên phù hợp để thêm.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setObserverDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={addObserverMutation.isPending || !observerUserId}
              onClick={() => addObserverMutation.mutate(observerUserId)}
            >
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Đổi người làm chính</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label
              htmlFor="reassign-user"
              className="text-sm font-semibold text-slate-700"
            >
              Người làm chính mới
            </label>
            <select
              id="reassign-user"
              title="Chọn người làm chính mới"
              value={reassignUserId}
              onChange={(eventValue) => setReassignUserId(eventValue.target.value)}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none"
            >
              <option value="">Chọn nhân sự</option>
              {reassignCandidates.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name?.trim() || member.email}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReassignDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={reassignMutation.isPending || !reassignUserId}
              onClick={() => reassignMutation.mutate(reassignUserId)}
            >
              Chuyển giao
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
              <label className="text-sm font-semibold text-slate-700">
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
                className="text-sm font-semibold text-slate-700"
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
                className="text-sm font-semibold text-slate-700"
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
                className="text-sm font-semibold text-slate-700"
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
                <label className="text-sm font-semibold text-slate-700">
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
              <label className="text-sm font-semibold text-slate-700">
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
                !subtaskEndTime.trim() ||
                totalChildWeight + (parseInt(subtaskWeightDraft || "0", 10) || 0) > 100
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
            <DialogTitle>Đổi thời gian</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label
                htmlFor="task-start-update"
                className="text-sm font-semibold text-slate-700"
              >
                Ngày bắt đầu
              </label>
              <input
                id="task-start-update"
                type="datetime-local"
                title="Chọn ngày bắt đầu mới cho task"
                value={taskStartDraft}
                onChange={(e) => setTaskStartDraft(e.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="task-deadline-update"
                className="text-sm font-semibold text-slate-700"
              >
                Deadline
              </label>
              <input
                id="task-deadline-update"
                type="datetime-local"
                title="Chọn deadline mới cho task"
                value={taskDeadlineDraft}
                onChange={(e) => setTaskDeadlineDraft(e.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none"
              />
            </div>
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

      {/* Defect Note Dialog */}
      <Dialog open={defectNoteDialogOpen} onOpenChange={setDefectNoteDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Ghi nhận lỗi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Ghi nhận lỗi hoặc vấn đề phát hiện sau khi công việc hoàn thành.
            </p>
            <textarea
              value={defectNoteDraft}
              onChange={(e) => setDefectNoteDraft(e.target.value)}
              placeholder="Mô tả lỗi hoặc vấn đề..."
              className="min-h-[100px] w-full rounded-md border p-3 text-sm outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDefectNoteDialogOpen(false)
                setDefectNoteDraft("")
              }}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!defectNoteDraft.trim() || addDefectNoteMutation.isPending}
              onClick={() => addDefectNoteMutation.mutate()}
            >
              Ghi nhận lỗi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
