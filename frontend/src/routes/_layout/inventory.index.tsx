import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { AlertTriangle, Loader2, Plus, RefreshCw } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  listItems,
  createItem,
  getLowStockAlerts,
  listIssues,
  createIssue,
} from "@/modules/inventory/inventoryApi"
import {
  ISSUE_STATUS_LABELS,
  type IssueStatus,
  type InventoryItemCreate,
  type MaterialIssueItemCreate,
} from "@/modules/inventory/inventoryTypes"

export const Route = createFileRoute("/_layout/inventory/")({
  component: InventoryIndexPage,
})

const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  issued: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
}

function CreateItemDialog() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<InventoryItemCreate>({
    item_name: "",
    unit: "cái",
    min_stock_alert: 0,
  })
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => createItem(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] })
      setOpen(false)
      setForm({ item_name: "", unit: "cái", min_stock_alert: 0 })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" /> Thêm vật tư
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm vật tư vào kho</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tên vật tư *</Label>
            <Input
              value={form.item_name}
              onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
            />
          </div>
          <div>
            <Label>Mã vật tư</Label>
            <Input
              value={form.item_code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value || undefined }))}
            />
          </div>
          <div>
            <Label>ĐVT *</Label>
            <Input
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            />
          </div>
          <div>
            <Label>Danh mục</Label>
            <Input
              value={form.category ?? ""}
              placeholder="VD: cơ khí, điện, lạnh..."
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value || undefined }))}
            />
          </div>
          <div>
            <Label>Thông số kỹ thuật</Label>
            <Input
              value={form.specifications ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, specifications: e.target.value || undefined }))}
            />
          </div>
          <div>
            <Label>Mức cảnh báo tồn kho thấp</Label>
            <Input
              type="number"
              min={0}
              value={form.min_stock_alert ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, min_stock_alert: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              disabled={!form.item_name || !form.unit || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Thêm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateIssueDialog({ items }: { items: { id: string; item_name: string; unit: string; current_stock: number }[] }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [issueItems, setIssueItems] = useState<MaterialIssueItemCreate[]>([
    { inventory_item_id: "", quantity_requested: 1 },
  ])
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () =>
      createIssue({ notes: notes || undefined, items: issueItems.filter((i) => i.inventory_item_id) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-issues"] })
      setOpen(false)
      setNotes("")
      setIssueItems([{ inventory_item_id: "", quantity_requested: 1 }])
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Tạo phiếu xuất
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Tạo phiếu xuất kho</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ghi chú</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Danh sách vật tư *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIssueItems((p) => [...p, { inventory_item_id: "", quantity_requested: 1 }])}
              >
                <Plus className="w-3 h-3 mr-1" /> Thêm
              </Button>
            </div>
            {issueItems.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                <div className="col-span-8">
                  <Select
                    value={it.inventory_item_id}
                    onValueChange={(v) =>
                      setIssueItems((p) => p.map((x, i) => (i === idx ? { ...x, inventory_item_id: v } : x)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn vật tư" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.item_name} (tồn: {item.current_stock} {item.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    min={0.001}
                    step={0.001}
                    placeholder="SL"
                    value={it.quantity_requested}
                    onChange={(e) =>
                      setIssueItems((p) =>
                        p.map((x, i) => (i === idx ? { ...x, quantity_requested: parseFloat(e.target.value) || 1 } : x))
                      )
                    }
                  />
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  {issueItems.length > 1 && (
                    <button
                      className="text-red-400 hover:text-red-600"
                      onClick={() => setIssueItems((p) => p.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              disabled={issueItems.every((i) => !i.inventory_item_id) || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Tạo phiếu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StockList() {
  const [search, setSearch] = useState("")
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["inventory-items", search],
    queryFn: () => listItems({ search: search || undefined, limit: 200 }),
  })

  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Tìm vật tư..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Button variant="ghost" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Tên vật tư</th>
                <th className="text-left p-3 font-medium">Mã</th>
                <th className="text-left p-3 font-medium">Danh mục</th>
                <th className="text-left p-3 font-medium">ĐVT</th>
                <th className="text-right p-3 font-medium">Tồn kho</th>
                <th className="text-right p-3 font-medium">Cảnh báo</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">Chưa có vật tư nào</td>
                </tr>
              ) : (
                (data?.data ?? []).map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      <Link
                        to="/inventory/items/$itemId"
                        params={{ itemId: item.id }}
                        className="text-blue-600 hover:underline"
                      >
                        {item.item_name}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">{item.item_code ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{item.category ?? "—"}</td>
                    <td className="p-3">{item.unit}</td>
                    <td className={`p-3 text-right font-medium ${item.min_stock_alert > 0 && item.current_stock < item.min_stock_alert ? "text-red-600" : ""}`}>
                      {fmt(item.current_stock)}
                      {item.min_stock_alert > 0 && item.current_stock < item.min_stock_alert && (
                        <AlertTriangle className="w-3 h-3 inline ml-1 text-red-500" />
                      )}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{fmt(item.min_stock_alert)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function IssuesList() {
  const [statusFilter, setStatusFilter] = useState("all")
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["inventory-issues", statusFilter],
    queryFn: () => listIssues({ status: statusFilter === "all" ? undefined : statusFilter, limit: 100 }),
  })

  const { data: stockData } = useQuery({
    queryKey: ["inventory-items"],
    queryFn: () => listItems({ limit: 200 }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Lọc trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {Object.entries(ISSUE_STATUS_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <CreateIssueDialog items={stockData?.data ?? []} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Số phiếu</th>
                <th className="text-left p-3 font-medium">Số hạng mục</th>
                <th className="text-left p-3 font-medium">Trạng thái</th>
                <th className="text-left p-3 font-medium">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">Chưa có phiếu xuất kho nào</td>
                </tr>
              ) : (
                (data?.data ?? []).map((issue) => (
                  <tr key={issue.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono">
                      <Link
                        to="/inventory/issues/$issueId"
                        params={{ issueId: issue.id }}
                        className="text-blue-600 hover:underline"
                      >
                        {issue.issue_number}
                      </Link>
                    </td>
                    <td className="p-3">{issue.items.length} hạng mục</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[issue.status]}`}>
                        {ISSUE_STATUS_LABELS[issue.status]}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(issue.created_at).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AlertsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["inventory-alerts"],
    queryFn: () => getLowStockAlerts(),
  })

  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n)

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (data?.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <span className="text-4xl">✅</span>
          <p>Không có vật tư nào dưới mức cảnh báo</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-red-50">
              <tr>
                <th className="text-left p-3 font-medium text-red-800">Vật tư</th>
                <th className="text-left p-3 font-medium text-red-800">ĐVT</th>
                <th className="text-right p-3 font-medium text-red-800">Tồn kho</th>
                <th className="text-right p-3 font-medium text-red-800">Mức cảnh báo</th>
                <th className="text-right p-3 font-medium text-red-800">Thiếu</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3 font-medium text-red-700">{item.item_name}</td>
                  <td className="p-3">{item.unit}</td>
                  <td className="p-3 text-right font-bold text-red-600">{fmt(item.current_stock)}</td>
                  <td className="p-3 text-right text-muted-foreground">{fmt(item.min_stock_alert)}</td>
                  <td className="p-3 text-right text-red-600">
                    -{fmt(item.min_stock_alert - item.current_stock)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InventoryIndexPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kho Hàng</h1>
          <p className="text-sm text-muted-foreground">Quản lý tồn kho và phiếu xuất vật tư</p>
        </div>
        <CreateItemDialog />
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Tồn kho</TabsTrigger>
          <TabsTrigger value="issues">Phiếu xuất kho</TabsTrigger>
          <TabsTrigger value="alerts">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Cảnh báo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="stock" className="mt-4">
          <StockList />
        </TabsContent>
        <TabsContent value="issues" className="mt-4">
          <IssuesList />
        </TabsContent>
        <TabsContent value="alerts" className="mt-4">
          <AlertsList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
