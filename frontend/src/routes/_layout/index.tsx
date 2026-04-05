import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { DashboardService, ProjectsService, RolesService, UsersService } from "@/client"
import { isManagementUser } from "@/utils/accountAccess"

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
    const [profile, me] = await Promise.all([
      RolesService.myAccountProfile(),
      UsersService.readUserMe(),
    ])
    const allowed = Boolean(me?.is_superuser) || isManagementUser(profile)
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

  const profileQuery = useQuery({
    queryKey: ["dashboard", "profile"],
    queryFn: () => RolesService.myAccountProfile(),
  })
  const primaryMembership = useMemo(
    () => profileQuery.data?.memberships.find((membership) => membership.is_primary) ?? profileQuery.data?.memberships[0],
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
    queryFn: async () => (await DashboardService.overview(dashboardParams)) as OverviewPayload,
  })

  const projectStatsQuery = useQuery({
    queryKey: ["dashboard", "project-stats", dashboardParams],
    queryFn: async () => (await DashboardService.projectStats(dashboardParams)) as ProjectStatsPayload[],
  })

  const leaderboardQuery = useQuery({
    queryKey: ["dashboard", "leaderboard", dashboardParams],
    queryFn: async () => (await DashboardService.leaderboard(dashboardParams)) as LeaderboardPayload[],
  })

  const workloadQuery = useQuery({
    queryKey: ["dashboard", "workload", dashboardParams],
    queryFn: async () => (await DashboardService.userWorkload(dashboardParams)) as WorkloadPayload[],
  })

  const overdueQuery = useQuery({
    queryKey: ["dashboard", "overdue", dashboardParams],
    queryFn: async () => (await DashboardService.overdueReport(dashboardParams)) as OverduePayload,
  })

  const projectsQuery = useQuery({
    queryKey: ["dashboard", "projects-catalog"],
    queryFn: () => ProjectsService.listProjects({ limit: 200 }),
  })

  const usersQuery = useQuery({
    queryKey: ["dashboard", "users-catalog"],
    queryFn: () => UsersService.readUsers({ limit: 500 }),
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
    () => (projectStatsQuery.data ?? []).slice().sort((a, b) => b.completion_pct - a.completion_pct).slice(0, 3),
    [projectStatsQuery.data],
  )
  const topWorkers = useMemo(
    () => (leaderboardQuery.data ?? []).slice().sort((a, b) => b.done - a.done).slice(0, 5),
    [leaderboardQuery.data],
  )
  const userNameById = useMemo(() => {
    const data = new Map<string, string>()
    for (const user of usersQuery.data?.data ?? []) {
      data.set(user.id, user.full_name || user.email)
    }
    return data
  }, [usersQuery.data?.data])
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-2 pb-24 sm:px-3 md:px-0">
      <section className="space-y-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Tổng quan quản lý</h1>
          <p className="text-sm text-muted-foreground">Tổng quan dự án, tiến độ và hiệu suất</p>
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
            onChange={(eventValue) => setDepartmentFilter(eventValue.target.value)}
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
          <p className="text-[11px] font-bold uppercase text-muted-foreground">Tiến độ tổng thể</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-primary">{overview?.completion_rate_pct ?? 0}%</p>
            <p className="text-xs font-semibold text-red-600">{overview?.overdue_tasks ?? 0} task trễ</p>
          </div>
          <progress
            max={100}
            value={Math.max(0, Math.min(100, overview?.completion_rate_pct ?? 0))}
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
          <span className="text-xs font-semibold text-primary">{overview?.total_projects ?? 0} dự án</span>
        </div>
        {topProjects.map((project) => (
          <Link
            key={project.project_id}
            to="/projects/$projectId"
            params={{ projectId: project.project_id }}
            className="block space-y-1.5 rounded-lg p-1 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{project.name}</p>
              <p className="text-xs font-bold text-primary">{project.completion_pct}%</p>
            </div>
            <progress
              max={100}
              value={Math.max(0, Math.min(100, project.completion_pct))}
              className="h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              {project.done_tasks}/{project.total_tasks} done • {project.overdue_tasks} overdue
            </p>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Task Trễ Deadline</h2>
        <div className="space-y-2">
          {delayedTasks.map((task) => (
            <div key={task.task_id} className="rounded-xl border-l-4 border-red-500 bg-white p-3 shadow-sm">
              <p className="text-sm font-bold">{task.name}</p>
              <p className="text-xs text-muted-foreground">
                {task.project_name ?? projectNameById.get(task.project_id) ?? task.project_id}
              </p>
              <p className="text-[11px] font-medium text-red-600">
                Assignee: {task.assignee_name ?? userNameById.get(task.assignee_id) ?? task.assignee_id}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Nhân sự hoàn thành task nhiều nhất</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {topWorkers.map((worker) => (
            <div key={worker.user_id} className="min-w-[180px] rounded-xl border bg-white p-3">
              <p className="truncate text-sm font-bold">
                {worker.user_name ?? userNameById.get(worker.user_id) ?? worker.user_id}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{worker.done} done</p>
              <p className="text-xs font-semibold text-primary">{worker.completion_pct}% completion</p>
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
                <p className="truncate">{item.user_name ?? userNameById.get(item.user_id) ?? item.user_id}</p>
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
    </div>
  )
}
