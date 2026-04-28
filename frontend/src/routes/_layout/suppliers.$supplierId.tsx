import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Star } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { clearSession } from "@/modules/auth/tokenStore"
import { getSupplier, updateSupplier } from "@/modules/supplier/supplierApi"
import type { SupplierUpdate } from "@/modules/supplier/supplierTypes"
import { hasPermission } from "@/utils/accountAccess"

export const Route = createFileRoute("/_layout/suppliers/$supplierId")({
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
  component: SupplierDetailPage,
  head: () => ({ meta: [{ title: "Chi tiết nhà cung cấp" }] }),
})

function SupplierDetailPage() {
  const { supplierId } = Route.useParams()
  const { permissions } = Route.useRouteContext()
  const canEdit = hasPermission(permissions, "SUPPLIER_UPDATE")
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: () => getSupplier(supplierId),
  })

  const [form, setForm] = useState<SupplierUpdate>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (supplier) {
      setForm({
        supplier_name: supplier.supplier_name,
        contact_name: supplier.contact_name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        specialty: supplier.specialty,
        notes: supplier.notes,
        rating: supplier.rating,
      })
      setDirty(false)
    }
  }, [supplier])

  const mutation = useMutation({
    mutationFn: (body: SupplierUpdate) => updateSupplier(supplierId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier", supplierId] })
      queryClient.invalidateQueries({ queryKey: ["suppliers"] })
      toast.success("Đã cập nhật")
      setDirty(false)
    },
    onError: () => toast.error("Cập nhật thất bại"),
  })

  const set = (key: keyof SupplierUpdate, value: string | number | null) => {
    setForm((f) => ({ ...f, [key]: value || null }))
    setDirty(true)
  }

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Đang tải...</div>
  }

  if (!supplier) {
    return <div className="p-6 text-destructive">Không tìm thấy nhà cung cấp.</div>
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: "/suppliers" })}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl font-semibold">{supplier.supplier_name}</h1>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="space-y-1">
          <Label>
            Tên nhà cung cấp <span className="text-destructive">*</span>
          </Label>
          <Input
            disabled={!canEdit}
            value={form.supplier_name ?? ""}
            onChange={(e) => set("supplier_name", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Người liên hệ</Label>
            <Input
              disabled={!canEdit}
              value={form.contact_name ?? ""}
              onChange={(e) => set("contact_name", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Điện thoại</Label>
            <Input
              disabled={!canEdit}
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input
            disabled={!canEdit}
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Chuyên cung cấp</Label>
          <Input
            disabled={!canEdit}
            placeholder="máy nén, dàn lạnh, vật tư điện..."
            value={form.specialty ?? ""}
            onChange={(e) => set("specialty", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Địa chỉ</Label>
          <Input
            disabled={!canEdit}
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-yellow-500" /> Đánh giá (1–5)
          </Label>
          <Input
            disabled={!canEdit}
            type="number"
            min={1}
            max={5}
            value={form.rating ?? ""}
            onChange={(e) =>
              set("rating", e.target.value ? Number(e.target.value) : null)
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Ghi chú</Label>
          <Textarea
            disabled={!canEdit}
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        {canEdit && dirty && (
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setForm({
                  supplier_name: supplier.supplier_name,
                  contact_name: supplier.contact_name,
                  phone: supplier.phone,
                  email: supplier.email,
                  address: supplier.address,
                  specialty: supplier.specialty,
                  notes: supplier.notes,
                  rating: supplier.rating,
                })
                setDirty(false)
              }}
            >
              Hủy thay đổi
            </Button>
            <Button
              disabled={!form.supplier_name?.trim() || mutation.isPending}
              onClick={() => mutation.mutate(form)}
            >
              {mutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
