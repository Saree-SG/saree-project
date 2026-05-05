import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import axios from "axios"
import { ArrowLeft, CalendarRange, Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { OpenAPI } from "@/client"
import { Button } from "@/components/ui/button"
import { getAccessToken } from "@/modules/auth/tokenStore"

type PersonnelTask = {
  id: string
  name: string
  status: string
  start_time: string | null
  end_time: string | null
  project_name?: string | null
}

type PersonnelWeeklyRow = {
  period: string
  done: number
  overdue: number
}

type PersonnelStats = {
  user_id: string
  user_name: string
  done: number
  on_time: number
  overdue: number
  completion_pct: number
}

/**
 * Build auth headers for dashboard calls.
 */
function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

/**
 * Convert ISO date string to short vi-VN label.
 */
function formatShortDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  })
}

/**
 * Build compact gantt range percentages for a task list.
 */
function computeTaskRanges(tasks: PersonnelTask[]) {
  const times = tasks
    .flatMap((task) => [task.start_time, task.end_time])
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const span = Math.max(maxTime - minTime, 1)
  return tasks.map((task) => {
    const start = task.start_time ? new Date(task.start_time).getTime() : minTime
    const end = task.end_time ? new Date(task.end_time).getTime() : start
    const left = ((start - minTime) / span) * 100
    const width = Math.max(((end - start) / span) * 100, 2)
    const isOverdue = task.status !== "completed" && end < Date.now()
    return {
      ...task,
      left,
      width,
      isOverdue,
    }
  })
}

export const Route = createFileRoute("/_layout/dashboard/personnel/$userId")({
  component: DashboardPersonnelPage,
  head: () => ({ meta: [{ title: "Dashboard nhân sự" }] }),
})

function DashboardPersonnelPage() {
  const { userId } = Route.useParams()

  const leaderboardQuery = useQuery({
    queryKey: ["dashboard", "leaderboard"],
    queryFn: async () =>
      (
        await axios.get<PersonnelStats[]>(
          `${OpenAPI.BASE}/api/v1/dashboard/leaderboard`,
          { headers: authHeaders() },
        )
      ).data,
  })

  const tasksQuery = useQuery({
    queryKey: ["dashboard", "personnel-tasks", userId],
    queryFn: async () =>
      (
        await axios.get<PersonnelTask[]>(
          `${OpenAPI.BASE}/api/v1/dashboard/users/${userId}/tasks`,
          { headers: authHeaders() },
        )
      ).data,
  })

  const weeklyStatsQuery = useQuery({
    queryKey: ["dashboard", "personnel-weekly-stats", userId],
    queryFn: async () =>
      (
        await axios.get<PersonnelWeeklyRow[]>(
          `${OpenAPI.BASE}/api/v1/dashboard/users/${userId}/weekly-stats`,
          { headers: authHeaders() },
        )
      ).data,
  })

  const userStats = (leaderboardQuery.data ?? []).find((row) => row.user_id === userId)
  const taskRanges = computeTaskRanges(tasksQuery.data ?? [])

  if (tasksQuery.isLoading || weeklyStatsQuery.isLoading || leaderboardQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {userStats?.user_name ?? userId}
          </h1>
          <p className="text-sm text-muted-foreground">
            Tổng hợp tiến độ công việc theo thời gian
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Hoàn thành</p>
          <p className="text-2xl font-black text-green-600">{userStats?.done ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Đúng hạn</p>
          <p className="text-2xl font-black">{userStats?.on_time ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Trễ hạn</p>
          <p className="text-2xl font-black text-red-600">{userStats?.overdue ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tỷ lệ hoàn thành</p>
          <p className="text-2xl font-black text-primary">
            {Math.round(userStats?.completion_pct ?? 0)}%
          </p>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold">Gantt công việc (compact)</h2>
        </div>
        {!taskRanges.length ? (
          <p className="text-sm text-muted-foreground">Chưa có task để hiển thị.</p>
        ) : (
          <div className="space-y-2">
            {taskRanges.map((task) => (
              <div key={task.id} className="grid grid-cols-[240px_1fr] items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{task.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {task.project_name ?? "—"} · {formatShortDate(task.start_time)} -{" "}
                    {formatShortDate(task.end_time)}
                  </p>
                </div>
                <div className="relative h-5 rounded-md bg-muted">
                  <div
                    className={`absolute top-1/2 h-2 -translate-y-1/2 rounded ${
                      task.isOverdue ? "bg-red-500" : "bg-blue-500"
                    }`}
                    style={{ left: `${task.left}%`, width: `${task.width}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-sm font-bold">Hiệu suất theo tuần/tháng</h2>
        {!weeklyStatsQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu thống kê.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyStatsQuery.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="done" fill="#22c55e" name="Hoàn thành" />
                <Bar dataKey="overdue" fill="#ef4444" name="Trễ hạn" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div>
        <Button variant="outline" asChild>
          <Link to="/">Về dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
