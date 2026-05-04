import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

export const Route = createFileRoute("/_layout/material-requests/")({
  component: MaterialRequestsPage,
  head: () => ({
    meta: [{ title: "Yêu cầu vật tư" }],
  }),
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MaterialRequestPublic = {
  id: string
  item_name: string
  quantity: number
  unit: string
  reason: string
  status: string
  created_at: string
  materials_note?: string | null
  director_note?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  pending_materials: "Chờ vật tư duyệt",
  pending_director: "Chờ GĐ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
}

const STATUS_BADGE: Record<string, string> = {
  pending_materials: "bg-yellow-100 text-yellow-700",
  pending_director: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function listMaterialRequests(): Promise<MaterialRequestPublic[]> {
  const res = await axios.get<MaterialRequestPublic[]>(
    `${OpenAPI.BASE}/api/v1/material-requests`,
    { headers: authHeaders() },
  )
  return res.data
}

async function createMaterialRequest(body: {
  item_name: string
  quantity: number
  unit: string
  reason: string
}): Promise<MaterialRequestPublic> {
  const res = await axios.post<MaterialRequestPublic>(
    `${OpenAPI.BASE}/api/v1/material-requests`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

async function reviewMaterialRequest(
  id: string,
  body: { approved: boolean; note?: string },
): Promise<MaterialRequestPublic> {
  const res = await axios.post<MaterialRequestPublic>(
    `${OpenAPI.BASE}/api/v1/material-requests/${id}/review`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

async function decideMaterialRequest(
  id: string,
  body: { approved: boolean; note?: string },
): Promise<MaterialRequestPublic> {
  const res = await axios.post<MaterialRequestPublic>(
    `${OpenAPI.BASE}/api/v1/material-requests/${id}/decide`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function MaterialRequestsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [itemName, setItemName] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unit, setUnit] = useState("cái")
  const [reason, setReason] = useState("")
  const [reviewOpen, setReviewOpen] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState("")
  const [reviewAction, setReviewAction] = useState<"review" | "decide">("review")

  const listQuery = useQuery({
    queryKey: ["material-requests"],
    queryFn: listMaterialRequests,
  })

  const createMutation = useMutation({
    mutationFn: createMaterialRequest,
    onSuccess: () => {
      toast({ title: "Đã tạo yêu cầu vật tư" })
      setCreateOpen(false)
      setItemName(""); setQuantity("1"); setUnit("cái"); setReason("")
      void queryClient.invalidateQueries({ queryKey: ["material-requests"] })
    },
    onError: () => toast({ title: "Lỗi khi tạo yêu cầu", variant: "destructive" }),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, approved, note }: { id: string; approved: boolean; note?: string }) =>
      reviewAction === "review"
        ? reviewMaterialRequest(id, { approved, note })
        : decideMaterialRequest(id, { approved, note }),
    onSuccess: () => {
      toast({ title: "Đã cập nhật yêu cầu" })
      setReviewOpen(null); setReviewNote("")
      void queryClient.invalidateQueries({ queryKey: ["material-requests"] })
    },
    onError: () => toast({ title: "Lỗi khi duyệt yêu cầu", variant: "destructive" }),
  })

  const requests = listQuery.data ?? []

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-2 pb-24 pt-3 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">Yêu cầu vật tư</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Tạo yêu cầu</Button>
      </div>

      {listQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {requests.length === 0 && !listQuery.isLoading && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-2xl">📋</p>
          <p className="mt-2 font-semibold text-slate-700">Chưa có yêu cầu vật tư nào</p>
        </div>
      )}

      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.id} className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{req.item_name}</p>
                <p className="text-xs text-muted-foreground">
                  {req.quantity} {req.unit} · {req.reason}
                </p>
                {req.materials_note && (
                  <p className="text-xs text-blue-600 mt-1">Vật tư: {req.materials_note}</p>
                )}
                {req.director_note && (
                  <p className="text-xs text-orange-600 mt-0.5">GĐ: {req.director_note}</p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[req.status] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABELS[req.status] ?? req.status}
              </span>
            </div>
            {(req.status === "pending_materials" || req.status === "pending_director") && (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() => {
                    setReviewOpen(req.id)
                    setReviewAction(req.status === "pending_materials" ? "review" : "decide")
                    setReviewNote("")
                  }}
                >
                  ✓ Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => {
                    setReviewOpen(`reject:${req.id}`)
                    setReviewAction(req.status === "pending_materials" ? "review" : "decide")
                    setReviewNote("")
                  }}
                >
                  ✕ Từ chối
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Tạo yêu cầu vật tư</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Tên vật tư *</label>
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Ví dụ: Sơn tường, Ống thép..."
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium">Số lượng</label>
                <input
                  type="number" min={0.001} step={0.001}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium">Đơn vị</label>
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="cái, m, kg..."
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Lý do</label>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Huỷ</Button>
            <Button
              disabled={!itemName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({
                item_name: itemName.trim(),
                quantity: parseFloat(quantity) || 1,
                unit: unit.trim() || "cái",
                reason: reason.trim() || "—",
              })}
            >
              {createMutation.isPending ? "Đang tạo…" : "Tạo yêu cầu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review/decide dialog */}
      <Dialog
        open={!!reviewOpen}
        onOpenChange={(open) => { if (!open) { setReviewOpen(null); setReviewNote("") } }}
      >
        <DialogContent className="max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {reviewOpen?.startsWith("reject:") ? "Từ chối yêu cầu" : "Duyệt yêu cầu"}
            </DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-sm font-medium">Ghi chú (tuỳ chọn)</label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              rows={3}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewOpen(null); setReviewNote("") }}>
              Huỷ
            </Button>
            <Button
              disabled={reviewMutation.isPending}
              variant={reviewOpen?.startsWith("reject:") ? "destructive" : "default"}
              onClick={() => {
                const id = reviewOpen?.replace("reject:", "") ?? ""
                reviewMutation.mutate({
                  id,
                  approved: !reviewOpen?.startsWith("reject:"),
                  note: reviewNote.trim() || undefined,
                })
              }}
            >
              {reviewMutation.isPending ? "Đang xử lý…" : (reviewOpen?.startsWith("reject:") ? "Xác nhận từ chối" : "Xác nhận duyệt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
