import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import {
  DashboardService,
  ProjectsService,
  RolesService,
  TasksService,
  UsersService,
  type ProjectPublic,
  type TaskPublic,
} from "@/client"

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

type MemberPayload = {
  user_id: string
  role_id: string
  joined_at: string
}

export const Route = createFileRoute("/_layout/projects/$projectId")({
  beforeLoad: async () => {
    const profile = await RolesService.myAccountProfile()
    const isDirector = profile.memberships.some((membership) => membership.role_name === "director")
    if (!isDirector) {
      throw redirect({ to: "/chat" })
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

function ProjectTaskDashboardPage() {
  const { projectId } = Route.useParams()

  const projectQuery = useQuery({
    queryKey: ["project-dashboard", "project", projectId],
    queryFn: () => ProjectsService.getProject({ projectId }) as Promise<ProjectPublic>,
  })

  const projectStatsQuery = useQuery({
    queryKey: ["project-dashboard", "stats", projectId],
    queryFn: async () =>
      (await DashboardService.projectStats({ projectId })) as ProjectStatsPayload[],
  })

  const tasksQuery = useQuery({
    queryKey: ["project-dashboard", "tasks", projectId],
    queryFn: async () =>
      (await TasksService.listProjectTasks({ projectId, limit: 30 })).data as TaskPublic[],
  })

  const membersQuery = useQuery({
    queryKey: ["project-dashboard", "members", projectId],
    queryFn: () => ProjectsService.getMembers({ projectId }) as Promise<MemberPayload[]>,
  })

  const usersQuery = useQuery({
    queryKey: ["project-dashboard", "users"],
    queryFn: () => UsersService.readUsers({ limit: 300 }),
  })

  const workloadQuery = useQuery({
    queryKey: ["project-dashboard", "workload", projectId],
    queryFn: () => DashboardService.userWorkload({ projectId }) as Promise<WorkloadPayload[]>,
  })

  const stats = projectStatsQuery.data?.[0]

  const userById = useMemo(() => {
    const data = new Map<string, { name: string; email: string }>()
    for (const user of usersQuery.data?.data ?? []) {
      data.set(user.id, {
        name: user.full_name || user.email,
        email: user.email,
      })
    }
    return data
  }, [usersQuery.data?.data])

  const teamCards = useMemo(() => {
    const workloadMap = new Map<string, number>()
    for (const row of workloadQuery.data ?? []) {
      workloadMap.set(row.user_id, row.active_tasks)
    }
    return (membersQuery.data ?? []).slice(0, 8).map((member) => {
      const profile = userById.get(member.user_id)
      const activeTasks = workloadMap.get(member.user_id) ?? 0
      const loadTag = activeTasks >= 6 ? "OVERLOAD" : "AVAILABLE"
      return {
        id: member.user_id,
        name: profile?.name || member.user_id,
        title: profile?.email || "",
        activeTasks,
        loadTag,
      }
    })
  }, [membersQuery.data, userById, workloadQuery.data])

  const detailedTasks = useMemo(() => {
    return (tasksQuery.data ?? []).slice(0, 10).map((task) => {
      const assignee = userById.get(task.assignee_id)
      const reportedProgress = task.reported_progress_total ?? 0
      return {
        ...task,
        assigneeName: assignee?.name || task.assignee_id,
        reportedProgress,
      }
    })
  }, [tasksQuery.data, userById])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-2 pb-24 sm:px-4">
      <section className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Active Project</div>
        <h1 className="text-2xl font-extrabold tracking-tight">{projectQuery.data?.name ?? "Project Dashboard"}</h1>
        <p className="text-sm text-muted-foreground">Management Hub • Task execution overview</p>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Overall Progress</p>
            <p className="text-3xl font-black">{stats?.completion_pct ?? 0}%</p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>{stats?.done_tasks ?? 0} Completed</p>
              <p>{Math.max(0, (stats?.total_tasks ?? 0) - (stats?.done_tasks ?? 0))} In Progress/Todo</p>
            </div>
          </div>
          <div className="text-right text-xs">
            <p className="font-semibold text-red-600">{stats?.overdue_tasks ?? 0} overdue</p>
            <p className="text-muted-foreground">Status: {projectQuery.data?.status ?? "N/A"}</p>
          </div>
        </div>
        <progress
          max={100}
          value={Math.max(0, Math.min(100, stats?.completion_pct ?? 0))}
          className="mt-4 h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Project Team</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {teamCards.map((member) => (
            <div key={member.id} className="space-y-2 rounded-xl border bg-white p-3 shadow-sm">
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
              <p className="truncate text-[11px] text-muted-foreground">{member.title}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Detailed Tasks</h2>
        </div>
        <div className="space-y-3">
          {detailedTasks.map((task) => (
            <Link
              key={task.id}
              to="/tasks/$taskId"
              params={{ taskId: task.id }}
              className="block space-y-3 rounded-xl border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-10 w-10 shrink-0 rounded-full bg-primary/10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{task.name}</p>
                  <p className="text-[11px] text-primary">{task.assigneeName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Due: {new Date(task.end_time).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-muted-foreground">{statusLabel(task.status)}</p>
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
      </section>

      <section className="grid grid-cols-2 gap-3">
        <button type="button" className="rounded-2xl bg-primary py-5 text-sm font-bold text-white">
          New Task
        </button>
        <button type="button" className="rounded-2xl border-2 border-primary/20 bg-white py-5 text-sm font-bold text-primary">
          Export Report
        </button>
      </section>
    </div>
  )
}
