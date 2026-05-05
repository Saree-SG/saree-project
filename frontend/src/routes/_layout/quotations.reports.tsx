import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { BarChart2, TrendingUp, Award, XCircle, DollarSign, FileText } from "lucide-react"
import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { clearSession } from "@/modules/auth/tokenStore"
import {
  reportByClient,
  reportByEquipment,
  reportLostAnalysis,
  reportSummary,
} from "@/modules/quotation/quotationApi"
import { EQUIPMENT_CATEGORIES } from "@/modules/quotation/stageConfig"
import { hasPermission } from "@/utils/accountAccess"

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/_layout/quotations/reports")({
  beforeLoad: async () => {
    let permissions
    try {
      permissions = await import("@/modules/rbac/rbacApi").then((m) =>
        m.readMyPermissions(),
      )
    } catch (err: unknown) {
      const e = err as { status?: number }
      if (e?.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw err
    }
    const allowed =
      hasPermission(permissions, "QUOTATION_VIEW") ||
      hasPermission(permissions, "QUOTATION_VIEW_ALL")
    if (!allowed) throw redirect({ to: "/quotations" })
  },
  component: QuotationReportsPage,
  head: () => ({ meta: [{ title: "Báo cáo báo giá" }] }),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatVnd(value: number | null | undefined): string {
  if (value == null) return "—"
  if (value >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(2)} tỷ`
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(0)} triệu`
  return new Intl.NumberFormat("vi-VN").format(value)
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${value.toFixed(1)}%`
}

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#64748b"]

const LOST_REASON_VN: Record<string, string> = {
  price: "Giá không cạnh tranh",
  design: "Thiết kế không phù hợp",
  marketing: "Tiếp thị chưa tốt",
  other: "Lý do khác",
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent: string
}) {
  return (
    <div className={`rounded-xl border bg-card p-5 flex gap-4 items-start shadow-sm`}>
      <div className={`rounded-lg p-2.5 ${accent}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function QuotationReportsPage() {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [equipmentFilter, setEquipmentFilter] = useState("")
  const [clientFilter, setClientFilter] = useState("")

  // Applied filter state (only update on "Áp dụng")
  const [appliedParams, setAppliedParams] = useState<{
    date_from?: string
    date_to?: string
    equipment_category?: string
    client_company_name?: string
  }>({})

  function handleApply() {
    setAppliedParams({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      equipment_category: equipmentFilter || undefined,
      client_company_name: clientFilter || undefined,
    })
  }

  function handleReset() {
    setDateFrom("")
    setDateTo("")
    setEquipmentFilter("")
    setClientFilter("")
    setAppliedParams({})
  }

  const summaryQuery = useQuery({
    queryKey: ["quotation-reports", "summary", appliedParams],
    queryFn: () => reportSummary(appliedParams),
  })

  const byClientQuery = useQuery({
    queryKey: ["quotation-reports", "by-client", appliedParams],
    queryFn: () => reportByClient(appliedParams),
  })

  const byEquipmentQuery = useQuery({
    queryKey: ["quotation-reports", "by-equipment", appliedParams],
    queryFn: () => reportByEquipment(appliedParams),
  })

  const lostQuery = useQuery({
    queryKey: ["quotation-reports", "lost", appliedParams],
    queryFn: () => reportLostAnalysis(appliedParams),
  })

  const summary = summaryQuery.data
  const byClient = byClientQuery.data ?? []
  const byEquipment = byEquipmentQuery.data ?? []
  const lostReasons = (lostQuery.data ?? []).map((r) => ({
    ...r,
    name: LOST_REASON_VN[r.lost_reason_category] ?? r.lost_reason_category,
  }))

  // Bar chart data: equipment win/loss
  const equipmentChartData = byEquipment.map((row) => ({
    name: row.equipment_category,
    "Thắng": row.won,
    "Thua": row.lost,
    "Đang xử lý": row.total - row.won - row.lost,
  }))

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link to="/quotations" className="hover:text-foreground">Danh sách báo giá</Link>
            <span>/</span>
            <span>Báo cáo</span>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-muted-foreground" />
            Báo cáo & Phân tích
          </h1>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Bộ lọc
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Từ ngày</p>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Đến ngày</p>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Hạng mục thiết bị</p>
            <select
              title="Hạng mục"
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {EQUIPMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Công ty khách hàng</p>
            <Input
              placeholder="Tìm theo tên công ty"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleApply}>Áp dụng</Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>Xóa bộ lọc</Button>
        </div>
      </div>

      {/* Summary cards */}
      {summaryQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải tổng quan...</p>
      ) : summaryQuery.isError ? (
        <p className="text-sm text-destructive">Không thể tải dữ liệu tổng quan.</p>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Tổng hồ sơ"
            value={summary.total}
            icon={FileText}
            accent="bg-slate-500"
          />
          <StatCard
            label="Đang xử lý"
            value={summary.in_progress}
            icon={TrendingUp}
            accent="bg-blue-500"
          />
          <StatCard
            label="Đã gửi khách hàng"
            value={summary.sent}
            icon={TrendingUp}
            accent="bg-teal-500"
          />
          <StatCard
            label="Thương lượng"
            value={summary.negotiating}
            icon={TrendingUp}
            accent="bg-cyan-500"
          />
          <StatCard
            label="Thắng"
            value={summary.closed_won}
            sub={`Tỷ lệ: ${fmtPct(summary.win_rate)}`}
            icon={Award}
            accent="bg-green-500"
          />
          <StatCard
            label="Thua"
            value={summary.closed_lost}
            sub={summary.total_won_value != null ? `Giá trị thắng: ${formatVnd(summary.total_won_value)}` : undefined}
            icon={XCircle}
            accent="bg-red-500"
          />
        </div>
      ) : null}

      {/* Total won value highlight */}
      {summary?.total_won_value != null && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex items-center gap-4">
          <div className="rounded-lg bg-green-500 p-2.5">
            <DollarSign className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-green-700">Tổng giá trị hợp đồng thắng</p>
            <p className="text-2xl font-bold text-green-800 tabular-nums">
              {new Intl.NumberFormat("vi-VN", {
                style: "currency",
                currency: "VND",
                maximumFractionDigits: 0,
              }).format(summary.total_won_value)}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By equipment chart */}
        <div className="rounded-xl border bg-card p-5">
          <p className="font-semibold mb-4">Theo hạng mục thiết bị</p>
          {byEquipmentQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : !byEquipment.length ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={equipmentChartData} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-20}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Thắng" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Đang xử lý" stackId="a" fill="#60a5fa" />
                <Bar dataKey="Thua" stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Lost reason pie chart */}
        <div className="rounded-xl border bg-card p-5">
          <p className="font-semibold mb-4">Phân tích nguyên nhân thua</p>
          {lostQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : !lostReasons.length ? (
            <p className="text-sm text-muted-foreground">Chưa có hồ sơ thua.</p>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="h-[220px] w-full sm:h-[240px] lg:w-[55%]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={lostReasons}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={82}
                      dataKey="count"
                      nameKey="name"
                      paddingAngle={3}
                    >
                      {lostReasons.map((_entry, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v} hồ sơ`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-sm lg:flex-1">
                {lostReasons.map((r, i) => (
                  <div key={r.lost_reason_category} className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-xs">
                      {r.name}
                      <span className="ml-1 text-muted-foreground">
                        ({r.count} — {r.percentage.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* By client table */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <p className="font-semibold">Thống kê theo khách hàng</p>
        </div>
        {byClientQuery.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Đang tải...</p>
        ) : !byClient.length ? (
          <p className="p-5 text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Khách hàng</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
                <TableHead className="text-right">Thắng</TableHead>
                <TableHead className="text-right">Thua</TableHead>
                <TableHead className="text-right">Đang xử lý</TableHead>
                <TableHead className="text-right">Tỷ lệ thắng</TableHead>
                <TableHead className="text-right">Giá trị thắng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byClient.map((row) => (
                <TableRow key={row.client_company_name}>
                  <TableCell className="font-medium">{row.client_company_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                  <TableCell className="text-right tabular-nums text-green-600">{row.won}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-500">{row.lost}</TableCell>
                  <TableCell className="text-right tabular-nums text-blue-500">{row.in_progress}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.win_rate != null ? (
                      <span className={row.win_rate >= 50 ? "text-green-600 font-medium" : ""}>
                        {fmtPct(row.win_rate)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatVnd(row.total_won_value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* By equipment table */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <p className="font-semibold">Thống kê theo hạng mục thiết bị</p>
        </div>
        {byEquipmentQuery.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Đang tải...</p>
        ) : !byEquipment.length ? (
          <p className="p-5 text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hạng mục</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
                <TableHead className="text-right">Thắng</TableHead>
                <TableHead className="text-right">Thua</TableHead>
                <TableHead className="text-right">Tỷ lệ thắng</TableHead>
                <TableHead>Tỷ lệ trực quan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byEquipment.map((row) => {
                const winPct = row.win_rate ?? 0
                return (
                  <TableRow key={row.equipment_category}>
                    <TableCell className="font-medium">{row.equipment_category}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-600">{row.won}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-500">{row.lost}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.win_rate != null ? fmtPct(row.win_rate) : "—"}
                    </TableCell>
                    <TableCell className="w-40 min-w-[8rem]">
                      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-green-500 transition-all"
                          style={{ width: `${winPct}%` }}
                        />
                        {row.lost > 0 && (
                          <div
                            className="bg-red-400 transition-all"
                            style={{ width: `${(row.lost / row.total) * 100}%` }}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
