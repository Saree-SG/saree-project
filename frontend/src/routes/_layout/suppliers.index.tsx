import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Plus, Search, Star, Trash2, Pencil } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useDebounce } from "@/hooks/useDebounce"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { clearSession } from "@/modules/auth/tokenStore"
import {
  listSuppliers,
  createSupplier,
  deleteSupplier,
} from "@/modules/supplier/supplierApi"
import type { SupplierCreate, SupplierPublic } from "@/modules/supplier/supplierTypes"
import { hasPermission } from "@/utils/accountAccess"

export const Route = createFileRoute("/_layout/suppliers/")({
  beforeLoad: async () => {
    let permissions: string[]
    try {
      permissions = await import("@/modules/rbac/rbacApi").then((m) =>
        m.readMyPermissions(),
      )
    } catch (err: unknown) {
      const e = err as { status?: number }
      if (e?.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw err
    }
    if (!hasPermission(permissions, "SUPPLIER_VIEW")) {
      throw redirect({ to: "/" })
    }
    return { permissions }
  },
  component: SuppliersPage,
  head: () => ({ meta: [{ title: "Nhà Cung Cấp" }] }),
})

function SuppliersPage() {
  const { permissions } = Route.useRouteContext()
  const canCreate = hasPermission(permissions, "SUPPLIER_CREATE")
  const canDelete = hasPermission(permissions, "SUPPLIER_DELETE")

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 400)
  const [createOpen, setCreateOpen] = useState(false)

  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", debouncedSearch],
    queryFn: () => listSuppliers({ search: debouncedSearch || undefined, limit: 100 }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] })
      toast.success("Đã xóa nhà cung cấp")
    },
    onError: () => toast.error("Xóa thất bại"),
  })

  const suppliers = data?.data ?? []

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Nhà Cung Cấp</h1>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Thêm mới
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Tìm tên hoặc người liên hệ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên nhà cung cấp</TableHead>
              <TableHead>Người liên hệ</TableHead>
              <TableHead>Điện thoại</TableHead>
              <TableHead>Chuyên cung cấp</TableHead>
              <TableHead>Đánh giá</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Chưa có nhà cung cấp nào
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/suppliers/$supplierId"
                      params={{ supplierId: s.id }}
                      className="hover:underline"
                    >
                      {s.supplier_name}
                    </Link>
                  </TableCell>
                  <TableCell>{s.contact_name ?? "—"}</TableCell>
                  <TableCell>{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.specialty ?? "—"}</TableCell>
                  <TableCell>
                    {s.rating ? (
                      <span className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-400" />
                        {s.rating}/5
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Link to="/suppliers/$supplierId" params={{ supplierId: s.id }}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Xóa "${s.supplier_name}"?`)) {
                              deleteMutation.mutate(s.id)
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canCreate && (
        <CreateSupplierDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["suppliers"] })
            setCreateOpen(false)
          }}
        />
      )}
    </div>
  )
}

function CreateSupplierDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (s: SupplierPublic) => void
}) {
  const [form, setForm] = useState<SupplierCreate>({ supplier_name: "" })

  const mutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: (s) => {
      toast.success("Đã thêm nhà cung cấp")
      onCreated(s)
      setForm({ supplier_name: "" })
    },
    onError: () => toast.error("Tạo thất bại"),
  })

  const field = (key: keyof SupplierCreate) => ({
    value: (form[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value || null })),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm nhà cung cấp mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>
              Tên nhà cung cấp <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="Công ty TNHH..."
              value={form.supplier_name}
              onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Người liên hệ</Label>
              <Input placeholder="Nguyễn Văn A" {...field("contact_name")} />
            </div>
            <div className="space-y-1">
              <Label>Điện thoại</Label>
              <Input placeholder="0909..." {...field("phone")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input placeholder="example@mail.com" {...field("email")} />
          </div>
          <div className="space-y-1">
            <Label>Chuyên cung cấp</Label>
            <Input placeholder="máy nén, dàn lạnh, vật tư điện..." {...field("specialty")} />
          </div>
          <div className="space-y-1">
            <Label>Địa chỉ</Label>
            <Input placeholder="Quận/Huyện, Tỉnh/Thành..." {...field("address")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={!form.supplier_name.trim() || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            {mutation.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
