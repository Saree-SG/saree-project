import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { listAuditLog } from "@/modules/admin/adminStatsApi"

export const Route = createFileRoute("/_layout/admin/activity")({
  component: AdminActivity,
})

const ALL = "__all__"

function actionTone(action: string): string {
  if (action.includes("delete") || action.includes("removed"))
    return "bg-rose-100 text-rose-700"
  if (action.includes("created") || action.includes("added"))
    return "bg-emerald-100 text-emerald-700"
  if (action.includes("updated") || action.includes("changed"))
    return "bg-amber-100 text-amber-700"
  return "bg-slate-100 text-slate-700"
}

function formatTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("vi-VN")
}

function shortJson(value: unknown): string {
  if (value == null) return "—"
  try {
    const s = JSON.stringify(value)
    return s.length > 120 ? `${s.slice(0, 120)}…` : s
  } catch {
    return String(value)
  }
}

function AdminActivity() {
  const [search, setSearch] = useState("")
  const [entityFilter, setEntityFilter] = useState<string>(ALL)

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "stats", "audit"],
    queryFn: () => listAuditLog({ limit: 200 }),
    refetchInterval: 60_000,
  })

  const entityTypes = useMemo(() => {
    return [...new Set(data.map((r) => r.entity_type))].sort()
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.filter((r) => {
      if (entityFilter !== ALL && r.entity_type !== entityFilter) return false
      if (q) {
        const hay =
          `${r.actor_name ?? ""} ${r.actor_email ?? ""} ${r.action} ${r.entity_type}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, search, entityFilter])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nhật ký hoạt động</h1>
        <p className="text-muted-foreground">
          Toàn bộ hành động ghi nhận trên hệ thống (audit log).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {filtered.length} / {data.length} bản ghi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              placeholder="Tìm theo tên người dùng hoặc action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72"
            />
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Loại đối tượng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả</SelectItem>
                {entityTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Người thực hiện</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead>Đối tượng</TableHead>
                  <TableHead>Thay đổi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      Không có hoạt động.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatTime(r.created_at)}
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/admin/users/$userId"
                          params={{ userId: r.actor_id }}
                          className="hover:underline"
                        >
                          <div className="font-medium">
                            {r.actor_name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.actor_email || ""}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge className={actionTone(r.action)}>
                          {r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="mr-2">
                          {r.entity_type}
                        </Badge>
                        <code className="text-[10px] text-muted-foreground">
                          {r.entity_id.slice(0, 8)}
                        </code>
                      </TableCell>
                      <TableCell
                        className="max-w-md truncate text-xs text-muted-foreground"
                        title={shortJson(r.new_value)}
                      >
                        {shortJson(r.new_value)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
