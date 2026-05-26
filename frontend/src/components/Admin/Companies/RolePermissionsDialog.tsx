import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { RolePermissionEditor } from "@/components/Admin/RolePermissionEditor"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import {
  assignRolePermissions,
  listPermissionsCatalog,
  readRolePermissions,
} from "@/modules/rbac/rbacApi"
import { handleError } from "@/utils"

type Props = {
  open: boolean
  onClose: () => void
  roleId: string | null
  roleDisplayName: string
}

export default function RolePermissionsDialog({
  open,
  onClose,
  roleId,
  roleDisplayName,
}: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: catalog = [] } = useQuery({
    queryKey: ["roles", "permissions-catalog"],
    queryFn: listPermissionsCatalog,
    enabled: open,
  })

  const permissionsQuery = useQuery({
    queryKey: ["roles", "role-permissions", roleId ?? ""],
    queryFn: () => readRolePermissions(roleId ?? ""),
    enabled: open && Boolean(roleId),
  })

  useEffect(() => {
    if (permissionsQuery.data) {
      setSelected(new Set(permissionsQuery.data))
    }
  }, [permissionsQuery.data])

  const mutation = useMutation({
    mutationFn: () =>
      assignRolePermissions({
        roleId: roleId ?? "",
        permissionCodes: Array.from(selected),
      }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật quyền")
      await qc.invalidateQueries({
        queryKey: ["roles", "role-permissions", roleId ?? ""],
      })
      onClose()
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Phân quyền cho vai trò</DialogTitle>
          <DialogDescription>
            {`Cấu hình quyền cho "${roleDisplayName}". Hover (i) để xem chi tiết quyền.`}
          </DialogDescription>
        </DialogHeader>
        {permissionsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Đang tải danh sách quyền...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <RolePermissionEditor
              catalog={catalog}
              selected={selected}
              onChange={setSelected}
              maxHeightClass="max-h-[55vh]"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <LoadingButton
            loading={mutation.isPending || permissionsQuery.isLoading}
            onClick={() => mutation.mutate()}
          >
            Lưu quyền
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
