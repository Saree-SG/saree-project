import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { useState } from "react"

import { buildMobileNavGroups, isLayoutNavItemActive } from "@/config/layoutNav"
import { useLayoutNavAccess } from "@/hooks/useLayoutNavAccess"
import { cn } from "@/lib/utils"

export function MobileBottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const { access } = useLayoutNavAccess()
  const groups = buildMobileNavGroups(access)

  // 4 tab chính lấy từ nhóm đầu tiên (Cá nhân) + nút "Thêm" mở drawer chia
  // nhóm cho phần còn lại (đủ cho worker: Công việc/Chấm công/Nghỉ phép/Sự cố).
  const [firstGroup, ...restGroups] = groups
  const tabItems = firstGroup?.items.slice(0, 4) ?? []
  const overflowFromFirstGroup = firstGroup?.items.slice(4) ?? []
  const drawerGroups = overflowFromFirstGroup.length
    ? [{ ...firstGroup, items: overflowFromFirstGroup }, ...restGroups]
    : restGroups

  const drawerHasActive = drawerGroups.some((group) =>
    group.items.some((item) => isLayoutNavItemActive(item, pathname)),
  )

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-60 block border-t bg-background shadow-[0_-2px_10px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)] md:hidden">
        <div className="grid h-14 grid-cols-5 px-1">
          {tabItems.map((item) => (
            <RouterLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold transition-colors",
                isLayoutNavItemActive(item, pathname)
                  ? "text-primary"
                  : "text-muted-foreground",
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
              drawerHasActive || moreOpen
                ? "text-primary"
                : "text-muted-foreground",
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
          <div className="fixed inset-x-0 bottom-0 z-80 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom,0px)]">
            <div className="sticky top-0 border-b bg-background px-4 py-3">
              <p className="font-semibold text-foreground">Điều hướng khác</p>
            </div>
            <div className="p-3 space-y-4">
              {drawerGroups.map((group) => (
                <div key={group.key} className="space-y-1">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
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
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
