import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { useState } from "react"

import { ApiError, RolesService, UsersService } from "@/client"
import AdminSidebar from "@/components/Admin/AdminSidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { clearSession } from "@/modules/auth/tokenStore"

export const Route = createFileRoute("/_layout/admin")({
  component: AdminLayout,
  beforeLoad: async () => {
    let user
    try {
      user = await UsersService.readUserMe()
    } catch (errorValue) {
      if (errorValue instanceof ApiError && errorValue.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw errorValue
    }

    if (user.is_superuser) {
      return { isSuperuser: true }
    }

    // Allow board directors (any role with level 1) to access /admin/organization
    try {
      const profile = await RolesService.myAccountProfile()
      const isDirector = profile.memberships.some((m) => m.role_level === 1)
      if (isDirector) return { isSuperuser: false }
    } catch {
      // ignore — fall through to redirect
    }
    throw redirect({ to: "/" })
  },
  head: () => ({
    meta: [{ title: "Admin - Saree" }],
  }),
})

function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm">
              <Menu className="h-5 w-5" />
              <span className="ml-2 font-semibold">Admin</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <AdminSidebar embedded onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
