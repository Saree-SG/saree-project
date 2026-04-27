import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowLeft, ChevronRight, Loader2, Pencil, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getOrder,
  getRequest,
  addSupplierQuotes,
  updateSupplierQuote,
  selectSuppliers,
  markOrdered,
  receiveOrder,
} from "@/modules/procurement/procurementApi"
import { getContract } from "@/modules/contract/contractApi"
import { listLineItems } from "@/modules/quotation/quotationApi"
import {
  PO_STATUS_LABELS,
  PO_STATUS_ORDER,
  type POStatus,
  type PurchaseOrderItem,
  type SupplierQuote,
  type SupplierQuoteCreate,
} from "@/modules/procurement/procurementTypes"
import { listSuppliers } from "@/modules/supplier/supplierApi"
import type { SupplierPublic } from "@/modules/supplier/supplierTypes"
import { useMyPermissions } from "@/hooks/useMyPermissions"

function hasPermission(perms: string[], code: string) {
  return perms.includes(code)
}

export const Route = createFileRoute("/_layout/procurement/orders/$poId")({
  component: PODetailPage,
})

const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_supplier_selection: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  ordered: "bg-purple-100 text-purple-800",
  partially_received: "bg-orange-100 text-orange-800",
  received: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
}

function AddQuotesDialog({
  poId,
  item,
  lockedUnitPrice,
  onSuccess,
}: {
  poId: string
  item: PurchaseOrderItem
  lockedUnitPrice?: number
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [quotes, setQuotes] = useState<SupplierQuoteCreate[]>([
    { supplier_id: "", unit_price: lockedUnitPrice ?? 0 },
  ])
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "for-procurement-po"],
    queryFn: () => listSuppliers({ limit: 200 }),
  })
  const suppliers: SupplierPublic[] = suppliersQuery.data?.data ?? []

  const mutation = useMutation({
    mutationFn: () =>
      addSupplierQuotes(
        poId,
        item.id,
        quotes.filter((q) => q.supplier_id && q.unit_price > 0),
      ),
    onSuccess: () => {
      onSuccess()
      setOpen(false)
    },
  })

  const addRow = () =>
    setQuotes((prev) => [...prev, { supplier_id: "", unit_price: lockedUnitPrice ?? 0 }])
  const removeRow = (idx: number) =>
    setQuotes((prev) => prev.filter((_, i) => i !== idx))
  const update = (idx: number, field: keyof SupplierQuoteCreate, value: string | number) =>
    setQuotes((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)))

  const existingCount = item.supplier_quotes.length
  const maxNew = 3 - existingCount
  const isUnitPriceLocked = lockedUnitPrice != null && lockedUnitPrice > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={existingCount >= 3}>
          <Plus className="w-3 h-3 mr-1" /> Thêm báo giá ({existingCount}/3)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nhập báo giá: {item.item_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {existingCount > 0 && (
            <p className="text-sm text-muted-foreground">
              Đã có {existingCount} báo giá. Có thể thêm tối đa {maxNew} báo giá nữa.
            </p>
          )}
          <div className="space-y-4">
            {quotes.slice(0, maxNew).map((q, idx) => (
              <div key={idx} className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Báo giá #{idx + 1}</p>
                  {quotes.length > 1 && (
                    <button
                      title="Xóa dòng báo giá"
                      onClick={() => removeRow(idx)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Nhà cung cấp</Label>
                    <select
                      title="Chọn nhà cung cấp"
                      value={q.supplier_id ?? ""}
                      onChange={(e) => update(idx, "supplier_id", e.target.value)}
                      className="h-11 w-full rounded-md border bg-white px-3 text-sm outline-none"
                    >
                      <option value="">Chọn nhà cung cấp</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.supplier_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Đơn giá</Label>
                    <Input
                      type="number"
                      placeholder={isUnitPriceLocked ? "Theo hợp đồng" : "Nhập đơn giá"}
                      className="h-11 text-base"
                      value={isUnitPriceLocked ? lockedUnitPrice : (q.unit_price || "")}
                      disabled={isUnitPriceLocked}
                      onChange={(e) => update(idx, "unit_price", parseFloat(e.target.value) || 0)}
                    />
                    {isUnitPriceLocked && (
                      <p className="text-xs text-muted-foreground">
                        Đơn giá này lấy từ hợp đồng, không cho chỉnh sửa.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Thời gian giao hàng (ngày)</Label>
                    <Input
                      type="number"
                      placeholder="Số ngày dự kiến giao hàng"
                      className="h-11 text-base"
                      value={q.lead_time_days ?? ""}
                      onChange={(e) =>
                        update(idx, "lead_time_days", parseInt(e.target.value) || undefined as unknown as number)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Ghi chú</Label>
                    <Input
                      placeholder="Nhập ghi chú (nếu có)"
                      className="h-11 text-base"
                      value={q.notes ?? ""}
                      onChange={(e) => update(idx, "notes", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {quotes.length < maxNew && (
            <Button type="button" variant="ghost" size="sm" className="h-10" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" /> Thêm dòng
            </Button>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              disabled={mutation.isPending || !quotes.some((q) => q.supplier_id && q.unit_price > 0)}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Lưu báo giá
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EditQuoteDialog({
  poId,
  itemId,
  quote,
  lockedUnitPrice,
  onSuccess,
}: {
  poId: string
  itemId: string
  quote: SupplierQuote
  lockedUnitPrice?: number
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState(quote.supplier_id ?? "")
  const [unitPrice, setUnitPrice] = useState<number>(lockedUnitPrice ?? quote.unit_price)
  const [leadTimeDays, setLeadTimeDays] = useState<string>(quote.lead_time_days != null ? String(quote.lead_time_days) : "")
  const [notes, setNotes] = useState(quote.notes ?? "")
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "for-procurement-po"],
    queryFn: () => listSuppliers({ limit: 200 }),
  })
  const suppliers: SupplierPublic[] = suppliersQuery.data?.data ?? []
  const isUnitPriceLocked = lockedUnitPrice != null && lockedUnitPrice > 0

  const mutation = useMutation({
    mutationFn: () =>
      updateSupplierQuote(poId, itemId, quote.id, {
        supplier_id: supplierId || undefined,
        unit_price: isUnitPriceLocked ? lockedUnitPrice : unitPrice,
        lead_time_days: leadTimeDays ? parseInt(leadTimeDays, 10) : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      onSuccess()
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Sửa báo giá">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Sửa báo giá nhà cung cấp</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nhà cung cấp</Label>
            <select
              title="Chọn nhà cung cấp để cập nhật báo giá"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-11 w-full rounded-md border bg-white px-3 text-sm outline-none"
            >
              <option value="">Chọn nhà cung cấp</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.supplier_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Đơn giá</Label>
            <Input
              type="number"
              value={isUnitPriceLocked ? lockedUnitPrice : unitPrice}
              disabled={isUnitPriceLocked}
              onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
            />
            {isUnitPriceLocked && (
              <p className="text-xs text-muted-foreground">Đơn giá này lấy từ hợp đồng, không cho chỉnh sửa.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Thời gian giao hàng (ngày)</Label>
            <Input
              type="number"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              disabled={mutation.isPending || !supplierId || (!isUnitPriceLocked && unitPrice <= 0)}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Lưu thay đổi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SelectSuppliersDialog({
  poId,
  items,
  onSuccess,
}: {
  poId: string
  items: PurchaseOrderItem[]
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [selections, setSelections] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: () =>
      selectSuppliers(poId, {
        selections: Object.entries(selections).map(([po_item_id, quote_id]) => ({
          po_item_id,
          supplier_quote_id: quote_id,
        })),
      }),
    onSuccess: () => {
      onSuccess()
      setOpen(false)
    },
  })

  const allSelected = items.every(
    (item) =>
      item.supplier_quotes.length === 0 || selections[item.id]
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Chốt NCC cho PO</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chốt nhà cung cấp cho từng hạng mục</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {items.map((item) => (
            <div key={item.id}>
              <p className="font-medium text-sm mb-2">
                {item.item_name} — {item.quantity} {item.unit}
              </p>
              {item.supplier_quotes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Chưa có báo giá</p>
              ) : (
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 w-8"></th>
                        <th className="text-left p-2">Nhà cung cấp</th>
                        <th className="text-right p-2">Đơn giá</th>
                        <th className="text-right p-2">Thành tiền</th>
                        <th className="text-right p-2">TG giao hàng</th>
                        <th className="text-left p-2">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.supplier_quotes.map((q) => (
                        <tr
                          key={q.id}
                          className={`border-t cursor-pointer hover:bg-blue-50 ${selections[item.id] === q.id ? "bg-blue-50" : ""}`}
                          onClick={() =>
                            setSelections((prev) => ({ ...prev, [item.id]: q.id }))
                          }
                        >
                          <td className="p-2 text-center">
                            <input
                              type="radio"
                              title="Chọn báo giá nhà cung cấp"
                              readOnly
                              checked={selections[item.id] === q.id}
                            />
                          </td>
                          <td className="p-2 font-medium">{q.supplier_name}</td>
                          <td className="p-2 text-right">
                            {new Intl.NumberFormat("vi-VN").format(q.unit_price)}đ
                          </td>
                          <td className="p-2 text-right">
                            {new Intl.NumberFormat("vi-VN").format(q.unit_price * item.quantity)}đ
                          </td>
                          <td className="p-2 text-right text-muted-foreground">
                            {q.lead_time_days != null ? `${q.lead_time_days} ngày` : "—"}
                          </td>
                          <td className="p-2 text-muted-foreground">{q.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              disabled={mutation.isPending || !allSelected}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Xác nhận chốt NCC
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReceiveDialog({
  poId,
  items,
  onSuccess,
}: {
  poId: string
  items: PurchaseOrderItem[]
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.quantity - i.received_quantity]))
  )

  const mutation = useMutation({
    mutationFn: () =>
      receiveOrder(poId, {
        items: Object.entries(quantities)
          .filter(([, qty]) => qty > 0)
          .map(([po_item_id, received_quantity]) => ({ po_item_id, received_quantity })),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      onSuccess()
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Nhận hàng</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Xác nhận nhận hàng</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Vật tư</th>
                  <th className="text-right p-2">Đặt</th>
                  <th className="text-right p-2">Đã nhận</th>
                  <th className="text-right p-2">Nhận lần này</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-2">{item.item_name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right">{item.received_quantity}</td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity - item.received_quantity}
                        className="w-20 text-right"
                        value={quantities[item.id] ?? 0}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [item.id]: parseFloat(e.target.value) || 0,
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Xác nhận nhận hàng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PODetailPage() {
  const { poId } = Route.useParams()
  const qc = useQueryClient()
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []
  const permissionsReady = permissionsQuery.isSuccess

  const { data: po, isLoading } = useQuery({
    queryKey: ["procurement-order", poId],
    queryFn: () => getOrder(poId),
  })
  const requestQuery = useQuery({
    queryKey: ["procurement-request", po?.request_id],
    queryFn: () => getRequest(po!.request_id),
    enabled: Boolean(po?.request_id),
  })
  const contractQuery = useQuery({
    queryKey: ["contract", requestQuery.data?.contract_id],
    queryFn: () => getContract(requestQuery.data!.contract_id!),
    enabled: Boolean(requestQuery.data?.contract_id),
  })
  const contractItemsQuery = useQuery({
    queryKey: ["quotation-line-items", contractQuery.data?.quotation_id],
    queryFn: () => listLineItems(contractQuery.data!.quotation_id),
    enabled: Boolean(contractQuery.data?.quotation_id),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["procurement-order", poId] })
    qc.invalidateQueries({ queryKey: ["procurement-orders"] })
  }

  const markOrderedMut = useMutation({
    mutationFn: () => markOrdered(poId),
    onSuccess: invalidate,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!po) return null

  const currentIdx = PO_STATUS_ORDER.indexOf(po.status)

  const canAddQuotes = !permissionsReady || hasPermission(permissions, "PROCUREMENT_PO_CREATE")
  const canSelectSupplier = !permissionsReady || hasPermission(permissions, "PROCUREMENT_DIRECTOR_APPROVE")
  const canMarkOrdered = !permissionsReady || hasPermission(permissions, "PROCUREMENT_PO_CREATE")
  const canReceive = !permissionsReady || hasPermission(permissions, "PROCUREMENT_RECEIVE")

  const quotationLineItems = contractItemsQuery.data ?? []
  const contractPriceByKey = new Map<string, number>()
  for (const row of quotationLineItems) {
    if (row.sale_unit_price == null) {
      continue
    }
    const key = `${row.description.trim().toLowerCase()}|${(row.specifications ?? "").trim().toLowerCase()}|${row.unit.trim().toLowerCase()}`
    contractPriceByKey.set(key, row.sale_unit_price)
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/procurement" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Mua hàng
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-mono">{po.po_number}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{po.po_number}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PO_STATUS_COLORS[po.status]}`}
            >
              {PO_STATUS_LABELS[po.status]}
            </span>
            {po.total_amount != null && (
              <span className="text-sm font-medium text-green-700">
                Tổng:{" "}
                {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(po.total_amount)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {po.status === "pending_supplier_selection" && canSelectSupplier && (
            <SelectSuppliersDialog poId={poId} items={po.items} onSuccess={invalidate} />
          )}
          {po.status === "approved" && canMarkOrdered && (
            <Button
              size="sm"
              disabled={markOrderedMut.isPending}
              onClick={() => markOrderedMut.mutate()}
            >
              {markOrderedMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Xác nhận đã đặt hàng
            </Button>
          )}
          {(po.status === "ordered" || po.status === "partially_received") && canReceive && (
            <ReceiveDialog poId={poId} items={po.items} onSuccess={invalidate} />
          )}
        </div>
      </div>

      {/* Status stepper */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {PO_STATUS_ORDER.map((s, idx) => (
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
              {PO_STATUS_LABELS[s]}
            </div>
            {idx < PO_STATUS_ORDER.length - 1 && (
              <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Items with quote comparison */}
      <div>
        <h2 className="font-semibold mb-3">Hạng mục & Báo giá nhà cung cấp</h2>
        <div className="space-y-4">
          {po.items.map((item, idx) => (
            <div key={item.id} className="border rounded-lg overflow-hidden">
              <div className="bg-muted/30 px-4 py-2 flex items-center justify-between">
                <span className="font-medium text-sm">
                  {idx + 1}. {item.item_name}
                  {item.specifications && (
                    <span className="text-muted-foreground ml-2">({item.specifications})</span>
                  )}
                  {" "}— {item.quantity} {item.unit}
                </span>
                <div className="flex items-center gap-2">
                  {item.selected_supplier_id && item.total_price != null && (
                    <span className="text-xs text-green-700 font-medium">
                      Đã chọn:{" "}
                      {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(item.total_price)}
                    </span>
                  )}
                  {(po.status === "draft" || po.status === "pending_supplier_selection") && canAddQuotes && (
                    <AddQuotesDialog
                      poId={poId}
                      item={item}
                      lockedUnitPrice={contractPriceByKey.get(
                        `${item.item_name.trim().toLowerCase()}|${(item.specifications ?? "").trim().toLowerCase()}|${item.unit.trim().toLowerCase()}`
                      )}
                      onSuccess={invalidate}
                    />
                  )}
                </div>
              </div>
              {item.supplier_quotes.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-muted/10">
                    <tr>
                      <th className="text-left p-2 pl-4">Nhà cung cấp</th>
                      <th className="text-right p-2">Đơn giá</th>
                      <th className="text-right p-2">Thành tiền</th>
                      <th className="text-right p-2">TG giao hàng</th>
                      <th className="text-left p-2">Ghi chú</th>
                      {(po.status === "draft" || po.status === "pending_supplier_selection") && (
                        <th className="text-center p-2">Thao tác</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {item.supplier_quotes.map((q) => (
                      <tr
                        key={q.id}
                        className={`border-t ${q.is_selected ? "bg-green-50" : ""}`}
                      >
                        <td className="p-2 pl-4 font-medium">
                          {q.supplier_name}
                          {q.is_selected && (
                            <span className="ml-2 text-xs bg-green-200 text-green-800 rounded px-1">
                              ✓ Đã chọn
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {new Intl.NumberFormat("vi-VN").format(q.unit_price)}đ
                        </td>
                        <td className="p-2 text-right">
                          {new Intl.NumberFormat("vi-VN").format(q.unit_price * item.quantity)}đ
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          {q.lead_time_days != null ? `${q.lead_time_days} ngày` : "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">{q.notes ?? "—"}</td>
                        {(po.status === "draft" || po.status === "pending_supplier_selection") && (
                          <td className="p-2 text-center">
                            <EditQuoteDialog
                              poId={poId}
                              itemId={item.id}
                              quote={q}
                              lockedUnitPrice={contractPriceByKey.get(
                                `${item.item_name.trim().toLowerCase()}|${(item.specifications ?? "").trim().toLowerCase()}|${item.unit.trim().toLowerCase()}`
                              )}
                              onSuccess={invalidate}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-4 text-sm text-muted-foreground italic">Chưa có báo giá nào</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {po.notes && (
        <div className="border rounded-lg p-4 bg-muted/20">
          <p className="text-sm font-medium mb-1">Ghi chú</p>
          <p className="text-sm text-muted-foreground">{po.notes}</p>
        </div>
      )}
    </div>
  )
}
