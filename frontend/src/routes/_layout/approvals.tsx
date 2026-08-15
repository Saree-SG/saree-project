import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  CalendarOff,
  CheckCircle2,
  FileText,
  ScrollText,
  Star,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import { useCan } from "@/hooks/useMyPermissions"
import { cn } from "@/lib/utils"
import { listContracts } from "@/modules/contract/contractApi"
import { CONTRACT_STATUS_LABELS } from "@/modules/contract/contractTypes"
import {
  approveLeaveRequest,
  listPendingLeaveRequests,
  rejectLeaveRequest,
} from "@/modules/leave/leaveApi"
import { getMyPendingQuotations } from "@/modules/quotation/quotationApi"
import { STAGE_CONFIG } from "@/modules/quotation/stageConfig"
import {
  approveSkillRequest,
  fetchMySkillRequests,
  fetchPendingSkillRequests,
  rejectSkillRequest,
  type SkillRequest,
} from "@/modules/skills/skillApi"

export const Route = createFileRoute("/_layout/approvals")({
  component: ApprovalsPage,
  head: () => ({ meta: [{ title: "Phê duyệt" }] }),
})

const LEVEL_LABEL: Record<number, string> = {
  1: "Cơ bản",
  2: "Trung cấp",
  3: "Nâng cao",
  4: "Giỏi",
  5: "Chuyên gia",
}
const LEAVE_TYPE_VN: Record<string, string> = {
  annual: "Nghỉ phép năm",
  sick: "Nghỉ bệnh",
  unpaid: "Nghỉ không lương",
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  count,
  color,
}: {
  icon: React.ReactNode
  title: string
  count: number
  color: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-t-2xl px-4 py-3",
        color,
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-[13px] font-bold">{title}</h2>
      </div>
      <span className="rounded-full bg-white/60 px-2.5 py-0.5 text-[11px] font-bold">
        {count} mục
      </span>
    </div>
  )
}

function ApproveRejectButtons({
  onApprove,
  onReject,
  isPending,
}: {
  onApprove: () => void
  onReject: () => void
  isPending?: boolean
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onApprove}
        disabled={isPending}
        className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt
      </button>
      <button
        onClick={onReject}
        className="flex items-center gap-1 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
      >
        <XCircle className="h-3.5 w-3.5" /> Từ chối
      </button>
    </div>
  )
}

function RejectForm({
  onConfirm,
  onCancel,
  isPending,
}: {
  onConfirm: (note: string) => void
  onCancel: () => void
  isPending?: boolean
}) {
  const [note, setNote] = useState("")
  return (
    <div className="space-y-2 border-t border-slate-100 bg-red-50 px-4 py-3">
      <p className="text-xs font-semibold text-red-700">Lý do từ chối</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nhập lý do..."
        rows={2}
        className="w-full resize-none rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-300"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(note)}
          disabled={isPending}
          className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending ? "Đang gửi..." : "Xác nhận từ chối"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-xl border px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
        >
          Huỷ
        </button>
      </div>
    </div>
  )
}

function EmptyBox({ label }: { label: string }) {
  return (
    <div className="rounded-b-2xl border border-t-0 border-slate-100 bg-white p-6 text-center">
      <CheckCircle2 className="mx-auto h-7 w-7 text-slate-200" />
      <p className="mt-2 text-sm text-slate-400">{label}</p>
    </div>
  )
}

// ── Leave ─────────────────────────────────────────────────────────────────────
function LeaveApprovalSection() {
  const qc = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)

  const { data: leaveRes, isLoading } = useQuery({
    queryKey: ["leave-pending"],
    queryFn: listPendingLeaveRequests,
  })
  const requests = leaveRes?.data ?? []

  const approveMut = useMutation({
    mutationFn: (id: string) => approveLeaveRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-pending"] }),
  })
  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      rejectLeaveRequest(id, note),
    onSuccess: () => {
      setRejectTarget(null)
      qc.invalidateQueries({ queryKey: ["leave-pending"] })
    },
  })

  return (
    <section>
      <SectionHeader
        icon={<CalendarOff className="h-4 w-4 text-teal-700" />}
        title="Nghỉ phép chờ duyệt"
        count={requests.length}
        color="bg-teal-100 text-teal-800"
      />
      {isLoading && (
        <div className="h-20 animate-pulse rounded-b-2xl bg-slate-100" />
      )}
      {!isLoading && requests.length === 0 && (
        <EmptyBox label="Không có đơn nghỉ nào chờ duyệt" />
      )}
      {!isLoading && requests.length > 0 && (
        <div className="divide-y divide-slate-50 overflow-hidden rounded-b-2xl border border-t-0 border-slate-100 bg-white">
          {requests.map((req) => (
            <div key={req.id}>
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-slate-800">
                    {req.user_name ?? "Nhân viên"}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    {LEAVE_TYPE_VN[req.leave_type] ?? req.leave_type} ·{" "}
                    {new Date(req.start_date).toLocaleDateString("vi-VN")} →{" "}
                    {new Date(req.end_date).toLocaleDateString("vi-VN")} ·{" "}
                    <span className="font-semibold text-slate-700">
                      {req.num_days} ngày
                    </span>
                  </p>
                  {req.reason && (
                    <p className="mt-1 text-[11px] italic text-slate-400">
                      "{req.reason}"
                    </p>
                  )}
                  {(req as any).decision_note && (
                    <p className="mt-1 text-[11px] text-red-500">
                      Từ chối: {(req as any).decision_note}
                    </p>
                  )}
                </div>
                <ApproveRejectButtons
                  onApprove={() => approveMut.mutate(req.id)}
                  onReject={() => setRejectTarget(req.id)}
                  isPending={approveMut.isPending}
                />
              </div>
              {rejectTarget === req.id && (
                <RejectForm
                  onConfirm={(note) => rejectMut.mutate({ id: req.id, note })}
                  onCancel={() => setRejectTarget(null)}
                  isPending={rejectMut.isPending}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── My Skill Requests ─────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; bg: string; text: string }> =
  {
    pending: { label: "Chờ duyệt", bg: "bg-amber-100", text: "text-amber-700" },
    approved: { label: "Đã duyệt", bg: "bg-green-100", text: "text-green-700" },
    rejected: { label: "Từ chối", bg: "bg-red-100", text: "text-red-700" },
    cancelled: { label: "Đã huỷ", bg: "bg-slate-100", text: "text-slate-500" },
  }

function MySkillRequestsSection() {
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["skillRequests", "my"],
    queryFn: fetchMySkillRequests,
  })

  const pending = requests.filter((r) => r.status === "pending")

  return (
    <section>
      <SectionHeader
        icon={<Star className="h-4 w-4 text-violet-700" />}
        title="Yêu cầu kỹ năng của tôi"
        count={pending.length}
        color="bg-violet-100 text-violet-800"
      />
      {isLoading && (
        <div className="h-20 animate-pulse rounded-b-2xl bg-slate-100" />
      )}
      {!isLoading && requests.length === 0 && (
        <EmptyBox label="Bạn chưa gửi yêu cầu kỹ năng nào" />
      )}
      {!isLoading && requests.length > 0 && (
        <div className="divide-y divide-slate-50 overflow-hidden rounded-b-2xl border border-t-0 border-slate-100 bg-white">
          {requests.map((req: SkillRequest) => {
            const m = STATUS_META[req.status] ?? STATUS_META.pending
            return (
              <div key={req.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-400 mb-1">
                      Gửi {new Date(req.created_at).toLocaleDateString("vi-VN")}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {req.requested_skills.map((s, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-100"
                        >
                          {(s as any).skill_name ?? s.skill_id} ·{" "}
                          {LEVEL_LABEL[s.level] ?? `Cấp ${s.level}`}
                        </span>
                      ))}
                    </div>
                    {req.note && (
                      <p className="mt-1 text-[11px] italic text-slate-400">
                        "{req.note}"
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      m.bg,
                      m.text,
                    )}
                  >
                    {m.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Skills Approval Queue ─────────────────────────────────────────────────────
function SkillApprovalSection() {
  const qc = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["skillRequests", "pending"],
    queryFn: fetchPendingSkillRequests,
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => approveSkillRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skillRequests"] }),
  })
  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      rejectSkillRequest(id, note),
    onSuccess: () => {
      setRejectTarget(null)
      qc.invalidateQueries({ queryKey: ["skillRequests"] })
    },
  })

  return (
    <section>
      <SectionHeader
        icon={<Star className="h-4 w-4 text-violet-700" />}
        title="Kỹ năng chờ duyệt"
        count={requests.length}
        color="bg-violet-100 text-violet-800"
      />
      {isLoading && (
        <div className="h-20 animate-pulse rounded-b-2xl bg-slate-100" />
      )}
      {!isLoading && requests.length === 0 && (
        <EmptyBox label="Không có yêu cầu kỹ năng nào chờ duyệt" />
      )}
      {!isLoading && requests.length > 0 && (
        <div className="divide-y divide-slate-50 overflow-hidden rounded-b-2xl border border-t-0 border-slate-100 bg-white">
          {requests.map((req) => (
            <div key={req.id}>
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-slate-800">
                    {req.user_name ?? "Nhân viên"}
                  </p>
                  <p className="text-[11px] text-slate-400 mb-1">
                    Gửi {new Date(req.created_at).toLocaleDateString("vi-VN")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {req.requested_skills.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-100"
                      >
                        {(s as any).skill_name ?? s.skill_id} ·{" "}
                        {LEVEL_LABEL[s.level] ?? `Cấp ${s.level}`}
                      </span>
                    ))}
                  </div>
                  {req.note && (
                    <p className="mt-1 text-[11px] italic text-slate-400">
                      "{req.note}"
                    </p>
                  )}
                </div>
                <ApproveRejectButtons
                  onApprove={() => approveMut.mutate(req.id)}
                  onReject={() => setRejectTarget(req.id)}
                  isPending={approveMut.isPending}
                />
              </div>
              {rejectTarget === req.id && (
                <RejectForm
                  onConfirm={(note) => rejectMut.mutate({ id: req.id, note })}
                  onCancel={() => setRejectTarget(null)}
                  isPending={rejectMut.isPending}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Quotations ────────────────────────────────────────────────────────────────
function QuotationApprovalSection() {
  const { data: quotations = [], isLoading } = useQuery({
    queryKey: ["my-pending-quotations"],
    queryFn: getMyPendingQuotations,
  })

  return (
    <section>
      <SectionHeader
        icon={<FileText className="h-4 w-4 text-amber-700" />}
        title="Báo giá chờ xử lý"
        count={quotations.length}
        color="bg-amber-100 text-amber-800"
      />
      {isLoading && (
        <div className="h-20 animate-pulse rounded-b-2xl bg-slate-100" />
      )}
      {!isLoading && quotations.length === 0 && (
        <EmptyBox label="Không có báo giá nào chờ xử lý" />
      )}
      {!isLoading && quotations.length > 0 && (
        <div className="divide-y divide-slate-50 overflow-hidden rounded-b-2xl border border-t-0 border-slate-100 bg-white">
          {quotations.map((q) => {
            const stageCfg = STAGE_CONFIG[q.current_stage]
            return (
              <Link
                key={q.id}
                to="/quotations/$quotationId"
                params={{ quotationId: q.id }}
                search={{ tab: "history" }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-slate-800">
                    {q.project_name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {q.client_company_name} · #{q.quote_number}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    stageCfg.badgeBg,
                    stageCfg.badgeText,
                  )}
                >
                  {stageCfg.shortLabel}
                </span>
                <span className="text-slate-300">›</span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Contracts ─────────────────────────────────────────────────────────────────
function ContractApprovalSection() {
  const canApprove = useCan("CONTRACT_APPROVE")
  const { data, isLoading } = useQuery({
    queryKey: ["my-pending-contracts", "pending_approval"],
    queryFn: () => listContracts({ status: "pending_approval", limit: 100 }),
    enabled: canApprove,
  })
  const contracts = data?.data ?? []

  if (!canApprove) return null

  return (
    <section>
      <SectionHeader
        icon={<ScrollText className="h-4 w-4 text-indigo-700" />}
        title="Hợp đồng chờ phê duyệt"
        count={contracts.length}
        color="bg-indigo-100 text-indigo-800"
      />
      {isLoading && (
        <div className="h-20 animate-pulse rounded-b-2xl bg-slate-100" />
      )}
      {!isLoading && contracts.length === 0 && (
        <EmptyBox label="Không có hợp đồng nào chờ duyệt" />
      )}
      {!isLoading && contracts.length > 0 && (
        <div className="divide-y divide-slate-50 overflow-hidden rounded-b-2xl border border-t-0 border-slate-100 bg-white">
          {contracts.map((c) => (
            <Link
              key={c.id}
              to="/contracts/$contractId"
              params={{ contractId: c.id }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-slate-800">
                  {c.contract_number}
                </p>
                <p className="text-[11px] text-slate-400">
                  {new Intl.NumberFormat("vi-VN").format(c.total_value)}{" "}
                  {c.currency}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                {CONTRACT_STATUS_LABELS[c.status]}
              </span>
              <span className="text-slate-300">›</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
function ApprovalsPage() {
  const canLeaveApprove = useCan("LEAVE_APPROVE")
  const canSkillApprove = useCan("SKILL_APPROVE")

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white px-4 py-4 sm:px-6">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
          Phê duyệt
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Tất cả các mục đang chờ xử lý và phê duyệt
        </p>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-6">
        {canLeaveApprove && <LeaveApprovalSection />}
        <QuotationApprovalSection />
        <ContractApprovalSection />
        <MySkillRequestsSection />
        {canSkillApprove && <SkillApprovalSection />}

        {!canLeaveApprove && !canSkillApprove && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-slate-200" />
            <p className="mt-3 text-sm font-medium text-slate-500">
              Bạn không có quyền phê duyệt
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Liên hệ quản trị viên để được cấp quyền.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
