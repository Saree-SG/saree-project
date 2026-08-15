import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import axios from "axios"
import { Download } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { type CompanyPublic, OpenAPI, RolesService } from "@/client"
import OrgChart from "@/components/Admin/Organization/OrgChart"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { getAccessToken } from "@/modules/auth/tokenStore"
import { getOrgTree } from "@/modules/org/orgTreeApi"

export const Route = createFileRoute("/_layout/admin/organization")({
  component: AdminOrganization,
})

function AdminOrganization() {
  const [companyId, setCompanyId] = useState<string>("")
  const [exporting, setExporting] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const exportPng = async () => {
    if (!chartRef.current) return
    setExporting(true)
    try {
      const { toPng } = await import("html-to-image")
      const dataUrl = await toPng(chartRef.current, {
        cacheBust: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      })
      const link = document.createElement("a")
      link.download = `org-chart-${Date.now()}.png`
      link.href = dataUrl
      link.click()
      showSuccessToast("Đã tải file PNG")
    } catch (err) {
      showErrorToast("Xuất PNG thất bại")
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  const { user } = useAuth()
  const isSuperuser = Boolean(user?.is_superuser)
  const { data: companies = [] } = useQuery({
    queryKey: ["roles", isSuperuser ? "companies" : "my-companies"],
    queryFn: async () => {
      if (isSuperuser) return RolesService.listCompanies()
      const res = await axios.get<CompanyPublic[]>(
        `${OpenAPI.BASE}/api/v1/roles/my-companies`,
        { headers: { Authorization: `Bearer ${getAccessToken() || ""}` } },
      )
      return res.data
    },
  })

  useEffect(() => {
    if (!companyId && companies.length > 0) {
      setCompanyId(companies[0].id)
    }
  }, [companies, companyId])

  const {
    data: tree,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["roles", "org-tree", companyId],
    queryFn: () => getOrgTree({ companyId }),
    enabled: Boolean(companyId),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sơ đồ tổ chức</h1>
          <p className="text-muted-foreground">
            Cây vị trí công ty theo phòng ban và vai trò.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-64">
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
          <Button
            variant="outline"
            disabled={!tree || exporting}
            onClick={exportPng}
          >
            <Download className="mr-1 h-4 w-4" />
            {exporting ? "Đang xuất..." : "Xuất PNG"}
          </Button>
        </div>
      </div>

      {!companyId ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          Chọn công ty để xem sơ đồ.
        </div>
      ) : isLoading ? (
        <div className="rounded-md border p-10 text-center text-muted-foreground">
          Đang tải sơ đồ...
        </div>
      ) : error || !tree ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Không tải được sơ đồ tổ chức.
        </div>
      ) : tree.departments.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          Công ty này chưa có phòng ban hoặc thành viên.
        </div>
      ) : (
        <OrgChart ref={chartRef} data={tree} />
      )}
    </div>
  )
}
