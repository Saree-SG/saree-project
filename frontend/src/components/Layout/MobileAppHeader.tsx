import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { ChevronLeft, HelpCircle } from "lucide-react"

import { RolesService } from "@/client"
import { ReleaseNotesBell } from "@/components/Common/ReleaseNotesBell"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import useAuth from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { APP_VERSION_SHORT } from "@/utils/appVersion"

type Crumb = { label: string; to?: string }

/**
 * Derives breadcrumb trail labels and optional parent links from the URL path.
 */
function computeBreadcrumbs(pathname: string): Crumb[] {
  const normalized =
    pathname.endsWith("/") && pathname.length > 1
      ? pathname.slice(0, -1)
      : pathname

  if (normalized === "" || normalized === "/") {
    return [{ label: "Tổng quan" }]
  }
  if (normalized === "/tasks") {
    return [{ label: "Công việc" }]
  }
  if (/^\/tasks\/[^/]+$/.test(normalized)) {
    return [{ label: "Công việc", to: "/tasks" }, { label: "Chi tiết" }]
  }
  if (normalized.startsWith("/chat")) {
    return [{ label: "Chat" }]
  }
  if (normalized === "/admin") {
    return [{ label: "Admin" }]
  }
  if (normalized === "/settings") {
    return [{ label: "Cài đặt" }]
  }
  if (/^\/projects\/[^/]+$/.test(normalized)) {
    return [{ label: "Tổng quan", to: "/" }, { label: "Dự án" }]
  }
  if (normalized === "/items") {
    return [{ label: "Items" }]
  }
  if (normalized === "/reports") {
    return [{ label: "Tổng quan", to: "/" }, { label: "Báo cáo" }]
  }
  if (normalized === "/quotations") {
    return [{ label: "Báo Giá" }]
  }
  if (normalized === "/quotations/new") {
    return [{ label: "Báo Giá", to: "/quotations" }, { label: "Tạo mới" }]
  }
  if (normalized === "/quotations/reports") {
    return [{ label: "Báo Giá", to: "/quotations" }, { label: "Báo cáo" }]
  }
  if (/^\/quotations\/[^/]+$/.test(normalized)) {
    return [{ label: "Báo Giá", to: "/quotations" }, { label: "Chi tiết" }]
  }
  return [{ label: "Trang" }]
}

/**
 * Chooses explicit parent navigation or browser history for the mobile back control.
 */
function resolveMobileBackTarget(pathname: string): string | "history" | null {
  const normalized =
    pathname.endsWith("/") && pathname.length > 1
      ? pathname.slice(0, -1)
      : pathname
  if (normalized === "" || normalized === "/") {
    return null
  }
  if (/^\/tasks\/[^/]+$/.test(normalized)) {
    return "/tasks"
  }
  if (/^\/projects\/[^/]+$/.test(normalized)) {
    return "/"
  }
  if (normalized === "/reports") {
    return "/"
  }
  if (/^\/quotations\/[^/]+$/.test(normalized)) {
    return "/quotations"
  }
  if (
    normalized === "/quotations/new" ||
    normalized === "/quotations/reports"
  ) {
    return "/quotations"
  }
  return "history"
}

/**
 * Sticky mobile top bar with back control and breadcrumbs (hidden from md breakpoint up).
 */
export function MobileAppHeader() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const navigate = useNavigate()
  const crumbs = computeBreadcrumbs(pathname)
  const backTarget = resolveMobileBackTarget(pathname)

  const { user: currentUser } = useAuth()
  const { data: accountProfile } = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser),
  })
  const primaryMembership =
    accountProfile?.memberships.find((m) => m.is_primary) ||
    accountProfile?.memberships[0]
  const greetingName =
    currentUser?.full_name || currentUser?.email?.split("@")[0] || ""
  const roleLabel = primaryMembership?.role_display_name

  /**
   * Runs the appropriate back navigation for the current route.
   */
  const handleBack = () => {
    if (backTarget === null) {
      return
    }
    if (backTarget === "history") {
      window.history.back()
      return
    }
    navigate({ to: backTarget })
  }

  return (
    <header
      className={cn(
        // Gradient phủ luôn safe-area trên cùng để status bar iOS ăn màu xanh
        "app-chrome fixed left-0 right-0 top-0 z-40 pt-[env(safe-area-inset-top,0px)] md:hidden",
      )}
    >
      <div className="flex h-14 min-h-14 items-center gap-1 px-4">
        {backTarget !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 size-9 shrink-0"
            aria-label="Quay lại"
            onClick={handleBack}
          >
            <ChevronLeft className="size-5" />
          </Button>
        ) : null}
        <nav className="min-w-0 flex-1 overflow-x-auto" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 whitespace-nowrap text-sm">
            {crumbs.map((crumb, index) => (
              <li
                key={`${crumb.label}-${index}`}
                className="flex items-center gap-1"
              >
                {index > 0 ? (
                  <span className="text-header-muted">/</span>
                ) : null}
                {crumb.to && index < crumbs.length - 1 ? (
                  <Link
                    to={crumb.to}
                    className="font-medium text-header-muted hover:text-white"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-semibold">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="-mr-2 flex shrink-0 items-center gap-1">
          <Link
            to="/help"
            title="Hướng dẫn sử dụng"
            aria-label="Hướng dẫn sử dụng"
            className="inline-flex size-9 items-center justify-center rounded-md"
          >
            <HelpCircle className="size-5" />
          </Link>
          <ReleaseNotesBell />
          <NotificationBell />
        </div>
      </div>
      <div className="flex h-8 min-h-8 items-center justify-between gap-2 border-t border-white/15 bg-black/10 px-4">
        <p className="min-w-0 truncate text-xs">
          Xin chào{greetingName ? ", " : ""}
          <span className="font-semibold">{greetingName}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {roleLabel ? (
            <Badge
              variant="secondary"
              className="bg-white/15 px-1.5 py-0 text-[10px] font-medium text-white ring-1 ring-white/25 ring-inset"
            >
              {roleLabel}
            </Badge>
          ) : null}
          <span
            className="text-[10px] text-header-muted"
            title="Phiên bản ứng dụng"
          >
            {APP_VERSION_SHORT}
          </span>
        </div>
      </div>
    </header>
  )
}
