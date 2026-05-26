import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { type CompanyPublic, RolesService } from "@/client"
import UserDepartmentAssign from "@/components/Admin/UserDepartmentAssign"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  type CompanyMember,
  listCompanyMembers,
  removeCompanyMemberRole,
  updateCompanyMemberRole,
} from "@/modules/rbac/rbacApi"
import { handleError } from "@/utils"

type Props = { company: CompanyPublic }

export default function CompanyMembersTab({ company }: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [draft, setDraft] = useState<Record<string, string>>({})

  const { data: members = [] } = useQuery({
    queryKey: ["roles", "company-members", company.id],
    queryFn: () => listCompanyMembers(company.id),
  })

  const { data: roles = [] } = useQuery({
    queryKey: ["roles", "catalog", company.id],
    queryFn: () => RolesService.listCompanyRoles({ companyId: company.id }),
  })

  const updateMutation = useMutation({
    mutationFn: (p: {
      member: CompanyMember
      newRoleId: string
      isPrimary: boolean
    }) =>
      updateCompanyMemberRole({
        companyId: company.id,
        userId: p.member.user_id,
        currentRoleId: p.member.role_id,
        newRoleId: p.newRoleId,
        isPrimary: p.isPrimary,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật thành viên")
      await qc.invalidateQueries({
        queryKey: ["roles", "company-members", company.id],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const removeMutation = useMutation({
    mutationFn: (m: CompanyMember) =>
      removeCompanyMemberRole({
        companyId: company.id,
        userId: m.user_id,
        roleId: m.role_id,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã gỡ thành viên khỏi vai trò")
      await qc.invalidateQueries({
        queryKey: ["roles", "company-members", company.id],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nhân viên trong công ty ({members.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ tên</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Chính</TableHead>
              <TableHead>Phòng ban</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Công ty chưa có thành viên.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => {
                const key = `${m.user_id}-${m.role_id}`
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium">
                      {m.full_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">L{m.role_level}</Badge>
                        <Select
                          value={draft[key] ?? m.role_id}
                          onValueChange={(v) =>
                            setDraft((cur) => ({ ...cur, [key]: v }))
                          }
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roles
                              .filter((r) => Boolean(r.id))
                              .map((r) => (
                                <SelectItem
                                  key={r.id}
                                  value={r.id as string}
                                >
                                  {r.display_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                    <TableCell>
                      <UserDepartmentAssign
                        companyId={company.id}
                        userId={m.user_id}
                        currentDepartmentId={m.department_id}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <LoadingButton
                          size="sm"
                          variant="outline"
                          loading={updateMutation.isPending}
                          onClick={() =>
                            updateMutation.mutate({
                              member: m,
                              newRoleId: draft[key] ?? m.role_id,
                              isPrimary: m.is_primary,
                            })
                          }
                        >
                          Lưu vai trò
                        </LoadingButton>
                        {!m.is_primary ? (
                          <LoadingButton
                            size="sm"
                            variant="outline"
                            loading={updateMutation.isPending}
                            onClick={() =>
                              updateMutation.mutate({
                                member: m,
                                newRoleId: m.role_id,
                                isPrimary: true,
                              })
                            }
                          >
                            Đặt chính
                          </LoadingButton>
                        ) : null}
                        <LoadingButton
                          size="sm"
                          variant="destructive"
                          loading={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(m)}
                        >
                          Gỡ
                        </LoadingButton>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
