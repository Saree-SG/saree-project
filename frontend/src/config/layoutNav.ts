import type { LucideIcon } from "lucide-react"
import {
  Building2,
  ClipboardList,
  FileSignature,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageCircle,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react"

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
  showCompanyManagement: boolean,
  canAccessProjects?: boolean,
  canAccessQuotations?: boolean,
  canAccessSuppliers?: boolean,
  canAccessContracts?: boolean,
  canAccessProcurement?: boolean,
  canAccessInventory?: boolean,
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
  if (canAccessProjects) {
    items.push({
      icon: FolderOpen,
      title: "Dự án",
      path: "/projects",
      matchPrefix: true,
    })
  }
  if (canAccessQuotations) {
    items.push({
      icon: FileText,
      title: "Báo Giá",
      path: "/quotations",
      matchPrefix: true,
    })
  }
  if (canAccessContracts) {
    items.push({
      icon: FileSignature,
      title: "Hợp Đồng",
      path: "/contracts",
      matchPrefix: true,
    })
  }
  if (canAccessSuppliers) {
    items.push({
      icon: Truck,
      title: "Nhà Cung Cấp",
      path: "/suppliers",
      matchPrefix: true,
    })
  }
  if (canAccessProcurement) {
    items.push({
      icon: ShoppingCart,
      title: "Mua Hàng",
      path: "/procurement",
      matchPrefix: true,
    })
  }
  if (canAccessInventory) {
    items.push({
      icon: Package,
      title: "Kho Hàng",
      path: "/inventory",
      matchPrefix: true,
    })
  }
  items.push({ icon: MessageCircle, title: "Chat", path: "/chat" })
  if (showCompanyManagement) {
    items.push({ icon: Building2, title: "Quản lý công ty", path: "/company" })
  }
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
  showCompanyManagement: boolean,
  canAccessProjects?: boolean,
  canAccessQuotations?: boolean,
  canAccessSuppliers?: boolean,
  canAccessContracts?: boolean,
  canAccessProcurement?: boolean,
  canAccessInventory?: boolean,
): LayoutNavItem[] {
  return [
    ...buildLayoutNavItems(isSuperuser, showManagement, showCompanyManagement, canAccessProjects, canAccessQuotations, canAccessSuppliers, canAccessContracts, canAccessProcurement, canAccessInventory),
    { icon: Settings, title: "Cài đặt", path: "/settings" },
  ]
}

/**
 * Returns whether the current path should highlight the given nav item.
 */
export function isLayoutNavItemActive(
  item: LayoutNavItem,
  pathname: string,
): boolean {
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
