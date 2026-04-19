import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo } from "react"

import { type TaskPublic, TasksService } from "@/client"

export const Route = createFileRoute("/_layout/tasks/")({
  component: MyTasksPage,
  head: () => ({
    meta: [{ title: "Công việc của tôi" }],
  }),
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MyTaskItem = {
  task: TaskPublic
  project_id: string
  project_name: string
  company_id: string
  company_name: string
}

type MyDashboardPayload = {
  overdue_critical?: MyTaskItem[]
  overdue_local?: MyTaskItem[]
  due_soon?: MyTaskItem[]
  today?: MyTaskItem[]
  ongoing?: MyTaskItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: string): string {
  switch (status) {
    case "todo": return "Chờ làm"
    case "in_progress": return "Đang làm"
    case "review": return "Chờ duyệt"
    case "done": return "Hoàn thành"
    case "overdue_local": return "Quá hạn"
    case "overdue_critical": return "Quá hạn nghiêm trọng"
    case "due_soon": return "Sắp đến hạn"
    default: return status
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "done": return "bg-green-100 text-green-700"
    case "in_progress": return "bg-blue-100 text-blue-700"
    case "review": return "bg-purple-100 text-purple-700"
    case "overdue_critical": return "bg-red-100 text-red-700"
    case "overdue_local": return "bg-orange-100 text-orange-700"
    case "due_soon": return "bg-amber-100 text-amber-700"
    default: return "bg-slate-100 text-slate-600"
  }
}

function deadlineText(endTime: string, effectiveStatus: string): { text: string; cls: string } {
  const end = new Date(endTime)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()
  const diffH = Math.floor(diffMs / 3_600_000)
  const diffD = Math.floor(diffMs / 86_400_000)

  if (effectiveStatus === "overdue_critical" || effectiveStatus === "overdue_local") {
    const overdueDays = Math.abs(diffD)
    return {
      text: overdueDays === 0 ? "Hết hạn hôm nay" : `Quá hạn ${overdueDays} ngày`,
      cls: "text-red-600 font-semibold",
    }
  }
  if (diffH < 24) {
    return {
      text: diffH <= 0 ? "Hết hạn hôm nay" : `Còn ${diffH} giờ`,
      cls: "text-amber-600 font-semibold",
    }
  }
  if (diffD <= 3) {
    return { text: `Còn ${diffD} ngày`, cls: "text-amber-500" }
  }
  return {
    text: end.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }),
    cls: "text-muted-foreground",
  }
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------

function TaskCard({ row }: { row: MyTaskItem }) {
  const task = row.task
  const effectiveStatus = task.computed_status ?? task.status
  const progress = task.reported_progress_total ?? 0
  const isSubtask = Boolean(task.parent_id)
  const dl = deadlineText(task.end_time, effectiveStatus)

  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className="block rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Top row: name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isSubtask && (
            <span className="mb-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              Công việc con
            </span>
          )}
          <p className="text-sm font-bold leading-snug text-slate-900">{task.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {row.company_name} · {row.project_name}
          </p>
        </div>
        <span className={[
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
          statusBadgeClass(effectiveStatus),
        ].join(" ")}>
          {statusLabel(effectiveStatus)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Tiến độ</span>
          <span className="font-semibold text-slate-700">{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={[
              "h-full rounded-full transition-all",
              progress >= 100 ? "bg-green-500"
                : progress >= 60 ? "bg-blue-500"
                : progress >= 30 ? "bg-amber-400"
                : "bg-slate-300",
            ].join(" ")}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>

      {/* Bottom row: deadline + assignor */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className={["text-[11px]", dl.cls].join(" ")}>
          🗓 {dl.text}
        </p>
        {task.assignor_name && (
          <p className="text-[10px] text-muted-foreground truncate">
            Giao bởi {task.assignor_name}
          </p>
        )}
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Priority section
// ---------------------------------------------------------------------------

type BandConfig = {
  key: keyof MyDashboardPayload
  label: string
  emoji: string
  headerCls: string
  borderCls: string
}

const BANDS: BandConfig[] = [
  {
    key: "overdue_critical",
    label: "Quá hạn nghiêm trọng",
    emoji: "🔴",
    headerCls: "text-red-700 bg-red-50 border-red-200",
    borderCls: "border-red-200",
  },
  {
    key: "overdue_local",
    label: "Đã quá hạn",
    emoji: "🟠",
    headerCls: "text-orange-700 bg-orange-50 border-orange-200",
    borderCls: "border-orange-200",
  },
  {
    key: "due_soon",
    label: "Sắp đến hạn (trong 24h)",
    emoji: "🟡",
    headerCls: "text-amber-700 bg-amber-50 border-amber-200",
    borderCls: "border-amber-200",
  },
  {
    key: "today",
    label: "Hôm nay",
    emoji: "📌",
    headerCls: "text-blue-700 bg-blue-50 border-blue-200",
    borderCls: "border-blue-200",
  },
  {
    key: "ongoing",
    label: "Đang thực hiện",
    emoji: "📋",
    headerCls: "text-slate-700 bg-slate-50 border-slate-200",
    borderCls: "border-slate-200",
  },
]

function BandSection({ band, items }: { band: BandConfig; items: MyTaskItem[] }) {
  if (items.length === 0) return null
  return (
    <section className={["rounded-xl border overflow-hidden", band.borderCls].join(" ")}>
      <div className={["flex items-center justify-between px-4 py-2.5 border-b", band.headerCls].join(" ")}>
        <h2 className="text-sm font-bold">
          {band.emoji} {band.label}
        </h2>
        <span className="text-xs font-semibold opacity-70">{items.length} việc</span>
      </div>
      <div className="space-y-2 bg-white p-3">
        {items.map((row) => (
          <TaskCard key={row.task.id} row={row} />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function MyTasksPage() {
  const dashboardQuery = useQuery({
    queryKey: ["my-tasks-dashboard"],
    queryFn: async () =>
      (await TasksService.myDashboard()) as MyDashboardPayload,
  })

  const data = dashboardQuery.data

  const totalAll = useMemo(
    () =>
      (data?.overdue_critical?.length ?? 0) +
      (data?.overdue_local?.length ?? 0) +
      (data?.due_soon?.length ?? 0) +
      (data?.today?.length ?? 0) +
      (data?.ongoing?.length ?? 0),
    [data],
  )

  const urgentCount = useMemo(
    () =>
      (data?.overdue_critical?.length ?? 0) +
      (data?.overdue_local?.length ?? 0) +
      (data?.due_soon?.length ?? 0),
    [data],
  )

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-2 pb-24 pt-3 sm:px-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Công việc của tôi</h1>
          <p className="text-xs text-muted-foreground">
            {totalAll > 0
              ? `${totalAll} công việc đang mở${urgentCount > 0 ? ` · ${urgentCount} cần xử lý gấp` : ""}`
              : "Chưa có công việc nào"}
          </p>
        </div>
      </div>

      {/* Loading */}
      {dashboardQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {/* Error */}
      {dashboardQuery.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Không tải được danh sách công việc. Vui lòng thử lại.
        </div>
      )}

      {/* Empty */}
      {!dashboardQuery.isLoading && !dashboardQuery.isError && totalAll === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-2xl">✅</p>
          <p className="mt-2 font-semibold text-slate-700">Bạn không có công việc nào đang mở</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Khi được giao việc, danh sách sẽ hiển thị tại đây.
          </p>
        </div>
      )}

      {/* Band sections */}
      {BANDS.map((band) => (
        <BandSection
          key={band.key}
          band={band}
          items={data?.[band.key] ?? []}
        />
      ))}
    </div>
  )
}
