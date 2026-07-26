import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { CheckCircle2, Clock, Star, XCircle, Inbox } from "lucide-react"

import {
  fetchMySkillRequests,
  fetchPendingSkillRequests,
  approveSkillRequest,
  rejectSkillRequest,
  type SkillRequest,
} from "@/modules/skills/skillApi"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { hasPermission } from "@/utils/accountAccess"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_layout/skill-requests")({
  component: SkillRequestsPage,
  head: () => ({ meta: [{ title: "Yêu cầu kỹ năng" }] }),
})

const LEVEL_LABEL: Record<number, string> = { 1: "Cơ bản", 2: "Trung cấp", 3: "Nâng cao", 4: "Giỏi", 5: "Chuyên gia" }

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending:   { label: "Chờ duyệt", bg: "bg-amber-100",  text: "text-amber-700"  },
  approved:  { label: "Đã duyệt",  bg: "bg-green-100",  text: "text-green-700"  },
  rejected:  { label: "Từ chối",   bg: "bg-red-100",    text: "text-red-700"    },
  cancelled: { label: "Đã huỷ",   bg: "bg-slate-100",  text: "text-slate-500"  },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", m.bg, m.text)}>
      {m.label}
    </span>
  )
}

// ── Đơn của tôi ──────────────────────────────────────────────────────────────
function MyRequests() {
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["skillRequests", "my"],
    queryFn: fetchMySkillRequests,
  })

  if (isLoading) return <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <Star className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-500">Bạn chưa gửi yêu cầu kỹ năng nào</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {requests.map((req) => (
        <MyRequestCard key={req.id} req={req} />
      ))}
    </div>
  )
}

function MyRequestCard({ req }: { req: SkillRequest }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-violet-500" />
          <span className="text-[13px] font-semibold text-slate-700">
            {new Date(req.created_at).toLocaleDateString("vi-VN")} · {req.requested_skills.length} kỹ năng
          </span>
        </div>
        <StatusBadge status={req.status} />
      </div>
      <div className="space-y-1.5 px-4 py-3">
        {req.requested_skills.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
            <span className="text-slate-700">{(s as any).skill_name ?? s.skill_id}</span>
            <span className="text-[11px] text-slate-400">· {LEVEL_LABEL[s.level] ?? `Cấp ${s.level}`}</span>
          </div>
        ))}
        {req.note && (
          <p className="mt-2 text-[11px] text-slate-400 italic">Ghi chú: {req.note}</p>
        )}
      </div>
    </div>
  )
}

// ── Hàng đợi duyệt (chỉ hiện cho approver) ──────────────────────────────────
function ApprovalQueue() {
  const qc = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["skillRequests", "pending"],
    queryFn: fetchPendingSkillRequests,
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => approveSkillRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skillRequests"] })
    },
  })
  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => rejectSkillRequest(id, note),
    onSuccess: () => {
      setRejectTarget(null)
      setRejectNote("")
      qc.invalidateQueries({ queryKey: ["skillRequests"] })
    },
  })

  if (isLoading) return <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-500">Không có yêu cầu nào đang chờ duyệt</p>
      </div>
    )
  }

  return (
    <div id="approval-queue" className="space-y-3">
      {requests.map((req) => (
        <div key={req.id} className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm">
          <div className="flex items-center justify-between bg-amber-50 px-4 py-3">
            <div>
              <p className="text-[13px] font-bold text-slate-800">{req.user_name ?? "Nhân viên"}</p>
              <p className="text-[11px] text-slate-400">
                Gửi {new Date(req.created_at).toLocaleDateString("vi-VN")} · {req.requested_skills.length} kỹ năng
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => approveMut.mutate(req.id)}
                disabled={approveMut.isPending}
                className="flex items-center gap-1 rounded-xl bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt
              </button>
              <button
                onClick={() => setRejectTarget(req.id)}
                className="flex items-center gap-1 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                <XCircle className="h-3.5 w-3.5" /> Từ chối
              </button>
            </div>
          </div>

          <div className="space-y-1.5 px-4 py-3">
            {req.requested_skills.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-slate-700">{(s as any).skill_name ?? s.skill_id}</span>
                <span className="text-[11px] text-slate-400">· {LEVEL_LABEL[s.level] ?? `Cấp ${s.level}`}</span>
              </div>
            ))}
          </div>

          {rejectTarget === req.id && (
            <div className="border-t border-slate-100 bg-red-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-red-700">Lý do từ chối</p>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Nhập lý do..."
                className="w-full rounded-xl border px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => rejectMut.mutate({ id: req.id, note: rejectNote })}
                  disabled={rejectMut.isPending}
                  className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {rejectMut.isPending ? "Đang gửi..." : "Xác nhận từ chối"}
                </button>
                <button
                  onClick={() => setRejectTarget(null)}
                  className="rounded-xl border px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                >
                  Huỷ
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
function SkillRequestsPage() {
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []
  const canApprove = hasPermission(permissions, "SKILL_APPROVE") || hasPermission(permissions, "ADMIN")

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100">
            <Star className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Yêu cầu kỹ năng</h1>
            <p className="text-sm text-slate-500">Theo dõi và phê duyệt yêu cầu nâng cấp kỹ năng</p>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4 py-4 sm:px-6">
        {/* Approver section — chỉ hiện nếu có quyền */}
        {canApprove && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Inbox className="h-4 w-4 text-amber-600" />
              <h2 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Cần tôi duyệt</h2>
            </div>
            <ApprovalQueue />
          </section>
        )}

        {/* Đơn của tôi */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-violet-600" />
            <h2 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Đơn của tôi</h2>
          </div>
          <MyRequests />
        </section>
      </div>
    </div>
  )
}
