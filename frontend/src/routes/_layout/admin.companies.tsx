import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { type CompanyPublic, RolesService } from "@/client"
import CompaniesList from "@/components/Admin/Companies/CompaniesList"
import CompanyDepartmentsTab from "@/components/Admin/Companies/CompanyDepartmentsTab"
import CompanyInfoTab from "@/components/Admin/Companies/CompanyInfoTab"
import CompanyMembersTab from "@/components/Admin/Companies/CompanyMembersTab"
import CompanyRolesTab from "@/components/Admin/Companies/CompanyRolesTab"
import CreateCompany from "@/components/Admin/CreateCompany"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const Route = createFileRoute("/_layout/admin/companies")({
  component: AdminCompanies,
})

function AdminCompanies() {
  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["roles", "companies"],
    queryFn: () => RolesService.listCompanies(),
  })
  const [selected, setSelected] = useState<CompanyPublic | null>(null)

  useEffect(() => {
    if (!selected && companies.length > 0) {
      setSelected(companies[0])
    }
    if (selected) {
      const refreshed = companies.find((c) => c.id === selected.id)
      if (refreshed && refreshed !== selected) setSelected(refreshed)
    }
  }, [companies, selected])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Công ty & Phân quyền
          </h1>
          <p className="text-muted-foreground">
            Quản lý công ty, vai trò, phòng ban và thành viên.
          </p>
        </div>
        <CreateCompany />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Danh sách công ty
          </h2>
          {isLoading ? (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              Đang tải...
            </div>
          ) : (
            <CompaniesList
              companies={companies}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          )}
        </div>

        <div>
          {!selected ? (
            <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
              Chọn một công ty để xem chi tiết.
            </div>
          ) : (
            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Thông tin</TabsTrigger>
                <TabsTrigger value="roles">Vai trò</TabsTrigger>
                <TabsTrigger value="departments">Phòng ban</TabsTrigger>
                <TabsTrigger value="members">Thành viên</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="mt-4">
                <CompanyInfoTab company={selected} />
              </TabsContent>
              <TabsContent value="roles" className="mt-4">
                <CompanyRolesTab company={selected} />
              </TabsContent>
              <TabsContent value="departments" className="mt-4">
                <CompanyDepartmentsTab company={selected} />
              </TabsContent>
              <TabsContent value="members" className="mt-4">
                <CompanyMembersTab company={selected} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  )
}
