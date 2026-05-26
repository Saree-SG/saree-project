import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { type CompanyPublic, RolesService } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

type Props = { company: CompanyPublic }

export default function CompanyInfoTab({ company }: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [name, setName] = useState(company.name)

  useEffect(() => {
    setName(company.name)
  }, [company.id, company.name])

  const mutation = useMutation({
    mutationFn: () =>
      RolesService.updateCompany({
        companyId: company.id,
        requestBody: { name: name.trim() },
      }),
    onSuccess: async () => {
      showSuccessToast("Đã cập nhật công ty")
      await qc.invalidateQueries({ queryKey: ["roles", "companies"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin công ty</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Tên công ty</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Slug</Label>
          <Input value={company.slug} disabled />
        </div>
        <div className="space-y-1">
          <Label>Trạng thái</Label>
          <Input value={company.is_active ? "Active" : "Inactive"} disabled />
        </div>
        <div className="flex items-end justify-end md:col-span-2">
          <LoadingButton
            loading={mutation.isPending}
            disabled={!name.trim() || name.trim() === company.name}
            onClick={() => mutation.mutate()}
          >
            Lưu thay đổi
          </LoadingButton>
        </div>
      </CardContent>
    </Card>
  )
}
