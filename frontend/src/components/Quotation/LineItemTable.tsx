import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2, X, Check } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import useCustomToast from "@/hooks/useCustomToast"
import {
  addLineItem,
  deleteLineItem,
  updateLineItem,
  updateLineItemPrice,
  updateItemSalePrice,
} from "@/modules/quotation/quotationApi"
import type {
  QuotationLineItemCreate,
  QuotationLineItemPublic,
  QuotationStage,
} from "@/modules/quotation/quotationTypes"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatVnd(value: number | null | undefined): string {
  if (value == null) return "—"
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

function getErrorDetail(error: unknown): string {
  const e = error as { response?: { data?: { detail?: string } } }
  return e.response?.data?.detail ?? "Vui lòng thử lại."
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function canEditStructure(stage: QuotationStage, permissions: string[]): boolean {
  return stage === "S3_TECH_DESIGN" && permissions.includes("QUOTATION_DESIGN")
}

function canFillCostPrice(stage: QuotationStage, permissions: string[]): boolean {
  return stage === "S5_PROCUREMENT_PRICING" && permissions.includes("QUOTATION_FILL_PRICE")
}

function canFillSalePrice(stage: QuotationStage, permissions: string[]): boolean {
  return stage === "S6_SALES_FINALIZE" && permissions.includes("QUOTATION_FINALIZE")
}

// ---------------------------------------------------------------------------
// New-item blank row
// ---------------------------------------------------------------------------

const BLANK_NEW: QuotationLineItemCreate = {
  description: "",
  unit: "",
  quantity: 1,
  category: "",
  item_code: "",
  specifications: "",
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LineItemTableProps {
  quotationId: string
  stage: QuotationStage
  permissions: string[]
  items: QuotationLineItemPublic[]
  loading: boolean
  error: boolean
}

export function LineItemTable({
  quotationId,
  stage,
  permissions,
  items,
  loading,
  error,
}: LineItemTableProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const editStructure = canEditStructure(stage, permissions)
  const editCost = canFillCostPrice(stage, permissions)
  const editSale = canFillSalePrice(stage, permissions)

  // --- Add row state ---
  const [addOpen, setAddOpen] = useState(false)
  const [newItem, setNewItem] = useState<QuotationLineItemCreate>({ ...BLANK_NEW })

  // --- Edit structure state (S3) ---
  const [editId, setEditId] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<{
    description: string
    unit: string
    quantity: string
    category: string
    item_code: string
    specifications: string
  } | null>(null)

  // --- Edit cost price state (S5) ---
  const [costEditId, setCostEditId] = useState<string | null>(null)
  const [costPrice, setCostPrice] = useState("")
  const [costSupplier, setCostSupplier] = useState("")
  const [costNote, setCostNote] = useState("")

  // --- Edit sale price state (S6) ---
  const [saleEditId, setSaleEditId] = useState<string | null>(null)
  const [salePrice, setSalePrice] = useState("")

  // ---- Mutations ----

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["quotation", quotationId, "items"] })
    await queryClient.invalidateQueries({ queryKey: ["quotation", quotationId] })
  }

  const addMutation = useMutation({
    mutationFn: () =>
      addLineItem(quotationId, {
        description: newItem.description.trim(),
        unit: newItem.unit.trim(),
        quantity: Number(newItem.quantity),
        category: newItem.category?.trim() || undefined,
        item_code: newItem.item_code?.trim() || undefined,
        specifications: newItem.specifications?.trim() || undefined,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã thêm hạng mục.")
      setAddOpen(false)
      setNewItem({ ...BLANK_NEW })
      await invalidate()
    },
    onError: (e) => showErrorToast(getErrorDetail(e)),
  })

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      updateLineItem(quotationId, id, {
        description: editRow!.description.trim(),
        unit: editRow!.unit.trim(),
        quantity: Number(editRow!.quantity),
        category: editRow!.category.trim() || undefined,
        item_code: editRow!.item_code.trim() || undefined,
        specifications: editRow!.specifications.trim() || undefined,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật.")
      setEditId(null)
      setEditRow(null)
      await invalidate()
    },
    onError: (e) => showErrorToast(getErrorDetail(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLineItem(quotationId, id),
    onSuccess: async () => {
      showSuccessToast("Đã xóa hạng mục.")
      await invalidate()
    },
    onError: (e) => showErrorToast(getErrorDetail(e)),
  })

  const costMutation = useMutation({
    mutationFn: (id: string) =>
      updateLineItemPrice(quotationId, id, {
        cost_unit_price: costPrice ? Number(costPrice) : undefined,
        supplier_name: costSupplier.trim() || undefined,
        procurement_note: costNote.trim() || undefined,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật giá mua.")
      setCostEditId(null)
      setCostPrice("")
      setCostSupplier("")
      setCostNote("")
      await invalidate()
    },
    onError: (e) => showErrorToast(getErrorDetail(e)),
  })

  const saleMutation = useMutation({
    mutationFn: (id: string) =>
      updateItemSalePrice(quotationId, id, { sale_unit_price: Number(salePrice) }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật giá bán.")
      setSaleEditId(null)
      setSalePrice("")
      await invalidate()
    },
    onError: (e) => showErrorToast(getErrorDetail(e)),
  })

  // ---- Summary totals ----
  const totalCost = items.reduce((s, r) => s + (r.cost_total ?? 0), 0)
  const totalSale = items.reduce((s, r) => s + (r.sale_total ?? 0), 0)

  // ---- Render helpers ----

  function startEdit(item: QuotationLineItemPublic) {
    setEditId(item.id)
    setEditRow({
      description: item.description,
      unit: item.unit,
      quantity: String(item.quantity),
      category: item.category ?? "",
      item_code: item.item_code ?? "",
      specifications: item.specifications ?? "",
    })
  }

  function startCostEdit(item: QuotationLineItemPublic) {
    setCostEditId(item.id)
    setCostPrice(item.cost_unit_price != null ? String(item.cost_unit_price) : "")
    setCostSupplier(item.supplier_name ?? "")
    setCostNote(item.procurement_note ?? "")
  }

  function startSaleEdit(item: QuotationLineItemPublic) {
    setSaleEditId(item.id)
    setSalePrice(item.sale_unit_price != null ? String(item.sale_unit_price) : "")
  }

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Đang tải hạng mục...</p>
  }
  if (error) {
    return <p className="p-4 text-sm text-destructive">Không thể tải hạng mục.</p>
  }

  // Decide which columns to show
  const showCostCols = editCost || items.some((i) => i.cost_unit_price != null)
  const showSaleCols = editSale || items.some((i) => i.sale_unit_price != null)
  const showSpecsCols = editStructure || items.some((i) => i.specifications)

  return (
    <div className="space-y-3">
      {/* Add new row button — S3 tech only */}
      {editStructure && !addOpen && (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Thêm hạng mục
        </Button>
      )}

      {/* Add new row form */}
      {editStructure && addOpen && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hạng mục mới
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input
              placeholder="Mã hạng mục"
              value={newItem.item_code ?? ""}
              onChange={(e) => setNewItem((p) => ({ ...p, item_code: e.target.value }))}
            />
            <Input
              placeholder="Nhóm / Category"
              value={newItem.category ?? ""}
              onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))}
              className="sm:col-span-1"
            />
            <Input
              placeholder="Mô tả hạng mục *"
              value={newItem.description}
              onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
              className="col-span-2"
            />
          </div>
          <Input
            placeholder="Thông số kỹ thuật"
            value={newItem.specifications ?? ""}
            onChange={(e) => setNewItem((p) => ({ ...p, specifications: e.target.value }))}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Đơn vị (cái, bộ, m…) *"
              value={newItem.unit}
              onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
              className="flex-1"
            />
            <Input
              placeholder="Số lượng *"
              inputMode="decimal"
              value={String(newItem.quantity)}
              onChange={(e) => setNewItem((p) => ({ ...p, quantity: Number(e.target.value) || 0 }))}
              className="w-28"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={addMutation.isPending || !newItem.description.trim() || !newItem.unit.trim()}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending ? "Đang thêm..." : "Thêm"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddOpen(false)
                setNewItem({ ...BLANK_NEW })
              }}
            >
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {items.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Chưa có hạng mục nào.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium w-8">#</th>
                <th className="px-3 py-2 text-left font-medium min-w-[80px]">Mã</th>
                <th className="px-3 py-2 text-left font-medium min-w-[90px]">Nhóm</th>
                <th className="px-3 py-2 text-left font-medium min-w-[180px]">Mô tả</th>
                {showSpecsCols && (
                  <th className="px-3 py-2 text-left font-medium min-w-[160px]">Thông số KT</th>
                )}
                <th className="px-3 py-2 text-left font-medium w-16">ĐVT</th>
                <th className="px-3 py-2 text-right font-medium w-20">SL</th>
                {showCostCols && (
                  <>
                    <th className="px-3 py-2 text-right font-medium min-w-[120px]">Đ.giá mua</th>
                    <th className="px-3 py-2 text-right font-medium min-w-[120px]">T.mua</th>
                    <th className="px-3 py-2 text-left font-medium min-w-[110px]">NCC</th>
                    <th className="px-3 py-2 text-left font-medium min-w-[110px]">Ghi chú VT</th>
                  </>
                )}
                {showSaleCols && (
                  <>
                    <th className="px-3 py-2 text-right font-medium min-w-[120px]">Đ.giá bán</th>
                    <th className="px-3 py-2 text-right font-medium min-w-[120px]">T.bán</th>
                  </>
                )}
                {(editStructure || editCost || editSale) && (
                  <th className="px-3 py-2 w-20" />
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, idx) => {
                const isEditingStructure = editId === item.id
                const isEditingCost = costEditId === item.id
                const isEditingSale = saleEditId === item.id

                return (
                  <tr key={item.id} className="group hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>

                    {/* --- Structure edit mode (S3) --- */}
                    {isEditingStructure && editRow ? (
                      <>
                        <td className="px-3 py-1.5">
                          <Input
                            value={editRow.item_code}
                            onChange={(e) => setEditRow((p) => p && { ...p, item_code: e.target.value })}
                            className="h-7 text-xs"
                            placeholder="Mã"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            value={editRow.category}
                            onChange={(e) => setEditRow((p) => p && { ...p, category: e.target.value })}
                            className="h-7 text-xs"
                            placeholder="Nhóm"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            value={editRow.description}
                            onChange={(e) => setEditRow((p) => p && { ...p, description: e.target.value })}
                            className="h-7 text-xs"
                            placeholder="Mô tả *"
                          />
                        </td>
                        {showSpecsCols && (
                          <td className="px-3 py-1.5">
                            <Input
                              value={editRow.specifications}
                              onChange={(e) => setEditRow((p) => p && { ...p, specifications: e.target.value })}
                              className="h-7 text-xs"
                              placeholder="Thông số KT"
                            />
                          </td>
                        )}
                        <td className="px-3 py-1.5">
                          <Input
                            value={editRow.unit}
                            onChange={(e) => setEditRow((p) => p && { ...p, unit: e.target.value })}
                            className="h-7 w-16 text-xs"
                            placeholder="ĐVT *"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            inputMode="decimal"
                            value={editRow.quantity}
                            onChange={(e) => setEditRow((p) => p && { ...p, quantity: e.target.value })}
                            className="h-7 w-20 text-xs text-right"
                            placeholder="SL *"
                          />
                        </td>
                        {showCostCols && (
                          <>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-muted-foreground">—</td>
                          </>
                        )}
                        {showSaleCols && (
                          <>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                          </>
                        )}
                        <td className="px-3 py-1.5">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              title="Lưu"
                              className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
                              disabled={updateMutation.isPending || !editRow.description.trim() || !editRow.unit.trim()}
                              onClick={() => updateMutation.mutate(item.id)}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Huỷ"
                              className="rounded p-1 text-muted-foreground hover:bg-muted/50"
                              onClick={() => { setEditId(null); setEditRow(null) }}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : isEditingCost ? (
                      /* --- Cost price edit mode (S5) --- */
                      <>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.item_code || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.category || "—"}</td>
                        <td className="px-3 py-2 font-medium">{item.description}</td>
                        {showSpecsCols && (
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.specifications || "—"}</td>
                        )}
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-1.5" colSpan={2}>
                          <Input
                            inputMode="decimal"
                            placeholder="Đơn giá mua (VND)"
                            value={costPrice}
                            onChange={(e) => setCostPrice(e.target.value)}
                            className="h-7 text-xs text-right"
                          />
                          {costPrice ? (
                            <p className="mt-0.5 text-right text-xs text-muted-foreground">
                              Tổng: {formatVnd((Number(costPrice) || 0) * item.quantity)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            placeholder="Nhà cung cấp"
                            value={costSupplier}
                            onChange={(e) => setCostSupplier(e.target.value)}
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            placeholder="Ghi chú"
                            value={costNote}
                            onChange={(e) => setCostNote(e.target.value)}
                            className="h-7 text-xs"
                          />
                        </td>
                        {showSaleCols && (
                          <>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                          </>
                        )}
                        <td className="px-3 py-1.5">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              title="Lưu"
                              className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
                              disabled={costMutation.isPending}
                              onClick={() => costMutation.mutate(item.id)}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Huỷ"
                              className="rounded p-1 text-muted-foreground hover:bg-muted/50"
                              onClick={() => { setCostEditId(null); setCostPrice(""); setCostSupplier(""); setCostNote("") }}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : isEditingSale ? (
                      /* --- Sale price edit mode (S6) --- */
                      <>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.item_code || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.category || "—"}</td>
                        <td className="px-3 py-2 font-medium">{item.description}</td>
                        {showSpecsCols && (
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.specifications || "—"}</td>
                        )}
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                        {showCostCols && (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {formatVnd(item.cost_unit_price)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {formatVnd(item.cost_total)}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.supplier_name || "—"}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.procurement_note || "—"}</td>
                          </>
                        )}
                        <td className="px-3 py-1.5" colSpan={2}>
                          <Input
                            inputMode="decimal"
                            placeholder="Đơn giá bán (VND)"
                            value={salePrice}
                            onChange={(e) => setSalePrice(e.target.value)}
                            className="h-7 text-xs text-right"
                          />
                          {salePrice ? (
                            <p className="mt-0.5 text-right text-xs text-muted-foreground">
                              Tổng: {formatVnd((Number(salePrice) || 0) * item.quantity)}
                            </p>
                          ) : null}
                          {item.cost_unit_price && salePrice ? (
                            <p className="text-right text-xs text-blue-600">
                              Hệ số ≈ {(Number(salePrice) / item.cost_unit_price).toFixed(2)}×
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              title="Lưu"
                              className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
                              disabled={saleMutation.isPending || !salePrice.trim()}
                              onClick={() => saleMutation.mutate(item.id)}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Huỷ"
                              className="rounded p-1 text-muted-foreground hover:bg-muted/50"
                              onClick={() => { setSaleEditId(null); setSalePrice("") }}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      /* --- Read mode --- */
                      <>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.item_code || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.category || "—"}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.description}</p>
                        </td>
                        {showSpecsCols && (
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.specifications || "—"}</td>
                        )}
                        <td className="px-3 py-2 text-muted-foreground">{item.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                        {showCostCols && (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums text-sm">
                              {formatVnd(item.cost_unit_price)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {formatVnd(item.cost_total)}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.supplier_name || "—"}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.procurement_note || "—"}</td>
                          </>
                        )}
                        {showSaleCols && (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums text-sm">
                              {formatVnd(item.sale_unit_price)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {formatVnd(item.sale_total)}
                            </td>
                          </>
                        )}
                        {(editStructure || editCost || editSale) && (
                          <td className="px-3 py-2">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {editStructure && (
                                <>
                                  <button
                                    type="button"
                                    title="Chỉnh sửa"
                                    className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                    onClick={() => startEdit(item)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Xóa"
                                    className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                    disabled={deleteMutation.isPending}
                                    onClick={() => {
                                      if (confirm(`Xóa hạng mục "${item.description}"?`)) {
                                        deleteMutation.mutate(item.id)
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              {editCost && (
                                <button
                                  type="button"
                                  title="Điền giá mua"
                                  className="rounded p-1 text-xs text-orange-600 hover:bg-orange-50"
                                  onClick={() => startCostEdit(item)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {editSale && (
                                <button
                                  type="button"
                                  title="Set giá bán"
                                  className="rounded p-1 text-xs text-blue-600 hover:bg-blue-50"
                                  onClick={() => startSaleEdit(item)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>

            {/* Summary footer */}
            {(showCostCols || showSaleCols) && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold text-sm">
                  <td
                    className="px-3 py-2 text-right text-muted-foreground"
                    colSpan={4 + (showSpecsCols ? 1 : 0) + 2}
                  >
                    Tổng cộng
                  </td>
                  {showCostCols && (
                    <>
                      <td className="px-3 py-2 text-right" />
                      <td className="px-3 py-2 text-right tabular-nums">{formatVnd(totalCost)}</td>
                      <td className="px-3 py-2" colSpan={2} />
                    </>
                  )}
                  {showSaleCols && (
                    <>
                      <td className="px-3 py-2 text-right" />
                      <td className="px-3 py-2 text-right tabular-nums">{formatVnd(totalSale)}</td>
                    </>
                  )}
                  {(editStructure || editCost || editSale) && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
