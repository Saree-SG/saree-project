import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { RolesService } from "@/client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import {
  type AdminUserMembership,
  addUserMembership,
  updateUserMembership,
} from "@/modules/admin/adminUsersApi"
import { listDepartments } from "@/modules/org/departmentApi"
import { handleError } from "@/utils"

const NONE = "__none__"

type Props = {
  open: boolean
  onClose: () => void
  userId: string
  /** When provided, dialog edits existing membership; otherwise it creates */
  editing?: AdminUserMembership | null
  /** Current user.department_id (for edit pre-fill) */
  currentDepartmentId?: string | null
}

export default function MembershipDialog({
  open,
  onClose,
  userId,
  editing,
  currentDepartmentId,
}: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isEdit = Boolean(editing)

  const [companyId, setCompanyId] = useState<string>("")
  const [roleId, setRoleId] = useState<string>("")
  const [departmentId, setDepartmentId] = useState<string>(NONE)
  const [isPrimary, setIsPrimary] = useState<boolean>(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setCompanyId(editing.company_id)
      setRoleId(editing.role_id)
      setDepartmentId(currentDepartmentId ?? NONE)
      setIsPrimary(editing.is_primary)
    } else {
      setCompanyId("")
      setRoleId("")
      setDepartmentId(NONE)
      setIsPrimary(false)
    }
  }, [open, editing, currentDepartmentId])

  const { data: companies = [] } = useQuery({
    queryKey: ["roles", "companies"],
    queryFn: () => RolesService.listCompanies(),
    enabled: open,
  })

  const { data: roles = [] } = useQuery({
    queryKey: ["roles", "catalog", companyId],
    queryFn: () => RolesService.listCompanyRoles({ companyId }),
    enabled: open && Boolean(companyId),
  })

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", companyId],
    queryFn: () => listDepartments(companyId),
    enabled: open && Boolean(companyId),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit && editing) {
        return updateUserMembership(userId, editing.company_id, {
          role_id: roleId !== editing.role_id ? roleId : null,
          department_id: departmentId === NONE ? null : departmentId,
          clear_department: departmentId === NONE,
          is_primary: isPrimary !== editing.is_primary ? isPrimary : null,
        })
      }
      return addUserMembership(userId, {
        company_id: companyId,
        role_id: roleId,
        department_id: departmentId === NONE ? null : departmentId,
        is_primary: isPrimary,
      })
    },
    onSuccess: async () => {
      showSuccessToast(
        isEdit ? "Đã cập nhật vai trò" : "Đã thêm vai trò trong công ty",
      )
      await qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] })
      await qc.invalidateQueries({ queryKey: ["admin", "users"] })
      onClose()
    },
    onError: handleError.bind(showErrorToast),
  })

  const canSave = Boolean(companyId) && Boolean(roleId) && !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Cập nhật vai trò trong công ty" : "Thêm vai trò"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1">
            <Label>Công ty</Label>
            <Select
              value={companyId}
              onValueChange={(v) => {
                setCompanyId(v)
                setRoleId("")
                setDepartmentId(NONE)
              }}
              disabled={isEdit}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn công ty" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Vai trò</Label>
            <Select
              value={roleId}
              onValueChange={setRoleId}
              disabled={!companyId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id as string}>
                    {r.display_name} · L{r.level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Phòng ban</Label>
            <Select
              value={departmentId}
              onValueChange={setDepartmentId}
              disabled={!companyId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn phòng ban" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Không gán —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isPrimary}
              onCheckedChange={(v) => setIsPrimary(Boolean(v))}
            />
            Đặt làm vai trò chính
          </label>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={mutation.isPending}>
              Huỷ
            </Button>
          </DialogClose>
          <LoadingButton
            loading={mutation.isPending}
            disabled={!canSave}
            onClick={() => mutation.mutate()}
          >
            Lưu
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
