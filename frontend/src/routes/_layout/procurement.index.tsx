import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { Plus, Loader2, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  listRequests,
  listAllOrders,
  createRequest,
} from "@/modules/procurement/procurementApi"
import {
  PR_STATUS_LABELS,
  PO_STATUS_LABELS,
  type PRStatus,
  type POStatus,
} from "@/modules/procurement/procurementTypes"

export const Route = createFileRoute("/_layout/procurement/")({
  component: ProcurementIndexPage,
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

function CreateRequestDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [urgency, setUrgency] = useState<"normal" | "urgent" | "critical">("normal")
  const [notes, setNotes] = useState("")

  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () =>
      createRequest({ title, urgency, notes: notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procurement-requests"] })
      setOpen(false)
      resetForm()
    },
  })

  const resetForm = () => {
    setTitle("")
    setUrgency("normal")
    setNotes("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" /> Tạo yêu cầu
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo yêu cầu mua hàng</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tiêu đề *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Mua vật tư thi công lắp đặt máy lạnh..."
            />
          </div>
          <div>
            <Label>Mức độ ưu tiên</Label>
            <Select value={urgency} onValueChange={(v) => setUrgency(v as typeof urgency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Bình thường</SelectItem>
                <SelectItem value="urgent">Khẩn cấp</SelectItem>
                <SelectItem value="critical">Rất khẩn cấp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Sau khi tạo yêu cầu, bạn vào chi tiết để thêm danh sách vật tư.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={!title || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Tạo yêu cầu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RequestsList() {
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["procurement-requests", statusFilter],
    queryFn: () =>
      listRequests({ status: statusFilter === "all" ? undefined : statusFilter, limit: 100 }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {Object.entries(PR_STATUS_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <th className="text-left p-3 font-medium">Số YC</th>
                <th className="text-left p-3 font-medium">Tiêu đề</th>
                <th className="text-left p-3 font-medium">Ưu tiên</th>
                <th className="text-left p-3 font-medium">Trạng thái</th>
                <th className="text-left p-3 font-medium">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Chưa có yêu cầu nào
                  </td>
                </tr>
              ) : (
                (data?.data ?? []).map((req) => (
                  <tr key={req.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono">
                      <Link
                        to="/procurement/requests/$requestId"
                        params={{ requestId: req.id }}
                        className="text-blue-600 hover:underline"
                      >
                        {req.request_number}
                      </Link>
                    </td>
                    <td className="p-3">{req.title}</td>
                    <td className="p-3">
                      {req.urgency === "critical" ? (
                        <Badge variant="destructive">Rất khẩn</Badge>
                      ) : req.urgency === "urgent" ? (
                        <Badge className="bg-orange-100 text-orange-800">Khẩn</Badge>
                      ) : (
                        <span className="text-muted-foreground">Bình thường</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PR_STATUS_COLORS[req.status]}`}
                      >
                        {PR_STATUS_LABELS[req.status]}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString("vi-VN")}
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

function OrdersList() {
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["procurement-orders", statusFilter],
    queryFn: () =>
      listAllOrders({ status: statusFilter === "all" ? undefined : statusFilter, limit: 100 }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {Object.entries(PO_STATUS_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <th className="text-left p-3 font-medium">Số PO</th>
                <th className="text-left p-3 font-medium">Số YC</th>
                <th className="text-left p-3 font-medium">Tổng tiền</th>
                <th className="text-left p-3 font-medium">Trạng thái</th>
                <th className="text-left p-3 font-medium">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Chưa có đơn đặt hàng nào
                  </td>
                </tr>
              ) : (
                (data?.data ?? []).map((po) => (
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
                    <td className="p-3 font-mono text-muted-foreground">{po.request_id.slice(0, 8)}…</td>
                    <td className="p-3">
                      {po.total_amount != null
                        ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(po.total_amount)
                        : "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PO_STATUS_COLORS[po.status]}`}
                      >
                        {PO_STATUS_LABELS[po.status]}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(po.created_at).toLocaleDateString("vi-VN")}
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

function ProcurementIndexPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mua Hàng</h1>
          <p className="text-sm text-muted-foreground">Quản lý yêu cầu và đơn đặt hàng</p>
        </div>
        <CreateRequestDialog />
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Yêu cầu mua hàng</TabsTrigger>
          <TabsTrigger value="orders">Đơn đặt hàng (PO)</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <RequestsList />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <OrdersList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
