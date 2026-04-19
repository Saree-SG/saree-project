import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { type CompanyPublic, RolesService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
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
  listCompanyMembers,
  listPermissionsCatalog,
  type CompanyMember,
  type PermissionCatalogItem,
  removeCompanyMemberRole,
  readRolePermissions,
  updateCompanyMemberRole,
} from "@/modules/rbac/rbacApi"
import { handleError } from "@/utils"

const CompanyManagement = () => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { data: companies } = useQuery({
    queryKey: ["roles", "companies"],
    queryFn: () => RolesService.listCompanies(),
  })
  const [open, setOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyPublic | null>(
    null,
  )
  const [name, setName] = useState("")
  const [roleName, setRoleName] = useState("")
  const [roleDisplayName, setRoleDisplayName] = useState("")
  const [roleLevel, setRoleLevel] = useState("3")
  const [roleDescription, setRoleDescription] = useState("")
  const [newRolePermissionCodes, setNewRolePermissionCodes] = useState<
    Set<string>
  >(new Set())
  const [editingRole, setEditingRole] = useState<{
    id: string
    displayName: string
  } | null>(null)
  const [editRolePermissionCodes, setEditRolePermissionCodes] = useState<
    Set<string>
  >(new Set())
  const [memberRoleDraftByKey, setMemberRoleDraftByKey] = useState<
    Record<string, string>
  >({})

  const { data: companyRoles } = useQuery({
    queryKey: ["roles", "catalog", editingCompany?.id || ""],
    queryFn: () =>
      RolesService.listCompanyRoles({ companyId: editingCompany?.id || "" }),
    enabled: Boolean(editingCompany?.id),
  })
  const { data: companyMembers } = useQuery({
    queryKey: ["roles", "company-members", editingCompany?.id || ""],
    queryFn: () => listCompanyMembers(editingCompany?.id || ""),
    enabled: Boolean(editingCompany?.id),
  })

  const { data: permissionsCatalog } = useQuery({
    queryKey: ["roles", "permissions-catalog"],
    queryFn: listPermissionsCatalog,
    enabled: Boolean(editingCompany?.id),
  })

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionCatalogItem[]>()
    for (const item of permissionsCatalog ?? []) {
      const key = item.module || "other"
      const rows = groups.get(key) ?? []
      rows.push(item)
      groups.set(key, rows)
    }
    return Array.from(groups.entries()).map(([module, rows]) => ({
      module,
      rows: rows.slice().sort((a, b) => a.code.localeCompare(b.code)),
    }))
  }, [permissionsCatalog])

  function toggleNewRolePermissionCode(code: string, checked: boolean) {
    setNewRolePermissionCodes((currentValue) => {
      const nextValue = new Set(currentValue)
      if (checked) {
        nextValue.add(code)
      } else {
        nextValue.delete(code)
      }
      return nextValue
    })
  }
  function toggleEditRolePermissionCode(code: string, checked: boolean) {
    setEditRolePermissionCodes((currentValue) => {
      const nextValue = new Set(currentValue)
      if (checked) {
        nextValue.add(code)
      } else {
        nextValue.delete(code)
      }
      return nextValue
    })
  }

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

  const updateMutation = useMutation({
    mutationFn: (payload: { companyId: string; name: string }) =>
      RolesService.updateCompany({
        companyId: payload.companyId,
        requestBody: {
          name: payload.name,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Company updated")
      queryClient.invalidateQueries({ queryKey: ["roles", "companies"] })
      setOpen(false)
      setEditingCompany(null)
      setName("")
    },
    onError: handleError.bind(showErrorToast),
  })

  const createRoleMutation = useMutation({
    mutationFn: async (payload: {
      companyId: string
      roleName: string
      roleDisplayName: string
      roleLevel: number
      roleDescription: string
      permissionCodes: string[]
    }) => {
      const role = await RolesService.createRole({
        companyId: payload.companyId,
        requestBody: {
          name: payload.roleName,
          display_name: payload.roleDisplayName,
          level: payload.roleLevel,
          description: payload.roleDescription || null,
          policy_doc: { permissions: payload.permissionCodes },
        },
      })
      if (!role.id) {
        throw new Error("Role ID is missing after createRole")
      }
      await assignRolePermissions({
        roleId: role.id,
        permissionCodes: payload.permissionCodes,
      })
      return role
    },
    onSuccess: async () => {
      showSuccessToast("Role added to company")
      await queryClient.invalidateQueries({
        queryKey: ["roles", "catalog", editingCompany?.id || ""],
      })
      setRoleName("")
      setRoleDisplayName("")
      setRoleLevel("3")
      setRoleDescription("")
      setNewRolePermissionCodes(new Set())
    },
    onError: (errorValue) =>
      handleError.call(showErrorToast, errorValue as unknown as any),
  })
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
      showSuccessToast("Role permissions updated")
      await queryClient.invalidateQueries({
        queryKey: ["roles", "role-permissions", editingRole?.id ?? ""],
      })
      setEditingRole(null)
    },
    onError: (errorValue) =>
      handleError.call(showErrorToast, errorValue as unknown as any),
  })
  const updateMemberMutation = useMutation({
    mutationFn: async (payload: {
      member: CompanyMember
      newRoleId: string
      isPrimary: boolean
    }) => {
      if (!editingCompany) {
        throw new Error("Company is not selected")
      }
      return updateCompanyMemberRole({
        companyId: editingCompany.id,
        userId: payload.member.user_id,
        currentRoleId: payload.member.role_id,
        newRoleId: payload.newRoleId,
        isPrimary: payload.isPrimary,
      })
    },
    onSuccess: async () => {
      showSuccessToast("Member updated")
      await queryClient.invalidateQueries({
        queryKey: ["roles", "company-members", editingCompany?.id || ""],
      })
    },
    onError: (errorValue) =>
      handleError.call(showErrorToast, errorValue as unknown as any),
  })
  const removeMemberMutation = useMutation({
    mutationFn: async (member: CompanyMember) => {
      if (!editingCompany) {
        throw new Error("Company is not selected")
      }
      return removeCompanyMemberRole({
        companyId: editingCompany.id,
        userId: member.user_id,
        roleId: member.role_id,
      })
    },
    onSuccess: async () => {
      showSuccessToast("Member role removed")
      await queryClient.invalidateQueries({
        queryKey: ["roles", "company-members", editingCompany?.id || ""],
      })
    },
    onError: (errorValue) =>
      handleError.call(showErrorToast, errorValue as unknown as any),
  })

  return (
    <div className="rounded-md border p-4">
      <h3 className="text-lg font-semibold">Companies</h3>
      <p className="text-sm text-muted-foreground mb-3">
        View all companies and edit company name.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(companies ?? []).map((company) => (
            <TableRow key={company.id}>
              <TableCell>{company.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {company.slug}
              </TableCell>
              <TableCell>{company.is_active ? "Active" : "Inactive"}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingCompany(company)
                    setName(company.name)
                    setOpen(true)
                  }}
                >
                  <Pencil className="mr-2 size-4" />
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>
              Update company info and define role permissions in one place.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div>
              <p className="text-sm font-medium mb-2">Company Name</p>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <h4 className="font-semibold">Add Role For This Company</h4>
              <p className="text-xs text-muted-foreground">
                Select permission codes this role can execute in ERP workflows.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Role key (eg: truong_phong_kinh_doanh)"
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                />
                <Input
                  placeholder="Role display name (eg: Trưởng Phòng Kinh Doanh)"
                  value={roleDisplayName}
                  onChange={(event) => setRoleDisplayName(event.target.value)}
                />
                <Select value={roleLevel} onValueChange={setRoleLevel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Role level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Level 1</SelectItem>
                    <SelectItem value="2">Level 2</SelectItem>
                    <SelectItem value="3">Level 3</SelectItem>
                    <SelectItem value="4">Level 4</SelectItem>
                    <SelectItem value="5">Level 5</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Role description"
                  value={roleDescription}
                  onChange={(event) => setRoleDescription(event.target.value)}
                />
                <div className="md:col-span-2">
                  <p className="text-xs font-medium mb-2">Permission matrix</p>
                  <div className="max-h-64 space-y-3 overflow-auto rounded-md border p-3">
                    {groupedPermissions.map((group) => (
                      <div key={group.module} className="space-y-2">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          {group.module}
                        </p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {group.rows.map((permission) => {
                            const checked = newRolePermissionCodes.has(
                              permission.code,
                            )
                            return (
                              <label
                                key={permission.id}
                                className="flex items-start gap-2 rounded border p-2 text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) =>
                                    toggleNewRolePermissionCode(
                                      permission.code,
                                      event.target.checked,
                                    )
                                  }
                                />
                                <span>
                                  <span className="block font-semibold">
                                    {permission.code}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {permission.description}
                                  </span>
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <LoadingButton
                    loading={createRoleMutation.isPending}
                    disabled={!editingCompany || !roleName || !roleDisplayName}
                    onClick={() => {
                      if (!editingCompany) {
                        return
                      }
                      createRoleMutation.mutate({
                        companyId: editingCompany.id,
                        roleName: roleName
                          .trim()
                          .toLowerCase()
                          .replace(/ /g, "_"),
                        roleDisplayName: roleDisplayName.trim(),
                        roleLevel: Number(roleLevel),
                        roleDescription: roleDescription.trim(),
                        permissionCodes: Array.from(newRolePermissionCodes),
                      })
                    }}
                  >
                    Add Role
                  </LoadingButton>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Current Roles</p>
                <div className="max-h-56 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Display Name</TableHead>
                        <TableHead>Key</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Description</TableHead>
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
                              Edit permissions
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Nhân viên trong công ty</p>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Họ tên</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Primary</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(companyMembers ?? []).map((member: CompanyMember) => (
                        <TableRow key={`${member.user_id}-${member.role_id}`}>
                          <TableCell>{member.full_name || "N/A"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.email}
                          </TableCell>
                          <TableCell>{member.role_display_name}</TableCell>
                          <TableCell>L{member.role_level}</TableCell>
                          <TableCell>
                            {member.is_primary ? "Yes" : "No"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Select
                                value={
                                  memberRoleDraftByKey[
                                    `${member.user_id}-${member.role_id}`
                                  ] ?? member.role_id
                                }
                                onValueChange={(newValue) =>
                                  setMemberRoleDraftByKey((currentValue) => ({
                                    ...currentValue,
                                    [`${member.user_id}-${member.role_id}`]:
                                      newValue,
                                  }))
                                }
                              >
                                <SelectTrigger className="w-48">
                                  <SelectValue placeholder="Chọn role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(companyRoles ?? [])
                                    .filter((role) => Boolean(role.id))
                                    .map((role) => (
                                      <SelectItem key={role.id} value={role.id as string}>
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
                                      memberRoleDraftByKey[
                                        `${member.user_id}-${member.role_id}`
                                      ] ?? member.role_id,
                                    isPrimary: member.is_primary,
                                  })
                                }
                              >
                                Save role
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
                                  Set primary
                                </LoadingButton>
                              ) : null}
                              <LoadingButton
                                loading={removeMemberMutation.isPending}
                                size="sm"
                                variant="destructive"
                                onClick={() => removeMemberMutation.mutate(member)}
                              >
                                Remove
                              </LoadingButton>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t bg-background pt-3">
            <DialogClose asChild>
              <Button variant="outline" disabled={updateMutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              loading={updateMutation.isPending}
              onClick={() => {
                if (!editingCompany || !name.trim()) {
                  return
                }
                updateMutation.mutate({
                  companyId: editingCompany.id,
                  name: name.trim(),
                })
              }}
            >
              Save
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingRole)} onOpenChange={() => setEditingRole(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit role permissions</DialogTitle>
            <DialogDescription>
              {editingRole
                ? `Configure permissions for ${editingRole.displayName}`
                : "Select permissions for role"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-auto rounded-md border p-3">
            {groupedPermissions.map((group) => (
              <div key={group.module} className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {group.module}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {group.rows.map((permission) => {
                    const checked = editRolePermissionCodes.has(permission.code)
                    return (
                      <label
                        key={permission.id}
                        className="flex items-start gap-2 rounded border p-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            toggleEditRolePermissionCode(
                              permission.code,
                              event.target.checked,
                            )
                          }
                        />
                        <span>
                          <span className="block font-semibold">
                            {permission.code}
                          </span>
                          <span className="text-muted-foreground">
                            {permission.description}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingRole(null)}
            >
              Cancel
            </Button>
            <LoadingButton
              loading={
                updateRolePermissionsMutation.isPending ||
                rolePermissionsQuery.isLoading
              }
              onClick={() => updateRolePermissionsMutation.mutate()}
            >
              Save permissions
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CompanyManagement
