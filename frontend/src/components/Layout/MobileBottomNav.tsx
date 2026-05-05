import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { useState } from "react"

import { RolesService } from "@/client"
import { buildMobileBottomNavItems, isLayoutNavItemActive, type LayoutNavItem } from "@/config/layoutNav"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { cn } from "@/lib/utils"
import {
  canAccessContract,
  canAccessDashboard,
  canAccessMaterialRequest,
  canAccessProject,
  canAccessQuotation,
  isCompanyDirector,
  isManagementUser,
} from "@/utils/accountAccess"

export function MobileBottomNav() {
  const { user: currentUser } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const profileQuery = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser) && isLoggedIn(),
  })
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []

  const isSuperuser = Boolean(currentUser?.is_superuser)

  const allItems: LayoutNavItem[] = buildMobileBottomNavItems(
    isSuperuser,
    isSuperuser || isManagementUser(profileQuery.data) || canAccessDashboard(permissions),
    isCompanyDirector(profileQuery.data),
    isSuperuser || canAccessProject(permissions),
    isSuperuser || canAccessQuotation(permissions),
    isSuperuser || canAccessContract(permissions),
    isSuperuser || canAccessMaterialRequest(permissions),
  )

  const tabItems = allItems.slice(0, 3)
  const drawerItems = allItems.slice(3)
  const drawerHasActive = drawerItems.some((i) => isLayoutNavItemActive(i, pathname))

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-60 block border-t bg-background shadow-[0_-2px_10px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)] md:hidden">
        <div className="grid h-14 grid-cols-4 px-1">
          {tabItems.map((item) => (
            <RouterLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold transition-colors",
                isLayoutNavItemActive(item, pathname) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-5 shrink-0" />
              <span className="max-w-full truncate">{item.title}</span>
            </RouterLink>
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold transition-colors",
              drawerHasActive || moreOpen ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Menu className="size-5 shrink-0" />
            <span>Thêm</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-70 bg-black/50"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-80 rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom,0px)]">
            <div className="border-b px-4 py-3">
              <p className="font-semibold text-foreground">Điều hướng khác</p>
            </div>
            <div className="p-3 space-y-1">
              {drawerItems.map((item) => (
                <RouterLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    isLayoutNavItemActive(item, pathname)
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span>{item.title}</span>
                </RouterLink>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
