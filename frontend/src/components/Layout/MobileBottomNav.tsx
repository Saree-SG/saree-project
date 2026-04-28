import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import { ClipboardList, Menu, Settings } from "lucide-react"
import { useMemo, useState } from "react"

import { RolesService } from "@/client"
import {
  buildMobileBottomNavItems,
  isLayoutNavItemActive,
  type LayoutNavItem,
} from "@/config/layoutNav"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  canAccessContract,
  canAccessDashboard,
  canAccessInventory,
  canAccessProcurement,
  canAccessQuotation,
  canAccessSupplier,
  isCompanyDirector,
  isManagementUser,
} from "@/utils/accountAccess"

/**
 * Fixed bottom tab bar for small screens; mirrors primary routes plus Cài đặt.
 */
export function MobileBottomNav() {
  const { user: currentUser } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const profileQuery = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser) && isLoggedIn(),
  })

  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []
  const showManagement =
    Boolean(currentUser?.is_superuser) ||
    isManagementUser(profileQuery.data) ||
    canAccessDashboard(permissions)
  const showCompanyManagement = isCompanyDirector(profileQuery.data)
  const showQuotations =
    Boolean(currentUser?.is_superuser) || canAccessQuotation(permissions)

  const showSuppliers =
    Boolean(currentUser?.is_superuser) || canAccessSupplier(permissions)

  const showContracts =
    Boolean(currentUser?.is_superuser) || canAccessContract(permissions)

  const showProcurement =
    Boolean(currentUser?.is_superuser) || canAccessProcurement(permissions)

  const showInventory =
    Boolean(currentUser?.is_superuser) || canAccessInventory(permissions)

  const items = buildMobileBottomNavItems(
    Boolean(currentUser?.is_superuser),
    showManagement,
    showCompanyManagement,
    showQuotations,
    showSuppliers,
    showContracts,
    showProcurement,
    showInventory,
  )
  const visibleItems = items.length
    ? items
    : [
        { icon: ClipboardList, title: "Công việc", path: "/tasks", matchPrefix: true },
        { icon: Settings, title: "Cài đặt", path: "/settings" },
      ]
  const primaryItems = useMemo(() => visibleItems.slice(0, 3), [visibleItems])
  const overflowItems = useMemo(() => visibleItems.slice(3), [visibleItems])
  const overflowActive = useMemo(
    () => overflowItems.some((item) => isLayoutNavItemActive(item, pathname)),
    [overflowItems, pathname],
  )

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-60 block border-t bg-background shadow-[0_-2px_10px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)] md:hidden",
        )}
        aria-label="Điều hướng chính"
      >
        <div className="grid h-14 grid-cols-4 gap-0.5 px-1">
          {primaryItems.map((item) => {
            const active = isLayoutNavItemActive(item, pathname)
            return (
              <RouterLink
                key={item.path + item.title}
                to={item.path}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-5 shrink-0" aria-hidden />
                <span className="max-w-full truncate">{item.title}</span>
              </RouterLink>
            )
          })}

          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition-colors",
              overflowActive || moreOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setMoreOpen(true)}
            aria-label="Mở thêm mục điều hướng"
          >
            <Menu className="size-5 shrink-0" aria-hidden />
            <span className="max-w-full truncate">Thêm</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[70dvh] rounded-t-2xl p-0 md:hidden">
          <SheetHeader className="border-b pb-3">
            <SheetTitle>Điều hướng khác</SheetTitle>
          </SheetHeader>
          <div className="space-y-1 p-3">
            {overflowItems.map((item: LayoutNavItem) => {
              const active = isLayoutNavItemActive(item, pathname)
              return (
                <RouterLink
                  key={`more-${item.path}-${item.title}`}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => setMoreOpen(false)}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.title}</span>
                </RouterLink>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
