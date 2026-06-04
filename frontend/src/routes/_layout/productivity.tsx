import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Award, Clock, Gauge, TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getTeamProductivity } from "@/modules/dashboard/productivityApi"

export const Route = createFileRoute("/_layout/productivity")({
  component: ProductivityPage,
  head: () => ({ meta: [{ title: "Năng suất tổ" }] }),
})

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs">{label}</div>
          <div className="truncate text-lg font-semibold">{value}</div>
          {sub && <div className="text-muted-foreground truncate text-xs">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

function ProductivityPage() {
  const [month, setMonth] = useState<string>(currentMonth())

  const query = useQuery({
    queryKey: ["team-productivity", month],
    queryFn: () => getTeamProductivity({ month }),
  })

  const rows = query.data?.rows ?? []

  const totals = useMemo(() => {
    const hours = rows.reduce((s, r) => s + r.work_hours, 0)
    const done = rows.reduce((s, r) => s + r.tasks_done, 0)
    const topHours = [...rows].sort((a, b) => b.work_hours - a.work_hours)[0]
    const topDone = [...rows].sort((a, b) => b.tasks_done - a.tasks_done)[0]
    return { hours, done, topHours, topDone }
  }, [rows])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Gauge className="text-primary size-6" /> Năng suất tổ
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Giờ công + tỷ lệ hoàn thành công việc theo tháng — cơ sở thi đua, khen
            thưởng.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Tháng</label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="w-40"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Clock className="size-5" />}
          label="Tổng giờ công"
          value={`${totals.hours.toFixed(1)} h`}
        />
        <StatCard
          icon={<TrendingUp className="size-5" />}
          label="Task hoàn thành"
          value={String(totals.done)}
        />
        <StatCard
          icon={<Award className="size-5" />}
          label="Nhiều giờ công nhất"
          value={totals.topHours?.user_name ?? "—"}
          sub={totals.topHours ? `${totals.topHours.work_hours.toFixed(1)} h` : undefined}
        />
        <StatCard
          icon={<Award className="size-5" />}
          label="Hoàn thành nhiều nhất"
          value={totals.topDone?.user_name ?? "—"}
          sub={totals.topDone ? `${totals.topDone.tasks_done} task` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chi tiết theo nhân sự</CardTitle>
          <CardDescription>
            Tháng {query.data?.month ?? month} · {rows.length} người
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Đang tải…</p>
          ) : query.isError ? (
            <p className="text-destructive py-6 text-center text-sm">
              Không tải được dữ liệu (cần quyền xem báo cáo).
            </p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Chưa có dữ liệu chấm công / công việc trong tháng này.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân sự</TableHead>
                  <TableHead className="text-right">Giờ công</TableHead>
                  <TableHead className="text-right">Số ngày</TableHead>
                  <TableHead className="text-right">Task HT</TableHead>
                  <TableHead className="text-right text-red-500">Trễ</TableHead>
                  <TableHead className="text-right">% HT</TableHead>
                  <TableHead className="text-right">Task/giờ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{r.user_name}</TableCell>
                    <TableCell className="text-right">
                      {r.work_hours.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">{r.days_worked}</TableCell>
                    <TableCell className="text-right">
                      {r.tasks_done}/{r.tasks_total}
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {r.tasks_overdue || ""}
                    </TableCell>
                    <TableCell className="text-right">{r.completion_pct}%</TableCell>
                    <TableCell className="text-right">
                      {r.tasks_per_hour != null ? r.tasks_per_hour.toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
