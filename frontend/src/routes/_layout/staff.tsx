import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CheckCircle2, Inbox, XCircle } from "lucide-react"
import { useState } from "react"

import { DetailProvider } from "@/components/demo/detail"
import { LiveStaff } from "@/components/demo/live"
import {
  approveSkillRequest,
  fetchPendingSkillRequests,
  rejectSkillRequest,
} from "@/modules/skills/skillApi"

export const Route = createFileRoute("/_layout/staff")({
  component: StaffPage,
  head: () => ({ meta: [{ title: "Nhân viên" }] }),
})

const LEVEL_LABEL: Record<number, string> = {
  1: "Cơ bản",
  2: "Trung bình",
  3: "Khá",
  4: "Giỏi",
  5: "Chuyên gia",
}

function SkillApprovalPanel() {
  const qc = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")

  const pending = useQuery({
    queryKey: ["skillRequests", "pending"],
    queryFn: fetchPendingSkillRequests,
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => approveSkillRequest(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["skillRequests", "pending"] }),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      rejectSkillRequest(id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skillRequests", "pending"] })
      setRejectTarget(null)
      setRejectNote("")
    },
  })

  const requests = pending.data ?? []
  if (pending.isLoading) return null
  if (requests.length === 0) return null

  return (
    <div
      id="skill-approval"
      className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-amber-700" />
        <h2 className="text-sm font-semibold text-amber-900">
          Yêu cầu duyệt kỹ năng
        </h2>
        <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
          {requests.length}
        </span>
      </div>

      <div className="space-y-3">
        {requests.map((req) => (
          <div
            key={req.id}
            className="rounded-xl border bg-white p-3 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {req.user_name ?? "Nhân viên"}
                </p>
                <p className="text-[11px] text-slate-400">
                  Gửi lúc {new Date(req.created_at).toLocaleDateString("vi-VN")}{" "}
                  · {req.requested_skills.length} kỹ năng
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => approveMut.mutate(req.id)}
                  disabled={approveMut.isPending}
                  className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt
                </button>
                <button
                  onClick={() => {
                    setRejectTarget(req.id)
                    setRejectNote("")
                  }}
                  className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Từ chối
                </button>
              </div>
            </div>

            {/* Danh sách kỹ năng đề xuất */}
            <div className="flex flex-wrap gap-1.5">
              {req.requested_skills.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
                >
                  {(s as any).skill_name ?? s.skill_id} ·{" "}
                  {LEVEL_LABEL[s.level] ?? `Cấp ${s.level}`}
                </span>
              ))}
            </div>

            {/* Form từ chối */}
            {rejectTarget === req.id && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Lý do từ chối (không bắt buộc)"
                  className="w-full rounded-lg border px-2.5 py-1.5 text-xs resize-none"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      rejectMut.mutate({ id: req.id, note: rejectNote })
                    }
                    disabled={rejectMut.isPending}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {rejectMut.isPending ? "Đang gửi..." : "Xác nhận từ chối"}
                  </button>
                  <button
                    onClick={() => setRejectTarget(null)}
                    className="rounded-lg border px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StaffPage() {
  return (
    <DetailProvider>
      <div className="mx-auto w-full max-w-lg px-2 pb-10 pt-4 md:max-w-6xl md:px-4">
        <SkillApprovalPanel />
        <LiveStaff />
      </div>
    </DetailProvider>
  )
}
