import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { UsersService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import type { AdminUserDetail } from "@/modules/admin/adminUsersApi"
import { handleError } from "@/utils"

type Props = { user: AdminUserDetail }

export default function InfoTab({ user }: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [email, setEmail] = useState(user.email)
  const [fullName, setFullName] = useState(user.full_name ?? "")
  const [password, setPassword] = useState("")
  const [isActive, setIsActive] = useState(user.is_active)
  const [isSuperuser, setIsSuperuser] = useState(user.is_superuser)

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        email,
        full_name: fullName,
        is_active: isActive,
        is_superuser: isSuperuser,
      }
      if (password) body.password = password
      return UsersService.updateUser({
        userId: user.id,
        requestBody: body as never,
      })
    },
    onSuccess: async () => {
      showSuccessToast("Cập nhật thông tin thành công")
      setPassword("")
      await qc.invalidateQueries({ queryKey: ["admin", "users"] })
      await qc.invalidateQueries({ queryKey: ["admin", "user-detail", user.id] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin cơ bản</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Họ và tên</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Đổi mật khẩu (để trống nếu không đổi)</Label>
          <Input
            type="password"
            placeholder="Mật khẩu mới"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-6 md:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isActive}
              onCheckedChange={(v) => setIsActive(Boolean(v))}
            />
            Đang hoạt động
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isSuperuser}
              onCheckedChange={(v) => setIsSuperuser(Boolean(v))}
            />
            Superuser
          </label>
        </div>
        <div className="flex justify-end md:col-span-2">
          <Button variant="outline" className="mr-2" onClick={() => {
            setEmail(user.email)
            setFullName(user.full_name ?? "")
            setPassword("")
            setIsActive(user.is_active)
            setIsSuperuser(user.is_superuser)
          }}>
            Hoàn tác
          </Button>
          <LoadingButton
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Lưu thay đổi
          </LoadingButton>
        </div>
      </CardContent>
    </Card>
  )
}
