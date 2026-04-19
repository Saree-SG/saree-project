import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"

import { RolesService } from "@/client"
import {
  buildMobileBottomNavItems,
  isLayoutNavItemActive,
} from "@/config/layoutNav"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { isCompanyDirector, isManagementUser } from "@/utils/accountAccess"

/**
 * Fixed bottom tab bar for small screens; mirrors primary routes plus Cài đặt.
 */
export function MobileBottomNav() {
  const { user: currentUser } = useAuth()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const profileQuery = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser) && isLoggedIn(),
  })

  const showManagement =
    Boolean(currentUser?.is_superuser) || isManagementUser(profileQuery.data)

  const showCompanyManagement = isCompanyDirector(profileQuery.data)

  const items = buildMobileBottomNavItems(
    Boolean(currentUser?.is_superuser),
    showManagement,
    showCompanyManagement,
  )

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden",
      )}
      aria-label="Điều hướng chính"
    >
      <div className="flex h-14 items-stretch justify-around gap-0.5 px-1">
        {items.map((item) => {
          const active = isLayoutNavItemActive(item, pathname)
          return (
            <RouterLink
              key={item.path + item.title}
              to={item.path}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition-colors",
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
      </div>
    </nav>
  )
}
