import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

import { type CompanyPublic, RolesService } from "@/client"
import {
  LocationPicker,
  type LocationValue,
} from "@/components/Common/LocationPicker"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import useCustomToast from "@/hooks/useCustomToast"
import { setCompanySiteLocation } from "@/modules/attendance/attendanceApi"

/**
 * Manage the tenant's own companies ("công ty của tôi"): rename them and set the
 * site location used for "by-company" attendance check-in. Companies here are
 * tenants (the Company table), not customer-directory rows.
 */
export default function OwnCompaniesPanel() {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const companiesQuery = useQuery({
    queryKey: ["roles", "companies"],
    queryFn: () => RolesService.listCompanies(),
  })
  const companies = companiesQuery.data ?? []

  const [companyId, setCompanyId] = useState<string>("")
  const selectedId = companyId || companies[0]?.id || ""
  const selected: CompanyPublic | undefined = useMemo(
    () => companies.find((c) => c.id === selectedId),
    [companies, selectedId],
  )

  const [name, setName] = useState("")
  const [location, setLocation] = useState<LocationValue>({
    lat: null,
    lng: null,
    radiusM: 150,
  })

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setLocation({
      lat: selected.site_lat ?? null,
      lng: selected.site_lng ?? null,
      radiusM: selected.site_radius_m ?? 150,
    })
  }, [selected])

  const saveNameMutation = useMutation({
    mutationFn: () =>
      RolesService.updateCompany({
        companyId: selectedId,
        requestBody: { name: name.trim() },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles", "companies"] })
      qc.invalidateQueries({ queryKey: ["my-companies"] })
      showSuccessToast("Đã cập nhật tên công ty")
    },
    onError: (e: any) =>
      showErrorToast(e?.body?.detail ?? e?.message ?? "Lưu thất bại"),
  })

  const saveLocationMutation = useMutation({
    mutationFn: () => {
      if ((location.lat === null) !== (location.lng === null))
        throw new Error("Cần nhập cả vĩ độ và kinh độ")
      if ((location.radiusM ?? 0) < 10)
        throw new Error("Bán kính tối thiểu 10m")
      return setCompanySiteLocation({
        companyId: selectedId,
        siteLat: location.lat,
        siteLng: location.lng,
        siteRadiusM: location.radiusM || 150,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles", "companies"] })
      qc.invalidateQueries({ queryKey: ["attendance-companies"] })
      showSuccessToast("Đã lưu vị trí công ty")
    },
    onError: (e: any) =>
      showErrorToast(e?.response?.data?.detail ?? e?.message ?? "Lưu thất bại"),
  })

  if (companiesQuery.isLoading) {
    return <p className="text-muted-foreground text-sm">Đang tải…</p>
  }
  if (companies.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Chưa có công ty nào. Liên hệ quản trị viên để tạo công ty.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <Select value={selectedId} onValueChange={setCompanyId}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder="Chọn công ty" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {c.site_lat != null ? " ✓" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin công ty</CardTitle>
              <CardDescription>Mã định danh: {selected.slug}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Tên công ty</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <LoadingButton
                loading={saveNameMutation.isPending}
                disabled={!name.trim() || name.trim() === selected.name}
                onClick={() => saveNameMutation.mutate()}
              >
                Lưu tên
              </LoadingButton>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Vị trí công ty (chấm công)
              </CardTitle>
              <CardDescription>
                Đặt toạ độ trụ sở và bán kính cho phép chấm công theo công ty.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <LocationPicker value={location} onChange={setLocation} />
              <LoadingButton
                className="w-full"
                loading={saveLocationMutation.isPending}
                onClick={() => saveLocationMutation.mutate()}
              >
                Lưu vị trí công ty
              </LoadingButton>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
