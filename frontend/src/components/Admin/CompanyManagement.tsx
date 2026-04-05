import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useState } from "react"

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
import { handleError } from "@/utils"

const DEFAULT_POLICY_DOC = `{
  "task": {
    "create": true,
    "update": true,
    "delete": false,
    "approve": false
  },
  "project": {
    "view_all": true,
    "manage_members": false
  },
  "report": {
    "view_team": true,
    "view_all": false
  }
}`

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
  const [rolePolicyDoc, setRolePolicyDoc] = useState(DEFAULT_POLICY_DOC)

  const { data: companyRoles } = useQuery({
    queryKey: ["roles", "catalog", editingCompany?.id || ""],
    queryFn: () =>
      RolesService.listCompanyRoles({ companyId: editingCompany?.id || "" }),
    enabled: Boolean(editingCompany?.id),
  })

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
    mutationFn: (payload: {
      companyId: string
      roleName: string
      roleDisplayName: string
      roleLevel: number
      roleDescription: string
      rolePolicyDoc: string
    }) => {
      let parsedPolicyDoc: unknown | null = null
      if (payload.rolePolicyDoc.trim()) {
        parsedPolicyDoc = JSON.parse(payload.rolePolicyDoc)
      }
      return RolesService.createRole({
        companyId: payload.companyId,
        requestBody: {
          name: payload.roleName,
          display_name: payload.roleDisplayName,
          level: payload.roleLevel,
          description: payload.roleDescription || null,
          policy_doc: parsedPolicyDoc as any,
        },
      })
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
      setRolePolicyDoc(DEFAULT_POLICY_DOC)
    },
    onError: handleError.bind(showErrorToast),
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
              Update company info and define role logic per feature/action in
              one place.
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
                Define role logic clearly by feature/action. Example:
                task.create, task.delete, project.manage_members.
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
                  <p className="text-xs font-medium mb-1">
                    Role Logic (JSON policy doc)
                  </p>
                  <textarea
                    className="w-full rounded-md border p-2 text-xs font-mono min-h-44"
                    aria-label="Role logic policy document JSON"
                    placeholder="Paste role logic JSON policy"
                    value={rolePolicyDoc}
                    onChange={(event) => setRolePolicyDoc(event.target.value)}
                  />
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
                        rolePolicyDoc,
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
    </div>
  )
}

export default CompanyManagement
