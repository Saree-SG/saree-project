import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { CheckCircle2, Clock, AlertTriangle, ChevronRight, Star, CalendarOff } from "lucide-react"

import { type TaskPublic, TasksService } from "@/client"
import { useMyPermissions, useCan } from "@/hooks/useMyPermissions"
import { hasPermission } from "@/utils/accountAccess"
import { cn } from "@/lib/utils"
import { listMyLeaveRequests } from "@/modules/leave/leaveApi"
import { fetchMySkillRequests } from "@/modules/skills/skillApi"
import { getMyPendingQuotations } from "@/modules/quotation/quotationApi"
import { STAGE_CONFIG } from "@/modules/quotation/stageConfig"
import { listContracts } from "@/modules/contract/contractApi"

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

const LEAVE_TYPE_VN: Record<string, string> = { annual: "Nghỉ phép năm", sick: "Nghỉ bệnh", unpaid: "Nghỉ không lương" }
const LEVEL_LABEL: Record<number, string> = { 1: "Cơ bản", 2: "Trung cấp", 3: "Nâng cao", 4: "Chuyên gia" }

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDeadline(endTime: string): string {
  const end = new Date(endTime)
  const now = new Date()
  const diffD = Math.floor((end.getTime() - now.getTime()) / 86_400_000)
  if (diffD < 0) return `Quá hạn ${Math.abs(diffD)} ngày`
  if (diffD === 0) return "Hôm nay"
  if (diffD === 1) return "Ngày mai"
  return end.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function getUrgencyMeta(task: TaskPublic): {
  label: string; bg: string; text: string; dot: string
} {
  const cs = task.computed_status ?? task.status
  if (cs === "overdue_critical") return { label: "Quá hạn nghiêm trọng", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" }
  if (cs === "overdue_local")    return { label: "Quá hạn", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" }
  if (cs === "due_soon")         return { label: "Sắp đến hạn", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" }
  const now = new Date()
  const end = new Date(task.end_time)
  if (end.toDateString() === now.toDateString()) return { label: "Hôm nay", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" }
  return { label: "Đang làm", bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" }
}

// ── TaskCard ──────────────────────────────────────────────────────────────────
function TaskCard({ row }: { row: MyTaskItem }) {
  const task = row.task
  const progress = task.reported_progress_total ?? 0
  const meta = getUrgencyMeta(task)
  const deadlineStr = formatDeadline(task.end_time)
  const isOverdue = (task.computed_status ?? task.status).startsWith("overdue")

  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className="group flex items-stretch gap-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
    >
      {/* colored left strip */}
      <div className={cn("w-1 shrink-0", meta.dot)} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3.5">
        {/* badge + project */}
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.bg, meta.text)}>
            {meta.label}
          </span>
          <span className="truncate text-[11px] text-slate-400">{row.project_name}</span>
        </div>
        {/* title */}
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-slate-800">{task.name}</p>
        {/* deadline + progress */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" />
            <span className={isOverdue ? "font-semibold text-red-500" : ""}>{deadlineStr}</span>
          </div>
          <div className="flex flex-1 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full transition-all",
                  progress >= 100 ? "bg-emerald-500" : progress >= 60 ? "bg-blue-500" : progress >= 30 ? "bg-amber-400" : "bg-slate-300"
                )}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-[11px] font-semibold text-slate-600">{progress}%</span>
          </div>
        </div>
      </div>
      <div className="flex items-center pr-3">
        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400" />
      </div>
    </Link>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function SectionBox({
  emoji, title, count, accentBg, accentText, accentBorder, children,
}: {
  emoji: string; title: string; count: number
  accentBg: string; accentText: string; accentBorder: string
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <section className={cn("overflow-hidden rounded-2xl border", accentBorder)}>
      <div className={cn("flex items-center justify-between px-4 py-2.5", accentBg)}>
        <h2 className={cn("text-[13px] font-bold", accentText)}>{emoji} {title}</h2>
        <span className={cn("text-[12px] font-semibold opacity-75", accentText)}>{count} việc</span>
      </div>
      <div className="space-y-2 bg-slate-50 p-2.5">{children}</div>
    </section>
  )
}

// ── Pending Approvals Box (real data) ────────────────────────────────────────
function PendingApprovalsBox() {
  const canContractApprove = useCan("CONTRACT_APPROVE")

  const leaveQ = useQuery({
    queryKey: ["leave-me", "pending"],
    queryFn: () => listMyLeaveRequests({ status: "pending" }),
  })
  const skillQ = useQuery({
    queryKey: ["skillRequests", "my"],
    queryFn: fetchMySkillRequests,
  })
  const quotationQ = useQuery({
    queryKey: ["my-pending-quotations"],
    queryFn: getMyPendingQuotations,
  })
  const contractQ = useQuery({
    queryKey: ["my-pending-contracts", "pending_approval"],
    queryFn: () => listContracts({ status: "pending_approval", limit: 20 }),
    enabled: canContractApprove,
  })

  const leaveItems = (leaveQ.data?.data ?? []).filter((r) => r.status === "pending")
  const skillItems = (skillQ.data ?? []).filter((r) => r.status === "pending")
  const quotations = quotationQ.data ?? []
  const contracts = contractQ.data?.data ?? []
  const total = leaveItems.length + skillItems.length + quotations.length + contracts.length

  if (leaveQ.isLoading || skillQ.isLoading) {
    return <div className="h-16 animate-pulse rounded-2xl bg-slate-200" />
  }
  if (total === 0) return null

  return (
    <Link to="/approvals" className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">⏳</span>
          <span className="text-[13px] font-bold text-slate-700">Chờ phê duyệt</span>
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{total}</span>
        </div>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-blue-600">
          Xem & duyệt <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="divide-y divide-slate-100 px-4">
        {leaveItems.slice(0, 2).map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-teal-50">
              <CalendarOff className="h-3.5 w-3.5 text-teal-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-slate-800">
                {LEAVE_TYPE_VN[r.leave_type] ?? r.leave_type}
              </p>
              <p className="text-[11px] text-slate-400">{new Date(r.start_date).toLocaleDateString("vi-VN")} · {r.num_days} ngày</p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Chờ duyệt</span>
          </div>
        ))}
        {skillItems.slice(0, 2).map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-violet-50">
              <Star className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-slate-800">
                {r.requested_skills.map((s: any) => s.skill_name ?? s.skill_id).join(", ")}
              </p>
              <p className="text-[11px] text-slate-400">{r.requested_skills.length} kỹ năng · {new Date(r.created_at).toLocaleDateString("vi-VN")}</p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Chờ duyệt</span>
          </div>
        ))}
        {quotations.slice(0, 2).map((q) => (
          <div key={q.id} className="flex items-center gap-3 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <span className="text-sm">📋</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-slate-800">{q.project_name}</p>
              <p className="text-[11px] text-slate-400">{q.client_company_name} · #{q.quote_number}</p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {STAGE_CONFIG[q.current_stage]?.shortLabel ?? "Chờ xử lý"}
            </span>
          </div>
        ))}
        {contracts.slice(0, 2).map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
              <span className="text-sm">📑</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-slate-800">{c.contract_number}</p>
            </div>
            <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Chờ ký</span>
          </div>
        ))}
        {total > 4 && (
          <p className="py-2.5 text-center text-[11px] text-slate-400">+{total - 4} mục khác</p>
        )}
      </div>
    </Link>
  )
}


// ── Main ──────────────────────────────────────────────────────────────────────
function MyTasksPage() {
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []
  const canContractApprove = hasPermission(permissions, "CONTRACT_APPROVE")

  const dashboardQuery = useQuery({
    queryKey: ["my-tasks-dashboard"],
    queryFn: async () => (await TasksService.myDashboard()) as MyDashboardPayload,
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
  const projects = data?.projects ?? []

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
    const urgent = filteredItems.filter((r) => {
      const cs = r.task.computed_status ?? r.task.status
      return cs === "overdue_critical" || cs === "overdue_local" || cs === "due_soon"
    })
    const today = filteredItems.filter((r) => {
      const cs = r.task.computed_status ?? r.task.status
      if (["overdue_critical", "overdue_local", "due_soon"].includes(cs)) return false
      const now = new Date()
      const end = new Date(r.task.end_time)
      return end.toDateString() === now.toDateString()
    })
    const ongoing = filteredItems.filter((r) => {
      const cs = r.task.computed_status ?? r.task.status
      if (["overdue_critical", "overdue_local", "due_soon"].includes(cs)) return false
      const now = new Date()
      const end = new Date(r.task.end_time)
      return end.toDateString() !== now.toDateString()
    })
    return { urgent, today, ongoing }
  }, [filteredItems])

  const totalAll = filteredItems.length
  const urgentCount = grouped.urgent.length
  const totalPending = 0 // calculated inside PendingApprovalsBox

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="border-b bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">Công việc của tôi</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {totalAll > 0
                ? `${totalAll} công việc${urgentCount > 0 ? ` · ` : ""}`
                : "Chưa có công việc nào"}
              {urgentCount > 0 && <span className="font-semibold text-red-600">{urgentCount} cần làm gấp</span>}
            </p>
          </div>

          {/* Stat chips */}
          <div className="flex flex-wrap gap-2">
            {urgentCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                <AlertTriangle className="h-3 w-3" /> {urgentCount} gấp
              </span>
            )}
            {grouped.today.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                <Clock className="h-3 w-3" /> {grouped.today.length} hôm nay
              </span>
            )}
            {totalPending > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                ⏳ {totalPending} chờ duyệt
              </span>
            )}
          </div>
        </div>

        {/* Project filter */}
        {projects.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
            <button
              onClick={() => setFilterProjectId("")}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition",
                filterProjectId === "" ? "border-blue-500 bg-blue-500 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              )}
            >
              Tất cả
            </button>
            {projects.map((p) => (
              <button
                key={p.project_id}
                onClick={() => setFilterProjectId(p.project_id)}
                className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  filterProjectId === p.project_id ? "border-blue-500 bg-blue-500 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                )}
              >
                {p.project_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-4 px-4 py-4 sm:px-6">

        {/* Chờ phê duyệt — real data */}
        <PendingApprovalsBox />

        {/* ── Loading / Error ── */}
        {dashboardQuery.isLoading && (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        )}
        {dashboardQuery.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Không tải được danh sách công việc. Vui lòng thử lại.
          </div>
        )}

        {/* ── Empty state ── */}
        {!dashboardQuery.isLoading && !dashboardQuery.isError && totalAll === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-3 text-base font-semibold text-slate-700">Không có công việc nào</p>
            <p className="mt-1 text-sm text-slate-400">Khi được giao việc, danh sách sẽ hiển thị tại đây.</p>
          </div>
        )}

        {/* ── Cần làm gấp ── */}
        <SectionBox emoji="🔴" title="Cần làm gấp" count={grouped.urgent.length}
          accentBg="bg-red-50" accentText="text-red-700" accentBorder="border-red-200">
          {grouped.urgent.map((r) => <TaskCard key={r.task.id} row={r} />)}
        </SectionBox>

        {/* ── Hôm nay ── */}
        <SectionBox emoji="📌" title="Hôm nay" count={grouped.today.length}
          accentBg="bg-blue-50" accentText="text-blue-700" accentBorder="border-blue-200">
          {grouped.today.map((r) => <TaskCard key={r.task.id} row={r} />)}
        </SectionBox>

        {/* ── Đang làm ── */}
        <SectionBox emoji="📋" title="Đang làm" count={grouped.ongoing.length}
          accentBg="bg-slate-100" accentText="text-slate-700" accentBorder="border-slate-200">
          {grouped.ongoing.map((r) => <TaskCard key={r.task.id} row={r} />)}
        </SectionBox>

        <div className="h-6" />
      </div>
    </div>
  )
}
