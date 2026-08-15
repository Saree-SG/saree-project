import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  type AuditLogPublic,
  type ProjectMemberWithUserPublic,
  ProjectsService,
  type TaskCommentPublic,
  type TaskPublic,
  TasksService,
} from "@/client"
import { TaskTree } from "@/components/Tasks/TaskTree"
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
import { useGeolocation } from "@/hooks/useGeolocation"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { useTaskWebSocket } from "@/hooks/useTaskWebSocket"
import {
  addDependency,
  fetchProjectGantt,
  removeDependency,
} from "@/modules/gantt/ganttApi"
import {
  addTaskExtraAssignee,
  addTaskObserver,
  handoffTask,
  reassignTask,
  removeTaskExtraAssignee,
  removeTaskObserver,
  type TaskExtraAssigneePublic,
  type TaskObserverPublic,
  type TaskWithPeople,
} from "@/modules/tasks/taskApi"
import {
  listProgressReportsWithReview,
  reviewProgressReport,
  submitProgressReport,
} from "@/modules/tasks/taskProgressApi"
import { handleError } from "@/utils"
import {
  type AuditLogWithActor,
  auditActionIcon,
  auditActionLabel,
  formatAuditChange,
} from "@/utils/auditLog"
import {
  toIsoFromLocalDateTime,
  toLocalDateTimeInputValue,
} from "@/utils/dateTime"
import { resolveBackendMediaUrl } from "@/utils/mediaUrl"

const PROGRESS_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
])

export const Route = createFileRoute("/_layout/tasks/$taskId")({
  component: TaskDetailPage,
  // ?addChild=true lets other pages deep-link straight into the "add subtask"
  // dialog (e.g. the project tree/table row menus) (P3-1).
  validateSearch: (
    search: Record<string, unknown>,
  ): { addChild?: boolean } => ({
    addChild: search.addChild === true || search.addChild === "true",
  }),
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

function computeHeaderHeadline(task: TaskPublic): {
  emoji: string
  text: string
  cls: string
} {
  const effectiveStatus = task.computed_status ?? task.status
  const end = new Date(task.end_time)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()
  const diffH = Math.floor(diffMs / 3_600_000)
  const diffD = Math.floor(diffMs / 86_400_000)

  if (task.status === "done") {
    return { emoji: "✅", text: "ĐÃ HOÀN THÀNH", cls: "text-green-700" }
  }
  if (
    effectiveStatus === "overdue_critical" ||
    effectiveStatus === "overdue_local"
  ) {
    const overdueDays = Math.abs(diffD)
    return {
      emoji: effectiveStatus === "overdue_critical" ? "🔴" : "🟠",
      text:
        overdueDays === 0 ? "QUÁ HẠN HÔM NAY" : `QUÁ HẠN ${overdueDays} NGÀY`,
      cls:
        effectiveStatus === "overdue_critical"
          ? "text-red-700"
          : "text-orange-700",
    }
  }
  if (diffH <= 24) {
    if (diffH <= 0)
      return { emoji: "🟡", text: "HẾT HẠN HÔM NAY", cls: "text-amber-700" }
    return { emoji: "🟡", text: `CÒN ${diffH} GIỜ`, cls: "text-amber-700" }
  }
  if (diffD <= 3)
    return { emoji: "📌", text: `CÒN ${diffD} NGÀY`, cls: "text-blue-700" }
  if (effectiveStatus === "in_progress")
    return { emoji: "📋", text: "ĐANG LÀM", cls: "text-slate-600" }
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
  const progressGeo = useGeolocation()
  const progressPhotoInputRef = useRef<HTMLInputElement>(null)
  const progressSectionRef = useRef<HTMLDivElement>(null)
  const commentsSectionRef = useRef<HTMLDivElement>(null)
  const subtasksSectionRef = useRef<HTMLDivElement>(null)
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

  // Progress-report review state (the on-site photo is the completion evidence)
  const [rejectReportId, setRejectReportId] = useState<string | null>(null)
  const [rejectReportNote, setRejectReportNote] = useState("")
  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false)
  const [taskEditDialogOpen, setTaskEditDialogOpen] = useState(false)
  const [dependencyDraft, setDependencyDraft] = useState("none")
  const [taskDeadlineDraft, setTaskDeadlineDraft] = useState("")
  const [taskStartDraft, setTaskStartDraft] = useState("")
  const [taskModuleTagDraft, setTaskModuleTagDraft] = useState("")
  const [requiresCheckinDraft, setRequiresCheckinDraft] = useState(false)
  const [checkinLatDraft, setCheckinLatDraft] = useState("")
  const [checkinLngDraft, setCheckinLngDraft] = useState("")
  const [checkinRadiusDraft, setCheckinRadiusDraft] = useState("150")
  const [taskNameDraft, setTaskNameDraft] = useState("")
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState("")
  const [taskPriorityDraft, setTaskPriorityDraft] = useState("medium")
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false)
  const [pauseNote, setPauseNote] = useState("")
  const [handoffDialogOpen, setHandoffDialogOpen] = useState(false)
  const [handoffAssigneeId, setHandoffAssigneeId] = useState("")
  const [handoffNote, setHandoffNote] = useState("")
  const [subtaskDialogOpen, setSubtaskDialogOpen] = useState(false)
  const [subtaskName, setSubtaskName] = useState("")
  const [subtaskDescription, setSubtaskDescription] = useState("")
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState("")
  const [subtaskStartTime, setSubtaskStartTime] = useState("")
  const [subtaskEndTime, setSubtaskEndTime] = useState("")
  const [subtaskWeightDraft, setSubtaskWeightDraft] = useState("")
  const [subtaskExtraAssigneeIds, setSubtaskExtraAssigneeIds] = useState<
    string[]
  >([])
  const [subtaskAssigneeSearch, setSubtaskAssigneeSearch] = useState("")
  const [subtaskAssigneePickerOpen, setSubtaskAssigneePickerOpen] =
    useState(false)
  const [subtaskExtraSearch, setSubtaskExtraSearch] = useState("")
  const [subtaskExtraPickerOpen, setSubtaskExtraPickerOpen] = useState(false)
  const [extraAssigneeDialogOpen, setExtraAssigneeDialogOpen] = useState(false)
  const [extraAssigneeUserId, setExtraAssigneeUserId] = useState("")
  const [observerDialogOpen, setObserverDialogOpen] = useState(false)
  const [observerUserId, setObserverUserId] = useState("")
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false)
  const [reassignUserId, setReassignUserId] = useState("")
  const [activeTab, setActiveTab] = useState<
    "progress" | "comments" | "subtasks" | "history"
  >("progress")
  const [perfCoeffDraft, setPerfCoeffDraft] = useState("")
  const [colorDraft, setColorDraft] = useState("")
  const [weightDraft, setWeightDraft] = useState("")
  const [defectNoteDialogOpen, setDefectNoteDialogOpen] = useState(false)
  const [defectNoteDraft, setDefectNoteDraft] = useState("")

  useEffect(() => {
    setProgressReportPhotoFailed({})
  }, [])

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
    queryFn: () => listProgressReportsWithReview(taskId),
  })

  const commentsQuery = useQuery({
    queryKey: ["task-detail", "comments", taskId],
    queryFn: () =>
      TasksService.listComments({ taskId }) as Promise<TaskCommentPublic[]>,
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

  const pauseMutation = useMutation({
    mutationFn: () =>
      TasksService.updateTaskStatus({
        taskId,
        requestBody: { status: "paused", pause_note: pauseNote } as never,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã tạm dừng công việc")
      setPauseDialogOpen(false)
      setPauseNote("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const handoffMutation = useMutation({
    mutationFn: () =>
      handoffTask(taskId, handoffAssigneeId, handoffNote || undefined),
    onSuccess: async (newTask) => {
      showSuccessToast(`Đã bàn giao — task mới: ${newTask.name}`)
      setHandoffDialogOpen(false)
      setHandoffAssigneeId("")
      setHandoffNote("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
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
      let gps: { gpsLat?: number; gpsLng?: number; gpsAccuracyM?: number } = {}
      let checkinSkipReason: string | undefined
      if (taskQuery.data?.requires_checkin) {
        try {
          const fix = await progressGeo.locate()
          gps = { gpsLat: fix.lat, gpsLng: fix.lng, gpsAccuracyM: fix.accuracy }
        } catch {
          // Device couldn't locate — require a reason to report to the manager.
          const reason = progressNoteInput.trim()
          if (!reason) {
            throw new Error(
              "Không định vị được. Hãy ghi lý do vào ô ghi chú để báo quản lý, rồi gửi lại.",
            )
          }
          checkinSkipReason = reason
        }
      }
      return submitProgressReport({
        taskId,
        file: payload.file,
        progressPercent: payload.pct,
        note: progressNoteInput.trim() || undefined,
        checkinSkipReason,
        ...gps,
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

  const reviewProgressReportMutation = useMutation({
    mutationFn: ({
      reportId,
      reviewStatus,
      reviewNote,
    }: {
      reportId: string
      reviewStatus: "approved" | "rejected"
      reviewNote?: string
    }) => reviewProgressReport({ taskId, reportId, reviewStatus, reviewNote }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật trạng thái báo cáo")
      setRejectReportId(null)
      setRejectReportNote("")
      // Approval changes the official progress + task status, so refresh the same
      // set of queries that submitting a report does (task, subtasks, project).
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "progress-reports", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "subtasks", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "audit", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "project-tasks"],
      })
      // Ancestors may auto-move to "review" via rollup → refresh parent + gantt.
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "parent-task"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "gantt"],
      })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
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
      const parsedCoeff = perfCoeffDraft.trim()
        ? parseFloat(perfCoeffDraft)
        : undefined
      const parsedLat = checkinLatDraft.trim()
        ? parseFloat(checkinLatDraft)
        : null
      const parsedLng = checkinLngDraft.trim()
        ? parseFloat(checkinLngDraft)
        : null
      if ((parsedLat === null) !== (parsedLng === null)) {
        throw new Error("Cần nhập cả vĩ độ và kinh độ cho vị trí check-in")
      }
      if (
        parsedLat !== null &&
        (Number.isNaN(parsedLat) || Number.isNaN(parsedLng as number))
      ) {
        throw new Error("Toạ độ vị trí check-in không hợp lệ")
      }
      const parsedRadius = checkinRadiusDraft.trim()
        ? parseInt(checkinRadiusDraft, 10)
        : 150
      const weightRaw = weightDraft.trim()
      let parsedWeight: number | null | undefined
      if (weightRaw === "") {
        // Empty = clear explicit weight (back to auto). Only send when the task
        // actually had one, to avoid no-op writes.
        parsedWeight = task?.progress_weight != null ? null : undefined
      } else {
        const w = parseInt(weightRaw, 10)
        if (Number.isNaN(w) || w < 1 || w > 100) {
          throw new Error(
            "Trọng số tiến độ phải từ 1 đến 100 (hoặc để trống = tự động).",
          )
        }
        parsedWeight = w
      }
      return TasksService.updateTask({
        taskId,
        requestBody: {
          name: taskNameDraft.trim(),
          description: taskDescriptionDraft.trim() || null,
          priority: taskPriorityDraft,
          start_time: startTime,
          end_time: endTime,
          module_tag: taskModuleTagDraft || null,
          color: colorDraft.trim() || null,
          requires_checkin: requiresCheckinDraft,
          checkin_lat: parsedLat,
          checkin_lng: parsedLng,
          checkin_radius_m: !Number.isNaN(parsedRadius) ? parsedRadius : 150,
          ...(parsedCoeff !== undefined && !Number.isNaN(parsedCoeff)
            ? { performance_coefficient: parsedCoeff }
            : {}),
          ...(parsedWeight !== undefined
            ? { progress_weight: parsedWeight }
            : {}),
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
    mutationFn: async (blockingTaskId: string) =>
      addDependency(blockingTaskId, taskId),
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
      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu")
      }
      const weightRaw = subtaskWeightDraft.trim()
      const weight = weightRaw
        ? Math.min(100, Math.max(1, parseInt(weightRaw, 10)))
        : undefined

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
          extra_assignee_ids: subtaskExtraAssigneeIds.filter(
            (id) => id !== subtaskAssigneeId,
          ),
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
      setSubtaskAssigneeSearch("")
      setSubtaskAssigneePickerOpen(false)
      setSubtaskExtraAssigneeIds([])
      setSubtaskExtraSearch("")
      setSubtaskExtraPickerOpen(false)
      setSubtaskStartTime("")
      setSubtaskEndTime("")
      setSubtaskWeightDraft("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "subtasks", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "project-tasks"],
      })
      // The org-chart mini-tree and the "N việc con" badge derive from the
      // gantt query — refresh it too so they don't show stale data (P3-7).
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "gantt"],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const task = taskQuery.data

  // Deep-link: open the add-subtask dialog when arrived via ?addChild=true and
  // the task can still take children (level < 4) (P3-1).
  const { addChild } = Route.useSearch()
  const addChildHandledRef = useRef(false)
  useEffect(() => {
    if (
      addChild &&
      task &&
      task.level < 4 &&
      task.status !== "done" &&
      !addChildHandledRef.current
    ) {
      addChildHandledRef.current = true
      setSubtaskDialogOpen(true)
    }
  }, [addChild, task])

  useEffect(() => {
    setTaskModuleTagDraft(task?.module_tag ?? "")
    setRequiresCheckinDraft(Boolean(task?.requires_checkin))
    setCheckinLatDraft(
      (task as any)?.checkin_lat != null
        ? String((task as any).checkin_lat)
        : "",
    )
    setCheckinLngDraft(
      (task as any)?.checkin_lng != null
        ? String((task as any).checkin_lng)
        : "",
    )
    setCheckinRadiusDraft(
      (task as any)?.checkin_radius_m != null
        ? String((task as any).checkin_radius_m)
        : "150",
    )
    setTaskNameDraft(task?.name ?? "")
    setTaskDescriptionDraft(task?.description ?? "")
    setTaskPriorityDraft(task?.priority ?? "medium")
    setTaskStartDraft(toLocalDateTimeInputValue(task?.start_time))
    setTaskDeadlineDraft(toLocalDateTimeInputValue(task?.end_time))
    setPerfCoeffDraft(
      (task as any)?.performance_coefficient != null
        ? String((task as any).performance_coefficient)
        : "",
    )
    setColorDraft((task as any)?.color ?? "")
    setWeightDraft(
      task?.progress_weight != null ? String(task.progress_weight) : "",
    )
  }, [task])

  // Official self-progress = sum of APPROVED reports only (matches backend).
  const selfProgress = useMemo(
    () =>
      (progressReportsQuery.data ?? [])
        .filter((r) => r.review_status === "approved")
        .reduce((acc, r) => acc + r.progress_percent, 0),
    [progressReportsQuery.data],
  )

  // Pending submissions cap how much more can be reported (approved + pending ≤ 100).
  const submittedProgress = useMemo(
    () =>
      (progressReportsQuery.data ?? [])
        .filter((r) => r.review_status !== "rejected")
        .reduce((acc, r) => acc + r.progress_percent, 0),
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
  const canApproveDelay = (myPermissionsQuery.data ?? []).includes(
    "TASK_UPDATE",
  )
  const canApproveProof = (myPermissionsQuery.data ?? []).includes(
    "PROOF_APPROVE",
  )
  const canEditTask = (myPermissionsQuery.data ?? []).includes("TASK_UPDATE")
  const canEditPerfCoeff = Boolean(currentUser?.is_superuser) || canEditTask
  const canUpdateTaskDeadline =
    canEditTask &&
    Boolean(currentUser?.is_superuser || task?.assignor_id === currentUser?.id)
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
      .filter(
        (row) =>
          row.dependent_task_id === taskId && row.dependency_type === "FS",
      )
      .map((row) => ({
        depId: row.id,
        blockingTaskId: row.blocking_task_id,
        blockingName:
          nameById.get(row.blocking_task_id) ?? row.blocking_task_id,
      }))
  }, [
    projectGanttQuery.data?.dependencies,
    projectGanttQuery.data?.tasks,
    taskId,
  ])
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

  // Effective weight per child: explicit weights as-is; children that left it
  // blank auto-share the unallocated weight equally (mirrors backend rollup).
  const effectiveWeightById = useMemo(() => {
    const explicitTotal = subtaskRows.reduce(
      (acc, s) => acc + (s.progress_weight ?? 0),
      0,
    )
    const autoCount = subtaskRows.filter(
      (s) => s.progress_weight == null,
    ).length
    const autoWeight =
      autoCount > 0 ? Math.max(0, 100 - explicitTotal) / autoCount : 0
    const map = new Map<string, number>()
    for (const s of subtaskRows) {
      map.set(s.id, s.progress_weight ?? autoWeight)
    }
    return map
  }, [subtaskRows])

  // Total weight allocated to child tasks (effective, incl. auto-shared)
  const totalChildWeight = useMemo(
    () =>
      subtaskRows.reduce(
        (acc, s) => acc + (effectiveWeightById.get(s.id) ?? 0),
        0,
      ),
    [subtaskRows, effectiveWeightById],
  )

  // Remaining weight reserved for direct reports at this task level
  const wReport = Math.max(0, 100 - totalChildWeight)

  // Max additional % the user can report directly (self-progress cap = 100)
  const maxRemainingProgress = Math.max(0, 100 - submittedProgress)

  // Weighted contributions for display breakdown
  const directContribution = Math.round((wReport * selfProgress) / 100)
  const childContribution = Math.round(
    subtaskRows.reduce(
      (acc, s) =>
        acc +
        ((effectiveWeightById.get(s.id) ?? 0) *
          (s.reported_progress_total ?? 0)) /
          100,
      0,
    ),
  )
  const totalProgress = task?.reported_progress_total ?? 0

  // All project tasks (Gantt shape) — carries parent_id/level for the whole
  // project so we can build the full subtree of the current task.
  const projectTasks = useMemo(
    () => projectGanttQuery.data?.tasks ?? [],
    [projectGanttQuery.data?.tasks],
  )

  // Stats over ALL descendants (every nesting level), used for the header
  // summary + tab badge so users immediately see a task has children.
  const descendantStats = useMemo(() => {
    if (!task) {
      return { total: 0, inProgress: 0, done: 0 }
    }
    const childrenByParent = new Map<string, typeof projectTasks>()
    for (const t of projectTasks) {
      if (!t.parent_id) continue
      const bucket = childrenByParent.get(t.parent_id)
      if (bucket) bucket.push(t)
      else childrenByParent.set(t.parent_id, [t])
    }
    let total = 0
    let inProgress = 0
    let done = 0
    const stack = [...(childrenByParent.get(task.id) ?? [])]
    const visited = new Set<string>()
    while (stack.length > 0) {
      const node = stack.pop()!
      if (visited.has(node.id)) continue
      visited.add(node.id)
      total += 1
      if (node.status === "done") done += 1
      else if (node.status === "in_progress") inProgress += 1
      stack.push(...(childrenByParent.get(node.id) ?? []))
    }
    return { total, inProgress, done }
  }, [projectTasks, task])

  // Loading / error state for the main task — without this the page rendered an
  // empty shell (header silently null) while loading or on failure (P3-6).
  if (taskQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-2 pt-10 sm:px-4">
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground" />
          Đang tải công việc…
        </div>
      </div>
    )
  }
  if (taskQuery.isError || !task) {
    return (
      <div className="mx-auto w-full max-w-3xl px-2 pt-10 sm:px-4">
        <div className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">
            Không tải được công việc này.
          </p>
          <p className="text-xs text-muted-foreground">
            Công việc có thể đã bị xóa hoặc bạn không có quyền xem.
          </p>
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void taskQuery.refetch()}
            >
              Thử lại
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-24 pt-3 sm:px-4">
      <section className="space-y-1 pt-1">
        <div className="flex items-center justify-between">
          {task?.parent_id ? (
            <Link
              to="/tasks/$taskId"
              params={{ taskId: task.parent_id }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← {parentTaskQuery.data?.name ?? "Quay lại công việc cha"}
            </Link>
          ) : (
            <Link
              to="/projects/$projectId"
              params={{ projectId: task?.project_id ?? "" }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← {projectQuery.data?.name ?? "Quay lại dự án"}
            </Link>
          )}
          {wsConnected ? (
            <span className="flex items-center gap-1 text-[10px] text-green-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Trực tiếp
            </span>
          ) : null}
        </div>
      </section>

      {/* ── Header card (new compact layout) ── */}
      {task
        ? (() => {
            const headline = computeHeaderHeadline(task)
            const progress = task.reported_progress_total ?? 0
            const progressBarCls =
              progress >= 100
                ? "bg-green-500"
                : progress >= 60
                  ? "bg-blue-500"
                  : progress >= 30
                    ? "bg-amber-400"
                    : "bg-slate-300"
            const canRequestDelay =
              isAssignee && task.status !== "done" && !hasPendingDelay
            return (
              <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
                {/* Status banner + manager menu */}
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={[
                      "text-sm font-bold tracking-wide",
                      headline.cls,
                    ].join(" ")}
                  >
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
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[220px]"
                      >
                        <DropdownMenuItem
                          onClick={() => setTaskEditDialogOpen(true)}
                        >
                          ✏️ Sửa thông tin việc
                        </DropdownMenuItem>
                        {canUpdateTaskDeadline && (
                          <DropdownMenuItem
                            onClick={() => {
                              setTaskStartDraft(
                                toLocalDateTimeInputValue(task.start_time),
                              )
                              setTaskDeadlineDraft(
                                toLocalDateTimeInputValue(task.end_time),
                              )
                              setDeadlineDialogOpen(true)
                            }}
                          >
                            🗓 Đổi thời gian
                          </DropdownMenuItem>
                        )}
                        {canManageExtraAssignees && (
                          <>
                            <DropdownMenuItem
                              onClick={() => setReassignDialogOpen(true)}
                            >
                              🔄 Đổi người làm chính
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setExtraAssigneeDialogOpen(true)}
                            >
                              ➕ Thêm người làm cùng
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setObserverDialogOpen(true)}
                            >
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
                          onClick={() =>
                            updateStatusMutation.mutate("in_progress")
                          }
                        >
                          ▶ Đánh dấu: Đang làm
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={task.status === "done"}
                          onClick={() => {
                            if ((task.reported_progress_total ?? 0) < 100) {
                              showErrorToast(
                                "Chưa thể đánh dấu hoàn thành khi tiến độ chưa đạt 100%",
                              )
                              return
                            }
                            updateStatusMutation.mutate("done")
                          }}
                        >
                          ✅ Đánh dấu: Hoàn thành
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            task.status === "done" || task.status === "paused"
                          }
                          onClick={() => setPauseDialogOpen(true)}
                        >
                          ⏸ Tạm dừng công việc
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={task.status === "done"}
                          onClick={() => setHandoffDialogOpen(true)}
                        >
                          🔄 Bàn giao cho người khác
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Breadcrumb path: Project / Ancestor / Parent */}
                {(parentBreadcrumbs.length > 0 || task?.project_id) && (
                  <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
                    {task?.project_id && (
                      <>
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: task.project_id }}
                          className="font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          {projectQuery.data?.name ?? "Dự án"}
                        </Link>
                        {parentBreadcrumbs.length > 0 && <span>/</span>}
                      </>
                    )}
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
                    className={[
                      "h-full rounded-full transition-all",
                      progressBarCls,
                    ].join(" ")}
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
                  {(task as any).performance_coefficient != null && (
                    <p>
                      <span className="font-semibold">Hệ số nhân viên:</span>{" "}
                      {(task as any).performance_coefficient}
                    </p>
                  )}
                </div>

                {/* Subtask summary + mini-tree — so users see at a glance
                    that this task has children, and where they sit. */}
                {descendantStats.total > 0 && (
                  <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 text-left"
                      onClick={() => {
                        setActiveTab("subtasks")
                        setTimeout(
                          () =>
                            subtasksSectionRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            }),
                          50,
                        )
                      }}
                    >
                      <span className="text-sm font-semibold text-blue-800">
                        📂 Việc này có {descendantStats.total} việc con
                        {descendantStats.inProgress > 0
                          ? ` · ${descendantStats.inProgress} đang làm`
                          : ""}
                        {descendantStats.done > 0
                          ? ` · ${descendantStats.done} đã xong`
                          : ""}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-blue-600 underline-offset-2 hover:underline">
                        Xem cây →
                      </span>
                    </button>
                    {projectTasks.length > 0 && (
                      <TaskTree
                        tasks={projectTasks}
                        rootId={task.id}
                        currentTaskId={task.id}
                        initialExpandDepth={2}
                        showRoot
                      />
                    )}
                  </div>
                )}

                {/* Blocked-by alert */}
                {(task.blocked_by?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                    <p className="mb-1.5 text-sm font-bold text-amber-700">
                      ⏳ Đang chờ việc khác xong trước
                    </p>
                    <ul className="space-y-1">
                      {task.blocked_by!.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center gap-2 text-sm text-amber-800"
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                          <span className="font-medium">{b.name}</span>
                          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            {b.status === "todo"
                              ? "Chờ làm"
                              : b.status === "in_progress"
                                ? "Đang làm"
                                : b.status}
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
                      setTimeout(
                        () =>
                          progressSectionRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          }),
                        50,
                      )
                    }}
                  >
                    ✓ Cập nhật
                    <br />
                    tiến độ
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-4 text-sm font-bold leading-tight text-slate-700 transition hover:bg-slate-100 active:scale-95"
                    onClick={() => {
                      setActiveTab("comments")
                      setTimeout(() => {
                        commentsSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
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
                    ⏰ Xin
                    <br />
                    gia hạn
                  </button>
                </div>
              </section>
            )
          })()
        : null}

      {(extraAssignees.length > 0 || observers.length > 0) && (
        <section className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold text-slate-700">Người tham gia</h4>
          {extraAssignees.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-700">
                Người làm cùng
              </p>
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
                        onClick={() =>
                          removeExtraAssigneeMutation.mutate(row.user_id)
                        }
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
              <p className="text-sm font-semibold text-slate-700">
                Người theo dõi
              </p>
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
                        onClick={() =>
                          removeObserverMutation.mutate(row.user_id)
                        }
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
          <h4 className="text-base font-bold text-slate-700">
            Mô tả công việc
          </h4>
          <div className="break-words rounded-lg bg-muted p-4 text-sm leading-relaxed">
            {task.description}
          </div>
        </section>
      ) : null}

      {/* ── Tabs navigation ── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 bg-slate-100 p-1">
          <TabsTrigger value="progress" className="py-2 text-sm font-semibold">
            Tiến độ
          </TabsTrigger>
          <TabsTrigger value="comments" className="py-2 text-sm font-semibold">
            Thảo luận
          </TabsTrigger>
          <TabsTrigger value="subtasks" className="py-2 text-sm font-semibold">
            Việc con
            {descendantStats.total > 0 ? (
              <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {descendantStats.total}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="history" className="py-2 text-sm font-semibold">
            Lịch sử
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Tab: Việc con ── */}
      {activeTab === "subtasks" && (
        <section
          ref={subtasksSectionRef}
          className="space-y-3 scroll-mt-4 rounded-xl border bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-base font-bold text-slate-700">
              Công việc con
            </h4>
            {(task?.level ?? 0) < 4 ? (
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                disabled={!task?.project_id || task?.status === "done"}
                title={
                  task?.status === "done"
                    ? "Công việc cha đã hoàn thành"
                    : undefined
                }
                onClick={() => setSubtaskDialogOpen(true)}
              >
                + Thêm công việc con
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Đã đạt giới hạn 5 tầng
              </span>
            )}
          </div>

          {/* Full hierarchy tree (all nesting levels) shown org-chart style:
              the big task on top, its children stacked below. If the current
              task is a leaf, root at its parent so the surrounding branch
              (parent + siblings) is still visible. */}
          {projectTasks.length > 0 && task ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cây công việc
              </p>
              <TaskTree
                tasks={projectTasks}
                rootId={
                  descendantStats.total > 0
                    ? taskId
                    : (task.parent_id ?? taskId)
                }
                currentTaskId={taskId}
                showRoot
              />
            </div>
          ) : null}

          {/* Direct children with weight / progress contribution breakdown. */}
          {subtaskRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chưa có công việc con nào.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Phân bổ trọng số (việc con trực tiếp)
              </p>
              {subtaskRows.map((subtask) => {
                const completionPct = subtask.reported_progress_total ?? 0
                const isAutoWeight = subtask.progress_weight == null
                const weight = Math.round(
                  effectiveWeightById.get(subtask.id) ?? 0,
                )
                return (
                  <Link
                    key={subtask.id}
                    to="/tasks/$taskId"
                    params={{ taskId: subtask.id }}
                    className="block rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="break-words text-sm font-bold">
                          {subtask.name}
                        </p>
                        <p className="break-words text-[11px] text-muted-foreground">
                          {subtask.assignee_name ?? subtask.assignee_id} · Hạn{" "}
                          {new Date(subtask.end_time).toLocaleString("vi-VN")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-row flex-wrap items-end justify-between gap-x-4 gap-y-1 sm:flex-col sm:items-end sm:justify-start sm:text-right">
                        <p className="text-[10px] font-bold uppercase text-primary">
                          {subtask.computed_status ?? subtask.status}
                        </p>
                        <p className="text-sm font-bold text-slate-800">
                          {completionPct}%
                        </p>
                        <p className="max-w-full break-words text-left text-[10px] text-slate-400 sm:text-right">
                          đóng góp {Math.round((weight * completionPct) / 100)}/
                          {weight}%
                          {isAutoWeight ? (
                            <span className="ml-1 text-slate-400">
                              (tự chia)
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, completionPct)}%` }}
                      />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Tab: Tiến độ ── */}
      {activeTab === "progress" && (
        <div className="space-y-6">
          <section ref={progressSectionRef} className="space-y-3 scroll-mt-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h4 className="text-base font-bold text-slate-700">Tiến độ</h4>
              <p className="text-sm font-bold text-primary">
                {totalProgress}%{task?.status === "done" ? " · Hoàn thành" : ""}
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded-full bg-muted">
                <div
                  className="h-2.5 rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, totalProgress)}%` }}
                />
              </div>
              {/* Breakdown: only shown for root tasks with subtasks */}
              {subtaskRows.length > 0 && (
                <div className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] min-[380px]:grid-cols-2">
                  <div className="min-w-0">
                    <p className="break-words text-muted-foreground">
                      Từ công việc con
                    </p>
                    <p className="font-semibold text-slate-700">
                      {childContribution}%
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-muted-foreground">
                      Báo cáo tại đây{" "}
                      {wReport < 100 ? `(tối đa ${wReport}%)` : ""}
                    </p>
                    <p className="break-words font-semibold text-slate-700">
                      {directContribution}%
                      {selfProgress > 0 &&
                      selfProgress !== directContribution ? (
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
                  Đã duyệt {selfProgress}/100%
                  {submittedProgress > selfProgress
                    ? ` · chờ duyệt ${submittedProgress - selfProgress}%`
                    : ""}{" "}
                  · Chỉ % đã duyệt mới được tính. Khi duyệt đủ 100% sẽ chuyển
                  sang kiểm tra.
                </p>
              )}
            </div>

            {totalChildWeight > 100 && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">
                Tổng mức đóng góp của công việc con ({totalChildWeight}%) đang
                vượt quá 100%. Hãy điều chỉnh lại.
              </p>
            )}
            {wReport > 0 ? (
              <div className="rounded-lg border bg-white p-3">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-2">
                    <label
                      htmlFor="progress-photo-file"
                      className="text-[11px] font-semibold text-muted-foreground"
                    >
                      Ảnh / tài liệu hiện trường
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="progress-photo-file"
                        ref={progressPhotoInputRef}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        capture="environment"
                        title="Chọn ảnh hoặc tài liệu báo cáo"
                        aria-label="Chọn ảnh hoặc tài liệu báo cáo tiến độ"
                        className="sr-only"
                        disabled={task?.status === "done"}
                        onChange={(eventValue) => {
                          const file = eventValue.target.files?.[0]
                          if (!file) {
                            return
                          }
                          const isImage = file.type.startsWith("image/")
                          const isDocument = PROGRESS_DOCUMENT_MIME_TYPES.has(
                            file.type,
                          )
                          if (!isImage && !isDocument) {
                            showErrorToast(
                              "Chỉ chọn ảnh hoặc tài liệu Word/Excel/PowerPoint/PDF",
                            )
                            return
                          }
                          setProgressPhotoFile(file)
                          setProgressPhotoPreview((previous) => {
                            if (previous) {
                              URL.revokeObjectURL(previous)
                            }
                            return isImage ? URL.createObjectURL(file) : null
                          })
                        }}
                      />
                      <button
                        type="button"
                        title="Chọn ảnh hoặc tài liệu"
                        disabled={task?.status === "done"}
                        className="h-9 rounded-md border bg-slate-50 px-3 text-xs font-bold text-slate-700 disabled:opacity-60"
                        onClick={() => progressPhotoInputRef.current?.click()}
                      >
                        Chọn ảnh / tài liệu
                      </button>
                      {progressPhotoFile ? (
                        <button
                          type="button"
                          title="Bỏ file"
                          className="h-9 rounded-md border border-input bg-transparent px-3 text-xs font-semibold text-muted-foreground"
                          onClick={clearProgressPhotoPick}
                        >
                          Bỏ file
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
                    ) : progressPhotoFile ? (
                      <p className="mt-1 max-w-full truncate text-xs text-muted-foreground">
                        📄 {progressPhotoFile.name}
                      </p>
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
                      className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none disabled:opacity-60"
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
                    className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none disabled:opacity-60"
                  />
                </div>
                {task?.requires_checkin && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                    <span>📍</span>
                    <span>
                      Công việc này yêu cầu <b>check-in vị trí</b> khi gửi báo
                      cáo. Nếu thiết bị không định vị được, hãy ghi lý do vào ô
                      ghi chú — báo cáo sẽ được gửi kèm cờ báo quản lý.
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  title="Gửi báo cáo tiến độ"
                  className="h-9 w-full rounded-md bg-primary text-sm font-bold text-white disabled:opacity-60 sm:w-auto sm:px-6"
                  disabled={
                    task?.status === "done" ||
                    addProgressReportMutation.isPending
                  }
                  onClick={() => {
                    const pct = parseProgressPercent(
                      progressPercentInput.trim(),
                    )
                    if (!progressPhotoFile) {
                      showErrorToast("Chọn ảnh hoặc tài liệu từ máy")
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
                    addProgressReportMutation.mutate({
                      pct,
                      file: progressPhotoFile,
                    })
                  }}
                >
                  Gửi báo cáo
                </button>
              </div>
            ) : (
              <p className="rounded-lg border bg-slate-50 p-3 text-[11px] text-muted-foreground">
                Tiến độ của công việc này được tính hoàn toàn từ công việc con —
                không cần nộp báo cáo/bằng chứng tại đây. Hãy báo cáo ở từng
                công việc con.
              </p>
            )}
            <div className="space-y-3">
              {(progressReportsQuery.data ?? []).map((row) => {
                const thumbSrc = resolveBackendMediaUrl(row.photo_url)
                const thumbFailed = Boolean(progressReportPhotoFailed[row.id])
                const isDocumentFile = /\.(pdf|docx?|xlsx?|pptx?)$/i.test(
                  row.photo_url ?? "",
                )
                const showThumb =
                  Boolean(thumbSrc) && !thumbFailed && !isDocumentFile
                return (
                  <div
                    key={row.id}
                    className="flex min-w-0 gap-3 rounded-lg border bg-slate-50 p-3"
                  >
                    {isDocumentFile && thumbSrc ? (
                      <a
                        href={thumbSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Mở tài liệu"
                        className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted px-1 text-center text-[9px] font-medium leading-tight text-blue-600"
                      >
                        <span className="text-lg">📄</span>
                        Xem file
                      </a>
                    ) : showThumb ? (
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
                        title={
                          thumbFailed ? "Không tải được ảnh" : "Chưa có ảnh"
                        }
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
                        <p className="mt-1 break-words text-[13px]">
                          {row.note}
                        </p>
                      ) : null}
                      {row.gps_lat != null && row.gps_lng != null ? (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <a
                            href={`https://www.google.com/maps?q=${row.gps_lat},${row.gps_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 break-all text-[12px] font-medium text-blue-600 hover:underline"
                            title="Mở vị trí trên Google Maps"
                          >
                            📍 {row.gps_lat.toFixed(6)},{" "}
                            {row.gps_lng.toFixed(6)}
                            {row.gps_accuracy_m != null
                              ? ` (±${Math.round(row.gps_accuracy_m)}m)`
                              : ""}
                          </a>
                          {row.location_valid === true ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
                              ✓ Đúng vị trí
                              {row.distance_m != null
                                ? ` · cách ${Math.round(row.distance_m)}m`
                                : ""}
                            </span>
                          ) : row.location_valid === false ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                              ✗ Sai vị trí
                              {row.distance_m != null
                                ? ` · cách ${Math.round(row.distance_m)}m`
                                : ""}
                            </span>
                          ) : null}
                        </div>
                      ) : row.checkin_skipped ? (
                        <p className="mt-1 text-[12px] font-medium text-amber-600">
                          ⚠️ Không có vị trí (đã bỏ qua check-in)
                        </p>
                      ) : null}

                      {/* Review status + actions — the on-site photo is the evidence */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                            row.review_status === "approved"
                              ? "bg-green-200 text-green-800"
                              : row.review_status === "rejected"
                                ? "bg-red-200 text-red-800"
                                : "bg-slate-200 text-slate-700",
                          ].join(" ")}
                        >
                          {row.review_status === "approved"
                            ? "Đã duyệt"
                            : row.review_status === "rejected"
                              ? "Bị từ chối"
                              : "Chờ duyệt"}
                        </span>
                        {row.review_status === "rejected" && row.review_note ? (
                          <span className="text-[11px] text-red-600">
                            {row.review_note}
                          </span>
                        ) : null}
                      </div>
                      {row.review_status === "pending" && canApproveProof ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={reviewProgressReportMutation.isPending}
                            className="rounded-md bg-green-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                            onClick={() =>
                              reviewProgressReportMutation.mutate({
                                reportId: row.id,
                                reviewStatus: "approved",
                              })
                            }
                          >
                            Duyệt
                          </button>
                          <button
                            type="button"
                            disabled={reviewProgressReportMutation.isPending}
                            className="rounded-md border border-red-300 px-3 py-1 text-[11px] font-bold text-red-600 disabled:opacity-60"
                            onClick={() => {
                              setRejectReportId(row.id)
                              setRejectReportNote("")
                            }}
                          >
                            Từ chối
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: Thảo luận ── */}
      {activeTab === "comments" && (
        <section ref={commentsSectionRef} className="space-y-3 scroll-mt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-slate-700">Thảo luận</h4>
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
              <p className="text-sm text-muted-foreground">
                Chưa có tin nhắn nào.
              </p>
            ) : (
              <div className="space-y-2">
                {generalComments.map((comment) => {
                  const isDefect = comment.comment_type === "defect_note"
                  return (
                    <div
                      key={comment.id}
                      className={[
                        "max-w-[90%] rounded-2xl border p-3 text-sm",
                        isDefect ? "border-red-200 bg-red-50" : "bg-muted",
                      ].join(" ")}
                    >
                      <div className="mb-1 flex items-baseline gap-2">
                        {isDefect && (
                          <span className="rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-800">
                            Lỗi
                          </span>
                        )}
                        <span
                          className={[
                            "text-xs font-bold",
                            isDefect ? "text-red-700" : "text-muted-foreground",
                          ].join(" ")}
                        >
                          {comment.author_name ?? comment.author_id}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(comment.created_at).toLocaleString(
                            "vi-VN",
                            {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                      </div>
                      <p className={isDefect ? "text-red-800" : ""}>
                        {comment.content}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={commentInputRef}
                value={commentDraft}
                onChange={(eventValue) =>
                  setCommentDraft(eventValue.target.value)
                }
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
              <p className="text-sm text-muted-foreground">
                Chưa có yêu cầu gia hạn.
              </p>
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
                          {isPending
                            ? "Đang chờ"
                            : isApproved
                              ? "Đã duyệt"
                              : "Từ chối"}
                        </span>
                        {req.requested_end_time && (
                          <span className="text-[11px] text-muted-foreground">
                            →{" "}
                            {new Date(
                              req.requested_end_time,
                            ).toLocaleDateString("vi-VN")}
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
                          Yêu cầu này do bạn tạo — cần người có quyền khác
                          (không phải chính bạn) duyệt hoặc từ chối.
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-base font-bold text-slate-700">Lịch sử</h4>
            <div className="space-y-3 rounded-xl border bg-white p-4">
              {auditQuery.isPending ? (
                <p className="text-xs text-muted-foreground">
                  Đang tải lịch sử...
                </p>
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
                        const actor =
                          typedEntry.actor_name ?? typedEntry.actor_id
                        const time = new Date(
                          typedEntry.created_at,
                        ).toLocaleString("vi-VN")
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

      {/* Edit task info Dialog */}
      <Dialog open={taskEditDialogOpen} onOpenChange={setTaskEditDialogOpen}>
        <DialogContent
          className="max-h-[90vh] w-full max-w-md overflow-x-hidden overflow-y-auto"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Sửa thông tin việc</DialogTitle>
          </DialogHeader>
          <div className="min-w-0 space-y-3">
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Tên việc
              </label>
              <input
                type="text"
                value={taskNameDraft}
                onChange={(e) => setTaskNameDraft(e.target.value)}
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
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
                className="min-h-[84px] w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none"
                placeholder="Mô tả ngắn"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Ưu tiên
                </label>
                <select
                  value={taskPriorityDraft}
                  onChange={(e) => setTaskPriorityDraft(e.target.value)}
                  title="Chọn mức ưu tiên"
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                  <option value="critical">Khẩn cấp</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Loại công việc
                </label>
                <select
                  value={taskModuleTagDraft}
                  onChange={(e) => setTaskModuleTagDraft(e.target.value)}
                  title="Chọn loại công việc"
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"
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
            <label className="flex items-start gap-2 rounded-md border border-input p-2.5 text-sm">
              <input
                type="checkbox"
                checked={requiresCheckinDraft}
                onChange={(e) => setRequiresCheckinDraft(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-slate-700">
                  Yêu cầu check-in vị trí khi nộp báo cáo
                </span>
                <span className="block text-xs text-muted-foreground">
                  Người thực hiện phải bật GPS khi gửi báo cáo tiến độ. Nếu
                  thiết bị không định vị được, họ phải ghi lý do để báo quản lý.
                </span>
              </span>
            </label>
            {requiresCheckinDraft ? (
              <div className="min-w-0 space-y-2 rounded-md border border-input p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Vị trí check-in chuẩn
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-input px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-slate-50"
                    onClick={() => {
                      if (!navigator.geolocation) {
                        showErrorToast("Thiết bị không hỗ trợ định vị")
                        return
                      }
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setCheckinLatDraft(pos.coords.latitude.toFixed(6))
                          setCheckinLngDraft(pos.coords.longitude.toFixed(6))
                          showSuccessToast("Đã lấy vị trí hiện tại")
                        },
                        () => showErrorToast("Không lấy được vị trí hiện tại"),
                        { enableHighAccuracy: true, timeout: 10000 },
                      )
                    }}
                  >
                    📍 Lấy vị trí hiện tại
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={checkinLatDraft}
                    onChange={(e) => setCheckinLatDraft(e.target.value)}
                    className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                    placeholder="Vĩ độ (lat)"
                    aria-label="Vĩ độ vị trí check-in"
                  />
                  <input
                    type="number"
                    step="any"
                    value={checkinLngDraft}
                    onChange={(e) => setCheckinLngDraft(e.target.value)}
                    className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                    placeholder="Kinh độ (lng)"
                    aria-label="Kinh độ vị trí check-in"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="shrink-0 text-xs text-muted-foreground">
                    Bán kính cho phép (m)
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={checkinRadiusDraft}
                    onChange={(e) => setCheckinRadiusDraft(e.target.value)}
                    className="h-9 w-24 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                    placeholder="150"
                    aria-label="Bán kính cho phép"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Báo cáo nộp trong bán kính này (cộng sai số GPS) sẽ được đánh
                  dấu
                  <b> đúng vị trí</b>. Để trống toạ độ nếu chưa cần kiểm tra.
                </p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Bắt đầu
                </label>
                <input
                  type="datetime-local"
                  title="Chọn thời gian bắt đầu"
                  aria-label="Chọn thời gian bắt đầu"
                  value={taskStartDraft}
                  onChange={(e) => setTaskStartDraft(e.target.value)}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Deadline
                </label>
                <input
                  type="datetime-local"
                  title="Chọn deadline task"
                  aria-label="Chọn deadline task"
                  value={taskDeadlineDraft}
                  onChange={(e) => setTaskDeadlineDraft(e.target.value)}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"
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
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
                  placeholder="VD: 1.0, 1.5, 2.0"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Màu nhãn
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Chọn màu nhãn"
                  value={colorDraft || "#3b82f6"}
                  onChange={(e) => setColorDraft(e.target.value)}
                  className="h-10 w-14 shrink-0 cursor-pointer rounded-md border border-input bg-transparent"
                />
                <input
                  type="text"
                  value={colorDraft}
                  onChange={(e) => setColorDraft(e.target.value)}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
                  placeholder="#3b82f6 (để trống = không màu)"
                />
                {colorDraft ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setColorDraft("")}
                  >
                    Xoá
                  </Button>
                ) : null}
              </div>
            </div>
            {task.level > 0 && (
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Trọng số tiến độ (% của việc cha)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={weightDraft}
                  onChange={(e) => setWeightDraft(e.target.value)}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
                  placeholder="Để trống = tự động chia đều"
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
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
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
                    disabled={
                      dependencyDraft === "none" ||
                      addDependencyMutation.isPending
                    }
                    onClick={() =>
                      addDependencyMutation.mutate(dependencyDraft)
                    }
                  >
                    Thêm
                  </Button>
                </div>
                {dependencyRows.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {dependencyRows.map((row) => (
                      <div
                        key={row.depId}
                        className="flex items-center justify-between rounded border border-input bg-white px-2 py-1.5 text-sm"
                      >
                        <span className="text-slate-700">
                          {row.blockingName}
                        </span>
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
              disabled={
                updateTaskInfoMutation.isPending || !taskNameDraft.trim()
              }
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
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
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

      {/* Reject Progress Report Dialog */}
      <Dialog
        open={Boolean(rejectReportId)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectReportId(null)
            setRejectReportNote("")
          }
        }}
      >
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Từ chối báo cáo tiến độ</DialogTitle>
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
              value={rejectReportNote}
              onChange={(e) => setRejectReportNote(e.target.value)}
              placeholder="Ví dụ: Ảnh không rõ nét, chưa đúng hạng mục yêu cầu..."
              className="min-h-[90px] w-full rounded-md border p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectReportId(null)
                setRejectReportNote("")
              }}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !rejectReportNote.trim() ||
                reviewProgressReportMutation.isPending
              }
              onClick={() => {
                if (!rejectReportId) return
                reviewProgressReportMutation.mutate({
                  reportId: rejectReportId,
                  reviewStatus: "rejected",
                  reviewNote: rejectReportNote.trim(),
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
                addExtraAssigneeMutation.isPending || !extraAssigneeUserId
              }
              onClick={() =>
                addExtraAssigneeMutation.mutate(extraAssigneeUserId)
              }
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
              onChange={(eventValue) =>
                setObserverUserId(eventValue.target.value)
              }
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
              onChange={(eventValue) =>
                setReassignUserId(eventValue.target.value)
              }
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
                onChange={(eventValue) =>
                  setSubtaskName(eventValue.target.value)
                }
                placeholder="Ví dụ: Đi dây điện tầng 2"
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">
                Người thực hiện
              </label>
              <input
                value={subtaskAssigneeSearch}
                onFocus={() => setSubtaskAssigneePickerOpen(true)}
                onBlur={() =>
                  setTimeout(() => setSubtaskAssigneePickerOpen(false), 120)
                }
                onChange={(e) => {
                  setSubtaskAssigneeSearch(e.target.value)
                  setSubtaskAssigneeId("")
                }}
                placeholder="Gõ tên hoặc email thành viên..."
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
              />
              {subtaskAssigneePickerOpen ? (
                <div className="max-h-48 overflow-auto rounded-md border">
                  {(() => {
                    const kw = subtaskAssigneeSearch.trim().toLowerCase()
                    const pool = projectMembersQuery.data ?? []
                    const filtered = kw
                      ? pool.filter(
                          (m) =>
                            (m.full_name ?? "").toLowerCase().includes(kw) ||
                            m.email.toLowerCase().includes(kw),
                        )
                      : pool
                    if (filtered.length === 0) {
                      return (
                        <p className="p-2 text-xs text-muted-foreground">
                          Không có thành viên phù hợp trong dự án.
                        </p>
                      )
                    }
                    return filtered.slice(0, 12).map((m) => (
                      <button
                        key={`subtask-assignee-${m.user_id}`}
                        type="button"
                        className={[
                          "flex w-full items-center justify-between px-2 py-2 text-left text-xs hover:bg-slate-50",
                          subtaskAssigneeId === m.user_id ? "bg-slate-100" : "",
                        ].join(" ")}
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setSubtaskAssigneeId(m.user_id)
                          setSubtaskAssigneeSearch(
                            m.full_name?.trim() || m.email,
                          )
                          setSubtaskAssigneePickerOpen(false)
                        }}
                      >
                        <span className="font-medium">
                          {m.full_name || "N/A"}
                        </span>
                        <span className="text-muted-foreground">{m.email}</span>
                      </button>
                    ))
                  })()}
                </div>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">
                Người cùng thực hiện (tuỳ chọn)
              </label>
              {subtaskExtraAssigneeIds.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {subtaskExtraAssigneeIds.map((id) => {
                    const u = (projectMembersQuery.data ?? []).find(
                      (m) => m.user_id === id,
                    )
                    const label = u?.full_name?.trim() || u?.email || id
                    return (
                      <span
                        key={`subtask-extra-${id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                      >
                        {label}
                        <button
                          type="button"
                          className="text-blue-500 hover:text-blue-700"
                          onClick={() =>
                            setSubtaskExtraAssigneeIds((cur) =>
                              cur.filter((x) => x !== id),
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
              <input
                value={subtaskExtraSearch}
                onFocus={() => setSubtaskExtraPickerOpen(true)}
                onBlur={() =>
                  setTimeout(() => setSubtaskExtraPickerOpen(false), 120)
                }
                onChange={(e) => setSubtaskExtraSearch(e.target.value)}
                placeholder="Gõ tên hoặc email để thêm..."
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
              />
              {subtaskExtraPickerOpen ? (
                <div className="max-h-48 overflow-auto rounded-md border">
                  {(() => {
                    const kw = subtaskExtraSearch.trim().toLowerCase()
                    const pool = (projectMembersQuery.data ?? []).filter(
                      (m) =>
                        m.user_id !== subtaskAssigneeId &&
                        !subtaskExtraAssigneeIds.includes(m.user_id),
                    )
                    const filtered = kw
                      ? pool.filter(
                          (m) =>
                            (m.full_name ?? "").toLowerCase().includes(kw) ||
                            m.email.toLowerCase().includes(kw),
                        )
                      : pool
                    if (filtered.length === 0) {
                      return (
                        <p className="p-2 text-xs text-muted-foreground">
                          Không có thành viên phù hợp.
                        </p>
                      )
                    }
                    return filtered.slice(0, 12).map((m) => (
                      <button
                        key={`subtask-extra-${m.user_id}`}
                        type="button"
                        className="flex w-full items-center justify-between px-2 py-2 text-left text-xs hover:bg-slate-50"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setSubtaskExtraAssigneeIds((cur) =>
                            cur.includes(m.user_id) ? cur : [...cur, m.user_id],
                          )
                          setSubtaskExtraSearch("")
                        }}
                      >
                        <span className="font-medium">
                          {m.full_name || "N/A"}
                        </span>
                        <span className="text-muted-foreground">{m.email}</span>
                      </button>
                    ))
                  })()}
                </div>
              ) : null}
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
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
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
                onChange={(eventValue) =>
                  setSubtaskEndTime(eventValue.target.value)
                }
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
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
                    "h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none",
                    totalChildWeight +
                      (parseInt(subtaskWeightDraft || "0", 10) || 0) >
                    100
                      ? "border-red-400"
                      : "",
                  ].join(" ")}
                />
                <p
                  className={[
                    "text-[10px]",
                    totalChildWeight > 100
                      ? "text-red-500 font-semibold"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  Các công việc con đã chiếm {totalChildWeight}% · Còn lại{" "}
                  {wReport}% cho báo cáo trực tiếp
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
                totalChildWeight +
                  (parseInt(subtaskWeightDraft || "0", 10) || 0) >
                  100
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
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
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
                className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
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
              disabled={
                !taskDeadlineDraft.trim() || updateDeadlineMutation.isPending
              }
              onClick={() => updateDeadlineMutation.mutate()}
            >
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Defect Note Dialog */}
      <Dialog
        open={defectNoteDialogOpen}
        onOpenChange={setDefectNoteDialogOpen}
      >
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
              disabled={
                !defectNoteDraft.trim() || addDefectNoteMutation.isPending
              }
              onClick={() => addDefectNoteMutation.mutate()}
            >
              Ghi nhận lỗi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Tạm dừng ── */}
      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>⏸ Tạm dừng công việc</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Nhập lý do tạm dừng (bắt buộc). Task sẽ chuyển sang trạng thái{" "}
              <strong>Paused</strong> và không tính vào workload.
            </p>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
              placeholder="VD: Chờ vật tư, thời tiết xấu..."
              value={pauseNote}
              onChange={(e) => setPauseNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={!pauseNote.trim() || pauseMutation.isPending}
              onClick={() => pauseMutation.mutate()}
            >
              Xác nhận tạm dừng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Bàn giao ── */}
      <Dialog open={handoffDialogOpen} onOpenChange={setHandoffDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>🔄 Bàn giao công việc</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Task gốc sẽ được tạm dừng. Task mới được tạo cho người tiếp nhận,
              giữ nguyên <strong>{task?.reported_progress_total ?? 0}%</strong>{" "}
              tiến độ hiện tại.
            </p>
            <div className="space-y-1">
              <p className="text-xs font-semibold">Người tiếp nhận (user ID)</p>
              <input
                className="w-full rounded-md border px-3 py-1.5 text-sm"
                placeholder="Dán user ID hoặc chọn từ danh sách..."
                value={handoffAssigneeId}
                onChange={(e) => setHandoffAssigneeId(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Hiện tại cần nhập user ID thủ công — sẽ có picker sau khi Bước 3
                (Skill) hoàn tất.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold">Ghi chú (tuỳ chọn)</p>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={2}
                placeholder="Lý do bàn giao..."
                value={handoffNote}
                onChange={(e) => setHandoffNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHandoffDialogOpen(false)}
            >
              Hủy
            </Button>
            <Button
              disabled={!handoffAssigneeId.trim() || handoffMutation.isPending}
              onClick={() => handoffMutation.mutate()}
            >
              Xác nhận bàn giao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
