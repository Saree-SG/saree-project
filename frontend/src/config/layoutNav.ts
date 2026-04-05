import type { LucideIcon } from "lucide-react"
import { ClipboardList, LayoutDashboard, MessageCircle, Settings, Users } from "lucide-react"

export type LayoutNavItem = {
  icon: LucideIcon
  title: string
  path: string
  matchPrefix?: boolean
}

/**
 * Builds primary sidebar / app navigation items from role (management vs staff).
 */
export function buildLayoutNavItems(
  isSuperuser: boolean,
  showManagement: boolean,
): LayoutNavItem[] {
  const items: LayoutNavItem[] = []
  if (showManagement) {
    items.push({
      icon: LayoutDashboard,
      title: "Tổng quan",
      path: "/",
    })
  }
  items.push({
    icon: ClipboardList,
    title: "Công việc",
    path: "/tasks",
    matchPrefix: true,
  })
  items.push({ icon: MessageCircle, title: "Chat", path: "/chat" })
  if (isSuperuser) {
    items.push({ icon: Users, title: "Admin", path: "/admin" })
  }
  return items
}

/**
 * Builds bottom navigation items including Cài đặt for mobile shell.
 */
export function buildMobileBottomNavItems(
  isSuperuser: boolean,
  showManagement: boolean,
): LayoutNavItem[] {
  return [
    ...buildLayoutNavItems(isSuperuser, showManagement),
    { icon: Settings, title: "Cài đặt", path: "/settings" },
  ]
}

/**
 * Returns whether the current path should highlight the given nav item.
 */
export function isLayoutNavItemActive(item: LayoutNavItem, pathname: string): boolean {
  if (item.matchPrefix) {
    if (item.path === "/tasks") {
      return pathname === "/tasks" || pathname.startsWith("/tasks/")
    }
    return pathname === item.path || pathname.startsWith(`${item.path}/`)
  }
  if (item.path === "/") {
    return pathname === "/" || pathname === ""
  }
  return pathname === item.path
}
