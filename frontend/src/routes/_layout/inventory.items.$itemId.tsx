import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react"
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
import { getItem, getMovements, adjustStock } from "@/modules/inventory/inventoryApi"

export const Route = createFileRoute("/_layout/inventory/items/$itemId")({
  component: ItemDetailPage,
})

function AdjustDialog({ itemId, onSuccess }: { itemId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState<number>(0)
  const [notes, setNotes] = useState("")

  const mutation = useMutation({
    mutationFn: () => adjustStock(itemId, { quantity, notes: notes || undefined }),
    onSuccess: () => {
      onSuccess()
      setOpen(false)
      setQuantity(0)
      setNotes("")
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Điều chỉnh tồn kho</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điều chỉnh tồn kho thủ công</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nhập số dương để tăng tồn kho (nhập hàng), số âm để giảm (xuất/hao hụt).
          </p>
          <div>
            <Label>Số lượng điều chỉnh</Label>
            <Input
              type="number"
              step={0.001}
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Lý do *</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              disabled={quantity === 0 || !notes || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Xác nhận
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ItemDetailPage() {
  const { itemId } = Route.useParams()
  const qc = useQueryClient()

  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ["inventory-item", itemId],
    queryFn: () => getItem(itemId),
  })

  const { data: movements, isLoading: movLoading } = useQuery({
    queryKey: ["inventory-movements", itemId],
    queryFn: () => getMovements(itemId, { limit: 100 }),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inventory-item", itemId] })
    qc.invalidateQueries({ queryKey: ["inventory-movements", itemId] })
    qc.invalidateQueries({ queryKey: ["inventory-items"] })
  }

  if (itemLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  }
  if (!item) return null

  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n)

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/inventory" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Kho hàng
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span>{item.item_name}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{item.item_name}</h1>
          {item.item_code && <p className="text-sm text-muted-foreground font-mono">{item.item_code}</p>}
          {item.category && <p className="text-sm text-muted-foreground">{item.category}</p>}
        </div>
        <AdjustDialog itemId={itemId} onSuccess={invalidate} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className={`border rounded-lg p-4 ${item.min_stock_alert > 0 && item.current_stock < item.min_stock_alert ? "border-red-200 bg-red-50" : ""}`}>
          <p className="text-xs text-muted-foreground">Tồn kho hiện tại</p>
          <p className={`text-2xl font-bold ${item.min_stock_alert > 0 && item.current_stock < item.min_stock_alert ? "text-red-600" : ""}`}>
            {fmt(item.current_stock)}
          </p>
          <p className="text-xs text-muted-foreground">{item.unit}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Mức cảnh báo</p>
          <p className="text-2xl font-bold">{fmt(item.min_stock_alert)}</p>
          <p className="text-xs text-muted-foreground">{item.unit}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Thông số</p>
          <p className="text-sm mt-1">{item.specifications ?? "—"}</p>
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-3">Lịch sử xuất nhập ({movements?.count ?? 0})</h2>
        {movLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Loại</th>
                  <th className="text-right p-3 font-medium">Số lượng</th>
                  <th className="text-right p-3 font-medium">Đơn giá</th>
                  <th className="text-left p-3 font-medium">Nguồn</th>
                  <th className="text-left p-3 font-medium">Ghi chú</th>
                  <th className="text-left p-3 font-medium">Ngày</th>
                </tr>
              </thead>
              <tbody>
                {(movements?.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">Chưa có giao dịch nào</td>
                  </tr>
                ) : (
                  (movements?.data ?? []).map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="p-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.movement_type === "in" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {m.movement_type === "in" ? "Nhập" : "Xuất"}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-medium ${m.movement_type === "in" ? "text-green-700" : "text-red-700"}`}>
                        {m.movement_type === "in" ? "+" : "-"}{fmt(m.quantity)}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {m.unit_price != null ? `${fmt(m.unit_price)}đ` : "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {m.reference_type === "po_receive" ? "Nhận từ PO" :
                         m.reference_type === "material_issue" ? "Xuất theo phiếu" :
                         "Điều chỉnh thủ công"}
                      </td>
                      <td className="p-3 text-muted-foreground">{m.notes ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(m.movement_date).toLocaleDateString("vi-VN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
