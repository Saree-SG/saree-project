import { createFileRoute, redirect } from "@tanstack/react-router"

import { ApiError, UsersService } from "@/client"
import CompanyManagement from "@/components/Admin/CompanyManagement"
import { clearSession } from "@/modules/auth/tokenStore"
import { readMyPermissions } from "@/modules/rbac/rbacApi"
import { canManageCompany } from "@/utils/accountAccess"

export const Route = createFileRoute("/_layout/company")({
  beforeLoad: async () => {
    let permissions: string[]
    let isSuperuser = false
    try {
      ;[permissions] = await Promise.all([
        readMyPermissions(),
        UsersService.readUserMe().then((u) => { isSuperuser = Boolean(u.is_superuser) }),
      ])
    } catch (errorValue) {
      if (errorValue instanceof ApiError && errorValue.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw errorValue
    }
    const allowed = isSuperuser || canManageCompany(permissions)
    if (!allowed) {
      throw redirect({ to: "/" })
    }
  },
  component: CompanyPage,
})

function CompanyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quản lý công ty</h1>
        <p className="text-muted-foreground">
          Giám đốc có thể cập nhật công ty, thiết lập roles/phòng ban.
        </p>
      </div>
      <CompanyManagement />
    </div>
  )
}
