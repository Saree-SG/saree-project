import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FolderOpen,
  UserCheck,
  Users,
} from "lucide-react"

import { DashboardService } from "@/client"
import { Card } from "@/components/ui/card"
import { StatCard } from "@/components/ui/stat-card"

/**
 * MÀN TỔNG QUAN MẪU — theo phong cách POC "QL Thi Công".
 * Mục đích: cho khách duyệt "khung nhìn thông tin" trước khi refactor toàn bộ.
 *
 * Đã wired vào API CÓ SẴN:
 *   - DashboardService.overview()      → thẻ dự án / task / %hoàn thành / trễ
 *   - DashboardService.projectStats()  → tiến độ công trình
 *   - DashboardService.userWorkload()  → suy ra rảnh / quá tải (TẠM THỜI)
 *
 * Chỗ đánh dấu (DEMO) = cần backend mới (staffing-summary, understaffed-tasks,
 * skill, workload_pct) theo docs/spec-poc-views.md. Hiện suy luận tạm từ số
 * task active để khách hình dung khung nhìn.
 */

type OverviewData = {
  total_projects?: number
  total_tasks?: number
  done_tasks?: number
  completion_rate_pct?: number
  overdue_tasks?: number
}

type ProjectStat = {
  project_id: string
  name: string
  status?: string
  completion_pct?: number
  total_tasks?: number
  done_tasks?: number
}

type WorkloadRow = {
  user_id: string
  user_name?: string
  active_tasks?: number
}

// Ngưỡng TẠM để phân loại (sẽ thay bằng workload_pct từ backend — spec mục 8).
const OVERLOAD_TASKS = 5

export const Route = createFileRoute("/_layout/overview-demo")({
  component: OverviewDemo,
})

function OverviewDemo() {
  const overview = useQuery({
    queryKey: ["demo", "overview"],
    queryFn: () => DashboardService.overview({}) as Promise<OverviewData>,
  })
  const projects = useQuery({
    queryKey: ["demo", "projectStats"],
    queryFn: () => DashboardService.projectStats({}) as Promise<ProjectStat[]>,
  })
  const workload = useQuery({
    queryKey: ["demo", "workload"],
    queryFn: () => DashboardService.userWorkload({}) as Promise<WorkloadRow[]>,
  })

  const o = overview.data ?? {}
  const rows = workload.data ?? []
  const overloaded = rows.filter((r) => (r.active_tasks ?? 0) >= OVERLOAD_TASKS)
  const free = rows.filter((r) => (r.active_tasks ?? 0) === 0)

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tổng quan</h1>
        <p className="text-sm text-slate-500">
          Theo dõi tiến độ, cảnh báo thiếu nhân sự và nhân viên rảnh
        </p>
      </div>

      {/* Thẻ chỉ số nhanh */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Dự án" value={o.total_projects ?? 0} tone="info" icon={FolderOpen} />
        <StatCard
          label="Hoàn thành"
          value={o.completion_rate_pct ?? 0}
          suffix="%"
          tone="success"
          icon={CheckCircle2}
        />
        <StatCard label="Đang rảnh" value={free.length} tone="warning" icon={UserCheck} />
        <StatCard label="Trễ tiến độ" value={o.overdue_tasks ?? 0} tone="danger" icon={Clock} />
      </div>

      {/* Banner cảnh báo → hành động (DEMO: nguồn thật = understaffed-tasks) */}
      {(free.length > 0 || overloaded.length > 0) && (
        <Card className="gap-0 border-amber-200 bg-amber-50 py-4">
          <div className="flex items-start gap-3 px-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {overloaded.length} nhân viên quá tải · {free.length} đang rảnh
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Cân nhắc điều phối lại nhân sự để cân bằng khối lượng.
              </p>
              <Link
                to="/"
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-amber-700"
              >
                Bố trí ngay <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Tiến độ công trình */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Tiến độ công trình</h2>
        {projects.isLoading ? (
          <p className="text-sm text-slate-400">Đang tải...</p>
        ) : (projects.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Chưa có công trình.</p>
        ) : (
          (projects.data ?? []).map((p) => (
            <Card key={p.project_id} className="gap-2 py-3">
              <div className="flex items-center justify-between px-4">
                <span className="truncate text-sm font-medium text-slate-800">{p.name}</span>
                <span className="text-sm font-semibold text-blue-700">
                  {Math.round(p.completion_pct ?? 0)}%
                </span>
              </div>
              <div className="px-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.min(100, Math.round(p.completion_pct ?? 0))}%` }}
                  />
                </div>
              </div>
            </Card>
          ))
        )}
      </section>

      {/* Khối lượng nhân sự (DEMO: nguồn thật = KPI tải trọng %) */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Users className="h-4 w-4" /> Khối lượng nhân sự
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">Chưa có dữ liệu phân công.</p>
        ) : (
          rows.slice(0, 8).map((r) => {
            const n = r.active_tasks ?? 0
            const tone =
              n === 0 ? "text-amber-600" : n >= OVERLOAD_TASKS ? "text-red-600" : "text-green-600"
            const label = n === 0 ? "Rảnh" : n >= OVERLOAD_TASKS ? "Quá tải" : "Ổn định"
            return (
              <Card key={r.user_id} className="gap-0 py-3">
                <div className="flex items-center justify-between px-4">
                  <span className="truncate text-sm font-medium text-slate-800">
                    {r.user_name ?? r.user_id}
                  </span>
                  <span className={`text-xs font-semibold ${tone}`}>
                    {label} · {n} việc
                  </span>
                </div>
              </Card>
            )
          })
        )}
      </section>

      <p className="pt-2 text-center text-[11px] text-slate-400">
        Màn mẫu — các phần đánh dấu DEMO cần backend mới (xem docs/spec-poc-views.md)
      </p>
    </div>
  )
}
