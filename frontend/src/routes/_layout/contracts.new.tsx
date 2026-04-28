import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { z } from "zod"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { clearSession } from "@/modules/auth/tokenStore"
import { createContract, listContracts } from "@/modules/contract/contractApi"
import { listQuotations } from "@/modules/quotation/quotationApi"
import type { ContractCreate } from "@/modules/contract/contractTypes"
import { hasPermission } from "@/utils/accountAccess"

const searchSchema = z.object({
  quotation_id: z.string().optional(),
  project_id: z.string().optional(),
})

export const Route = createFileRoute("/_layout/contracts/new")({
  validateSearch: searchSchema,
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
    if (!hasPermission(permissions, "CONTRACT_CREATE")) {
      throw redirect({ to: "/contracts" })
    }
    return { permissions }
  },
  component: NewContractPage,
  head: () => ({ meta: [{ title: "Tạo hợp đồng" }] }),
})

function NewContractPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: "/_layout/contracts/new" })

  const today = new Date().toISOString().split("T")[0]

  const [form, setForm] = useState<ContractCreate>({
    quotation_id: search.quotation_id ?? "",
    project_id: search.project_id ?? null,
    contract_date: today,
    total_value: 0,
    currency: "VND",
    advance_amount: null,
    notes: null,
  })

  const mutation = useMutation({
    mutationFn: createContract,
    onSuccess: (c) => {
      toast.success(`Đã tạo hợp đồng ${c.contract_number}`)
      navigate({ to: "/contracts/$contractId", params: { contractId: c.id } })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e?.response?.data?.detail ?? "Tạo hợp đồng thất bại")
    },
  })

  const setField = (key: keyof ContractCreate, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }))

  const wonQuotationsQuery = useQuery({
    queryKey: ["contract-create", "won-quotations"],
    queryFn: () =>
      listQuotations({
        outcome: "won",
        limit: 200,
      }),
  })

  const existingContractsQuery = useQuery({
    queryKey: ["contract-create", "existing-contracts"],
    queryFn: () => listContracts({ limit: 200 }),
  })

  const wonQuotations = wonQuotationsQuery.data?.data ?? []
  const existingQuotationIds = new Set(
    (existingContractsQuery.data?.data ?? []).map((contract) => contract.quotation_id),
  )
  const selectableWonQuotations = wonQuotations.filter(
    (quotation) => !existingQuotationIds.has(quotation.id),
  )

  const isValid =
    form.quotation_id.trim() !== "" &&
    form.contract_date !== "" &&
    form.total_value > 0

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Tạo hợp đồng mới</h1>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="space-y-1">
          <Label>
            Báo giá thắng <span className="text-destructive">*</span>
          </Label>
          <select
            title="Báo giá thắng"
            value={form.quotation_id}
            onChange={(e) => {
              const quotationId = e.target.value
              const selectedQuotation = selectableWonQuotations.find((q) => q.id === quotationId)
              setForm((prev) => ({
                ...prev,
                quotation_id: quotationId,
                total_value: selectedQuotation?.total_contract_value ?? prev.total_value,
              }))
            }}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            disabled={wonQuotationsQuery.isLoading || existingContractsQuery.isLoading}
          >
            <option value="">
              {wonQuotationsQuery.isLoading || existingContractsQuery.isLoading
                ? "Đang tải danh sách báo giá..."
                : "Chọn báo giá đã thắng"}
            </option>
            {selectableWonQuotations.map((q) => (
              <option key={q.id} value={q.id}>
                {q.quote_number} - {q.client_company_name} - {q.project_name}
              </option>
            ))}
          </select>
          {wonQuotationsQuery.isError || existingContractsQuery.isError ? (
            <p className="text-xs text-destructive">
              Không tải được dữ liệu báo giá/hợp đồng. Vui lòng thử lại.
            </p>
          ) : null}
          {!wonQuotationsQuery.isLoading && !existingContractsQuery.isLoading && !selectableWonQuotations.length ? (
            <p className="text-xs text-muted-foreground">
              Không còn báo giá thắng nào chưa tạo hợp đồng.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>
              Ngày hợp đồng <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={form.contract_date}
              onChange={(e) => setField("contract_date", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Đơn vị tiền tệ</Label>
            <Input
              value={form.currency}
              onChange={(e) => setField("currency", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>
              Giá trị hợp đồng <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min={0}
              value={form.total_value || ""}
              onChange={(e) => setField("total_value", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Tạm ứng đợt 1</Label>
            <Input
              type="number"
              min={0}
              value={form.advance_amount ?? ""}
              onChange={(e) =>
                setField("advance_amount", e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Ghi chú</Label>
          <Textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => setField("notes", e.target.value || null)}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => navigate({ to: "/contracts" })}>
          Hủy
        </Button>
        <Button
          disabled={!isValid || mutation.isPending}
          onClick={() => mutation.mutate(form)}
        >
          {mutation.isPending ? "Đang tạo..." : "Tạo hợp đồng"}
        </Button>
      </div>
    </div>
  )
}
