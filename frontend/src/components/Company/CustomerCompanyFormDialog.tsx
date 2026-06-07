import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import {
  LocationPicker,
  type LocationValue,
} from "@/components/Common/LocationPicker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import useCustomToast from "@/hooks/useCustomToast"
import {
  type CustomerCompanyPublic,
  createCustomerCompany,
  customerCompanyKeys,
  updateCustomerCompany,
} from "@/modules/company/customerCompanyApi"

type FormState = {
  name: string
  type: "customer" | "own"
  tax_code: string
  contact_name: string
  contact_title: string
  contact_phone: string
  contact_email: string
  address: string
  notes: string
  location: LocationValue
}

function emptyForm(defaultType: "customer" | "own"): FormState {
  return {
    name: "",
    type: defaultType,
    tax_code: "",
    contact_name: "",
    contact_title: "",
    contact_phone: "",
    contact_email: "",
    address: "",
    notes: "",
    location: { lat: null, lng: null, radiusM: 150 },
  }
}

function toForm(c: CustomerCompanyPublic): FormState {
  return {
    name: c.name,
    type: (c.type as "customer" | "own") ?? "customer",
    tax_code: c.tax_code ?? "",
    contact_name: c.contact_name ?? "",
    contact_title: c.contact_title ?? "",
    contact_phone: c.contact_phone ?? "",
    contact_email: c.contact_email ?? "",
    address: c.address ?? "",
    notes: c.notes ?? "",
    location: {
      lat: c.site_lat ?? null,
      lng: c.site_lng ?? null,
      radiusM: c.site_radius_m ?? 150,
    },
  }
}

function formToPayload(f: FormState) {
  return {
    name: f.name.trim(),
    type: f.type,
    tax_code: f.tax_code.trim() || null,
    contact_name: f.contact_name.trim() || null,
    contact_title: f.contact_title.trim() || null,
    contact_phone: f.contact_phone.trim() || null,
    contact_email: f.contact_email.trim() || null,
    address: f.address.trim() || null,
    notes: f.notes.trim() || null,
    site_lat: f.location.lat,
    site_lng: f.location.lng,
    site_radius_m: f.location.radiusM || 150,
  }
}

/**
 * Full create/edit form for a customer company — same level of detail as the
 * quotation client form, so a customer is registered once and reused. Shared by
 * the /company "Khách hàng" tab and the attendance by-company picker.
 */
export function CustomerCompanyFormDialog({
  open,
  onOpenChange,
  editing = null,
  defaultType = "customer",
  lockType = false,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: CustomerCompanyPublic | null
  defaultType?: "customer" | "own"
  lockType?: boolean
  onSaved?: (saved: CustomerCompanyPublic) => void
}) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [form, setForm] = useState<FormState>(emptyForm(defaultType))

  // Reset the form whenever the dialog opens (create vs edit).
  useEffect(() => {
    if (open) setForm(editing ? toForm(editing) : emptyForm(defaultType))
  }, [open, editing, defaultType])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = formToPayload(form)
      if (!payload.name) throw new Error("Vui lòng nhập tên công ty")
      if ((payload.site_lat === null) !== (payload.site_lng === null))
        throw new Error("Cần nhập cả vĩ độ và kinh độ")
      return editing
        ? updateCustomerCompany(editing.id, payload)
        : createCustomerCompany(payload)
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: customerCompanyKeys.all })
      qc.invalidateQueries({ queryKey: ["attendance-customer-companies"] })
      showSuccessToast(editing ? "Đã cập nhật công ty" : "Đã thêm công ty")
      onOpenChange(false)
      onSaved?.(saved)
    },
    onError: (e: any) =>
      showErrorToast(e?.body?.detail ?? e?.message ?? "Lưu thất bại"),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Sửa thông tin công ty" : "Thêm công ty khách hàng"}
          </DialogTitle>
          <DialogDescription>
            Tạo một lần, dùng lại nhiều lần khi tạo báo giá / hợp đồng / chấm
            công.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Tên công ty *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Công ty TNHH ABC"
              />
            </div>
            {!lockType && (
              <div className="space-y-1">
                <Label>Loại</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm({ ...form, type: v as "customer" | "own" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Công ty khách hàng</SelectItem>
                    <SelectItem value="own">Công ty của tôi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Mã số thuế</Label>
              <Input
                value={form.tax_code}
                onChange={(e) => setForm({ ...form, tax_code: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Người liên hệ</Label>
              <Input
                value={form.contact_name}
                onChange={(e) =>
                  setForm({ ...form, contact_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Chức danh</Label>
              <Input
                value={form.contact_title}
                onChange={(e) =>
                  setForm({ ...form, contact_title: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Điện thoại</Label>
              <Input
                value={form.contact_phone}
                onChange={(e) =>
                  setForm({ ...form, contact_phone: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={form.contact_email}
                onChange={(e) =>
                  setForm({ ...form, contact_email: e.target.value })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Địa chỉ</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Ghi chú</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              Vị trí công ty (cho chấm công)
            </p>
            <LocationPicker
              value={form.location}
              onChange={(location) => setForm({ ...form, location })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <LoadingButton
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {editing ? "Lưu thay đổi" : "Tạo công ty"}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
