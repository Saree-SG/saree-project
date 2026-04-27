import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import { clearSession } from "@/modules/auth/tokenStore"
import { createQuotation } from "@/modules/quotation/quotationApi"
import { EQUIPMENT_CATEGORIES } from "@/modules/quotation/stageConfig"
import type { QuotationCreate } from "@/modules/quotation/quotationTypes"
import { hasPermission } from "@/utils/accountAccess"

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/_layout/quotations/new")({
  beforeLoad: async () => {
    let permissions
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
    if (!hasPermission(permissions, "QUOTATION_CREATE")) {
      throw redirect({ to: "/quotations" })
    }
  },
  component: NewQuotationPage,
  head: () => ({ meta: [{ title: "Tạo hồ sơ báo giá mới" }] }),
})

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function NewQuotationPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [form, setForm] = useState<QuotationCreate>({
    project_name: "",
    client_company_name: "",
    equipment_category: null,
  })

  const [errors, setErrors] = useState<Partial<Record<keyof QuotationCreate, string>>>({})

  const mutation = useMutation({
    mutationFn: createQuotation,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
      showSuccessToast(`Đã tạo hồ sơ ${data.quote_number} thành công.`)
      navigate({
        to: "/quotations/$quotationId",
        params: { quotationId: data.id },
        search: { tab: "overview" },
      })
    },
    onError: () => {
      showErrorToast("Không thể tạo hồ sơ. Vui lòng thử lại.")
    },
  })

  function validate(): boolean {
    const next: typeof errors = {}
    if (!form.project_name.trim()) next.project_name = "Vui lòng nhập tên dự án."
    if (!form.client_company_name.trim()) next.client_company_name = "Vui lòng nhập tên công ty khách hàng."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    mutation.mutate({
      project_name: form.project_name.trim(),
      client_company_name: form.client_company_name.trim(),
      equipment_category: form.equipment_category || null,
    })
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/quotations">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tạo hồ sơ báo giá</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Điền thông tin cơ bản để mở hồ sơ. Các thông tin chi tiết có thể bổ sung sau.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 flex flex-col gap-5">
        {/* Project name */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project_name">
            Tên dự án <span className="text-destructive">*</span>
          </Label>
          <Input
            id="project_name"
            placeholder="VD: Hệ thống IQF nhà máy ABC"
            value={form.project_name}
            onChange={(e) => {
              setForm((f) => ({ ...f, project_name: e.target.value }))
              if (errors.project_name) setErrors((prev) => ({ ...prev, project_name: undefined }))
            }}
            className={errors.project_name ? "border-destructive" : ""}
            autoFocus
          />
          {errors.project_name && (
            <p className="text-xs text-destructive">{errors.project_name}</p>
          )}
        </div>

        {/* Client company name */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client_company_name">
            Tên công ty khách hàng <span className="text-destructive">*</span>
          </Label>
          <Input
            id="client_company_name"
            placeholder="VD: Công ty TNHH Thực phẩm XYZ"
            value={form.client_company_name}
            onChange={(e) => {
              setForm((f) => ({ ...f, client_company_name: e.target.value }))
              if (errors.client_company_name) setErrors((prev) => ({ ...prev, client_company_name: undefined }))
            }}
            className={errors.client_company_name ? "border-destructive" : ""}
          />
          {errors.client_company_name && (
            <p className="text-xs text-destructive">{errors.client_company_name}</p>
          )}
        </div>

        {/* Equipment category */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="equipment_category">Hạng mục thiết bị</Label>
          <Select
            value={form.equipment_category ?? "_none"}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, equipment_category: v === "_none" ? null : v }))
            }
          >
            <SelectTrigger id="equipment_category">
              <SelectValue placeholder="Chọn hạng mục (tuỳ chọn)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— Chưa xác định —</SelectItem>
              {EQUIPMENT_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Có thể cập nhật sau khi tạo hồ sơ.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Link to="/quotations">
            <Button type="button" variant="outline" disabled={mutation.isPending}>
              Huỷ
            </Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Tạo hồ sơ
          </Button>
        </div>
      </form>

      {/* Info hint */}
      <div className="rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Sau khi tạo hồ sơ:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Hồ sơ sẽ ở giai đoạn <strong>Thu thập thông tin (S1)</strong></li>
          <li>Nhân viên Kinh doanh điền đầy đủ thông tin khảo sát và nộp cho Ban Giám đốc duyệt</li>
          <li>Sau khi BGĐ duyệt, bộ phận Kỹ thuật sẽ bắt đầu thiết kế</li>
        </ul>
      </div>
    </div>
  )
}
