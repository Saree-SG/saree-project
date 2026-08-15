import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  type AdminUserDetail,
  type AdminUserMembership,
  deleteUserMembership,
} from "@/modules/admin/adminUsersApi"
import { handleError } from "@/utils"

import MembershipDialog from "./MembershipDialog"

type Props = { user: AdminUserDetail }

export default function MembershipTab({ user }: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUserMembership | null>(null)

  const removeMutation = useMutation({
    mutationFn: (companyId: string) => deleteUserMembership(user.id, companyId),
    onSuccess: async () => {
      showSuccessToast("Đã xoá vai trò khỏi công ty")
      await qc.invalidateQueries({
        queryKey: ["admin", "user-detail", user.id],
      })
      await qc.invalidateQueries({ queryKey: ["admin", "users"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Vai trò & Phòng ban</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Thêm vai trò
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Công ty</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Phòng ban</TableHead>
              <TableHead>Chính</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {user.memberships.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Người dùng chưa được gán vào công ty nào.
                </TableCell>
              </TableRow>
            ) : (
              user.memberships.map((m) => (
                <TableRow key={`${m.company_id}-${m.role_id}`}>
                  <TableCell>
                    <Badge variant="secondary">{m.company_name}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{m.role_display_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Level {m.role_level}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.is_primary && user.department_name ? (
                      <Badge variant="outline">{user.department_name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.is_primary ? (
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                        Chính
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(m)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={removeMutation.isPending}
                      onClick={() => {
                        if (confirm("Xoá vai trò này khỏi công ty?")) {
                          removeMutation.mutate(m.company_id)
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <MembershipDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        userId={user.id}
        editing={editing}
        currentDepartmentId={editing?.is_primary ? user.department_id : null}
      />
    </Card>
  )
}
