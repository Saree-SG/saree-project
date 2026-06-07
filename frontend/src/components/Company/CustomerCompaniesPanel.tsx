import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import { CustomerCompanyFormDialog } from "@/components/Company/CustomerCompanyFormDialog"
import { Badge } from "@/components/ui/badge"
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
import useCustomToast from "@/hooks/useCustomToast"
import { useCan } from "@/hooks/useMyPermissions"
import {
  type CustomerCompanyPublic,
  customerCompanyKeys,
  deleteCustomerCompany,
  listCustomerCompanies,
} from "@/modules/company/customerCompanyApi"

const TYPE_LABEL: Record<string, string> = {
  customer: "Khách hàng",
  own: "Công ty của tôi",
}

export default function CustomerCompaniesPanel() {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const canCreate = useCan("CUSTOMER_CREATE")

  const [typeFilter, setTypeFilter] = useState<"all" | "customer" | "own">(
    "all",
  )
  const [search, setSearch] = useState("")

  const listQuery = useQuery({
    queryKey: customerCompanyKeys.all,
    queryFn: () => listCustomerCompanies(),
  })
  const all = listQuery.data ?? []

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((c) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false
      if (q && !c.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [all, typeFilter, search])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerCompanyPublic | null>(null)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(c: CustomerCompanyPublic) {
    setEditing(c)
    setDialogOpen(true)
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCustomerCompany(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerCompanyKeys.all })
      showSuccessToast("Đã xóa công ty")
    },
    onError: (e: any) =>
      showErrorToast(e?.body?.detail ?? e?.message ?? "Xóa thất bại"),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="customer">Khách hàng</SelectItem>
              <SelectItem value="own">Công ty của tôi</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên…"
              className="w-56 pl-8"
            />
          </div>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Thêm công ty
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên công ty</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Người liên hệ</TableHead>
              <TableHead>Điện thoại</TableHead>
              <TableHead>Vị trí</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground text-center"
                >
                  Đang tải…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground text-center"
                >
                  Chưa có công ty nào. Bấm "Thêm công ty" để tạo mới.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={c.type === "own" ? "secondary" : "outline"}>
                      {TYPE_LABEL[c.type ?? "customer"] ?? c.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.contact_name || "—"}</TableCell>
                  <TableCell>{c.contact_phone || "—"}</TableCell>
                  <TableCell>
                    {c.site_lat != null && c.site_lng != null ? (
                      <span className="text-primary inline-flex items-center gap-1 text-xs">
                        <MapPin className="size-3" /> Đã đặt
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canCreate && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Xóa công ty "${c.name}"?`))
                              deleteMutation.mutate(c.id)
                          }}
                        >
                          <Trash2 className="text-destructive size-4" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CustomerCompanyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  )
}
