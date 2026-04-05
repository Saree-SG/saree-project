import { ChevronLeft } from "lucide-react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Crumb = { label: string; to?: string }

/**
 * Derives breadcrumb trail labels and optional parent links from the URL path.
 */
function computeBreadcrumbs(pathname: string): Crumb[] {
  const normalized = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname

  if (normalized === "" || normalized === "/") {
    return [{ label: "Tổng quan" }]
  }
  if (normalized === "/tasks") {
    return [{ label: "Công việc" }]
  }
  if (/^\/tasks\/[^/]+$/.test(normalized)) {
    return [
      { label: "Công việc", to: "/tasks" },
      { label: "Chi tiết" },
    ]
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
    return [
      { label: "Tổng quan", to: "/" },
      { label: "Dự án" },
    ]
  }
  if (normalized === "/items") {
    return [{ label: "Items" }]
  }
  return [{ label: "Trang" }]
}

/**
 * Chooses explicit parent navigation or browser history for the mobile back control.
 */
function resolveMobileBackTarget(pathname: string): string | "history" | null {
  const normalized = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname
  if (normalized === "" || normalized === "/") {
    return null
  }
  if (/^\/tasks\/[^/]+$/.test(normalized)) {
    return "/tasks"
  }
  if (/^\/projects\/[^/]+$/.test(normalized)) {
    return "/"
  }
  return "history"
}

/**
 * Sticky mobile top bar with back control and breadcrumbs (hidden from md breakpoint up).
 */
export function MobileAppHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const crumbs = computeBreadcrumbs(pathname)
  const backTarget = resolveMobileBackTarget(pathname)

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
        "fixed left-0 right-0 top-0 z-40 border-b bg-background pt-[env(safe-area-inset-top,0px)] md:hidden",
      )}
    >
      <div className="flex h-14 min-h-14 items-center gap-1 px-1">
        <div className="flex w-10 shrink-0 justify-center">
          {backTarget !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Quay lại"
              onClick={handleBack}
            >
              <ChevronLeft className="size-5" />
            </Button>
          ) : null}
        </div>
        <nav className="min-w-0 flex-1 overflow-x-auto" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 whitespace-nowrap text-sm">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <span className="text-muted-foreground">/</span> : null}
                {crumb.to && index < crumbs.length - 1 ? (
                  <Link
                    to={crumb.to}
                    className="font-medium text-muted-foreground hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-semibold text-foreground">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </header>
  )
}
