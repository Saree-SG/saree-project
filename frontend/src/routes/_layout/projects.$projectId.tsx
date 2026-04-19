import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import { ProjectGantt } from "@/components/Gantt/ProjectGantt"
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
import { listCompanyMembers, readMyPermissions } from "@/modules/rbac/rbacApi"
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
  if (status === "done") return "DONE"
  if (status === "in_progress") return "IN PROGRESS"
  if (status === "review") return "REVIEW"
  return "TODO"
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
  const [memberEmailDraft, setMemberEmailDraft] = useState("")
  const [memberSelectedUserId, setMemberSelectedUserId] = useState<string>("")
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [taskNameDraft, setTaskNameDraft] = useState("")
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState("")
  const [taskAssigneeEmailDraft, setTaskAssigneeEmailDraft] = useState("")
  const [taskAssigneeSelectedUserId, setTaskAssigneeSelectedUserId] = useState("")
  const [taskAssigneePickerOpen, setTaskAssigneePickerOpen] = useState(false)
  const [taskStartDateDraft, setTaskStartDateDraft] = useState("")
  const [taskEndDateDraft, setTaskEndDateDraft] = useState("")
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)
  const [taskView, setTaskView] = useState<"list" | "gantt">("list")

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
    setTaskStartDateDraft(toISODate(now))
    setTaskEndDateDraft(toISODate(end))
  }, [taskOpen])

  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      return ProjectsService.updateProject({
        projectId,
        requestBody: {
          name: projectNameDraft.trim() || null,
          status: projectStatusDraft || null,
          end_date: projectEndDateDraft || null,
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

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const name = taskNameDraft.trim()
      if (!name) {
        throw new Error("Nhập tên task")
      }
      const assigneeKeyword = taskAssigneeEmailDraft.trim()
      const assigneeKeywordLower = assigneeKeyword.toLowerCase()
      if (!assigneeKeyword) {
        throw new Error("Nhập tên hoặc email người thực hiện")
      }
      const candidateUsers = memberCandidates
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
        assignee_id: assignee.user_id,
      }
      return TasksService.createRootTask({
        projectId,
        requestBody: body,
      })
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
      <section className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">
          Active Project
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-extrabold tracking-tight">
            {projectQuery.data?.name ?? "Project Dashboard"}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <PermissionGuard permission="PROJECT_MANAGE_MEMBERS">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMemberOpen(true)}
                disabled={!projectQuery.data}
              >
                Thêm nhân viên
              </Button>
            </PermissionGuard>
            <PermissionGuard permission="PROJECT_VIEW">
              <Button
                type="button"
                variant="outline"
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
                💬 Chat nhóm dự án
              </Button>
            </PermissionGuard>
            <PermissionGuard permission="PROJECT_UPDATE">
              <Button
                type="button"
                onClick={() => setEditOpen(true)}
                disabled={!projectQuery.data}
              >
                Sửa dự án
              </Button>
            </PermissionGuard>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Management Hub • Task execution overview
        </p>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Overall Progress
            </p>
            <p className="text-3xl font-black">{stats?.completion_pct ?? 0}%</p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>{stats?.done_tasks ?? 0} Completed</p>
              <p>
                {Math.max(
                  0,
                  (stats?.total_tasks ?? 0) - (stats?.done_tasks ?? 0),
                )}{" "}
                In Progress/Todo
              </p>
            </div>
          </div>
          <div className="text-right text-xs">
            <button
              type="button"
              className={[
                "font-semibold text-red-600 underline-offset-2",
                showOverdueOnly ? "underline" : "hover:underline",
              ].join(" ")}
              onClick={() => setShowOverdueOnly((prev) => !prev)}
            >
              {stats?.overdue_tasks ?? 0} overdue
            </button>
            <p className="text-muted-foreground">
              Status: {projectQuery.data?.status ?? "N/A"}
            </p>
          </div>
        </div>
        <progress
          max={100}
          value={Math.max(0, Math.min(100, stats?.completion_pct ?? 0))}
          className="mt-4 h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
        />
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <DelayWarnings projectId={projectId} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Project Team</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {teamCards.map((member) => (
            <div
              key={member.id}
              className="space-y-2 rounded-xl border bg-white p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/10" />
                <span
                  className={[
                    "rounded px-2 py-0.5 text-[10px] font-bold",
                    member.loadTag === "OVERLOAD"
                      ? "bg-red-100 text-red-600"
                      : "bg-green-100 text-green-700",
                  ].join(" ")}
                >
                  {member.loadTag}
                </span>
              </div>
              <p className="truncate text-sm font-bold">{member.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {member.title}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Detailed Tasks</h2>
          {/* View switcher */}
          <div className="flex rounded-lg border bg-white p-0.5 text-xs font-semibold shadow-sm">
            <button
              type="button"
              onClick={() => setTaskView("list")}
              className={[
                "rounded-md px-3 py-1.5 transition-colors",
                taskView === "list"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              Danh sách
            </button>
            <button
              type="button"
              onClick={() => setTaskView("gantt")}
              className={[
                "rounded-md px-3 py-1.5 transition-colors",
                taskView === "gantt"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              Gantt
            </button>
          </div>
        </div>

        {/* Gantt view */}
        {taskView === "gantt" && (
          <ProjectGantt projectId={projectId} />
        )}

        {/* List view */}
        {taskView === "list" && (
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
                  <p className="text-[11px] text-primary">
                    {task.assigneeName}
                  </p>
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
                    Due: {new Date(task.end_time).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
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
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                  <span>Tiến độ báo cáo (%)</span>
                  <span>{task.reportedProgress}%</span>
                </div>
                <progress
                  max={100}
                  value={Math.min(100, task.reportedProgress)}
                  className="h-1.5 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                />
              </div>
            </Link>
          ))}
        </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <PermissionGuard permission="TASK_CREATE">
          <button
            type="button"
            className="h-10 rounded-xl bg-primary px-4 text-xs font-bold text-white"
            onClick={() => setTaskOpen(true)}
          >
            New Task
          </button>
        </PermissionGuard>
        <button
          type="button"
          className="h-10 rounded-xl border-2 border-primary/20 bg-white px-4 text-xs font-bold text-primary"
        >
          Export Report
        </button>
      </section>

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
                  <SelectItem value="planning">planning</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="on_hold">on_hold</SelectItem>
                  <SelectItem value="completed">completed</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
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
            <DialogTitle>Tạo task trong dự án</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Tên task</p>
              <Input
                value={taskNameDraft}
                onChange={(e) => setTaskNameDraft(e.target.value)}
                placeholder="VD: Khảo sát hiện trường"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Người thực hiện (email)
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
                  {memberCandidates.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      Không có nhân viên phù hợp.
                    </p>
                  ) : (
                    memberCandidates.map((user) => (
                      <button
                        key={`task-assignee-${user.user_id}-${user.role_id}`}
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Bắt đầu</p>
                <Input
                  type="date"
                  value={taskStartDateDraft}
                  onChange={(e) => setTaskStartDateDraft(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Deadline</p>
                <Input
                  type="date"
                  value={taskEndDateDraft}
                  onChange={(e) => setTaskEndDateDraft(e.target.value)}
                />
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
              Tạo task
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
