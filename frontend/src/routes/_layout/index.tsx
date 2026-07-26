import { createFileRoute, redirect } from "@tanstack/react-router"

import { ApiError, UsersService } from "@/client"
import { DetailProvider } from "@/components/demo/detail"
import { LiveOverview } from "@/components/demo/live"
import { clearSession } from "@/modules/auth/tokenStore"
import { readMyPermissions } from "@/modules/rbac/rbacApi"
import { canAccessDashboard } from "@/utils/accountAccess"

export const Route = createFileRoute("/_layout/")({
  beforeLoad: async () => {
    let permissions
    let me
    try {
      ;[permissions, me] = await Promise.all([
        readMyPermissions(),
        UsersService.readUserMe(),
      ])
    } catch (errorValue) {
      if (errorValue instanceof ApiError && errorValue.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw errorValue
    }
    const allowed = Boolean(me?.is_superuser) || canAccessDashboard(permissions)
    if (!allowed) {
      throw redirect({ to: "/tasks" })
    }
  },
  component: DashboardPage,
  head: () => ({
    meta: [{ title: "Tổng quan quản lý" }],
  }),
})

function DashboardPage() {
  return (
    <DetailProvider>
      <div className="mx-auto w-full max-w-lg px-2 pb-10 pt-4 md:max-w-6xl md:px-4">
        <LiveOverview />
      </div>
    </DetailProvider>
  )
}
