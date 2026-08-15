import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { BarChart2 } from "lucide-react"
import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { DashboardService, RolesService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useAuth from "@/hooks/useAuth"
import { clearSession } from "@/modules/auth/tokenStore"
import { listCompanyMembers, readMyPermissions } from "@/modules/rbac/rbacApi"
import { canAccessDashboard } from "@/utils/accountAccess"

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/_layout/reports")({
  beforeLoad: async () => {
    let permissions
    try {
      permissions = await readMyPermissions()
    } catch (err: unknown) {
      const e = err as { status?: number }
      if (e?.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw err
    }
    if (!canAccessDashboard(permissions)) throw redirect({ to: "/" })
  },
  component: DashboardReportsPage,
  head: () => ({ meta: [{ title: "Báo cáo tổng quan" }] }),
})

// ---------------------------------------------------------------------------
// Types (mirror index.tsx payloads)
// ---------------------------------------------------------------------------

type ProjectStats = {
  project_id: string
  name: string
  code: string | null
  end_date: string | null
  status: string
  total_tasks: number
  done_tasks: number
  overdue_tasks: number
  completion_pct: number
}

type LeaderboardRow = {
  user_id: string
  user_name?: string
  total: number
  done: number
  on_time: number
  overdue: number
  completion_pct: number
}

type WorkloadRow = {
  user_id: string
  user_name?: string
  active_tasks: number
  total_assigned: number
}

type OverduePayload = {
  critical?: ProjectWarning[]
  warning?: ProjectWarning[]
  watch?: ProjectWarning[]
}

type ProjectWarning = {
  project_id: string
  project_name?: string
  project_status?: string | null
  severity: "critical" | "warning" | "watch"
  overdue_tasks: number
  warning_tasks: number
  watch_tasks: number
  nearest_task_name: string
  nearest_task_end_time: string
  delay_days: number
  days_left: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  planning: "Lên kế hoạch",
  in_progress: "Đang thực hiện",
  on_hold: "Tạm dừng",
  completed: "Hoàn thành",
  cancelled: "Hủy",
}

const STATUS_COLOR: Record<string, string> = {
  planning: "#94a3b8",
  in_progress: "#3b82f6",
  on_hold: "#f59e0b",
  completed: "#22c55e",
  cancelled: "#ef4444",
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("vi-VN")
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DashboardReportsPage() {
  const { user: currentUser } = useAuth()

  const [projectFilter, setProjectFilter] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("")
  const [appliedParams, setAppliedParams] = useState<{
    projectId?: string
    departmentId?: string
  }>({})

  function handleApply() {
    setAppliedParams({
      projectId: projectFilter || undefined,
      departmentId: departmentFilter || undefined,
    })
  }

  function handleReset() {
    setProjectFilter("")
    setDepartmentFilter("")
    setAppliedParams({})
  }

  // --- data queries ---
  const profileQuery = useQuery({
    queryKey: ["reports", "profile"],
    queryFn: () => RolesService.myAccountProfile(),
  })
  const primaryMembership = useMemo(
    () =>
      profileQuery.data?.memberships.find((m) => m.is_primary) ??
      profileQuery.data?.memberships[0],
    [profileQuery.data?.memberships],
  )

  const projectsQuery = useQuery({
    queryKey: ["reports", "projects-catalog"],
    queryFn: () =>
      import("@/client").then((m) =>
        m.ProjectsService.listProjects({ limit: 200 }),
      ),
  })

  const departmentsQuery = useQuery({
    enabled: Boolean(primaryMembership?.company_id),
    queryKey: ["reports", "departments", primaryMembership?.company_id],
    queryFn: () =>
      RolesService.listDepartments({
        companyId: primaryMembership!.company_id,
      }),
  })

  const membersQuery = useQuery({
    queryKey: ["reports", "members"],
    queryFn: async () => {
      if (currentUser?.is_superuser) {
        const { UsersService } = await import("@/client")
        return (await UsersService.readUsers({ limit: 500 })).data
      }
      if (!primaryMembership?.company_id) return []
      return listCompanyMembers(primaryMembership.company_id)
    },
    enabled: Boolean(
      currentUser &&
        (currentUser.is_superuser || primaryMembership?.company_id),
    ),
  })

  const projectStatsQuery = useQuery({
    queryKey: ["reports", "project-stats", appliedParams],
    queryFn: async () =>
      (await DashboardService.projectStats(appliedParams)) as ProjectStats[],
  })

  const leaderboardQuery = useQuery({
    queryKey: ["reports", "leaderboard", appliedParams],
    queryFn: async () =>
      (await DashboardService.leaderboard(appliedParams)) as LeaderboardRow[],
  })

  const workloadQuery = useQuery({
    queryKey: ["reports", "workload", appliedParams],
    queryFn: async () =>
      (await DashboardService.userWorkload(appliedParams)) as WorkloadRow[],
  })

  const overdueQuery = useQuery({
    queryKey: ["reports", "overdue", appliedParams],
    queryFn: async () =>
      (await DashboardService.overdueReport(appliedParams)) as OverduePayload,
  })

  // --- derived chart data ---

  const projectStats = projectStatsQuery.data ?? []
  const leaderboard = leaderboardQuery.data ?? []
  const workload = workloadQuery.data ?? []
  const allOverdue = useMemo(() => {
    const od = overdueQuery.data
    if (!od) return []
    return [
      ...(od.critical ?? []).map((item) => ({ ...item, severityLabel: "Đỏ" })),
      ...(od.warning ?? []).map((item) => ({ ...item, severityLabel: "Cam" })),
      ...(od.watch ?? []).map((item) => ({ ...item, severityLabel: "Vàng" })),
    ]
  }, [overdueQuery.data])

  // Project status distribution (pie-style radial)
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of projectStats) {
      counts[p.status] = (counts[p.status] ?? 0) + 1
    }
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABEL[status] ?? status,
      value: count,
      fill: STATUS_COLOR[status] ?? "#94a3b8",
    }))
  }, [projectStats])

  // Project completion bar chart (top 10 by total tasks)
  const projectCompletionChart = useMemo(
    () =>
      [...projectStats]
        .sort((a, b) => b.total_tasks - a.total_tasks)
        .slice(0, 10)
        .map((p) => ({
          name: p.code ?? p.name.slice(0, 12),
          fullName: p.name,
          "Hoàn thành": p.done_tasks,
          "Còn lại": p.total_tasks - p.done_tasks,
          Trễ: p.overdue_tasks,
          pct: p.completion_pct,
        })),
    [projectStats],
  )

  // Leaderboard chart (top 10)
  const leaderboardChart = useMemo(
    () =>
      [...leaderboard]
        .sort((a, b) => b.done - a.done)
        .slice(0, 10)
        .map((r) => ({
          name: (r.user_name ?? r.user_id).split(" ").slice(-1)[0],
          fullName: r.user_name ?? r.user_id,
          "Đúng hạn": r.on_time,
          Trễ: r.overdue,
          "Tổng done": r.done,
          pct: r.completion_pct,
        })),
    [leaderboard],
  )

  // Workload chart
  const workloadChart = useMemo(
    () =>
      [...workload]
        .sort((a, b) => b.active_tasks - a.active_tasks)
        .slice(0, 10)
        .map((r) => ({
          name: (r.user_name ?? r.user_id).split(" ").slice(-1)[0],
          fullName: r.user_name ?? r.user_id,
          "Đang làm": r.active_tasks,
          "Tổng giao": r.total_assigned,
        })),
    [workload],
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 pb-24 md:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link to="/" className="hover:text-foreground">
              Tổng quan
            </Link>
            <span>/</span>
            <span>Báo cáo</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <BarChart2 className="size-6 text-muted-foreground" />
            Báo cáo & Phân tích
          </h1>
          <p className="text-sm text-muted-foreground">
            Hiệu suất dự án, nhân sự và tiến độ
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Bộ lọc
        </p>
        <div className="flex flex-wrap gap-3">
          <Select
            value={projectFilter || "all"}
            onValueChange={(v) => setProjectFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-full sm:w-[200px]">
              <SelectValue placeholder="Tất cả dự án" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả dự án</SelectItem>
              {(projectsQuery.data?.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={departmentFilter || "all"}
            onValueChange={(v) => setDepartmentFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-full sm:w-[200px]">
              <SelectValue placeholder="Tất cả phòng ban" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả phòng ban</SelectItem>
              {(departmentsQuery.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleApply}>
            Áp dụng
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>
            Xóa bộ lọc
          </Button>
        </div>
      </div>

      {/* Charts row 1: Project completion + Status distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Project completion stacked bar */}
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <p className="font-semibold mb-1">Tiến độ hoàn thành theo dự án</p>
          <p className="text-xs text-muted-foreground mb-4">
            Top 10 dự án nhiều task nhất
          </p>
          {projectStatsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : !projectCompletionChart.length ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={projectCompletionChart}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={96}
                />
                <Tooltip
                  formatter={(v, name) => [v, name]}
                  labelFormatter={(label, payload) => {
                    const fullName = (
                      payload?.[0]?.payload as { fullName?: string }
                    )?.fullName
                    const pct = (payload?.[0]?.payload as { pct?: number })?.pct
                    return `${fullName ?? label}${pct != null ? ` (${pct}%)` : ""}`
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Hoàn thành" stackId="a" fill="#22c55e" />
                <Bar dataKey="Còn lại" stackId="a" fill="#e2e8f0" />
                <Bar dataKey="Trễ" fill="#f87171" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status distribution radial */}
        <div className="rounded-xl border bg-card p-5">
          <p className="font-semibold mb-1">Phân bổ trạng thái dự án</p>
          <p className="text-xs text-muted-foreground mb-4">
            {projectStats.length} dự án
          </p>
          {projectStatsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : !statusDistribution.length ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius={20}
                  outerRadius={80}
                  data={statusDistribution}
                  startAngle={180}
                  endAngle={-180}
                >
                  <RadialBar dataKey="value" background label={false} />
                  <Tooltip formatter={(v, n) => [`${v} dự án`, n]} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {statusDistribution.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: s.fill }}
                      />
                      {s.name}
                    </span>
                    <span className="font-semibold">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts row 2: Leaderboard + Workload */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Leaderboard bar chart */}
        <div className="rounded-xl border bg-card p-5">
          <p className="font-semibold mb-1">Hiệu suất nhân sự</p>
          <p className="text-xs text-muted-foreground mb-4">
            Task hoàn thành (top 10)
          </p>
          {leaderboardQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : !leaderboardChart.length ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={leaderboardChart}
                layout="vertical"
                margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={54}
                />
                <Tooltip
                  formatter={(v, name) => [v, name]}
                  labelFormatter={(label, payload) => {
                    const full = (
                      payload?.[0]?.payload as { fullName?: string }
                    )?.fullName
                    const pct = (payload?.[0]?.payload as { pct?: number })?.pct
                    return `${full ?? label}${pct != null ? ` — ${pct}%` : ""}`
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Đúng hạn" stackId="a" fill="#22c55e" />
                <Bar
                  dataKey="Trễ"
                  stackId="a"
                  fill="#f87171"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Workload bar chart */}
        <div className="rounded-xl border bg-card p-5">
          <p className="font-semibold mb-1">Phân bổ nguồn lực</p>
          <p className="text-xs text-muted-foreground mb-4">
            Task đang làm vs tổng được giao (top 10)
          </p>
          {workloadQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : !workloadChart.length ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={workloadChart}
                layout="vertical"
                margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={54}
                />
                <Tooltip
                  formatter={(v, name) => [v, name]}
                  labelFormatter={(_label, payload) =>
                    (payload?.[0]?.payload as { fullName?: string })
                      ?.fullName ?? _label
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Đang làm" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Tổng giao" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Project stats table */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <p className="font-semibold">Chi tiết tiến độ dự án</p>
          <span className="text-xs text-muted-foreground">
            {projectStats.length} dự án
          </span>
        </div>
        {projectStatsQuery.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Đang tải...</p>
        ) : !projectStats.length ? (
          <p className="p-5 text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dự án</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Tổng task</TableHead>
                  <TableHead className="text-right">Hoàn thành</TableHead>
                  <TableHead className="text-right text-red-500">Trễ</TableHead>
                  <TableHead className="text-right">% Hoàn thành</TableHead>
                  <TableHead>Tiến trình</TableHead>
                  <TableHead>Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...projectStats]
                  .sort((a, b) => b.completion_pct - a.completion_pct)
                  .map((p) => (
                    <TableRow key={p.project_id}>
                      <TableCell>
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: p.project_id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.code ? (
                          <p className="text-xs text-muted-foreground">
                            {p.code}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            background: `${STATUS_COLOR[p.status]}20`,
                            color: STATUS_COLOR[p.status],
                          }}
                        >
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.total_tasks}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">
                        {p.done_tasks}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-red-500">
                        {p.overdue_tasks}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {p.completion_pct}%
                      </TableCell>
                      <TableCell className="w-28 min-w-[7rem]">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-green-500 transition-all"
                            style={{ width: `${p.completion_pct}%` }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(p.end_date)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Personnel performance table */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <p className="font-semibold">Hiệu suất nhân sự chi tiết</p>
          <span className="text-xs text-muted-foreground">
            {leaderboard.length} nhân viên
          </span>
        </div>
        {leaderboardQuery.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Đang tải...</p>
        ) : !leaderboard.length ? (
          <p className="p-5 text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Nhân viên</TableHead>
                <TableHead className="text-right">Tổng task</TableHead>
                <TableHead className="text-right text-green-600">
                  Hoàn thành
                </TableHead>
                <TableHead className="text-right">Đúng hạn</TableHead>
                <TableHead className="text-right text-red-500">Trễ</TableHead>
                <TableHead className="text-right">Tỷ lệ HT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...leaderboard]
                .sort((a, b) => b.done - a.done)
                .map((r, idx) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.user_name ?? r.user_id}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-green-600">
                      {r.done}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.on_time}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-500">
                      {r.overdue}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          r.completion_pct >= 80
                            ? "font-semibold text-green-600"
                            : ""
                        }
                      >
                        {r.completion_pct}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Overdue tasks table */}
      {allOverdue.length > 0 && (
        <div className="rounded-xl border border-red-100 bg-card">
          <div className="border-b border-red-100 bg-red-50 px-5 py-4 flex items-center justify-between rounded-t-xl">
            <p className="font-semibold text-red-700">Task trễ deadline</p>
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
              {allOverdue.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Dự án</TableHead>
                  <TableHead>Phụ trách</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Mức độ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allOverdue.map((t) => (
                  <TableRow
                    key={`${t.project_id}-${t.severity}`}
                    className="hover:bg-red-50/40"
                  >
                    <TableCell className="font-medium">
                      {t.nearest_task_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {t.project_name ?? t.project_id}
                    </TableCell>
                    <TableCell className="text-sm">—</TableCell>
                    <TableCell className="font-medium text-red-600">
                      {fmtDate(t.nearest_task_end_time)}
                    </TableCell>
                    <TableCell>
                      {t.severity === "critical" ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Đỏ · Trễ {t.delay_days} ngày
                        </span>
                      ) : t.severity === "warning" ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          Cam · Còn {t.days_left} ngày
                        </span>
                      ) : (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                          Vàng · Còn {t.days_left} ngày
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Members list */}
      {(membersQuery.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-5 py-4">
            <p className="font-semibold">Thành viên công ty</p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-4">
            {(membersQuery.data ?? []).map((m) => (
              <div
                key={"user_id" in m ? m.user_id : m.id}
                className="rounded-lg border bg-muted/20 px-3 py-2 text-sm"
              >
                <p className="truncate font-medium">
                  {"full_name" in m ? m.full_name : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {"email" in m ? m.email : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
