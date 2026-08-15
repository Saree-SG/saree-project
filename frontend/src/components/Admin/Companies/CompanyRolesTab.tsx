import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { type CompanyPublic, RolesService } from "@/client"
import { RolePermissionEditor } from "@/components/Admin/RolePermissionEditor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useCustomToast from "@/hooks/useCustomToast"
import {
  assignRolePermissions,
  listPermissionsCatalog,
} from "@/modules/rbac/rbacApi"
import { handleError } from "@/utils"

import RolePermissionsDialog from "./RolePermissionsDialog"

type Props = { company: CompanyPublic }

export default function CompanyRolesTab({ company }: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [roleKey, setRoleKey] = useState("")
  const [roleDisplay, setRoleDisplay] = useState("")
  const [roleLevel, setRoleLevel] = useState("3")
  const [roleDescription, setRoleDescription] = useState("")
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  )

  const { data: roles = [] } = useQuery({
    queryKey: ["roles", "catalog", company.id],
    queryFn: () => RolesService.listCompanyRoles({ companyId: company.id }),
  })

  const { data: catalog = [] } = useQuery({
    queryKey: ["roles", "permissions-catalog"],
    queryFn: listPermissionsCatalog,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const role = await RolesService.createRole({
        companyId: company.id,
        requestBody: {
          name: roleKey.trim().toLowerCase().replace(/ /g, "_"),
          display_name: roleDisplay.trim(),
          level: Number(roleLevel),
          description: roleDescription.trim() || null,
          policy_doc: { permissions: Array.from(newPerms) },
        },
      })
      if (!role.id) throw new Error("Role ID is missing")
      await assignRolePermissions({
        roleId: role.id,
        permissionCodes: Array.from(newPerms),
      })
      return role
    },
    onSuccess: async () => {
      showSuccessToast("Đã thêm vai trò mới")
      setRoleKey("")
      setRoleDisplay("")
      setRoleLevel("3")
      setRoleDescription("")
      setNewPerms(new Set())
      await qc.invalidateQueries({ queryKey: ["roles", "catalog", company.id] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Vai trò trong công ty</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên hiển thị</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead className="text-right">Quyền</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    Chưa có vai trò. Thêm bên dưới.
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.display_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">L{r.level}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.description || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!r.id}
                        onClick={() =>
                          r.id && setEditing({ id: r.id, name: r.display_name })
                        }
                      >
                        Sửa quyền
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thêm vai trò mới</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Key</Label>
            <Input
              placeholder="vd: truong_phong_kinh_doanh"
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Tên hiển thị</Label>
            <Input
              placeholder="vd: Trưởng Phòng Kinh Doanh"
              value={roleDisplay}
              onChange={(e) => setRoleDisplay(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Level</Label>
            <Select value={roleLevel} onValueChange={setRoleLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    Level {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Mô tả</Label>
            <Input
              placeholder="Mô tả ngắn"
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-2 block">Quyền cho vai trò</Label>
            <RolePermissionEditor
              catalog={catalog}
              selected={newPerms}
              onChange={setNewPerms}
              maxHeightClass="max-h-72"
            />
          </div>
          <div className="flex justify-end md:col-span-2">
            <LoadingButton
              loading={createMutation.isPending}
              disabled={!roleKey.trim() || !roleDisplay.trim()}
              onClick={() => createMutation.mutate()}
            >
              Thêm vai trò
            </LoadingButton>
          </div>
        </CardContent>
      </Card>

      <RolePermissionsDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        roleId={editing?.id ?? null}
        roleDisplayName={editing?.name ?? ""}
      />
    </div>
  )
}
