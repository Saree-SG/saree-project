import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import { type TaskPublic, TasksService } from "@/client"
import { listContracts } from "@/modules/contract/contractApi"
import { CONTRACT_STATUS_LABELS, type ContractPublic } from "@/modules/contract/contractTypes"
import { getMyPendingQuotations } from "@/modules/quotation/quotationApi"
import { STAGE_CONFIG } from "@/modules/quotation/stageConfig"
import type { QuotationPublic } from "@/modules/quotation/quotationTypes"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { hasPermission } from "@/utils/accountAccess"

export const Route = createFileRoute("/_layout/tasks/")({
  component: MyTasksPage,
  head: () => ({
    meta: [{ title: "Công việc của tôi" }],
  }),
})

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
  projects?: { project_id: string; project_name: string; company_id: string }[]
  companies?: { company_id: string; company_name: string }[]
}

type UrgencyBucket = "urgent" | "today" | "ongoing"

function bucketHeadline(bucket: UrgencyBucket, task: TaskPublic, effectiveStatus: string): { emoji: string; text: string } {
  const end = new Date(task.end_time)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()
  const diffH = Math.floor(diffMs / 3_600_000)
  const diffD = Math.floor(diffMs / 86_400_000)

  if (effectiveStatus === "overdue_critical" || effectiveStatus === "overdue_local") {
    const overdueDays = Math.abs(diffD)
    const emoji = effectiveStatus === "overdue_critical" ? "🔴" : "🟠"
    return {
      emoji,
      text: overdueDays === 0 ? "QUÁ HẠN HÔM NAY" : `QUÁ HẠN ${overdueDays} NGÀY`,
    }
  }
  if (bucket === "urgent") {
    if (diffH <= 0) return { emoji: "🟡", text: "HẾT HẠN HÔM NAY" }
    return { emoji: "🟡", text: `CÒN ${diffH} GIỜ` }
  }
  if (bucket === "today") {
    return { emoji: "📌", text: "HÔM NAY" }
  }
  if (diffD <= 3) return { emoji: "📋", text: `CÒN ${diffD} NGÀY` }
  return { emoji: "📋", text: "ĐANG LÀM" }
}

function bucketHeadlineClass(bucket: UrgencyBucket, effectiveStatus: string): string {
  if (effectiveStatus === "overdue_critical") return "text-red-700"
  if (effectiveStatus === "overdue_local") return "text-orange-700"
  if (bucket === "urgent") return "text-amber-700"
  if (bucket === "today") return "text-blue-700"
  return "text-slate-600"
}

function formatDeadline(endTime: string): string {
  const end = new Date(endTime)
  const now = new Date()
  const sameDay = end.toDateString() === now.toDateString()
  const time = end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  if (sameDay) return `hôm nay ${time}`
  return end.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function TaskCard({ row, bucket }: { row: MyTaskItem; bucket: UrgencyBucket }) {
  const task = row.task
  const effectiveStatus = task.computed_status ?? task.status
  const progress = task.reported_progress_total ?? 0
  const headline = bucketHeadline(bucket, task, effectiveStatus)
  const headlineCls = bucketHeadlineClass(bucket, effectiveStatus)

  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className="block rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <p className={["text-sm font-bold tracking-wide", headlineCls].join(" ")}>
        {headline.emoji} {headline.text}
      </p>

      <p className="mt-2 text-base font-bold leading-snug text-slate-900">
        {task.name}
      </p>

      <p className="mt-2 text-sm text-slate-600">
        Hạn: {formatDeadline(task.end_time)}
      </p>

      <div className="mt-2 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
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
        <span className="text-sm font-semibold text-slate-700 min-w-[36px] text-right">
          {progress}%
        </span>
      </div>
    </Link>
  )
}

type GroupConfig = {
  key: UrgencyBucket
  label: string
  emoji: string
  headerCls: string
  borderCls: string
}

const GROUPS: GroupConfig[] = [
  {
    key: "urgent",
    label: "Cần làm gấp",
    emoji: "🔴",
    headerCls: "text-red-700 bg-red-50 border-red-200",
    borderCls: "border-red-200",
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
    label: "Đang làm",
    emoji: "📋",
    headerCls: "text-slate-700 bg-slate-50 border-slate-200",
    borderCls: "border-slate-200",
  },
]

function GroupSection({
  group,
  items,
}: {
  group: GroupConfig
  items: MyTaskItem[]
}) {
  if (items.length === 0) return null
  return (
    <section className={["rounded-xl border overflow-hidden", group.borderCls].join(" ")}>
      <div className={["flex items-center justify-between px-4 py-3 border-b", group.headerCls].join(" ")}>
        <h2 className="text-base font-bold">
          {group.emoji} {group.label}
        </h2>
        <span className="text-sm font-semibold opacity-80">{items.length} việc</span>
      </div>
      <div className="space-y-2 bg-white p-3">
        {items.map((row) => (
          <TaskCard key={row.task.id} row={row} bucket={group.key} />
        ))}
      </div>
    </section>
  )
}

function PendingQuotationCard({ q }: { q: QuotationPublic }) {
  const stageCfg = STAGE_CONFIG[q.current_stage]
  return (
    <Link
      to="/quotations/$quotationId"
      params={{ quotationId: q.id }}
      search={{ tab: "history" }}
      className="block rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug text-slate-900">{q.project_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{q.client_company_name}</p>
        </div>
        <span className={[
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
          stageCfg.badgeBg,
          stageCfg.badgeText,
        ].join(" ")}>
          {stageCfg.shortLabel}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>#{q.quote_number}</span>
        {q.sales_owner_name && <span>KD: {q.sales_owner_name}</span>}
      </div>
    </Link>
  )
}

function PendingContractCard({ contract }: { contract: ContractPublic }) {
  return (
    <Link
      to="/contracts/$contractId"
      params={{ contractId: contract.id }}
      className="block rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug text-slate-900">{contract.contract_number}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Giá trị: {new Intl.NumberFormat("vi-VN").format(contract.total_value)} {contract.currency}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
          {CONTRACT_STATUS_LABELS[contract.status]}
        </span>
      </div>
    </Link>
  )
}

function MyTasksPage() {
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []
  const canContractApprove = hasPermission(permissions, "CONTRACT_APPROVE")

  const dashboardQuery = useQuery({
    queryKey: ["my-tasks-dashboard"],
    queryFn: async () =>
      (await TasksService.myDashboard()) as MyDashboardPayload,
  })

  const pendingQuotationsQuery = useQuery({
    queryKey: ["my-pending-quotations"],
    queryFn: getMyPendingQuotations,
  })
  const pendingContractsQuery = useQuery({
    queryKey: ["my-pending-contracts", "pending_approval"],
    queryFn: () => listContracts({ status: "pending_approval", limit: 100 }),
    enabled: canContractApprove,
  })

  const pendingQuotations = pendingQuotationsQuery.data ?? []
  const pendingContracts = pendingContractsQuery.data?.data ?? []

  const data = dashboardQuery.data
  const [filterProjectId, setFilterProjectId] = useState("")

  const allItems = useMemo<MyTaskItem[]>(() => [
    ...(data?.overdue_critical ?? []),
    ...(data?.overdue_local ?? []),
    ...(data?.due_soon ?? []),
    ...(data?.today ?? []),
    ...(data?.ongoing ?? []),
  ], [data])

  const filteredItems = useMemo(() =>
    filterProjectId ? allItems.filter((r) => r.project_id === filterProjectId) : allItems,
  [allItems, filterProjectId])

  const grouped = useMemo(() => {
    const urgent: MyTaskItem[] = filteredItems.filter((r) => {
      const cs = r.task.computed_status ?? r.task.status
      return cs === "overdue_critical" || cs === "overdue_local" || cs === "due_soon"
    })
    const today: MyTaskItem[] = filteredItems.filter((r) => {
      const cs = r.task.computed_status ?? r.task.status
      if (cs === "overdue_critical" || cs === "overdue_local" || cs === "due_soon") return false
      const now = new Date()
      const start = new Date(r.task.start_time)
      const end = new Date(r.task.end_time)
      return start.toDateString() === now.toDateString() || end.toDateString() === now.toDateString()
    })
    const ongoing: MyTaskItem[] = filteredItems.filter((r) => {
      const cs = r.task.computed_status ?? r.task.status
      if (cs === "overdue_critical" || cs === "overdue_local" || cs === "due_soon") return false
      const now = new Date()
      const start = new Date(r.task.start_time)
      const end = new Date(r.task.end_time)
      if (start.toDateString() === now.toDateString() || end.toDateString() === now.toDateString()) return false
      return true
    })
    return { urgent, today, ongoing }
  }, [filteredItems])

  const totalAll = filteredItems.length
  const urgentCount = grouped.urgent.length
  const projects = data?.projects ?? []

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-2 pb-24 pt-3 sm:px-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Công việc của tôi</h1>
          <p className="text-sm text-muted-foreground">
            {totalAll > 0
              ? `${totalAll} công việc${urgentCount > 0 ? ` · ${urgentCount} cần làm gấp` : ""}`
              : "Chưa có công việc nào"}
          </p>
        </div>
        {projects.length > 1 && (
          <select
            title="Lọc theo dự án"
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Tất cả dự án</option>
            {projects.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.project_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {pendingQuotations.length > 0 && (
        <section className="rounded-xl border border-amber-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-50 border-amber-200">
            <h2 className="text-base font-bold text-amber-700">
              📋 Báo giá cần xử lý
            </h2>
            <span className="text-sm font-semibold text-amber-700 opacity-80">
              {pendingQuotations.length} hồ sơ
            </span>
          </div>
          <div className="space-y-2 bg-white p-3">
            {pendingQuotations.map((q) => (
              <PendingQuotationCard key={q.id} q={q} />
            ))}
          </div>
        </section>
      )}
      {pendingContracts.length > 0 && (
        <section className="rounded-xl border border-indigo-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-indigo-50 border-indigo-200">
            <h2 className="text-base font-bold text-indigo-700">
              📑 Hợp đồng chờ phê duyệt
            </h2>
            <span className="text-sm font-semibold text-indigo-700 opacity-80">
              {pendingContracts.length} hợp đồng
            </span>
          </div>
          <div className="space-y-2 bg-white p-3">
            {pendingContracts.map((contract) => (
              <PendingContractCard key={contract.id} contract={contract} />
            ))}
          </div>
        </section>
      )}

      {dashboardQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {dashboardQuery.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Không tải được danh sách công việc. Vui lòng thử lại.
        </div>
      )}

      {!dashboardQuery.isLoading && !dashboardQuery.isError && totalAll === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 text-lg font-semibold text-slate-700">Bạn không có công việc nào</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Khi được giao việc, danh sách sẽ hiển thị tại đây.
          </p>
        </div>
      )}

      {GROUPS.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          items={grouped[group.key]}
        />
      ))}
    </div>
  )
}
