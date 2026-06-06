import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { RolesService } from "@/client"
import DepartmentManagement from "@/components/Admin/DepartmentManagement"
import { RolePermissionEditor } from "@/components/Admin/RolePermissionEditor"
import UserDepartmentAssign from "@/components/Admin/UserDepartmentAssign"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
  type Company,
  type CompanyMember,
  listCompanyMembers,
  listPermissionsCatalog,
  readRolePermissions,
  removeCompanyMemberRole,
  updateCompanyMemberRole,
} from "@/modules/rbac/rbacApi"
import { handleError } from "@/utils"

/**
 * Org management for a SINGLE selected company: rename, roles, departments and
 * members. Everything here is scoped to `company` chosen at the page level —
 * no per-tab company picker, no multi-company table.
 */
export default function CompanyOrgPanel({
  company,
}: {
  company: Company | null
}) {
  const companyId = company?.id ?? ""
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // ── Company rename ──────────────────────────────────────────────────────
  const [name, setName] = useState("")
  useEffect(() => {
    setName(company?.name ?? "")
  }, [company?.name])

  const renameMutation = useMutation({
    mutationFn: (newName: string) =>
      RolesService.updateCompany({
        companyId,
        requestBody: { name: newName },
      }),
    onSuccess: () => {
      showSuccessToast("Đã cập nhật tên công ty")
      queryClient.invalidateQueries({ queryKey: ["my-companies"] })
      queryClient.invalidateQueries({ queryKey: ["roles", "companies"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  // ── Roles ───────────────────────────────────────────────────────────────
  const { data: companyRoles } = useQuery({
    queryKey: ["roles", "catalog", companyId],
    queryFn: () => RolesService.listCompanyRoles({ companyId }),
    enabled: Boolean(companyId),
  })

  const { data: permissionsCatalog } = useQuery({
    queryKey: ["roles", "permissions-catalog"],
    queryFn: listPermissionsCatalog,
    enabled: Boolean(companyId),
  })

  const [roleName, setRoleName] = useState("")
  const [roleDisplayName, setRoleDisplayName] = useState("")
  const [roleLevel, setRoleLevel] = useState("3")
  const [roleDescription, setRoleDescription] = useState("")
  const [newRolePermissionCodes, setNewRolePermissionCodes] = useState<
    Set<string>
  >(new Set())

  const createRoleMutation = useMutation({
    mutationFn: async () => {
      const role = await RolesService.createRole({
        companyId,
        requestBody: {
          name: roleName.trim().toLowerCase().replace(/ /g, "_"),
          display_name: roleDisplayName.trim(),
          level: Number(roleLevel),
          description: roleDescription.trim() || null,
          policy_doc: { permissions: Array.from(newRolePermissionCodes) },
        },
      })
      if (!role.id) {
        throw new Error("Role ID is missing after createRole")
      }
      await assignRolePermissions({
        roleId: role.id,
        permissionCodes: Array.from(newRolePermissionCodes),
      })
      return role
    },
    onSuccess: async () => {
      showSuccessToast("Đã thêm vai trò")
      await queryClient.invalidateQueries({
        queryKey: ["roles", "catalog", companyId],
      })
      setRoleName("")
      setRoleDisplayName("")
      setRoleLevel("3")
      setRoleDescription("")
      setNewRolePermissionCodes(new Set())
    },
    onError: (err) => handleError.call(showErrorToast, err as any),
  })

  // ── Edit role permissions ───────────────────────────────────────────────
  const [editingRole, setEditingRole] = useState<{
    id: string
    displayName: string
  } | null>(null)
  const [editRolePermissionCodes, setEditRolePermissionCodes] = useState<
    Set<string>
  >(new Set())

  const rolePermissionsQuery = useQuery({
    queryKey: ["roles", "role-permissions", editingRole?.id ?? ""],
    queryFn: () => readRolePermissions(editingRole?.id ?? ""),
    enabled: Boolean(editingRole?.id),
  })
  useEffect(() => {
    if (!rolePermissionsQuery.data) {
      return
    }
    setEditRolePermissionCodes(new Set(rolePermissionsQuery.data))
  }, [rolePermissionsQuery.data])

  const updateRolePermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!editingRole?.id) {
        throw new Error("Role is not selected")
      }
      return assignRolePermissions({
        roleId: editingRole.id,
        permissionCodes: Array.from(editRolePermissionCodes),
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật quyền cho vai trò")
      await queryClient.invalidateQueries({
        queryKey: ["roles", "role-permissions", editingRole?.id ?? ""],
      })
      setEditingRole(null)
    },
    onError: (err) => handleError.call(showErrorToast, err as any),
  })

  // ── Members ─────────────────────────────────────────────────────────────
  const { data: companyMembers } = useQuery({
    queryKey: ["roles", "company-members", companyId],
    queryFn: () => listCompanyMembers(companyId),
    enabled: Boolean(companyId),
  })

  const [memberRoleDraftByKey, setMemberRoleDraftByKey] = useState<
    Record<string, string>
  >({})

  const invalidateMembers = () =>
    queryClient.invalidateQueries({
      queryKey: ["roles", "company-members", companyId],
    })

  const updateMemberMutation = useMutation({
    mutationFn: async (payload: {
      member: CompanyMember
      newRoleId: string
      isPrimary: boolean
    }) =>
      updateCompanyMemberRole({
        companyId,
        userId: payload.member.user_id,
        currentRoleId: payload.member.role_id,
        newRoleId: payload.newRoleId,
        isPrimary: payload.isPrimary,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật nhân sự")
      await invalidateMembers()
    },
    onError: (err) => handleError.call(showErrorToast, err as any),
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (member: CompanyMember) =>
      removeCompanyMemberRole({
        companyId,
        userId: member.user_id,
        roleId: member.role_id,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã gỡ vai trò của nhân sự")
      await invalidateMembers()
    },
    onError: (err) => handleError.call(showErrorToast, err as any),
  })

  if (!company) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        Chưa chọn công ty.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {/* Company name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin công ty</CardTitle>
          <CardDescription>
            Mã: {company.slug} ·{" "}
            {company.is_active ? "Đang hoạt động" : "Ngừng hoạt động"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">Tên công ty</p>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-72"
              />
            </div>
            <LoadingButton
              loading={renameMutation.isPending}
              disabled={!name.trim() || name.trim() === company.name}
              onClick={() => renameMutation.mutate(name.trim())}
            >
              Lưu tên
            </LoadingButton>
          </div>
        </CardContent>
      </Card>

      {/* Departments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phòng ban</CardTitle>
          <CardDescription>Cơ cấu phòng ban của công ty.</CardDescription>
        </CardHeader>
        <CardContent>
          <DepartmentManagement companyId={companyId} />
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vai trò &amp; phân quyền</CardTitle>
          <CardDescription>
            Định nghĩa vai trò và quyền thực thi trong quy trình ERP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3 space-y-3">
            <h4 className="text-sm font-semibold">Thêm vai trò</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Mã vai trò (vd: truong_phong_kinh_doanh)"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              />
              <Input
                placeholder="Tên hiển thị (vd: Trưởng Phòng Kinh Doanh)"
                value={roleDisplayName}
                onChange={(e) => setRoleDisplayName(e.target.value)}
              />
              <Select value={roleLevel} onValueChange={setRoleLevel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Cấp độ" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <SelectItem key={l} value={String(l)}>
                      Level {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Mô tả vai trò"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
              />
              <div className="md:col-span-2">
                <p className="text-xs font-medium mb-2">
                  Phân quyền cho vai trò
                </p>
                <RolePermissionEditor
                  catalog={permissionsCatalog ?? []}
                  selected={newRolePermissionCodes}
                  onChange={setNewRolePermissionCodes}
                  maxHeightClass="max-h-72"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <LoadingButton
                  loading={createRoleMutation.isPending}
                  disabled={!roleName || !roleDisplayName}
                  onClick={() => createRoleMutation.mutate()}
                >
                  Thêm vai trò
                </LoadingButton>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Vai trò hiện có</p>
            <div className="max-h-56 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên hiển thị</TableHead>
                    <TableHead>Mã</TableHead>
                    <TableHead>Cấp</TableHead>
                    <TableHead>Mô tả</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(companyRoles ?? []).map((role) => (
                    <TableRow key={role.id}>
                      <TableCell>{role.display_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {role.name}
                      </TableCell>
                      <TableCell>L{role.level}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {role.description || "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!role.id}
                          onClick={() => {
                            if (!role.id) {
                              return
                            }
                            setEditingRole({
                              id: role.id,
                              displayName: role.display_name,
                            })
                          }}
                        >
                          Sửa quyền
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nhân sự trong công ty</CardTitle>
          <CardDescription>
            Gán vai trò, đặt vai trò chính và phòng ban cho từng nhân sự.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[28rem] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Cấp</TableHead>
                  <TableHead>Chính</TableHead>
                  <TableHead>Phòng ban</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(companyMembers ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground"
                    >
                      Chưa có nhân sự.
                    </TableCell>
                  </TableRow>
                ) : null}
                {(companyMembers ?? []).map((member: CompanyMember) => {
                  const key = `${member.user_id}-${member.role_id}`
                  return (
                    <TableRow key={key}>
                      <TableCell>{member.full_name || "N/A"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.email}
                      </TableCell>
                      <TableCell>{member.role_display_name}</TableCell>
                      <TableCell>L{member.role_level}</TableCell>
                      <TableCell>{member.is_primary ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <UserDepartmentAssign
                          companyId={companyId}
                          userId={member.user_id}
                          currentDepartmentId={member.department_id}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Select
                            value={memberRoleDraftByKey[key] ?? member.role_id}
                            onValueChange={(newValue) =>
                              setMemberRoleDraftByKey((cur) => ({
                                ...cur,
                                [key]: newValue,
                              }))
                            }
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Chọn vai trò" />
                            </SelectTrigger>
                            <SelectContent>
                              {(companyRoles ?? [])
                                .filter((role) => Boolean(role.id))
                                .map((role) => (
                                  <SelectItem
                                    key={role.id}
                                    value={role.id as string}
                                  >
                                    {role.display_name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <LoadingButton
                            loading={updateMemberMutation.isPending}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateMemberMutation.mutate({
                                member,
                                newRoleId:
                                  memberRoleDraftByKey[key] ?? member.role_id,
                                isPrimary: member.is_primary,
                              })
                            }
                          >
                            Lưu vai trò
                          </LoadingButton>
                          {!member.is_primary ? (
                            <LoadingButton
                              loading={updateMemberMutation.isPending}
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateMemberMutation.mutate({
                                  member,
                                  newRoleId: member.role_id,
                                  isPrimary: true,
                                })
                              }
                            >
                              Đặt chính
                            </LoadingButton>
                          ) : null}
                          <LoadingButton
                            loading={removeMemberMutation.isPending}
                            size="sm"
                            variant="destructive"
                            onClick={() => removeMemberMutation.mutate(member)}
                          >
                            Gỡ
                          </LoadingButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit role permissions dialog */}
      <Dialog
        open={Boolean(editingRole)}
        onOpenChange={(open) => {
          if (!open) setEditingRole(null)
        }}
      >
        <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Phân quyền cho vai trò</DialogTitle>
            <DialogDescription>
              {editingRole
                ? `Cấu hình quyền cho vai trò "${editingRole.displayName}". Hover vào biểu tượng (i) để xem chi tiết từng quyền.`
                : "Chọn quyền cho vai trò"}
            </DialogDescription>
          </DialogHeader>
          {rolePermissionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Đang tải danh sách quyền...
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <RolePermissionEditor
                catalog={permissionsCatalog ?? []}
                selected={editRolePermissionCodes}
                onChange={setEditRolePermissionCodes}
                maxHeightClass="max-h-[55vh]"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingRole(null)}
            >
              Hủy
            </Button>
            <LoadingButton
              loading={
                updateRolePermissionsMutation.isPending ||
                rolePermissionsQuery.isLoading
              }
              onClick={() => updateRolePermissionsMutation.mutate()}
            >
              Lưu quyền
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
