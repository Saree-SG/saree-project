import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Building2, Gauge, LayoutGrid, Trophy, Users } from "lucide-react"
import { useState } from "react"

import { ApiError, UsersService } from "@/client"
import CompanyOrgPanel from "@/components/Company/CompanyOrgPanel"
import CompanyOverviewPanel from "@/components/Company/CompanyOverviewPanel"
import ProductivityPanel from "@/components/Company/ProductivityPanel"
import YearSummaryPanel from "@/components/Company/YearSummaryPanel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { clearSession } from "@/modules/auth/tokenStore"
import { listMyCompanies, readMyPermissions } from "@/modules/rbac/rbacApi"
import { canAccessDashboard, canManageCompany } from "@/utils/accountAccess"

export const Route = createFileRoute("/_layout/company")({
  beforeLoad: async () => {
    let permissions: string[]
    let isSuperuser = false
    try {
      ;[permissions] = await Promise.all([
        readMyPermissions(),
        UsersService.readUserMe().then((u) => {
          isSuperuser = Boolean(u.is_superuser)
        }),
      ])
    } catch (errorValue) {
      if (errorValue instanceof ApiError && errorValue.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw errorValue
    }
    // Manager (company admin) OR report viewer can open the company detail —
    // each tab is gated individually inside the page.
    const allowed =
      isSuperuser ||
      canManageCompany(permissions) ||
      canAccessDashboard(permissions)
    if (!allowed) {
      throw redirect({ to: "/" })
    }
  },
  component: CompanyPage,
})

function CompanyPage() {
  const { user } = useAuth()
  const isSuperuser = Boolean(user?.is_superuser)
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []

  const canManage = isSuperuser || canManageCompany(permissions)
  const canReport = isSuperuser || canAccessDashboard(permissions)

  // One company selector for the whole page — every tab scopes to it.
  const companiesQuery = useQuery({
    queryKey: ["my-companies"],
    queryFn: listMyCompanies,
    enabled: canManage,
  })
  const companies = companiesQuery.data ?? []
  const [companyId, setCompanyId] = useState<string | null>(null)
  const selectedId = companyId ?? companies[0]?.id ?? null
  const company = companies.find((c) => c.id === selectedId) ?? null

  // Default to the first available tab the user is allowed to see.
  const defaultTab = canManage ? "overview" : "productivity"

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="text-primary size-6" /> Chi tiết công ty
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tổng quan tổ chức, phòng ban, vai trò và năng suất nhân sự — tất cả
            ở một nơi.
          </p>
        </div>
        {canManage && companies.length > 0 ? (
          <Select
            value={selectedId ?? ""}
            onValueChange={(v) => setCompanyId(v)}
          >
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
        ) : null}
      </div>

      <Tabs defaultValue={defaultTab} className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {canManage ? (
            <>
              <TabsTrigger value="overview" className="flex-none px-3">
                <LayoutGrid className="mr-1" /> Tổng quan
              </TabsTrigger>
              <TabsTrigger value="org" className="flex-none px-3">
                <Users className="mr-1" /> Phòng ban &amp; Nhân sự
              </TabsTrigger>
            </>
          ) : null}
          {canReport ? (
            <>
              <TabsTrigger value="productivity" className="flex-none px-3">
                <Gauge className="mr-1" /> Năng suất tháng
              </TabsTrigger>
              <TabsTrigger value="year" className="flex-none px-3">
                <Trophy className="mr-1" /> Năng suất năm
              </TabsTrigger>
            </>
          ) : null}
        </TabsList>

        {canManage ? (
          <>
            <TabsContent value="overview">
              <CompanyOverviewPanel company={company} />
            </TabsContent>
            <TabsContent value="org">
              <CompanyOrgPanel company={company} />
            </TabsContent>
          </>
        ) : null}
        {canReport ? (
          <>
            <TabsContent value="productivity">
              <ProductivityPanel />
            </TabsContent>
            <TabsContent value="year">
              <YearSummaryPanel />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  )
}
