import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowLeft, Loader2, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  getRequest,
  submitRequest,
  addRequestItem,
  techReviewRequest,
  directorApproveRequest,
  listPOsForRequest,
  createPO,
} from "@/modules/procurement/procurementApi"
import {
  PR_STATUS_LABELS,
  PR_STATUS_ORDER,
  PO_STATUS_LABELS,
  type PRStatus,
  type POStatus,
} from "@/modules/procurement/procurementTypes"
import useCustomToast from "@/hooks/useCustomToast"
import { hasPermission } from "@/utils/accountAccess"
import { useMyPermissions } from "@/hooks/useMyPermissions"

export const Route = createFileRoute("/_layout/procurement/requests/$requestId")({
  component: RequestDetailPage,
})

const PR_STATUS_COLORS: Record<PRStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_tech: "bg-yellow-100 text-yellow-800",
  pending_director: "bg-orange-100 text-orange-800",
  approved: "bg-blue-100 text-blue-800",
  ordered: "bg-purple-100 text-purple-800",
  received: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
}

const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_supplier_selection: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  ordered: "bg-purple-100 text-purple-800",
  partially_received: "bg-orange-100 text-orange-800",
  received: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
}

function ReviewDialog({
  action,
  label,
  onConfirm,
  pending,
}: {
  action: "approve" | "reject"
  label: string
  onConfirm: (note: string) => void
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={action === "approve" ? "default" : "destructive"}
          size="sm"
        >
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ghi chú {action === "reject" ? "(bắt buộc)" : "(tuỳ chọn)"}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              variant={action === "approve" ? "default" : "destructive"}
              disabled={pending || (action === "reject" && !note)}
              onClick={() => {
                onConfirm(note)
                setOpen(false)
              }}
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Xác nhận
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RequestDetailPage() {
  const { requestId } = Route.useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [newItemName, setNewItemName] = useState("")
  const [newItemUnit, setNewItemUnit] = useState("")
  const [newItemQuantity, setNewItemQuantity] = useState("")
  const [newItemSpecs, setNewItemSpecs] = useState("")
  const [newItemUrgencyNote, setNewItemUrgencyNote] = useState("")
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []

  const { data: req, isLoading } = useQuery({
    queryKey: ["procurement-request", requestId],
    queryFn: () => getRequest(requestId),
  })

  const { data: posData } = useQuery({
    queryKey: ["procurement-pos-for-request", requestId],
    queryFn: () => listPOsForRequest(requestId),
    enabled: !!requestId,
  })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["procurement-request", requestId] })
    qc.invalidateQueries({ queryKey: ["procurement-requests"] })
    qc.invalidateQueries({ queryKey: ["procurement-pos-for-request", requestId] })
    qc.invalidateQueries({ queryKey: ["procurement-orders"] })
  }

  const submitMut = useMutation({
    mutationFn: () => submitRequest(requestId),
    onSuccess: () => {
      invalidate()
      showSuccessToast("Đã nộp yêu cầu lên Kỹ thuật")
    },
    onError: (errorValue: unknown) => {
      const detail =
        (errorValue as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (typeof detail === "string" && detail.includes("ít nhất 1 hạng mục")) {
        showErrorToast("Bạn cần nhập ít nhất 1 hạng mục vật tư trước khi nộp.")
        return
      }
      showErrorToast(detail || "Không thể nộp yêu cầu lúc này.")
    },
  })
  const techMut = useMutation({
    mutationFn: (body: { action: "approve" | "reject"; note?: string }) =>
      techReviewRequest(requestId, body),
    onSuccess: invalidate,
    onError: (errorValue: unknown) => {
      const detail =
        (errorValue as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showErrorToast(detail || "Bạn không có quyền duyệt kỹ thuật.")
    },
  })
  const directorMut = useMutation({
    mutationFn: (body: { action: "approve" | "reject"; note?: string }) =>
      directorApproveRequest(requestId, body),
    onSuccess: invalidate,
    onError: (errorValue: unknown) => {
      const detail =
        (errorValue as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showErrorToast(detail || "Bạn không có quyền duyệt BGĐ.")
    },
  })
  const createPoMut = useMutation({
    mutationFn: () =>
      createPO(requestId, {
        items: (req?.items ?? []).map((item) => ({
          request_item_id: item.id,
          item_name: item.item_name,
          specifications: item.specifications,
          unit: item.unit,
          quantity: Number(item.quantity || 0),
        })),
      }),
    onSuccess: (po) => {
      invalidate()
      navigate({ to: "/procurement/orders/$poId", params: { poId: po.id } })
    },
    onError: (errorValue: unknown) => {
      const detail =
        (errorValue as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showErrorToast(detail || "Không thể tạo đơn đặt hàng.")
    },
  })
  const addItemMut = useMutation({
    mutationFn: () =>
      addRequestItem(requestId, {
        item_name: newItemName.trim(),
        unit: newItemUnit.trim(),
        quantity: Number(newItemQuantity),
        specifications: newItemSpecs.trim() || undefined,
        urgency_note: newItemUrgencyNote.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate()
      showSuccessToast("Đã thêm hạng mục vật tư")
      setNewItemName("")
      setNewItemUnit("")
      setNewItemQuantity("")
      setNewItemSpecs("")
      setNewItemUrgencyNote("")
    },
    onError: (errorValue: unknown) => {
      const detail =
        (errorValue as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showErrorToast(detail || "Không thể thêm hạng mục vật tư.")
    },
  })
  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!req) return null

  const currentIdx = PR_STATUS_ORDER.indexOf(req.status)
  const permissionsReady = permissionsQuery.isSuccess
  const canSubmitRequest =
    !permissionsReady || hasPermission(permissions, "PROCUREMENT_REQUEST_CREATE")
  const canTechReview =
    !permissionsReady || hasPermission(permissions, "PROCUREMENT_TECH_REVIEW")
  const canDirectorApprove =
    !permissionsReady || hasPermission(permissions, "PROCUREMENT_DIRECTOR_APPROVE")
  const canCreatePo =
    !permissionsReady || hasPermission(permissions, "PROCUREMENT_PO_CREATE")

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/procurement" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Mua hàng
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-mono">{req.request_number}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{req.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PR_STATUS_COLORS[req.status]}`}
            >
              {PR_STATUS_LABELS[req.status]}
            </span>
            {req.urgency !== "normal" && (
              <Badge variant={req.urgency === "critical" ? "destructive" : "outline"}>
                {req.urgency === "critical" ? "Rất khẩn cấp" : "Khẩn cấp"}
              </Badge>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {req.status === "draft" && canSubmitRequest && (
            <Button
              size="sm"
              disabled={submitMut.isPending}
              onClick={() => submitMut.mutate()}
            >
              {submitMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Nộp lên KT
            </Button>
          )}
          {req.status === "pending_tech" && canTechReview && (
            <>
              <ReviewDialog
                action="approve"
                label="KT duyệt"
                onConfirm={(note) => techMut.mutate({ action: "approve", note: note || undefined })}
                pending={techMut.isPending}
              />
              <ReviewDialog
                action="reject"
                label="KT từ chối"
                onConfirm={(note) => techMut.mutate({ action: "reject", note })}
                pending={techMut.isPending}
              />
            </>
          )}
          {req.status === "pending_director" && canDirectorApprove && (
            <>
              <ReviewDialog
                action="approve"
                label="BGĐ duyệt"
                onConfirm={(note) => directorMut.mutate({ action: "approve", note: note || undefined })}
                pending={directorMut.isPending}
              />
              <ReviewDialog
                action="reject"
                label="BGĐ từ chối"
                onConfirm={(note) => directorMut.mutate({ action: "reject", note })}
                pending={directorMut.isPending}
              />
            </>
          )}
          {req.status === "approved" && (posData?.data ?? []).length === 0 && canCreatePo && (
            <Button
              size="sm"
              disabled={createPoMut.isPending}
              onClick={() => createPoMut.mutate()}
            >
              {createPoMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Tạo đơn đặt hàng
            </Button>
          )}
        </div>
      </div>

      {/* Status stepper */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {PR_STATUS_ORDER.map((s, idx) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                idx < currentIdx
                  ? "bg-green-100 text-green-800"
                  : idx === currentIdx
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {PR_STATUS_LABELS[s]}
            </div>
            {idx < PR_STATUS_ORDER.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Items table */}
      <div>
        <h2 className="font-semibold mb-3">Danh sách vật tư ({req.items.length} hạng mục)</h2>
        {req.status === "draft" && (
          <div className="mb-4 rounded-lg border bg-orange-50 p-3">
            <p className="mb-2 text-xs font-semibold text-orange-700">Thêm hạng mục vật tư</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={newItemName}
                onChange={(eventValue) => setNewItemName(eventValue.target.value)}
                placeholder="Tên vật tư"
                className="h-9 rounded-md border bg-white px-2 text-sm"
              />
              <input
                value={newItemUnit}
                onChange={(eventValue) => setNewItemUnit(eventValue.target.value)}
                placeholder="Đơn vị (VD: cái, mét)"
                className="h-9 rounded-md border bg-white px-2 text-sm"
              />
              <input
                inputMode="decimal"
                value={newItemQuantity}
                onChange={(eventValue) => setNewItemQuantity(eventValue.target.value)}
                placeholder="Số lượng"
                className="h-9 rounded-md border bg-white px-2 text-sm"
              />
              <input
                value={newItemSpecs}
                onChange={(eventValue) => setNewItemSpecs(eventValue.target.value)}
                placeholder="Quy cách"
                className="h-9 rounded-md border bg-white px-2 text-sm"
              />
              <input
                value={newItemUrgencyNote}
                onChange={(eventValue) => setNewItemUrgencyNote(eventValue.target.value)}
                placeholder="Ghi chú khẩn cấp (tuỳ chọn)"
                className="h-9 rounded-md border bg-white px-2 text-sm sm:col-span-2"
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                disabled={
                  addItemMut.isPending ||
                  !newItemName.trim() ||
                  !newItemUnit.trim() ||
                  !Number.isFinite(Number(newItemQuantity)) ||
                  Number(newItemQuantity) <= 0
                }
                onClick={() => addItemMut.mutate()}
              >
                {addItemMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Thêm vật tư
              </Button>
            </div>
          </div>
        )}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">#</th>
                <th className="text-left p-3 font-medium">Tên vật tư</th>
                <th className="text-left p-3 font-medium">Thông số</th>
                <th className="text-left p-3 font-medium">ĐVT</th>
                <th className="text-right p-3 font-medium">SL yêu cầu</th>
                <th className="text-right p-3 font-medium">SL đã đặt</th>
                <th className="text-right p-3 font-medium">SL nhận</th>
                <th className="text-left p-3 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {req.items.map((item, idx) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3 text-muted-foreground">{idx + 1}</td>
                  <td className="p-3 font-medium">{item.item_name}</td>
                  <td className="p-3 text-muted-foreground">{item.specifications ?? "—"}</td>
                  <td className="p-3">{item.unit}</td>
                  <td className="p-3 text-right">{item.quantity}</td>
                  <td className="p-3 text-right">{item.ordered_quantity}</td>
                  <td className="p-3 text-right">{item.received_quantity}</td>
                  <td className="p-3 text-muted-foreground">{item.urgency_note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      {req.notes && (
        <div className="border rounded-lg p-4 bg-muted/20">
          <p className="text-sm font-medium mb-1">Ghi chú</p>
          <p className="text-sm text-muted-foreground">{req.notes}</p>
        </div>
      )}

      {/* Review notes */}
      {(req.tech_note || req.director_note) && (
        <div className="space-y-2">
          {req.tech_note && (
            <div className="border rounded-lg p-4 bg-yellow-50">
              <p className="text-xs font-medium text-yellow-800 mb-1">Ý kiến kỹ thuật</p>
              <p className="text-sm">{req.tech_note}</p>
            </div>
          )}
          {req.director_note && (
            <div className="border rounded-lg p-4 bg-blue-50">
              <p className="text-xs font-medium text-blue-800 mb-1">Ý kiến BGĐ</p>
              <p className="text-sm">{req.director_note}</p>
            </div>
          )}
        </div>
      )}

      {/* Purchase Orders */}
      {(posData?.data ?? []).length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Đơn đặt hàng liên quan</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Số PO</th>
                  <th className="text-left p-3 font-medium">Trạng thái</th>
                  <th className="text-left p-3 font-medium">Tổng tiền</th>
                  <th className="text-left p-3 font-medium">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {posData!.data.map((po) => (
                  <tr key={po.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono">
                      <Link
                        to="/procurement/orders/$poId"
                        params={{ poId: po.id }}
                        className="text-blue-600 hover:underline"
                      >
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PO_STATUS_COLORS[po.status]}`}
                      >
                        {PO_STATUS_LABELS[po.status]}
                      </span>
                    </td>
                    <td className="p-3">
                      {po.total_amount != null
                        ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(po.total_amount)
                        : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(po.created_at).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
