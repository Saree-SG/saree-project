import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { ChevronDown, ChevronRight, BookTemplate, Plus, MoreHorizontal, BookmarkPlus, Layers } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import ProjectGantt from "@/components/Gantt/ProjectGanttV2"
import { DelayWarnings } from "@/components/Project/DelayWarnings"

import {
  ApiError,
  DashboardService,
  type ProjectMemberWithUserPublic,
  type ProjectPublic,
  ProjectsService,
  RolesService,
  type TaskCreate,
  type TaskPublic,
  TasksService,
  UsersService,
} from "@/client"
import { PermissionGuard } from "@/components/PermissionGuard"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import { clearSession } from "@/modules/auth/tokenStore"
import { createProjectChatRoom } from "@/modules/chat/chatApi"
import EditProfileDialog from "@/components/TaskProfile/EditProfileDialog"
import {
  applyProfile,
  listProfiles,
  listProfilesByCompany,
  saveTaskAsProfile,
  type TaskProfile,
} from "@/modules/taskProfile/taskProfileApi"
import { addDependency } from "@/modules/gantt/ganttApi"
import { listCompanyMembers, listCompanyRoles, readMyPermissions, type CompanyRole } from "@/modules/rbac/rbacApi"
import { handleError } from "@/utils"
import { hasPermission } from "@/utils/accountAccess"

type ProjectStatsPayload = {
  project_id: string
  name: string
  status: string
  total_tasks: number
  done_tasks: number
  overdue_tasks: number
  completion_pct: number
}

type WorkloadPayload = {
  user_id: string
  user_name?: string
  active_tasks: number
}

export const Route = createFileRoute("/_layout/projects/$projectId")({
  beforeLoad: async () => {
    let permissions
    let me
    try {
      ;[permissions, me] = await Promise.all([
        readMyPermissions(),
        UsersService.readUserMe(),
      ])
    } catch (errorValue) {
      if (errorValue instanceof ApiError && errorValue.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw errorValue
    }
    const allowed = Boolean(me?.is_superuser) || hasPermission(permissions, "PROJECT_VIEW")
    if (!allowed) {
      throw redirect({ to: "/tasks" })
    }
  },
  component: ProjectTaskDashboardPage,
})

function statusLabel(status: string) {
  if (status === "todo" || status === "to_do") return "Chờ làm"
  if (status === "done" || status === "completed") return "Hoàn thành"
  if (status === "in_progress" || status === "active") return "Đang thực hiện"
  if (status === "review") return "Chờ duyệt"
  if (status === "on_hold") return "Tạm dừng"
  if (status === "cancelled") return "Đã hủy"
  if (status === "planning") return "Lên kế hoạch"
  return status ?? "—"
}

function taskBusinessLabel(task: TaskPublic): string {
  const moduleTag = task.module_tag?.trim()
  if (moduleTag) {
    if (moduleTag === "engineering") return "Kỹ thuật"
    if (moduleTag === "planning") return "Kế hoạch"
    if (moduleTag === "production") return "Sản xuất"
    if (moduleTag === "sales") return "Kinh doanh"
    if (moduleTag === "director") return "Ban giám đốc"
    if (moduleTag === "procurement") return "Mua hàng"
    if (moduleTag === "inventory") return "Kho vật tư"
    if (moduleTag === "quotation") return "Báo giá"
    if (moduleTag === "contract") return "Hợp đồng"
    return moduleTag
  }
  if (task.linked_entity_type === "purchase_request") return "Đề nghị mua hàng"
  if (task.linked_entity_type === "material_issue") return "Xuất vật tư"
  return "Công việc chung"
}

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase()
}

function projectStatusColor(status: string) {
  if (status === "completed" || status === "done") return "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
  if (status === "in_progress" || status === "active") return "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
  if (status === "on_hold") return "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
  if (status === "cancelled") return "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
  return "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
}

function ProgressBar({ value, color = "bg-primary" }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * Calculate whole overdue days from task end time.
 */
function getOverdueDays(endTime: string): number {
  const end = new Date(endTime)
  const diffMs = Date.now() - end.getTime()
  if (diffMs <= 0) {
    return 0
  }
  return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)))
}

function addWorkingDays(startDateStr: string, days: number): string {
  const date = new Date(`${startDateStr}T12:00:00`)
  let added = 0
  while (added < days) {
    date.setDate(date.getDate() + 1)
    const dow = date.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return date.toISOString().slice(0, 10)
}

function ProjectTaskDashboardPage() {
  const { projectId } = Route.useParams()
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const navigate = useNavigate()

  const [editOpen, setEditOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState("")
  const [projectCodeDraft, setProjectCodeDraft] = useState("")
  const [projectStatusDraft, setProjectStatusDraft] = useState("planning")
  const [projectEndDateDraft, setProjectEndDateDraft] = useState("")
  const [projectTypeDraft, setProjectTypeDraft] = useState("client")
  const [memberEmailDraft, setMemberEmailDraft] = useState("")
  const [memberSelectedUserId, setMemberSelectedUserId] = useState<string>("")
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [taskNameDraft, setTaskNameDraft] = useState("")
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState("")
  const [taskAssigneeEmailDraft, setTaskAssigneeEmailDraft] = useState("")
  const [taskAssigneeSelectedUserId, setTaskAssigneeSelectedUserId] = useState("")
  const [taskAssigneePickerOpen, setTaskAssigneePickerOpen] = useState(false)
  const [taskExtraAssigneeIds, setTaskExtraAssigneeIds] = useState<string[]>([])
  const [taskExtraPickerOpen, setTaskExtraPickerOpen] = useState(false)
  const [taskExtraSearchDraft, setTaskExtraSearchDraft] = useState("")
  const [taskStartDateDraft, setTaskStartDateDraft] = useState("")
  const [taskEndDateDraft, setTaskEndDateDraft] = useState("")
  const [taskWorkingDays, setTaskWorkingDays] = useState("")
  const [taskDependencyDraft, setTaskDependencyDraft] = useState("none")
  const [selectedProfileId, setSelectedProfileId] = useState("")
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)
  const [productionSetupOpen, setProductionSetupOpen] = useState(false)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [taskView, setTaskView] = useState<"list" | "table" | "gantt" | "tree">("list")
  // Tree view expand/collapse state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  // Profile manager
  const [profileManagerOpen, setProfileManagerOpen] = useState(false)
  const [applyProfileOpen, setApplyProfileOpen] = useState(false)
  const [applyTargetProfileId, setApplyTargetProfileId] = useState("")
  const [applyAssigneeId, setApplyAssigneeId] = useState("")
  const [applyAssigneeEmail, setApplyAssigneeEmail] = useState("")
  const [applyAssigneePickerOpen, setApplyAssigneePickerOpen] = useState(false)
  const [applyParentTaskId, setApplyParentTaskId] = useState<string>("")
  // Save as profile
  const [saveAsProfileTaskId, setSaveAsProfileTaskId] = useState<string | null>(null)
  const [saveAsProfileName, setSaveAsProfileName] = useState("")
  const [saveAsProfileDesc, setSaveAsProfileDesc] = useState("")
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  // Tree node context menu
  const [treeMenuTaskId, setTreeMenuTaskId] = useState<string | null>(null)
  const treeMenuRef = useRef<HTMLDivElement>(null)

  const projectQuery = useQuery({
    queryKey: ["project-dashboard", "project", projectId],
    queryFn: () =>
      ProjectsService.getProject({ projectId }) as Promise<ProjectPublic>,
  })
  const meQuery = useQuery({
    queryKey: ["project-dashboard", "me"],
    queryFn: () => UsersService.readUserMe(),
  })

  const projectStatsQuery = useQuery({
    queryKey: ["project-dashboard", "stats", projectId],
    queryFn: async () =>
      (await DashboardService.projectStats({
        projectId,
      })) as ProjectStatsPayload[],
  })

  const tasksQuery = useQuery({
    queryKey: ["project-dashboard", "tasks", projectId],
    queryFn: async () =>
      (await TasksService.listProjectTasks({ projectId, limit: 30 }))
        .data as TaskPublic[],
  })

  const membersQuery = useQuery({
    queryKey: ["project-dashboard", "members", projectId],
    queryFn: () =>
      ProjectsService.getMembers({ projectId }) as Promise<
        ProjectMemberWithUserPublic[]
      >,
  })

  const workloadQuery = useQuery({
    queryKey: ["project-dashboard", "workload", projectId],
    queryFn: () =>
      DashboardService.userWorkload({ projectId }) as unknown as Promise<
        WorkloadPayload[]
      >,
  })
  const companyUsersQuery = useQuery({
    queryKey: ["project-dashboard", "company-users", projectQuery.data?.company_id],
    enabled: Boolean(projectQuery.data?.company_id),
    queryFn: async () => listCompanyMembers(projectQuery.data?.company_id ?? ""),
  })

  const companyRolesQuery = useQuery({
    queryKey: ["project-dashboard", "company-roles", projectQuery.data?.company_id],
    enabled: Boolean(projectQuery.data?.company_id) && productionSetupOpen,
    queryFn: () => listCompanyRoles(projectQuery.data!.company_id),
  })

  const profilesQuery = useQuery({
    queryKey: ["task-profiles", projectQuery.data?.company_id],
    queryFn: () =>
      projectQuery.data?.company_id
        ? listProfilesByCompany(projectQuery.data.company_id)
        : listProfiles(),
    enabled: Boolean(projectQuery.data),
  })

  const applyProfileMutation = useMutation({
    mutationFn: () =>
      applyProfile(applyTargetProfileId, {
        project_id: projectId,
        parent_task_id: applyParentTaskId || null,
        assignee_id: applyAssigneeId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-dashboard", "tasks", projectId] })
      setApplyProfileOpen(false)
      setApplyTargetProfileId("")
      setApplyAssigneeId("")
      setApplyAssigneeEmail("")
      setApplyParentTaskId("")
      showSuccessToast("Áp dụng mẫu thành công!")
    },
    onError: handleError.bind(showErrorToast),
  })

  const saveAsProfileMutation = useMutation({
    mutationFn: () =>
      saveTaskAsProfile(saveAsProfileTaskId!, {
        name: saveAsProfileName.trim(),
        description: saveAsProfileDesc.trim() || undefined,
        company_id: projectQuery.data?.company_id ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-profiles"] })
      setSaveAsProfileTaskId(null)
      setSaveAsProfileName("")
      setSaveAsProfileDesc("")
      showSuccessToast("Đã lưu mẫu công việc!")
    },
    onError: handleError.bind(showErrorToast),
  })

  // Role catalog is not required for member add anymore (role auto-resolved from company membership)

  const stats = projectStatsQuery.data?.[0]

  useEffect(() => {
    if (!editOpen) return
    const project = projectQuery.data
    if (!project) return
    setProjectNameDraft(project.name)
    setProjectCodeDraft(project.code)
    setProjectStatusDraft(project.status || "planning")
    setProjectEndDateDraft(project.end_date || "")
    setProjectTypeDraft((project as any).project_type || "client")
  }, [editOpen, projectQuery.data])

  useEffect(() => {
    if (!taskOpen) return
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const toISODate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const end = new Date(now)
    end.setDate(now.getDate() + 7)
    setTaskNameDraft("")
    setTaskDescriptionDraft("")
    setTaskAssigneeEmailDraft("")
    setTaskAssigneeSelectedUserId("")
    setTaskExtraAssigneeIds([])
    setTaskExtraSearchDraft("")
    setTaskExtraPickerOpen(false)
    setTaskStartDateDraft(toISODate(now))
    setTaskEndDateDraft(toISODate(end))
    setTaskWorkingDays("")
    setTaskDependencyDraft("none")
    setSelectedProfileId("")
  }, [taskOpen])

  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      return ProjectsService.updateProject({
        projectId,
        requestBody: {
          name: projectNameDraft.trim() || null,
          status: projectStatusDraft || null,
          end_date: projectEndDateDraft || null,
          project_type: projectTypeDraft || null,
        },
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật dự án")
      setEditOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "project", projectId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "projects-catalog"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "project-stats"],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const quickUpdateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return ProjectsService.updateProject({
        projectId,
        requestBody: { status: newStatus },
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật trạng thái")
      await queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "project", projectId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "projects-catalog"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "project-stats"],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const activateWithMembersMutation = useMutation({
    mutationFn: async () => {
      // 1. Update project status to in_progress
      await ProjectsService.updateProject({
        projectId,
        requestBody: { status: "in_progress" },
      })
      // 2. Add members by selected roles (find users with those roles from company members)
      const companyUsers = companyUsersQuery.data ?? []
      const alreadyMemberIds = new Set((membersQuery.data ?? []).map((m) => m.user_id))
      const usersToAdd = companyUsers.filter(
        (u) => selectedRoleIds.includes(u.role_id ?? "") && !alreadyMemberIds.has(u.user_id),
      )
      for (const user of usersToAdd) {
        await ProjectsService.addMember({
          projectId,
          userId: user.user_id,
          roleId: user.role_id ?? "",
        })
      }
    },
    onSuccess: async () => {
      showSuccessToast("Dự án đã chuyển sang thực hiện")
      setProductionSetupOpen(false)
      setSelectedRoleIds([])
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard", "project", projectId] })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard", "members", projectId] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "projects-catalog"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "project-stats"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const createProjectChatRoomMutation = useMutation({
    mutationFn: () => createProjectChatRoom(projectId),
    onSuccess: async (room) => {
      showSuccessToast("Chat nhóm dự án đã sẵn sàng")
      await queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "project", projectId],
      })
      navigate({ to: "/chat", search: { room: room.id } })
    },
    onError: handleError.bind(showErrorToast),
  })

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      const candidateUsers = companyUsersQuery.data ?? []
      const keyword = memberEmailDraft.trim()
      const keywordLower = keyword.toLowerCase()
      let user = candidateUsers.find((row) => row.user_id === memberSelectedUserId)
      if (!user && keyword) {
        user = candidateUsers.find(
          (row) =>
            row.email.toLowerCase() === keywordLower ||
            (row.full_name ?? "").toLowerCase() === keywordLower,
        )
      }
      if (!user && keyword) {
        const partialMatches = candidateUsers.filter((row) => {
          const name = (row.full_name ?? "").toLowerCase()
          const email = row.email.toLowerCase()
          return name.includes(keywordLower) || email.includes(keywordLower)
        })
        if (partialMatches.length === 1) {
          user = partialMatches[0]
        }
        if (partialMatches.length > 1) {
          throw new Error("Có nhiều nhân viên trùng tên, hãy chọn đúng trong danh sách")
        }
      }
      if (!user) {
        throw new Error("Nhập tên hoặc email hợp lệ, hoặc chọn trong danh sách")
      }
      const assignments = await RolesService.listUserCompanyRoles({
        userId: user.user_id,
      })
      const companyId = projectQuery.data?.company_id
      const assignment =
        assignments.find((row) => row.is_primary && row.company_id === companyId) ??
        assignments.find((row) => row.company_id === companyId)
      if (!assignment) {
        throw new Error("User chưa có role trong công ty")
      }
      return ProjectsService.addMember({
        projectId,
        userId: user.user_id,
        roleId: assignment.role_id,
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã thêm/cập nhật thành viên")
      setMemberEmailDraft("")
      setMemberSelectedUserId("")
      setMemberOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "members", projectId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "workload", projectId],
      })
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Không thể thêm thành viên"
      showErrorToast(message)
    },
  })
  const memberCandidates = useMemo(() => {
    const keyword = memberEmailDraft.trim().toLowerCase()
    const rows = Array.from(
      new Map(
        (companyUsersQuery.data ?? []).map((row) => [row.user_id, row]),
      ).values(),
    ).filter((row) => row.user_id !== meQuery.data?.id)
    if (!keyword) {
      return rows.slice(0, 12)
    }
    return rows
      .filter((row) => {
        const name = (row.full_name ?? "").toLowerCase()
        const email = row.email.toLowerCase()
        return name.includes(keyword) || email.includes(keyword)
      })
      .slice(0, 12)
  }, [companyUsersQuery.data, memberEmailDraft, meQuery.data?.id])

  const taskAssigneeCandidates = useMemo(() => {
    const keyword = taskAssigneeEmailDraft.trim().toLowerCase()
    const rows = (membersQuery.data ?? []).filter(
      (row) => row.user_id !== meQuery.data?.id,
    )
    if (!keyword) return rows.slice(0, 12)
    return rows
      .filter((row) => {
        const name = (row.full_name ?? "").toLowerCase()
        const email = row.email.toLowerCase()
        return name.includes(keyword) || email.includes(keyword)
      })
      .slice(0, 12)
  }, [membersQuery.data, taskAssigneeEmailDraft, meQuery.data?.id])

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      // Resolve assignee
      const assigneeKeyword = taskAssigneeEmailDraft.trim()
      const assigneeKeywordLower = assigneeKeyword.toLowerCase()
      if (!assigneeKeyword) {
        throw new Error("Nhập tên hoặc email người thực hiện")
      }
      const candidateUsers = taskAssigneeCandidates
      let assignee = candidateUsers.find(
        (row) => row.user_id === taskAssigneeSelectedUserId,
      )
      if (!assignee) {
        assignee = candidateUsers.find(
          (row) =>
            row.email.toLowerCase() === assigneeKeywordLower ||
            (row.full_name ?? "").toLowerCase() === assigneeKeywordLower,
        )
      }
      if (!assignee) {
        const partialMatches = candidateUsers.filter((row) => {
          const name = (row.full_name ?? "").toLowerCase()
          const email = row.email.toLowerCase()
          return (
            name.includes(assigneeKeywordLower) || email.includes(assigneeKeywordLower)
          )
        })
        if (partialMatches.length === 1) {
          assignee = partialMatches[0]
        }
        if (partialMatches.length > 1) {
          throw new Error("Có nhiều nhân viên trùng tên, hãy chọn đúng trong danh sách")
        }
      }
      if (!assignee) {
        throw new Error("Không tìm thấy nhân viên phù hợp")
      }
      const assigneeId = assignee.user_id
      const extraIds = taskExtraAssigneeIds.filter((id) => id !== assigneeId)

      // If a profile is selected, apply it instead of creating a single task
      if (selectedProfileId) {
        return applyProfile(selectedProfileId, {
          project_id: projectId,
          parent_task_id: null,
          assignee_id: assigneeId,
          extra_assignee_ids: extraIds,
        })
      }

      const name = taskNameDraft.trim()
      if (!name) {
        throw new Error("Nhập tên hạng mục")
      }
      const start = taskStartDateDraft.trim()
      const end = taskEndDateDraft.trim()
      if (!start || !end) {
        throw new Error("Chọn ngày bắt đầu/kết thúc")
      }
      const body: TaskCreate = {
        project_id: projectId,
        parent_id: null,
        name,
        description: taskDescriptionDraft.trim() || null,
        priority: "medium",
        start_time: `${start}T00:00:00Z`,
        end_time: `${end}T23:59:59Z`,
        assignee_id: assigneeId,
        extra_assignee_ids: extraIds,
      }
      const createdTask = await TasksService.createRootTask({
        projectId,
        requestBody: body,
      })
      if (taskDependencyDraft !== "none") {
        await addDependency(taskDependencyDraft, createdTask.id)
      }
      return createdTask
    },
    onSuccess: async () => {
      showSuccessToast("Đã tạo task")
      setTaskOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "tasks", projectId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "stats", projectId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "workload", projectId],
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Không thể tạo task"
      showErrorToast(message)
    },
  })

  const taskDependencyCandidates = useMemo(
    () =>
      (tasksQuery.data ?? [])
        .filter((row) => row.status !== "done")
        .map((row) => ({
          id: row.id,
          label: `${row.name} (${row.status})`,
        })),
    [tasksQuery.data],
  )

  const teamCards = useMemo(() => {
    const workloadMap = new Map<string, number>()
    for (const row of workloadQuery.data ?? []) {
      workloadMap.set(row.user_id, row.active_tasks)
    }
    return (membersQuery.data ?? []).slice(0, 8).map((member) => {
      const activeTasks = workloadMap.get(member.user_id) ?? 0
      const loadTag = activeTasks >= 6 ? "OVERLOAD" : "AVAILABLE"
      const displayName =
        member.full_name?.trim() || member.email || member.user_id
      return {
        id: member.user_id,
        name: displayName,
        title: `${member.role_display_name} · ${member.email}`,
        activeTasks,
        loadTag,
      }
    })
  }, [membersQuery.data, workloadQuery.data])

  const detailedTasks = useMemo(() => {
    const now = Date.now()
    const mapped = (tasksQuery.data ?? []).map((task) => {
      const computed = task.computed_status ?? ""
      const overdueByComputed = computed.includes("overdue")
      const overdueByDate =
        new Date(task.end_time).getTime() < now && task.status !== "done"
      const isOverdue = overdueByComputed || overdueByDate
      const isDueSoon = computed === "due_soon" && !isOverdue
      return {
        ...task,
        assigneeName: task.assignee_name?.trim() || task.assignee_id,
        businessLabel: taskBusinessLabel(task),
        collaborators: [
          task.assignee_name?.trim() || task.assignee_id,
          ...((task as TaskPublic & { extra_assignees?: Array<{ user_name?: string | null; user_id: string }> }).extra_assignees ?? []).map(
            (row) => row.user_name?.trim() || row.user_id,
          ),
        ],
        reportedProgress: task.reported_progress_total ?? 0,
        isOverdue,
        isDueSoon,
        overdueDays: isOverdue ? getOverdueDays(task.end_time) : 0,
      }
    })
    mapped.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) {
        return a.isOverdue ? -1 : 1
      }
      if (a.isDueSoon !== b.isDueSoon) {
        return a.isDueSoon ? -1 : 1
      }
      return new Date(a.end_time).getTime() - new Date(b.end_time).getTime()
    })
    const filtered = showOverdueOnly ? mapped.filter((task) => task.isOverdue) : mapped
    return filtered.slice(0, 10)
  }, [showOverdueOnly, tasksQuery.data])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-2 pb-24 sm:px-4">
      <section className="space-y-2 pt-1">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← Tổng quan
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="min-w-0 flex-1 text-2xl font-extrabold tracking-tight">
            {projectQuery.data?.name ?? "Dự án"}
          </h1>
          <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
            <PermissionGuard permission="PROJECT_VIEW">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center whitespace-nowrap sm:w-auto"
                disabled={!projectQuery.data || createProjectChatRoomMutation.isPending}
                onClick={() => {
                  const chatRoomId = (projectQuery.data as any)?.chat_room_id as
                    | string
                    | null
                    | undefined
                  if (chatRoomId) {
                    navigate({ to: "/chat", search: { room: chatRoomId } })
                    return
                  }
                  createProjectChatRoomMutation.mutate()
                }}
              >
                💬 Chat nhóm
              </Button>
            </PermissionGuard>
            <PermissionGuard permission="PROJECT_MANAGE_MEMBERS">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center whitespace-nowrap sm:w-auto"
                onClick={() => setMemberOpen(true)}
                disabled={!projectQuery.data}
              >
                + Thêm nhân viên
              </Button>
            </PermissionGuard>
            <PermissionGuard permission="PROJECT_UPDATE">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center whitespace-nowrap sm:w-auto"
                onClick={() => setEditOpen(true)}
                disabled={!projectQuery.data}
              >
                Chỉnh sửa
              </Button>
            </PermissionGuard>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{projectQuery.data?.code}</span>
          {(projectQuery.data as any)?.project_type && (
            <>
              <span>·</span>
              <span
                className={[
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  (projectQuery.data as any).project_type === "internal"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700",
                ].join(" ")}
              >
                {(projectQuery.data as any).project_type === "internal"
                  ? "Dự án nội bộ"
                  : "Dự án khách hàng"}
              </span>
            </>
          )}
          {projectQuery.data?.start_date && (
            <>
              <span>·</span>
              <span>
                Bắt đầu: <span className="font-semibold text-foreground">{new Date(projectQuery.data.start_date).toLocaleDateString("vi-VN")}</span>
              </span>
            </>
          )}
          {projectQuery.data?.end_date && (
            <>
              <span>·</span>
              <span>
                Deadline:{" "}
                <span
                  className={[
                    "font-semibold",
                    new Date(projectQuery.data.end_date).getTime() < Date.now()
                      ? "text-red-600"
                      : "text-foreground",
                  ].join(" ")}
                >
                  {new Date(projectQuery.data.end_date).toLocaleDateString("vi-VN")}
                </span>
              </span>
            </>
          )}
          <span>·</span>
          <PermissionGuard
            permission="PROJECT_UPDATE"
            fallback={
              <span
                className={[
                  "rounded-md border px-3 py-1 text-xs font-semibold",
                  projectStatusColor(projectQuery.data?.status ?? "").replace(/hover:[^\s]+/g, ""),
                ].join(" ")}
              >
                {statusLabel(projectQuery.data?.status ?? "")}
              </span>
            }
          >
            <Select
              value={projectQuery.data?.status ?? ""}
              onValueChange={(val) => {
                if (val === "in_progress") {
                  setProductionSetupOpen(true)
                } else {
                  quickUpdateStatusMutation.mutate(val)
                }
              }}
              disabled={quickUpdateStatusMutation.isPending || activateWithMembersMutation.isPending || !projectQuery.data}
            >
              <SelectTrigger
                className={[
                  "h-8 w-[140px] rounded-md border px-3 py-1 text-xs font-semibold shadow-sm focus:ring-1 focus:ring-offset-0 focus:outline-none transition-colors",
                  projectStatusColor(projectQuery.data?.status ?? ""),
                ].join(" ")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">Lên kế hoạch</SelectItem>
                <SelectItem value="in_progress">Đang thực hiện</SelectItem>
                <SelectItem value="on_hold">Tạm dừng</SelectItem>
                <SelectItem value="completed">Hoàn thành</SelectItem>
                <SelectItem value="cancelled">Đã hủy</SelectItem>
              </SelectContent>
            </Select>
          </PermissionGuard>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-black text-primary">{stats?.completion_pct ?? 0}%</p>
            <p className="text-xs text-muted-foreground">Hoàn thành</p>
          </div>
          <div>
            <p className="text-2xl font-black text-green-600">{stats?.done_tasks ?? 0}</p>
            <p className="text-xs text-muted-foreground">Task xong</p>
          </div>
          <div>
            <p className={`text-2xl font-black ${(stats?.overdue_tasks ?? 0) > 0 ? "text-red-600" : "text-muted-foreground"}`}>
              {stats?.overdue_tasks ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Task trễ</p>
          </div>
        </div>
        <ProgressBar value={stats?.completion_pct ?? 0} />
        {(stats?.overdue_tasks ?? 0) > 0 && (
          <button
            type="button"
            className={[
              "mt-3 w-full rounded-lg border py-2 text-xs font-semibold transition-colors",
              showOverdueOnly
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-dashed border-red-200 text-red-600 hover:bg-red-50",
            ].join(" ")}
            onClick={() => setShowOverdueOnly((prev) => !prev)}
          >
            {showOverdueOnly ? "Hiển thị tất cả task" : `Chỉ xem ${stats?.overdue_tasks} task đang trễ`}
          </button>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <DelayWarnings projectId={projectId} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">Công việc</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border bg-slate-50 p-0.5 text-xs font-semibold">
              {(["list", "table", "tree", "gantt"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTaskView(v)}
                  className={[
                    "rounded-md px-3 py-1 transition-colors",
                    taskView === v
                      ? "bg-white shadow text-slate-800"
                      : "text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  {v === "list" ? "Danh sách" : v === "table" ? "Bảng" : v === "tree" ? "Cây" : "Gantt"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setProfileManagerOpen(true)}
              title="Mẫu công việc"
              className="flex items-center gap-1.5 rounded-lg border bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <BookTemplate className="h-3.5 w-3.5" />
              Mẫu
            </button>
          </div>
        </div>
        {taskView === "gantt" && <ProjectGantt projectId={projectId} />}
        {taskView === "tree" && (
          <TaskTreeView
            tasks={tasksQuery.data ?? []}
            expandedNodes={expandedNodes}
            setExpandedNodes={setExpandedNodes}
            treeMenuTaskId={treeMenuTaskId}
            setTreeMenuTaskId={setTreeMenuTaskId}
            treeMenuRef={treeMenuRef}
            onSaveAsProfile={(taskId, taskName) => {
              setSaveAsProfileTaskId(taskId)
              setSaveAsProfileName(taskName)
            }}
            navigate={navigate}
            projectId={projectId}
          />
        )}
        {taskView === "table" && (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <th className="px-4 py-2.5">Tên công việc</th>
                  <th className="px-4 py-2.5">Người thực hiện</th>
                  <th className="px-4 py-2.5">Bắt đầu</th>
                  <th className="px-4 py-2.5">Kết thúc</th>
                  <th className="px-4 py-2.5">Trạng thái</th>
                  <th className="px-4 py-2.5">Tiến độ</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {detailedTasks.map((task) => (
                  <tr
                    key={task.id}
                    className={[
                      "border-b last:border-b-0 cursor-pointer hover:bg-slate-50",
                      task.isOverdue ? "bg-red-50" : task.isDueSoon ? "bg-amber-50" : "",
                    ].join(" ")}
                    onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })}
                  >
                    <td className="max-w-[220px] truncate px-4 py-2.5 font-medium">
                      {task.color && (
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: task.color }}
                        />
                      )}
                      {task.name}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{task.assigneeName}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(task.start_time).toLocaleDateString("vi-VN")}
                    </td>
                    <td className={["px-4 py-2.5 text-xs font-medium", task.isOverdue ? "text-red-600" : task.isDueSoon ? "text-amber-600" : "text-muted-foreground"].join(" ")}>
                      {new Date(task.end_time).toLocaleDateString("vi-VN")}
                      {task.isOverdue && <span className="ml-1 text-[10px]">(trễ {task.overdueDays}n)</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {statusLabel(task.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-primary">
                      {task.reportedProgress}%
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <TaskRowActions
                        taskId={task.id}
                        taskName={task.name}
                        taskLevel={task.level ?? 0}
                        menuOpenId={treeMenuTaskId}
                        setMenuOpenId={setTreeMenuTaskId}
                        onSaveAsProfile={(taskId, taskName) => {
                          setSaveAsProfileTaskId(taskId)
                          setSaveAsProfileName(taskName)
                        }}
                        navigate={navigate}
                      />
                    </td>
                  </tr>
                ))}
                {detailedTasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Chưa có công việc nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Nhân sự dự án</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {teamCards.map((member) => (
            <div
              key={member.id}
              className="space-y-1.5 rounded-xl border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-sm font-bold">{member.name}</p>
                <span
                  className={[
                    "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold",
                    member.loadTag === "OVERLOAD"
                      ? "bg-red-100 text-red-600"
                      : "bg-green-100 text-green-700",
                  ].join(" ")}
                >
                  {member.loadTag === "OVERLOAD" ? "Quá tải" : "Sẵn sàng"}
                </span>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {member.title}
              </p>
              <p className="text-[11px] font-medium text-primary">
                {member.activeTasks} công việc đang thực hiện
              </p>
            </div>
          ))}
        </div>
      </section>

      {taskView === "list" && (
      <section className="space-y-3">
        <div className="space-y-3">
          {detailedTasks.map((task) => (
            <Link
              key={task.id}
              to="/tasks/$taskId"
              params={{ taskId: task.id }}
              className={[
                "block space-y-3 rounded-xl border bg-white p-4 shadow-sm",
                task.isOverdue
                  ? "border-red-400"
                  : task.isDueSoon
                    ? "border-amber-400"
                    : "",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-10 w-10 shrink-0 rounded-full bg-primary/10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{task.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {task.businessLabel}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="flex -space-x-2">
                        {task.collaborators.slice(0, 3).map((name) => (
                          <span
                            key={`${task.id}-${name}`}
                            title={name}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-primary text-[9px] font-bold text-white"
                          >
                            {initials(name)}
                          </span>
                        ))}
                      </div>
                      <span className="text-[10px] font-semibold text-primary">
                        {task.collaborators.length} người
                      </span>
                    </div>
                  </div>
                  <p
                    className={[
                      "text-[11px]",
                      task.isOverdue
                        ? "font-semibold text-red-600"
                        : task.isDueSoon
                          ? "font-semibold text-amber-600"
                          : "text-muted-foreground",
                    ].join(" ")}
                  >
                    Hạn: {new Date(task.end_time).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                <div className="flex items-start gap-1 text-right">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground">
                      {statusLabel(task.status)}
                    </p>
                    {task.isOverdue ? (
                      <p className="mt-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                        Trễ {task.overdueDays} ngày
                      </p>
                    ) : null}
                    {task.isDueSoon ? (
                      <p className="mt-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        Sắp tới hạn
                      </p>
                    ) : null}
                  </div>
                  <TaskRowActions
                    taskId={task.id}
                    taskName={task.name}
                    taskLevel={task.level ?? 0}
                    menuOpenId={treeMenuTaskId}
                    setMenuOpenId={setTreeMenuTaskId}
                    onSaveAsProfile={(taskId, taskName) => {
                      setSaveAsProfileTaskId(taskId)
                      setSaveAsProfileName(taskName)
                    }}
                    navigate={navigate}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                  <span>Tiến độ</span>
                  <span>{task.reportedProgress}%</span>
                </div>
                <ProgressBar value={task.reportedProgress} />
              </div>
            </Link>
          ))}
        </div>
      </section>
      )}

      <PermissionGuard permission="TASK_CREATE">
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={() => setTaskOpen(true)}
          >
            + Tạo Hạng mục
          </Button>
        </div>
      </PermissionGuard>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa dự án</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Tên dự án
              </p>
              <Input
                value={projectNameDraft}
                onChange={(e) => setProjectNameDraft(e.target.value)}
                placeholder="Tên dự án"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Mã dự án
              </p>
              <Input value={projectCodeDraft} disabled />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Trạng thái
              </p>
              <Select
                value={projectStatusDraft}
                onValueChange={setProjectStatusDraft}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Lên kế hoạch</SelectItem>
                  <SelectItem value="in_progress">Đang thực hiện</SelectItem>
                  <SelectItem value="on_hold">Tạm dừng</SelectItem>
                  <SelectItem value="completed">Hoàn thành</SelectItem>
                  <SelectItem value="cancelled">Đã hủy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Deadline dự án
              </p>
              <Input
                type="date"
                value={projectEndDateDraft}
                onChange={(e) => setProjectEndDateDraft(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Loại dự án
              </p>
              <Select
                value={projectTypeDraft}
                onValueChange={setProjectTypeDraft}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại dự án" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Dự án khách hàng</SelectItem>
                  <SelectItem value="internal">Dự án nội bộ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
            >
              Hủy
            </Button>
            <LoadingButton
              loading={updateProjectMutation.isPending}
              onClick={() => updateProjectMutation.mutate()}
            >
              Lưu
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm nhân viên vào dự án</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Email
              </p>
              <Input
                value={memberEmailDraft}
                onFocus={() => setMemberPickerOpen(true)}
                onBlur={() => {
                  setTimeout(() => setMemberPickerOpen(false), 120)
                }}
                onChange={(e) => {
                  setMemberEmailDraft(e.target.value)
                  setMemberSelectedUserId("")
                }}
                placeholder="Gõ tên hoặc email nhân viên..."
              />
              <p className="text-[11px] text-muted-foreground">
                Hệ thống tự lấy role theo “chức vụ” của user trong công ty.
              </p>
              {memberPickerOpen ? (
                <div className="max-h-48 overflow-auto rounded-md border">
                  {memberCandidates.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      Không có nhân viên phù hợp.
                    </p>
                  ) : (
                    memberCandidates.map((user) => (
                      <button
                        key={`${user.user_id}-${user.role_id}`}
                        type="button"
                        className={[
                          "flex w-full items-center justify-between px-2 py-2 text-left text-xs hover:bg-slate-50",
                          memberSelectedUserId === user.user_id ? "bg-slate-100" : "",
                        ].join(" ")}
                        onMouseDown={(eventValue) => eventValue.preventDefault()}
                        onClick={() => {
                          setMemberSelectedUserId(user.user_id)
                          setMemberEmailDraft(user.email)
                          setMemberPickerOpen(false)
                        }}
                      >
                        <span className="font-medium">
                          {user.full_name || "N/A"}
                        </span>
                        <span className="text-muted-foreground">{user.email}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMemberOpen(false)}
            >
              Hủy
            </Button>
            <LoadingButton
              loading={addMemberMutation.isPending}
              onClick={() => addMemberMutation.mutate()}
            >
              Thêm
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo Hạng mục mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* ── Chọn từ mẫu ── */}
            <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Chọn từ mẫu (tuỳ chọn)</p>
              <Select
                value={selectedProfileId || "_none"}
                onValueChange={(v) => setSelectedProfileId(v === "_none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="-- Không dùng mẫu --" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">-- Không dùng mẫu --</SelectItem>
                  {(profilesQuery.data ?? []).map((profile: TaskProfile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name} ({profile.items.length} mục)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProfileId && (() => {
                const profile = (profilesQuery.data ?? []).find((p: TaskProfile) => p.id === selectedProfileId)
                return profile ? (
                  <p className="text-xs text-blue-600">
                    Sẽ tạo {profile.items.length} công việc con theo mẫu
                  </p>
                ) : null
              })()}
            </div>

            {/* ── Divider ── */}
            <div className="flex items-center gap-2">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">hoặc điền thủ công</span>
              <div className="flex-1 border-t" />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Tên hạng mục
              </p>
              <Input
                value={taskNameDraft}
                onChange={(e) => setTaskNameDraft(e.target.value)}
                placeholder="VD: Hạng mục điện, Hệ thống lạnh..."
                disabled={Boolean(selectedProfileId)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Người thực hiện
              </p>
              <Input
                value={taskAssigneeEmailDraft}
                onFocus={() => setTaskAssigneePickerOpen(true)}
                onBlur={() => {
                  setTimeout(() => setTaskAssigneePickerOpen(false), 120)
                }}
                onChange={(e) => {
                  setTaskAssigneeEmailDraft(e.target.value)
                  setTaskAssigneeSelectedUserId("")
                }}
                placeholder="Gõ tên hoặc email nhân viên..."
              />
              {taskAssigneePickerOpen ? (
                <div className="max-h-48 overflow-auto rounded-md border">
                  {taskAssigneeCandidates.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      Không có thành viên trong dự án. Hãy thêm thành viên trước.
                    </p>
                  ) : (
                    taskAssigneeCandidates.map((user) => (
                      <button
                        key={`task-assignee-${user.user_id}`}
                        type="button"
                        className={[
                          "flex w-full items-center justify-between px-2 py-2 text-left text-xs hover:bg-slate-50",
                          taskAssigneeSelectedUserId === user.user_id
                            ? "bg-slate-100"
                            : "",
                        ].join(" ")}
                        onMouseDown={(eventValue) => eventValue.preventDefault()}
                        onClick={() => {
                          setTaskAssigneeSelectedUserId(user.user_id)
                          setTaskAssigneeEmailDraft(user.email)
                          setTaskAssigneePickerOpen(false)
                        }}
                      >
                        <span className="font-medium">
                          {user.full_name || "N/A"}
                        </span>
                        <span className="text-muted-foreground">{user.email}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            {/* Người cùng thực hiện (extra assignees) */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Người cùng thực hiện (tuỳ chọn)
              </p>
              {taskExtraAssigneeIds.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {taskExtraAssigneeIds.map((id) => {
                    const u = (membersQuery.data ?? []).find(
                      (r) => r.user_id === id,
                    )
                    const label = u?.full_name?.trim() || u?.email || id
                    return (
                      <span
                        key={`extra-chip-${id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                      >
                        {label}
                        <button
                          type="button"
                          className="text-blue-500 hover:text-blue-700"
                          onClick={() =>
                            setTaskExtraAssigneeIds((cur) =>
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
              <Input
                value={taskExtraSearchDraft}
                onFocus={() => setTaskExtraPickerOpen(true)}
                onBlur={() => {
                  setTimeout(() => setTaskExtraPickerOpen(false), 120)
                }}
                onChange={(e) => setTaskExtraSearchDraft(e.target.value)}
                placeholder="Gõ tên hoặc email để thêm..."
              />
              {taskExtraPickerOpen ? (
                <div className="max-h-48 overflow-auto rounded-md border">
                  {(() => {
                    const kw = taskExtraSearchDraft.trim().toLowerCase()
                    const pool = (membersQuery.data ?? []).filter(
                      (r) =>
                        r.user_id !== meQuery.data?.id &&
                        r.user_id !== taskAssigneeSelectedUserId &&
                        !taskExtraAssigneeIds.includes(r.user_id),
                    )
                    const filtered = kw
                      ? pool.filter(
                          (r) =>
                            (r.full_name ?? "").toLowerCase().includes(kw) ||
                            r.email.toLowerCase().includes(kw),
                        )
                      : pool
                    if (filtered.length === 0) {
                      return (
                        <p className="p-2 text-xs text-muted-foreground">
                          Không có nhân viên phù hợp.
                        </p>
                      )
                    }
                    return filtered.slice(0, 12).map((user) => (
                      <button
                        key={`task-extra-${user.user_id}`}
                        type="button"
                        className="flex w-full items-center justify-between px-2 py-2 text-left text-xs hover:bg-slate-50"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setTaskExtraAssigneeIds((cur) =>
                            cur.includes(user.user_id) ? cur : [...cur, user.user_id],
                          )
                          setTaskExtraSearchDraft("")
                        }}
                      >
                        <span className="font-medium">
                          {user.full_name || "N/A"}
                        </span>
                        <span className="text-muted-foreground">{user.email}</span>
                      </button>
                    ))
                  })()}
                </div>
              ) : null}
            </div>

            {!selectedProfileId && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Bắt đầu</p>
                    <Input
                      type="date"
                      value={taskStartDateDraft}
                      onChange={(e) => {
                        setTaskStartDateDraft(e.target.value)
                        const days = parseInt(taskWorkingDays, 10)
                        if (e.target.value && !Number.isNaN(days) && days > 0) {
                          setTaskEndDateDraft(addWorkingDays(e.target.value, days))
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Số ngày làm việc</p>
                    <Input
                      type="number"
                      min={1}
                      placeholder="VD: 5"
                      value={taskWorkingDays}
                      onChange={(e) => {
                        setTaskWorkingDays(e.target.value)
                        const days = parseInt(e.target.value, 10)
                        if (taskStartDateDraft && !Number.isNaN(days) && days > 0) {
                          setTaskEndDateDraft(addWorkingDays(taskStartDateDraft, days))
                        }
                      }}
                    />
                    {taskEndDateDraft && (
                      <p className="text-[11px] text-muted-foreground">
                        Deadline: {new Date(`${taskEndDateDraft}T12:00:00`).toLocaleDateString("vi-VN")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Mô tả (tuỳ chọn)
                  </p>
                  <Input
                    value={taskDescriptionDraft}
                    onChange={(e) => setTaskDescriptionDraft(e.target.value)}
                    placeholder="Mô tả ngắn..."
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Task phụ thuộc trước (tuỳ chọn)
                  </p>
                  <Select
                    value={taskDependencyDraft}
                    onValueChange={setTaskDependencyDraft}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn task cần hoàn thành trước" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Không chọn</SelectItem>
                      {taskDependencyCandidates.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTaskOpen(false)}
            >
              Hủy
            </Button>
            <LoadingButton
              loading={createTaskMutation.isPending}
              onClick={() => createTaskMutation.mutate()}
            >
              Tạo Hạng mục
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Profile Manager Dialog ── */}
      <Dialog open={profileManagerOpen} onOpenChange={setProfileManagerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookTemplate className="h-4 w-4 text-blue-600" />
              Mẫu công việc
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {profilesQuery.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Đang tải...</p>
            ) : (profilesQuery.data ?? []).length === 0 ? (
              <div className="py-10 text-center">
                <Layers className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Chưa có mẫu nào</p>
                <p className="mt-1 text-xs text-muted-foreground">Chuyển sang tab "Cây", nhấn ⋯ trên Hạng mục → "Lưu làm mẫu"</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {(profilesQuery.data ?? []).map((profile: TaskProfile) => {
                  const rootCount = profile.items.filter(i => i.level === 0).length
                  const totalCount = profile.items.length
                  return (
                    <div key={profile.id} className="rounded-xl border bg-slate-50 p-4 hover:bg-white transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800">{profile.name}</p>
                          {profile.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{profile.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                              {rootCount} hạng mục gốc
                            </span>
                            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                              {totalCount} mục tổng
                            </span>
                          </div>
                          {/* Preview tree */}
                          <div className="mt-3 rounded-lg border bg-white p-3 text-xs text-slate-600 space-y-1 max-h-36 overflow-y-auto">
                            {profile.items.slice(0, 12).map((item) => (
                              <div key={item.id} style={{ paddingLeft: `${item.level * 16}px` }} className="flex items-center gap-1.5">
                                <span className={LEVEL_CONFIG[item.level]?.dot ?? "h-1.5 w-1.5 rounded-full bg-slate-300"} />
                                <span className="truncate">{item.name}</span>
                                <span className="ml-auto shrink-0 text-[10px] text-slate-400">{item.duration_days}n</span>
                              </div>
                            ))}
                            {profile.items.length > 12 && (
                              <p className="text-[10px] text-muted-foreground pl-2">...và {profile.items.length - 12} mục nữa</p>
                            )}
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Tạo bởi {profile.created_by_name ?? "—"} • {new Date(profile.created_at).toLocaleDateString("vi-VN")}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setApplyTargetProfileId(profile.id)
                              setProfileManagerOpen(false)
                              setApplyProfileOpen(true)
                            }}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                          >
                            Áp dụng
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProfileId(profile.id)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            Sửa
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileManagerOpen(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditProfileDialog
        open={Boolean(editingProfileId)}
        onClose={() => setEditingProfileId(null)}
        profile={
          (profilesQuery.data ?? []).find(
            (p: TaskProfile) => p.id === editingProfileId,
          ) ?? null
        }
      />

      {/* ── Apply Profile Dialog ── */}
      <Dialog open={applyProfileOpen} onOpenChange={(open) => { setApplyProfileOpen(open); if (!open) { setApplyAssigneeId(""); setApplyAssigneeEmail(""); setApplyParentTaskId("") } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Áp dụng mẫu vào dự án</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Gắn vào hạng mục (tuỳ chọn)</p>
              <Select value={applyParentTaskId || "_root"} onValueChange={v => setApplyParentTaskId(v === "_root" ? "" : v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Tạo ở gốc (Hạng mục mới)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_root">Tạo ở gốc dự án</SelectItem>
                  {(tasksQuery.data ?? []).filter(t => t.level === 0).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Người thực hiện mặc định</p>
              <Input
                value={applyAssigneeEmail}
                placeholder="Gõ tên hoặc email..."
                onFocus={() => setApplyAssigneePickerOpen(true)}
                onBlur={() => setTimeout(() => setApplyAssigneePickerOpen(false), 120)}
                onChange={e => { setApplyAssigneeEmail(e.target.value); setApplyAssigneeId("") }}
              />
              {applyAssigneePickerOpen && (
                <div className="max-h-40 overflow-auto rounded-md border bg-white shadow-md z-50">
                  {memberCandidates.filter(u =>
                    !applyAssigneeEmail || u.full_name?.toLowerCase().includes(applyAssigneeEmail.toLowerCase()) || u.email.toLowerCase().includes(applyAssigneeEmail.toLowerCase())
                  ).map(u => (
                    <button
                      key={u.user_id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-slate-50"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setApplyAssigneeId(u.user_id); setApplyAssigneeEmail(u.full_name ?? u.email); setApplyAssigneePickerOpen(false) }}
                    >
                      <span className="font-medium">{u.full_name ?? "N/A"}</span>
                      <span className="text-muted-foreground">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyProfileOpen(false)}>Hủy</Button>
            <LoadingButton
              loading={applyProfileMutation.isPending}
              disabled={!applyAssigneeId}
              onClick={() => applyProfileMutation.mutate()}
            >
              Áp dụng
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Save as Profile Dialog ── */}
      <Dialog open={!!saveAsProfileTaskId} onOpenChange={open => { if (!open) { setSaveAsProfileTaskId(null); setSaveAsProfileName(""); setSaveAsProfileDesc("") } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-4 w-4 text-blue-600" />
              Lưu làm mẫu công việc
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Tên mẫu</p>
              <Input
                value={saveAsProfileName}
                onChange={e => setSaveAsProfileName(e.target.value)}
                placeholder="VD: Lắp đặt hệ thống lạnh cơ bản"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Mô tả (tuỳ chọn)</p>
              <Input
                value={saveAsProfileDesc}
                onChange={e => setSaveAsProfileDesc(e.target.value)}
                placeholder="Mô tả ngắn về mẫu này..."
              />
            </div>
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
              Toàn bộ cây công việc con sẽ được lưu vào mẫu, kèm số ngày thực hiện của mỗi mục.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsProfileTaskId(null)}>Hủy</Button>
            <LoadingButton
              loading={saveAsProfileMutation.isPending}
              disabled={!saveAsProfileName.trim()}
              onClick={() => saveAsProfileMutation.mutate()}
            >
              Lưu mẫu
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Thiết lập nhân sự khi chuyển sang thực hiện ── */}
      <Dialog open={productionSetupOpen} onOpenChange={(open) => { setProductionSetupOpen(open); if (!open) setSelectedRoleIds([]) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chuyển sang Đang thực hiện</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Chọn các <span className="font-semibold text-foreground">bộ phận / vai trò</span> sẽ tham gia dự án này. Hệ thống sẽ tự thêm các thành viên tương ứng vào dự án.
            </p>
            {companyRolesQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Đang tải danh sách vai trò...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(companyRolesQuery.data ?? [])
                  .filter((r: CompanyRole) => r.level > 1)
                  .map((role: CompanyRole) => {
                    const checked = selectedRoleIds.includes(role.id)
                    return (
                      <label
                        key={role.id}
                        className={[
                          "flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                          checked
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() =>
                            setSelectedRoleIds((prev) =>
                              checked ? prev.filter((id) => id !== role.id) : [...prev, role.id],
                            )
                          }
                        />
                        {role.display_name}
                      </label>
                    )
                  })}
                {(companyRolesQuery.data ?? []).filter((r: CompanyRole) => r.level > 1).length === 0 && (
                  <p className="text-xs text-muted-foreground">Không có vai trò nào.</p>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              BGĐ và Quản lý dự án đã được thêm tự động. Bạn có thể bỏ qua và thêm thủ công sau.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProductionSetupOpen(false); setSelectedRoleIds([]) }}>
              Bỏ qua
            </Button>
            <LoadingButton
              loading={activateWithMembersMutation.isPending}
              onClick={() => activateWithMembersMutation.mutate()}
            >
              Bắt đầu thực hiện
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task Tree View
// ---------------------------------------------------------------------------

const LEVEL_CONFIG: Record<number, { label: string; badge: string; dot: string; indent: string }> = {
  0: { label: "Hạng mục", badge: "bg-blue-100 text-blue-700 border-blue-200", dot: "inline-block h-2 w-2 rounded-full bg-blue-600", indent: "" },
  1: { label: "Công việc", badge: "bg-cyan-100 text-cyan-700 border-cyan-200", dot: "inline-block h-2 w-2 rounded-full bg-cyan-500", indent: "ml-5" },
  2: { label: "Đầu việc", badge: "bg-teal-100 text-teal-700 border-teal-200", dot: "inline-block h-1.5 w-1.5 rounded-full bg-teal-500", indent: "ml-10" },
  3: { label: "Bước", badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "inline-block h-1.5 w-1.5 rounded-full bg-slate-400", indent: "ml-16" },
  4: { label: "Chi tiết", badge: "bg-slate-50 text-slate-500 border-slate-200", dot: "inline-block h-1 w-1 rounded-full bg-slate-300", indent: "ml-20" },
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  todo: { label: "Chờ", cls: "bg-slate-100 text-slate-500" },
  in_progress: { label: "Đang làm", cls: "bg-blue-100 text-blue-600" },
  review: { label: "Xem xét", cls: "bg-amber-100 text-amber-600" },
  done: { label: "Xong", cls: "bg-green-100 text-green-600" },
}

interface TaskRowActionsProps {
  taskId: string
  taskName: string
  taskLevel: number
  menuOpenId: string | null
  setMenuOpenId: (id: string | null) => void
  onSaveAsProfile: (taskId: string, taskName: string) => void
  navigate: ReturnType<typeof useNavigate>
  align?: "left" | "right"
}

function TaskRowActions({
  taskId,
  taskName,
  taskLevel,
  menuOpenId,
  setMenuOpenId,
  onSaveAsProfile,
  navigate,
  align = "right",
}: TaskRowActionsProps) {
  const open = menuOpenId === taskId
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    if ("preventDefault" in e) e.preventDefault()
  }
  return (
    <div className="relative inline-block" onClick={stop}>
      <button
        type="button"
        title="Tác vụ"
        aria-label="Tác vụ"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={(e) => {
          stop(e)
          setMenuOpenId(open ? null : taskId)
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className={[
            "absolute z-50 mt-1 min-w-[180px] rounded-xl border bg-white py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50"
            onClick={(e) => {
              stop(e)
              navigate({ to: "/tasks/$taskId", params: { taskId } })
              setMenuOpenId(null)
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Xem chi tiết
          </button>
          {taskLevel === 0 && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50"
              onClick={(e) => {
                stop(e)
                onSaveAsProfile(taskId, taskName)
                setMenuOpenId(null)
              }}
            >
              <BookmarkPlus className="h-3.5 w-3.5" /> Lưu làm mẫu
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface TaskTreeViewProps {
  tasks: TaskPublic[]
  expandedNodes: Set<string>
  setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>
  treeMenuTaskId: string | null
  setTreeMenuTaskId: (id: string | null) => void
  treeMenuRef: React.RefObject<HTMLDivElement | null>
  onSaveAsProfile: (taskId: string, taskName: string) => void
  navigate: ReturnType<typeof useNavigate>
  projectId: string
}

function TaskTreeView({
  tasks,
  expandedNodes,
  setExpandedNodes,
  treeMenuTaskId,
  setTreeMenuTaskId,
  treeMenuRef,
  onSaveAsProfile,
  navigate,
}: TaskTreeViewProps) {

  const childrenMap = useMemo(() => {
    const m = new Map<string | null, TaskPublic[]>()
    for (const t of tasks) {
      const key = t.parent_id ?? null
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(t)
    }
    // Sort each group by start_time
    for (const [, arr] of m) arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    return m
  }, [tasks])

  const roots = childrenMap.get(null) ?? []

  function toggleExpand(id: string) {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderNode(task: TaskPublic): React.ReactNode {
    const cfg = LEVEL_CONFIG[task.level] ?? LEVEL_CONFIG[4]
    const children = childrenMap.get(task.id) ?? []
    const hasChildren = children.length > 0
    const expanded = expandedNodes.has(task.id)
    const status = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo
    const durationDays = Math.max(1, Math.round((new Date(task.end_time).getTime() - new Date(task.start_time).getTime()) / 86400000))

    return (
      <div key={task.id}>
        <div
          className={[
            "group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors",
            cfg.indent,
          ].join(" ")}
        >
          {/* Expand toggle */}
          <button
            type="button"
            className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-400"
            onClick={() => hasChildren && toggleExpand(task.id)}
          >
            {hasChildren ? (
              expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <span className={cfg.dot} />
            )}
          </button>

          {/* Color dot if set */}
          {task.color && (
            <span className="shrink-0 h-2.5 w-2.5 rounded-full" style={{ background: task.color }} />
          )}

          {/* Level badge */}
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.badge}`}>
            {cfg.label}
          </span>

          {/* Task name — clickable */}
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-sm font-medium text-slate-800 truncate hover:text-blue-600"
            onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })}
          >
            {task.name}
          </button>

          {/* Duration */}
          <span className="shrink-0 text-[11px] text-slate-400 hidden sm:block">{durationDays}n</span>

          {/* Assignee avatar */}
          {task.assignee_name && (
            <span
              title={task.assignee_name}
              className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white"
            >
              {task.assignee_name.split(" ").map((w: string) => w[0]).slice(-2).join("").toUpperCase()}
            </span>
          )}

          {/* Status chip */}
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>
            {status.label}
          </span>

          {/* Context menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              className="rounded p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-600 transition-all"
              onClick={e => { e.stopPropagation(); setTreeMenuTaskId(treeMenuTaskId === task.id ? null : task.id) }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {treeMenuTaskId === task.id && (
              <div
                ref={treeMenuRef}
                className="absolute right-0 top-6 z-50 min-w-[160px] rounded-xl border bg-white shadow-lg py-1"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50"
                  onClick={() => { navigate({ to: "/tasks/$taskId", params: { taskId: task.id } }); setTreeMenuTaskId(null) }}
                >
                  <Plus className="h-3.5 w-3.5" /> Xem chi tiết
                </button>
                {task.level === 0 && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50"
                    onClick={() => { onSaveAsProfile(task.id, task.name); setTreeMenuTaskId(null) }}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" /> Lưu làm mẫu
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && expanded && (
          <div className="border-l border-slate-100 ml-5">
            {children.map(child => renderNode(child))}
          </div>
        )}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center shadow-sm">
        <Layers className="mx-auto mb-3 h-12 w-12 text-slate-200" />
        <p className="text-sm font-medium text-slate-500">Chưa có công việc nào</p>
        <p className="mt-1 text-xs text-muted-foreground">Tạo Hạng mục đầu tiên để bắt đầu</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm divide-y divide-slate-50">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 px-4 py-2 bg-slate-50 rounded-t-xl border-b">
        {Object.entries(LEVEL_CONFIG).map(([lvl, cfg]) => (
          <span key={lvl} className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${cfg.badge}`}>
            {cfg.label}
          </span>
        ))}
      </div>
      <div className="p-2">
        {roots.map(root => renderNode(root))}
      </div>
    </div>
  )
}
