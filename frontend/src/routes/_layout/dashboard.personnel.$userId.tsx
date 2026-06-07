import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import axios from "axios"
import { ArrowLeft, CalendarRange, Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ApiError, OpenAPI, RolesService, UsersService } from "@/client"
import GanttToolbar from "@/components/Gantt/GanttToolbar"
import GanttView from "@/components/Gantt/GanttView"
import { toGanttLink, toGanttRow } from "@/components/Gantt/transformers"
import type {
  GanttFilter,
  GanttGroupBy,
  GanttScale,
} from "@/components/Gantt/types"
import { Button } from "@/components/ui/button"
import { clearSession, getAccessToken } from "@/modules/auth/tokenStore"
import { fetchUserGantt } from "@/modules/gantt/ganttApi"

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

export const Route = createFileRoute("/_layout/dashboard/personnel/$userId")({
  component: DashboardPersonnelPage,
  head: () => ({ meta: [{ title: "Dashboard nhân sự" }] }),
  // Optional ?name= carried from the org chart so the title shows the person's
  // name even when they have no leaderboard stats. Returned key is optional so
  // links without a name stay valid.
  validateSearch: (search: Record<string, unknown>): { name?: string } => {
    const name = typeof search.name === "string" ? search.name : undefined
    return name ? { name } : {}
  },
  // Only managers (role level ≤ 2) and superusers may open a person's detail.
  beforeLoad: async () => {
    const user = await UsersService.readUserMe().catch((errorValue) => {
      if (errorValue instanceof ApiError && errorValue.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw errorValue
    })
    if (user.is_superuser) return
    try {
      const profile = await RolesService.myAccountProfile()
      const isManagerUp = profile.memberships.some((m) => m.role_level <= 2)
      if (isManagerUp) return
    } catch {
      // fall through to redirect
    }
    throw redirect({ to: "/" })
  },
})

function DashboardPersonnelPage() {
  const { userId } = Route.useParams()
  const { name: nameFromSearch } = Route.useSearch()

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

  const ganttQuery = useQuery({
    queryKey: ["gantt", "user", userId],
    queryFn: () => fetchUserGantt(userId),
  })

  const [scale, setScale] = useState<GanttScale>("day")
  const [groupBy, setGroupBy] = useState<GanttGroupBy>("project")
  const [filter, setFilter] = useState<GanttFilter>({})
  const [scrollToToday, setScrollToToday] = useState(0)

  const rows = useMemo(
    () =>
      (ganttQuery.data?.tasks ?? []).map((t) => {
        const r = toGanttRow(t)
        return {
          ...r,
          project_id: t.project_id,
          project_name: (t as any).project_name ?? null,
        }
      }),
    [ganttQuery.data?.tasks],
  )
  const links = useMemo(
    () => (ganttQuery.data?.dependencies ?? []).map(toGanttLink),
    [ganttQuery.data?.dependencies],
  )

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

  const userStats = (leaderboardQuery.data ?? []).find(
    (row) => row.user_id === userId,
  )

  if (
    ganttQuery.isLoading ||
    weeklyStatsQuery.isLoading ||
    leaderboardQuery.isLoading
  ) {
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
            {userStats?.user_name ?? nameFromSearch ?? userId}
          </h1>
          <p className="text-sm text-muted-foreground">
            Tổng hợp tiến độ công việc theo thời gian
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Hoàn thành</p>
          <p className="text-2xl font-black text-green-600">
            {userStats?.done ?? 0}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Đúng hạn</p>
          <p className="text-2xl font-black">{userStats?.on_time ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Trễ hạn</p>
          <p className="text-2xl font-black text-red-600">
            {userStats?.overdue ?? 0}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tỷ lệ hoàn thành</p>
          <p className="text-2xl font-black text-primary">
            {Math.round(userStats?.completion_pct ?? 0)}%
          </p>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Gantt công việc</h2>
          </div>
          <GanttToolbar
            rows={rows}
            scale={scale}
            onScaleChange={setScale}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            filter={filter}
            onFilterChange={setFilter}
            onScrollToToday={() => setScrollToToday((n) => n + 1)}
            enableProjectGroup
          />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có task để hiển thị.
          </p>
        ) : (
          <GanttView
            rows={rows}
            links={links}
            scale={scale}
            groupBy={groupBy}
            filter={filter}
            scrollToToday={scrollToToday}
            readOnly
          />
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-sm font-bold">Hiệu suất theo tuần/tháng</h2>
        {!weeklyStatsQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">
            Chưa có dữ liệu thống kê.
          </p>
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
