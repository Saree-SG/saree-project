import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { BarChart2, Eye, EyeOff, FileText, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useAuth from "@/hooks/useAuth"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { clearSession } from "@/modules/auth/tokenStore"
import { listQuotations } from "@/modules/quotation/quotationApi"
import {
  EQUIPMENT_CATEGORIES,
  getStageFilterLabel,
  STAGE_CONFIG,
  STATUS_CONFIG,
} from "@/modules/quotation/stageConfig"
import type {
  QuotationPublic,
  QuotationStage,
  QuotationStatus,
} from "@/modules/quotation/quotationTypes"
import { hasPermission } from "@/utils/accountAccess"

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/_layout/quotations/")({
  beforeLoad: async () => {
    let permissions: string[] = []
    let isSuperuser = false
    try {
      const [rbac, { UsersService }] = await Promise.all([
        import("@/modules/rbac/rbacApi"),
        import("@/client"),
      ])
      ;[permissions] = await Promise.all([
        rbac.readMyPermissions(),
        UsersService.readUserMe().then((u) => { isSuperuser = Boolean(u.is_superuser) }),
      ])
    } catch (err: unknown) {
      const e = err as { status?: number }
      if (e?.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw err
    }
    const allowed =
      isSuperuser ||
      hasPermission(permissions, "QUOTATION_VIEW") ||
      hasPermission(permissions, "QUOTATION_VIEW_ALL")
    if (!allowed) {
      throw redirect({ to: "/" })
    }
  },
  component: QuotationsPage,
  head: () => ({ meta: [{ title: "Hồ sơ Báo Giá" }] }),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatVND(value: number | null): string {
  if (value == null) return "—"
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("vi-VN")
}

// ---------------------------------------------------------------------------
// Status + Stage badges
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: QuotationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-600",
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText}`}
    >
      {cfg.label}
    </span>
  )
}

function StageBadge({ stage }: { stage: QuotationStage }) {
  const cfg = STAGE_CONFIG[stage]
  if (!cfg) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
      {cfg.shortLabel}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterState {
  client_company_name: string
  equipment_category: string
  status: string
  current_stage: string
}

function FilterBar({
  filters,
  onChange,
  onClear,
}: {
  filters: FilterState
  onChange: (f: Partial<FilterState>) => void
  onClear: () => void
}) {
  const hasActive =
    filters.client_company_name ||
    filters.equipment_category ||
    filters.status ||
    filters.current_stage

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Client search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Tên công ty khách hàng..."
          value={filters.client_company_name}
          onChange={(e) => onChange({ client_company_name: e.target.value })}
          className="h-9 pl-8 w-52 text-sm"
        />
      </div>

      {/* Equipment category */}
      <Select
        value={filters.equipment_category || "_all"}
        onValueChange={(v) =>
          onChange({ equipment_category: v === "_all" ? "" : v })
        }
      >
        <SelectTrigger className="h-9 w-44 text-sm">
          <SelectValue placeholder="Hạng mục thiết bị" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">Tất cả hạng mục</SelectItem>
          {EQUIPMENT_CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status */}
      <Select
        value={filters.status || "_all"}
        onValueChange={(v) => onChange({ status: v === "_all" ? "" : v })}
      >
        <SelectTrigger className="h-9 w-44 text-sm">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">Tất cả trạng thái</SelectItem>
          {(Object.entries(STATUS_CONFIG) as [QuotationStatus, (typeof STATUS_CONFIG)[QuotationStatus]][]).map(
            ([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>

      {/* Stage */}
      <Select
        value={filters.current_stage || "_all"}
        onValueChange={(v) =>
          onChange({ current_stage: v === "_all" ? "" : v })
        }
      >
        <SelectTrigger className="h-9 w-48 text-sm">
          <SelectValue placeholder="Giai đoạn" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">Tất cả giai đoạn</SelectItem>
          {(Object.entries(STAGE_CONFIG) as [QuotationStage, (typeof STAGE_CONFIG)[QuotationStage]][]).map(
            ([key]) => (
              <SelectItem key={key} value={key}>
                {getStageFilterLabel(key)}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>

      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-9 gap-1 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Xóa filter
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FileText className="mb-4 h-12 w-12 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">
        {hasFilters
          ? "Không tìm thấy hồ sơ phù hợp với bộ lọc."
          : "Chưa có hồ sơ báo giá nào."}
      </p>
      {!hasFilters && (
        <Link to="/quotations/new">
          <Button size="sm" className="mt-4 gap-1.5">
            <Plus className="h-4 w-4" />
            Tạo hồ sơ đầu tiên
          </Button>
        </Link>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row — my action indicator
// ---------------------------------------------------------------------------

function MyActionBadge({
  quotation,
  myPermissions,
}: {
  quotation: QuotationPublic
  myPermissions: string[]
}) {
  const perms = new Set(myPermissions)
  const stage = quotation.current_stage

  const isMyTurn = (() => {
    if (stage === "S1_SALES_COLLECT" && perms.has("QUOTATION_SUBMIT_SURVEY")) return true
    if (stage === "S2_DIRECTOR_APPROVE_SURVEY" && perms.has("QUOTATION_APPROVE_SURVEY")) return true
    if (stage === "S3_TECH_DESIGN" && perms.has("QUOTATION_DESIGN")) return true
    if (stage === "S4_DIRECTOR_APPROVE_DESIGN" && perms.has("QUOTATION_APPROVE_DESIGN")) return true
    if (stage === "S5_PROCUREMENT_PRICING" && perms.has("QUOTATION_FILL_PRICE")) return true
    if (stage === "S6_SALES_FINALIZE" && perms.has("QUOTATION_FINALIZE")) return true
    if (stage === "S7_DIRECTOR_APPROVE_QUOTE" && perms.has("QUOTATION_APPROVE_FINAL")) return true
    if (stage === "S8_SENT_TO_CLIENT" && perms.has("QUOTATION_SEND_CLIENT")) return true
    if (stage === "S8B_NEGOTIATION_REVIEW" && perms.has("QUOTATION_APPROVE_NEGOTIATION")) {
      return true
    }
    return false
  })()

  if (!isMyTurn) return null

  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 ring-1 ring-red-200">
      Việc của tôi
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

function QuotationsPage() {
  useAuth()
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []
  const canCreate = permissions.includes("QUOTATION_CREATE")

  const [filters, setFilters] = useState<FilterState>({
    client_company_name: "",
    equipment_category: "",
    status: "",
    current_stage: "",
  })
  const [page, setPage] = useState(0)
  const [priceVisible, setPriceVisible] = useState(false)

  const queryParams = {
    ...(filters.client_company_name
      ? { client_company_name: filters.client_company_name }
      : {}),
    ...(filters.equipment_category
      ? { equipment_category: filters.equipment_category }
      : {}),
    ...(filters.status ? { status: filters.status as QuotationStatus } : {}),
    ...(filters.current_stage
      ? { current_stage: filters.current_stage as QuotationStage }
      : {}),
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["quotations", queryParams],
    queryFn: () => listQuotations(queryParams),
  })

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0
  const hasFilters = Boolean(
    filters.client_company_name ||
      filters.equipment_category ||
      filters.status ||
      filters.current_stage,
  )

  function handleFilterChange(partial: Partial<FilterState>) {
    setFilters((prev) => ({ ...prev, ...partial }))
    setPage(0)
  }

  function handleClearFilters() {
    setFilters({
      client_company_name: "",
      equipment_category: "",
      status: "",
      current_stage: "",
    })
    setPage(0)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hồ sơ Báo Giá</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? `${data.count} hồ sơ` : "Đang tải..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/quotations/reports" search={{}}>
            <Button variant="outline" className="gap-1.5">
              <BarChart2 className="h-4 w-4" />
              Báo cáo
            </Button>
          </Link>
          {canCreate && (
            <Link to="/quotations/new">
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" />
                Tạo hồ sơ mới
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-20 text-sm text-destructive">
            Không thể tải danh sách. Vui lòng thử lại.
          </div>
        ) : !data?.data.length ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-32">Mã HĐ</TableHead>
                <TableHead>Tên dự án</TableHead>
                <TableHead>Khách hàng</TableHead>
                <TableHead className="w-36">Hạng mục</TableHead>
                <TableHead className="w-36">Trạng thái</TableHead>
                <TableHead className="w-44">Giai đoạn</TableHead>
                <TableHead className="w-28">Hạn phản hồi</TableHead>
                <TableHead className="w-38 text-right">
                  <div className="inline-flex w-full items-center justify-end gap-1.5">
                    <span>Giá bán</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setPriceVisible((prev) => !prev)}
                      aria-pressed={priceVisible}
                      aria-label={priceVisible ? "Ẩn cột giá bán" : "Hiện cột giá bán"}
                      title={priceVisible ? "Ẩn giá bán" : "Hiện giá bán"}
                    >
                      {priceVisible ? (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </Button>
                  </div>
                </TableHead>
                <TableHead className="w-28">Ngày tạo</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((q) => (
                <TableRow
                  key={q.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <TableCell>
                    {q.color ? (
                      <span
                        className="inline-block h-3 w-3 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: q.color }}
                        title={q.color}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to="/quotations/$quotationId"
                      params={{ quotationId: q.id }}
                      search={{ tab: "history" }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {q.quote_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/quotations/$quotationId"
                      params={{ quotationId: q.id }}
                      search={{ tab: "history" }}
                      className="font-medium hover:underline line-clamp-1"
                    >
                      {q.project_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {q.client_company_name}
                  </TableCell>
                  <TableCell className="text-sm">
                    {q.equipment_category ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={q.status} />
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={q.current_stage} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {q.client_response_deadline ? (
                      <span
                        className={
                          new Date(q.client_response_deadline).getTime() < Date.now()
                            ? "text-red-600 font-semibold"
                            : ""
                        }
                      >
                        {formatDate(q.client_response_deadline)}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">
                    {priceVisible
                      ? formatVND(q.total_contract_value)
                      : q.total_contract_value != null
                        ? "••••••"
                        : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(q.created_at)}
                  </TableCell>
                  <TableCell>
                    <MyActionBadge
                      quotation={q}
                      myPermissions={permissions}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Trang {page + 1} / {totalPages} — {data?.count} hồ sơ
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Tiếp
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
