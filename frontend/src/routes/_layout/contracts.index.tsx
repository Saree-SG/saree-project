import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { FileSignature, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
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
import { Badge } from "@/components/ui/badge"
import { clearSession } from "@/modules/auth/tokenStore"
import { listContracts } from "@/modules/contract/contractApi"
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_ORDER,
  type ContractStatus,
} from "@/modules/contract/contractTypes"
import { hasPermission } from "@/utils/accountAccess"

const STATUS_BADGE_VARIANT: Record<ContractStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  pending_approval: "secondary",
  sent: "outline",
  signed: "default",
  advance_received: "default",
  in_production: "default",
  completed: "default",
}

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-amber-100 text-amber-700",
  sent: "bg-blue-100 text-blue-700",
  signed: "bg-purple-100 text-purple-700",
  advance_received: "bg-yellow-100 text-yellow-700",
  in_production: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
}

export const Route = createFileRoute("/_layout/contracts/")({
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
    const allowed =
      hasPermission(permissions, "CONTRACT_VIEW") ||
      hasPermission(permissions, "CONTRACT_VIEW_ALL")
    if (!allowed) throw redirect({ to: "/" })
    return { permissions }
  },
  component: ContractsPage,
  head: () => ({ meta: [{ title: "Hợp Đồng" }] }),
})

function ContractsPage() {
  const { permissions } = Route.useRouteContext()
  const canCreate = hasPermission(permissions, "CONTRACT_CREATE")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { data, isLoading } = useQuery({
    queryKey: ["contracts", statusFilter],
    queryFn: () =>
      listContracts({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
      }),
  })

  const contracts = data?.data ?? []

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FileSignature className="w-5 h-5" />
          Hợp Đồng
        </h1>
        {canCreate && (
          <Link to="/contracts/new">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Tạo hợp đồng
            </Button>
          </Link>
        )}
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {CONTRACT_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {CONTRACT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Số HĐ</TableHead>
              <TableHead>Ngày ký</TableHead>
              <TableHead>Giá trị</TableHead>
              <TableHead>Tạm ứng</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : contracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Chưa có hợp đồng nào
                </TableCell>
              </TableRow>
            ) : (
              contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/contracts/$contractId"
                      params={{ contractId: c.id }}
                      className="hover:underline"
                    >
                      {c.contract_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {c.contract_date
                      ? new Date(c.contract_date).toLocaleDateString("vi-VN")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {c.total_value.toLocaleString("vi-VN")} {c.currency}
                  </TableCell>
                  <TableCell>
                    {c.advance_amount
                      ? `${c.advance_amount.toLocaleString("vi-VN")} ${c.currency}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[c.status as ContractStatus] ?? ""}`}
                    >
                      {c.status_label ?? CONTRACT_STATUS_LABELS[c.status as ContractStatus]}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
