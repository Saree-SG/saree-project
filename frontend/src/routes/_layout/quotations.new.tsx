import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

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
import {
  createQuotation,
  listQuotationCompanyProfiles,
} from "@/modules/quotation/quotationApi"
import { EQUIPMENT_CATEGORIES } from "@/modules/quotation/stageConfig"
import type { QuotationCompanyProfile, QuotationCreate } from "@/modules/quotation/quotationTypes"
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
  head: () => ({ meta: [{ title: "Tạo dự án mới" }] }),
})

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function NewQuotationPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState<QuotationCreate>({
    project_name: "",
    client_company_name: "",
    equipment_category: null,
    client_contact_name: "",
    client_contact_title: "",
    client_contact_phone: "",
    client_contact_email: "",
    client_address: "",
    notes: "",
    survey_note: "",
  })

  const [errors, setErrors] = useState<Partial<Record<keyof QuotationCreate, string>>>({})
  const [companyMode, setCompanyMode] = useState<"existing" | "new">("existing")

  const companiesQuery = useQuery({
    queryKey: ["quotation-company-profiles"],
    queryFn: listQuotationCompanyProfiles,
  })
  const hasExistingCompanies = (companiesQuery.data?.length ?? 0) > 0

  useEffect(() => {
    if (companiesQuery.isSuccess && !hasExistingCompanies && companyMode !== "new") {
      setCompanyMode("new")
    }
  }, [companiesQuery.isSuccess, hasExistingCompanies, companyMode])

  const mutation = useMutation({
    mutationFn: createQuotation,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
      queryClient.invalidateQueries({ queryKey: ["quotation-company-profiles"] })
      showSuccessToast(`Đã tạo hồ sơ ${data.quote_number} thành công.`)
      navigate({
        to: "/quotations/$quotationId",
        params: { quotationId: data.id },
        search: { tab: "history" },
      })
    },
    onError: () => {
      showErrorToast("Không thể tạo hồ sơ. Vui lòng thử lại.")
    },
  })

  function validateStep1(): boolean {
    const next: typeof errors = {}
    if (!form.client_company_name.trim()) next.client_company_name = "Vui lòng nhập tên công ty khách hàng."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function validateStep2(): boolean {
    const next: typeof errors = {}
    if (!form.project_name.trim()) next.project_name = "Vui lòng nhập tên dự án."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function applyCompanyProfile(profile: QuotationCompanyProfile) {
    setForm((prev) => ({
      ...prev,
      client_company_name: profile.client_company_name,
      client_contact_name: profile.client_contact_name ?? "",
      client_contact_title: profile.client_contact_title ?? "",
      client_contact_phone: profile.client_contact_phone ?? "",
      client_contact_email: profile.client_contact_email ?? "",
      client_address: profile.client_address ?? "",
      notes: profile.notes ?? "",
      survey_note: profile.survey_note ?? "",
      equipment_category: profile.equipment_category ?? null,
    }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateStep2()) return
    mutation.mutate({
      project_name: form.project_name.trim(),
      client_company_name: form.client_company_name.trim(),
      client_contact_name: form.client_contact_name?.trim() || null,
      client_contact_title: form.client_contact_title?.trim() || null,
      client_contact_phone: form.client_contact_phone?.trim() || null,
      client_contact_email: form.client_contact_email?.trim() || null,
      client_address: form.client_address?.trim() || null,
      equipment_category: form.equipment_category || null,
      notes: form.notes?.trim() || null,
      survey_note: form.survey_note?.trim() || null,
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
          <h1 className="text-2xl font-bold tracking-tight">Tạo dự án mới</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Dự án bắt đầu từ quy trình báo giá.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 flex flex-col gap-5">
        {step === 1 ? (
          <>
            <div className="rounded-md border bg-muted/30 p-2 text-xs font-medium">
              Bước 1/2 — Thông tin công ty khách hàng
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_company_name">
                Tên công ty khách hàng <span className="text-destructive">*</span>
              </Label>
              {hasExistingCompanies && companyMode === "existing" ? (
                <div className="space-y-2">
                  <Select
                    value={form.client_company_name || "_none"}
                    onValueChange={(value) => {
                      if (value === "__new__") {
                        setCompanyMode("new")
                        setForm((prev) => ({ ...prev, client_company_name: "" }))
                        return
                      }
                      if (value === "_none") {
                        setForm((prev) => ({
                          ...prev,
                          client_company_name: "",
                        }))
                      } else {
                        const profile = (companiesQuery.data ?? []).find(
                          (item) => item.client_company_name === value,
                        )
                        if (profile) {
                          applyCompanyProfile(profile)
                        }
                      }
                      if (errors.client_company_name) {
                        setErrors((prev) => ({ ...prev, client_company_name: undefined }))
                      }
                    }}
                  >
                    <SelectTrigger
                      id="client_company_name"
                      className={errors.client_company_name ? "border-destructive" : ""}
                    >
                      <SelectValue placeholder="Chọn công ty đã có" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Chọn công ty</SelectItem>
                      {(companiesQuery.data ?? []).map((company) => (
                        <SelectItem
                          key={company.client_company_name}
                          value={company.client_company_name}
                        >
                          {company.client_company_name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">+ Tạo công ty mới</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Input
                  id="client_company_name"
                  placeholder="VD: Công ty TNHH Thực phẩm XYZ"
                  value={form.client_company_name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, client_company_name: e.target.value }))
                    if (errors.client_company_name) {
                      setErrors((prev) => ({ ...prev, client_company_name: undefined }))
                    }
                  }}
                  className={errors.client_company_name ? "border-destructive" : ""}
                  autoFocus
                />
              )}
              {hasExistingCompanies && companyMode === "new" ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCompanyMode("existing")
                      setForm((prev) => ({ ...prev, client_company_name: "" }))
                      if (errors.client_company_name) {
                        setErrors((prev) => ({ ...prev, client_company_name: undefined }))
                      }
                    }}
                  >
                    Chọn lại từ danh sách
                  </Button>
                </div>
              ) : null}
              {errors.client_company_name && (
                <p className="text-xs text-destructive">{errors.client_company_name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client_contact_name">Tên khách hàng</Label>
                <Input
                  id="client_contact_name"
                  value={form.client_contact_name ?? ""}
                  onChange={(eventValue) =>
                    setForm((prev) => ({ ...prev, client_contact_name: eventValue.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client_contact_title">Chức vụ</Label>
                <Input
                  id="client_contact_title"
                  value={form.client_contact_title ?? ""}
                  onChange={(eventValue) =>
                    setForm((prev) => ({ ...prev, client_contact_title: eventValue.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client_contact_phone">Số điện thoại</Label>
                <Input
                  id="client_contact_phone"
                  value={form.client_contact_phone ?? ""}
                  onChange={(eventValue) =>
                    setForm((prev) => ({ ...prev, client_contact_phone: eventValue.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client_contact_email">Email</Label>
                <Input
                  id="client_contact_email"
                  value={form.client_contact_email ?? ""}
                  onChange={(eventValue) =>
                    setForm((prev) => ({ ...prev, client_contact_email: eventValue.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_address">Vị trí khảo sát</Label>
              <Input
                id="client_address"
                value={form.client_address ?? ""}
                onChange={(eventValue) =>
                  setForm((prev) => ({ ...prev, client_address: eventValue.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Ghi chú công ty</Label>
              <Input
                id="notes"
                value={form.notes ?? ""}
                onChange={(eventValue) =>
                  setForm((prev) => ({ ...prev, notes: eventValue.target.value }))
                }
              />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-md border bg-muted/30 p-2 text-xs font-medium">
              Bước 2/2 — Thông tin khảo sát và dự án
            </div>
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
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Link to="/quotations">
            <Button type="button" variant="outline" disabled={mutation.isPending}>
              Huỷ
            </Button>
          </Link>
          {step === 1 ? (
            <Button
              type="button"
              onClick={() => {
                if (!validateStep1()) return
                setStep(2)
              }}
            >
              Tiếp theo
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Quay lại
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Tạo dự án mới
              </Button>
            </>
          )}
        </div>
      </form>

      {/* Info hint */}
      <div className="rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Sau khi tạo hồ sơ:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Flow hiển thị sẽ bắt đầu từ <strong>Tạo hồ sơ</strong>, sau đó chuyển sang <strong>Khảo sát</strong></li>
          <li>Nhân viên Kinh doanh điền đầy đủ thông tin khảo sát và nộp cho Ban Giám đốc duyệt</li>
          <li>Sau khi Giám đốc duyệt, bộ phận Kỹ thuật sẽ bắt đầu thiết kế</li>
        </ul>
      </div>
    </div>
  )
}
