import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import {
  ApiError,
  DashboardService,
  type ProjectCreate,
  type ProjectPublic,
  ProjectsService,
  RolesService,
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
import { clearSession } from "@/modules/auth/tokenStore"
import { readMyPermissions } from "@/modules/rbac/rbacApi"
import { canAccessDashboard } from "@/utils/accountAccess"

type OverviewPayload = {
  total_projects: number
  total_tasks: number
  done_tasks: number
  completion_rate_pct: number
  overdue_tasks: number
}

type ProjectStatsPayload = {
  project_id: string
  name: string
  status: string
  total_tasks: number
  done_tasks: number
  overdue_tasks: number
  completion_pct: number
}

type LeaderboardPayload = {
  user_id: string
  user_name?: string
  total: number
  done: number
  on_time: number
  overdue: number
  completion_pct: number
}

type WorkloadPayload = {
  user_id: string
  user_name?: string
  active_tasks: number
}

type OverduePayload = {
  overdue_critical: Array<{
    task_id: string
    name: string
    assignee_id: string
    assignee_name?: string
    end_time: string
    project_id: string
    project_name?: string
    is_on_critical_path: boolean
  }>
  overdue_local: Array<{
    task_id: string
    name: string
    assignee_id: string
    assignee_name?: string
    end_time: string
    project_id: string
    project_name?: string
    is_on_critical_path: boolean
  }>
}

export const Route = createFileRoute("/_layout/")({
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
    const allowed = Boolean(me?.is_superuser) || canAccessDashboard(permissions)
    if (!allowed) {
      throw redirect({ to: "/tasks" })
    }
  },
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Tổng quan quản lý",
      },
    ],
  }),
})

function Dashboard() {
  const [projectFilter, setProjectFilter] = useState<string>("")
  const [departmentFilter, setDepartmentFilter] = useState<string>("")
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState("")
  const [projectMemberKeyword, setProjectMemberKeyword] = useState("")
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [projectMemberPickerOpen, setProjectMemberPickerOpen] = useState(false)
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: ["dashboard", "profile"],
    queryFn: () => RolesService.myAccountProfile(),
  })
  const primaryMembership = useMemo(
    () =>
      profileQuery.data?.memberships.find(
        (membership) => membership.is_primary,
      ) ?? profileQuery.data?.memberships[0],
    [profileQuery.data?.memberships],
  )

  const dashboardParams = useMemo(
    () => ({
      projectId: projectFilter || undefined,
      departmentId: departmentFilter || undefined,
    }),
    [departmentFilter, projectFilter],
  )

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview", dashboardParams],
    queryFn: async () =>
      (await DashboardService.overview(dashboardParams)) as OverviewPayload,
  })

  const projectStatsQuery = useQuery({
    queryKey: ["dashboard", "project-stats", dashboardParams],
    queryFn: async () =>
      (await DashboardService.projectStats(
        dashboardParams,
      )) as ProjectStatsPayload[],
  })

  const leaderboardQuery = useQuery({
    queryKey: ["dashboard", "leaderboard", dashboardParams],
    queryFn: async () =>
      (await DashboardService.leaderboard(
        dashboardParams,
      )) as LeaderboardPayload[],
  })

  const workloadQuery = useQuery({
    queryKey: ["dashboard", "workload", dashboardParams],
    queryFn: async () =>
      (await DashboardService.userWorkload(
        dashboardParams,
      )) as WorkloadPayload[],
  })

  const overdueQuery = useQuery({
    queryKey: ["dashboard", "overdue", dashboardParams],
    queryFn: async () =>
      (await DashboardService.overdueReport(dashboardParams)) as OverduePayload,
  })

  const projectsQuery = useQuery({
    queryKey: ["dashboard", "projects-catalog"],
    queryFn: () => ProjectsService.listProjects({ limit: 200 }),
  })
  const usersQuery = useQuery({
    queryKey: ["dashboard", "users"],
    queryFn: async () => (await UsersService.readUsers({ limit: 500 })).data,
  })
  const meQuery = useQuery({
    queryKey: ["dashboard", "me"],
    queryFn: () => UsersService.readUserMe(),
  })

  const createProjectMutation = useMutation({
    mutationFn: async (payload: ProjectCreate) => {
      const project = (await ProjectsService.createProject({
        requestBody: payload,
      })) as ProjectPublic
      if (selectedMemberIds.length > 0) {
        for (const userId of selectedMemberIds) {
          const assignments = await RolesService.listUserCompanyRoles({ userId })
          const assignment =
            assignments.find(
              (row) =>
                row.is_primary &&
                row.company_id === (primaryMembership?.company_id ?? ""),
            ) ??
            assignments.find(
              (row) => row.company_id === (primaryMembership?.company_id ?? ""),
            )
          if (!assignment) {
            continue
          }
          await ProjectsService.addMember({
            projectId: project.id,
            userId,
            roleId: assignment.role_id,
          })
        }
      }
      return project
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "projects-catalog"],
      })
      setCreateProjectOpen(false)
      setProjectNameDraft("")
      setProjectMemberKeyword("")
      setSelectedMemberIds([])
      window.location.href = `/projects/${project.id}`
    },
  })

  const departmentsQuery = useQuery({
    enabled: Boolean(primaryMembership?.company_id),
    queryKey: ["dashboard", "departments", primaryMembership?.company_id],
    queryFn: () =>
      RolesService.listDepartments({
        companyId: primaryMembership!.company_id,
      }),
  })

  const overview = overviewQuery.data
  const topProjects = useMemo(
    () =>
      (projectStatsQuery.data ?? [])
        .slice()
        .sort((a, b) => b.completion_pct - a.completion_pct)
        .slice(0, 3),
    [projectStatsQuery.data],
  )
  const topWorkers = useMemo(
    () =>
      (leaderboardQuery.data ?? [])
        .slice()
        .sort((a, b) => b.done - a.done)
        .slice(0, 5),
    [leaderboardQuery.data],
  )
  const projectNameById = useMemo(() => {
    const data = new Map<string, string>()
    for (const project of projectsQuery.data?.data ?? []) {
      data.set(project.id, project.name)
    }
    return data
  }, [projectsQuery.data?.data])
  const delayedTasks = useMemo(() => {
    const overdue = overdueQuery.data
    if (!overdue) return []
    return [...overdue.overdue_critical, ...overdue.overdue_local].slice(0, 6)
  }, [overdueQuery.data])
  const memberCandidates = useMemo(() => {
    const keyword = projectMemberKeyword.trim().toLowerCase()
    const rows = (usersQuery.data ?? []).filter(
      (row) => row.id !== meQuery.data?.id,
    )
    if (!keyword) {
      return rows.slice(0, 15)
    }
    return rows
      .filter((row) => {
        const name = (row.full_name ?? "").toLowerCase()
        const email = row.email.toLowerCase()
        return name.includes(keyword) || email.includes(keyword)
      })
      .slice(0, 15)
  }, [projectMemberKeyword, usersQuery.data, meQuery.data?.id])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-2 pb-24 sm:px-3 md:px-0">
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Tổng quan quản lý
            </h1>
            <p className="text-sm text-muted-foreground">
              Tổng quan dự án, tiến độ và hiệu suất
            </p>
          </div>
          <PermissionGuard permission="PROJECT_CREATE">
            <LoadingButton
              loading={false}
              className="shrink-0"
              onClick={() => setCreateProjectOpen(true)}
            >
              Tạo dự án
            </LoadingButton>
          </PermissionGuard>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <select
            id="director-dashboard-project-filter"
            title="Lọc theo dự án"
            value={projectFilter}
            onChange={(eventValue) => setProjectFilter(eventValue.target.value)}
            className="h-10 min-w-[180px] rounded-xl border bg-white px-3 text-sm outline-none"
          >
            <option value="">Dự án: Tất cả</option>
            {(projectsQuery.data?.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            id="director-dashboard-department-filter"
            title="Lọc theo phòng ban"
            value={departmentFilter}
            onChange={(eventValue) =>
              setDepartmentFilter(eventValue.target.value)
            }
            className="h-10 min-w-[170px] rounded-xl border bg-white px-3 text-sm outline-none"
          >
            <option value="">Phòng ban: Tất cả</option>
            {(departmentsQuery.data ?? []).map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-xl border bg-white p-4">
          <p className="text-[11px] font-bold uppercase text-muted-foreground">
            Tiến độ tổng thể
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-primary">
              {overview?.completion_rate_pct ?? 0}%
            </p>
            <p className="text-xs font-semibold text-red-600">
              {overview?.overdue_tasks ?? 0} task trễ
            </p>
          </div>
          <progress
            max={100}
            value={Math.max(
              0,
              Math.min(100, overview?.completion_rate_pct ?? 0),
            )}
            className="mt-3 h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
          />
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-[11px] text-muted-foreground">Task hoàn thành</p>
          <p className="text-xl font-bold">{overview?.done_tasks ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-[11px] text-muted-foreground">Tổng task</p>
          <p className="text-xl font-bold">{overview?.total_tasks ?? 0}</p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Top 3 dự án tiêu biểu</h2>
          <span className="text-xs font-semibold text-primary">
            {overview?.total_projects ?? 0} dự án
          </span>
        </div>
        {topProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-slate-50 p-4">
            <p className="text-sm font-semibold">Chưa có dự án để hiển thị.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Bạn hãy bấm <span className="font-semibold">Tạo dự án</span> ở phía
              trên để bắt đầu.
            </p>
          </div>
        ) : null}
        {topProjects.map((project) => (
          <Link
            key={project.project_id}
            to="/projects/$projectId"
            params={{ projectId: project.project_id }}
            className="block space-y-1.5 rounded-lg p-1 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{project.name}</p>
              <p className="text-xs font-bold text-primary">
                {project.completion_pct}%
              </p>
            </div>
            <progress
              max={100}
              value={Math.max(0, Math.min(100, project.completion_pct))}
              className="h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              {project.done_tasks}/{project.total_tasks} done •{" "}
              {project.overdue_tasks} overdue
            </p>
          </Link>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Danh sách dự án</h2>
          <span className="text-xs font-semibold text-muted-foreground">
            {(projectsQuery.data?.data ?? []).length}
          </span>
        </div>
        {(projectsQuery.data?.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed bg-slate-50 p-4">
            <p className="text-sm font-semibold">Chưa có dự án nào.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tạo dự án mới để bắt đầu giao việc và theo dõi tiến độ.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(projectsQuery.data?.data ?? []).slice(0, 12).map((project) => (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="block rounded-lg border bg-white p-3 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{project.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {project.code} · {project.status ?? "planning"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Task Trễ Deadline</h2>
        <div className="space-y-2">
          {delayedTasks.map((task) => (
            <div
              key={task.task_id}
              className="rounded-xl border-l-4 border-red-500 bg-white p-3 shadow-sm"
            >
              <p className="text-sm font-bold">{task.name}</p>
              <p className="text-xs text-muted-foreground">
                {task.project_name ??
                  projectNameById.get(task.project_id) ??
                  task.project_id}
              </p>
              <p className="text-[11px] font-medium text-red-600">
                Assignee: {task.assignee_name ?? task.assignee_id}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">
          Nhân sự hoàn thành task nhiều nhất
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {topWorkers.map((worker) => (
            <div
              key={worker.user_id}
              className="min-w-[180px] rounded-xl border bg-white p-3"
            >
              <p className="truncate text-sm font-bold">
                {worker.user_name ?? worker.user_id}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {worker.done} done
              </p>
              <p className="text-xs font-semibold text-primary">
                {worker.completion_pct}% completion
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-sm font-bold">Phân bổ nguồn lực</h2>
        <div className="space-y-2">
          {(workloadQuery.data ?? []).slice(0, 7).map((item) => (
            <div key={item.user_id} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <p className="truncate">{item.user_name ?? item.user_id}</p>
                <p className="font-semibold">{item.active_tasks}</p>
              </div>
              <progress
                max={100}
                value={Math.max(8, Math.min(100, item.active_tasks * 12))}
                className="h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-blue-500"
              />
            </div>
          ))}
        </div>
      </section>

      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tạo dự án mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Tên dự án
              </p>
              <Input
                value={projectNameDraft}
                onChange={(eventValue) =>
                  setProjectNameDraft(eventValue.target.value)
                }
                placeholder="Nhập tên dự án..."
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Chọn nhân viên tham gia (tuỳ chọn)
              </p>
              <Input
                value={projectMemberKeyword}
                onFocus={() => setProjectMemberPickerOpen(true)}
                onBlur={() => {
                  setTimeout(() => setProjectMemberPickerOpen(false), 120)
                }}
                onChange={(eventValue) =>
                  setProjectMemberKeyword(eventValue.target.value)
                }
                placeholder="Gõ tên hoặc email để lọc..."
              />
              {projectMemberPickerOpen ? (
                <div className="max-h-52 overflow-auto rounded-md border">
                  {memberCandidates.map((user) => {
                    const selected = selectedMemberIds.includes(user.id)
                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={[
                          "flex w-full items-center justify-between px-2 py-2 text-left text-xs hover:bg-slate-50",
                          selected ? "bg-slate-100" : "",
                        ].join(" ")}
                        onMouseDown={(eventValue) => eventValue.preventDefault()}
                        onClick={() =>
                          setSelectedMemberIds((currentValue) =>
                            currentValue.includes(user.id)
                              ? currentValue.filter((idValue) => idValue !== user.id)
                              : [...currentValue, user.id],
                          )
                        }
                      >
                        <span className="font-medium">
                          {user.full_name || "N/A"}
                        </span>
                        <span className="text-muted-foreground">{user.email}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateProjectOpen(false)}
            >
              Hủy
            </Button>
            <LoadingButton
              loading={createProjectMutation.isPending}
              onClick={() => {
                const title = projectNameDraft.trim()
                if (!title) {
                  return
                }
                const today = new Date()
                const end = new Date(today)
                end.setDate(today.getDate() + 30)
                const pad = (n: number) => String(n).padStart(2, "0")
                const toISODate = (d: Date) =>
                  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                createProjectMutation.mutate({
                  name: title,
                  code: `PRJ-${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`,
                  description: null,
                  start_date: toISODate(today),
                  end_date: toISODate(end),
                  status: "planning",
                  department_id: null,
                })
              }}
            >
              Tạo dự án
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
