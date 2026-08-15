import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import type { AdminUserListRow } from "@/modules/admin/adminUsersApi"

const ALL = "__all__"

function formatRelative(iso: string | null): string {
  if (!iso) return "Chưa từng"
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 0) return new Date(iso).toLocaleDateString("vi-VN")
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "Vừa xong"
  if (min < 60) return `${min}m trước`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h trước`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} ngày trước`
  return new Date(iso).toLocaleDateString("vi-VN")
}

function initials(name: string | null, email: string): string {
  const src = (name || email).trim()
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?"
}

function levelTone(level: number | null): string {
  switch (level) {
    case 1:
      return "bg-rose-100 text-rose-700 hover:bg-rose-100"
    case 2:
      return "bg-amber-100 text-amber-700 hover:bg-amber-100"
    case 3:
      return "bg-blue-100 text-blue-700 hover:bg-blue-100"
    case 4:
    case 5:
      return "bg-slate-100 text-slate-700 hover:bg-slate-100"
    default:
      return "bg-muted text-muted-foreground"
  }
}

type Props = {
  users: AdminUserListRow[]
}

export default function UserListTable({ users }: Props) {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [companyFilter, setCompanyFilter] = useState<string>(ALL)
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL)
  const [roleFilter, setRoleFilter] = useState<string>(ALL)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)

  const filterOptions = useMemo(() => {
    const companies = new Map<string, string>()
    const departments = new Map<string, string>()
    const roles = new Map<string, string>()
    for (const u of users) {
      if (u.company_id && u.company_name)
        companies.set(u.company_id, u.company_name)
      if (u.department_id && u.department_name)
        departments.set(u.department_id, u.department_name)
      if (u.primary_role_id && u.primary_role_display_name)
        roles.set(u.primary_role_id, u.primary_role_display_name)
    }
    return {
      companies: [...companies.entries()],
      departments: [...departments.entries()],
      roles: [...roles.entries()],
    }
  }, [users])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (q) {
        const hay = `${u.full_name ?? ""} ${u.email}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (companyFilter !== ALL && u.company_id !== companyFilter) return false
      if (departmentFilter !== ALL && u.department_id !== departmentFilter)
        return false
      if (roleFilter !== ALL && u.primary_role_id !== roleFilter) return false
      if (statusFilter === "active" && !u.is_active) return false
      if (statusFilter === "inactive" && u.is_active) return false
      return true
    })
  }, [users, search, companyFilter, departmentFilter, roleFilter, statusFilter])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Tìm theo tên hoặc email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Công ty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả công ty</SelectItem>
            {filterOptions.companies.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Phòng ban" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả phòng ban</SelectItem>
            {filterOptions.departments.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Vai trò" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả vai trò</SelectItem>
            {filterOptions.roles.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả</SelectItem>
            <SelectItem value="active">Đang hoạt động</SelectItem>
            <SelectItem value="inactive">Vô hiệu hoá</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} / {users.length}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Người dùng</TableHead>
              <TableHead>Công ty</TableHead>
              <TableHead>Phòng ban</TableHead>
              <TableHead>Vai trò chính</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Đăng nhập gần nhất</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Không có người dùng phù hợp.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() =>
                    navigate({
                      to: "/admin/users/$userId",
                      params: { userId: u.id },
                    })
                  }
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {initials(u.full_name, u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {u.full_name || "—"}
                          {u.is_superuser ? (
                            <Badge
                              variant="outline"
                              className="ml-2 border-rose-300 text-rose-700"
                            >
                              Superuser
                            </Badge>
                          ) : null}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.company_name ? (
                      <Badge variant="secondary">{u.company_name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Chưa gán
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.department_name ? (
                      <Badge variant="outline">{u.department_name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Chưa gán
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.primary_role_display_name ? (
                      <Badge className={levelTone(u.primary_role_level)}>
                        {u.primary_role_display_name}
                        {u.primary_role_level
                          ? ` · L${u.primary_role_level}`
                          : ""}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Chưa có
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelative(u.last_login_at)}
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
