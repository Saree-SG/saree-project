import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarOff,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Map,
  MessageCircle,
  Settings,
  UserRound,
  Users,
  Workflow,
} from "lucide-react"

export type LayoutNavItem = {
  icon: LucideIcon
  title: string
  path: string
  matchPrefix?: boolean
}

export type LayoutNavGroup = {
  key: string
  label: string
  items: LayoutNavItem[]
}

export type LayoutNavAccess = {
  isSuperuser: boolean
  showManagement: boolean
  showCompanyManagement: boolean
  canAccessProjects?: boolean
  canAccessQuotations?: boolean
  canAccessContracts?: boolean
}

/**
 * Builds grouped sidebar / app navigation from role/permission access flags.
 * Groups with no visible items are dropped entirely.
 */
export function buildLayoutNavGroups(
  access: LayoutNavAccess,
): LayoutNavGroup[] {
  const {
    isSuperuser,
    showManagement,
    showCompanyManagement,
    canAccessProjects,
    canAccessQuotations,
    canAccessContracts,
  } = access

  const personal: LayoutNavItem[] = [
    {
      icon: ClipboardList,
      title: "Công việc",
      path: "/tasks",
      matchPrefix: true,
    },
    { icon: ClipboardCheck, title: "Chấm công", path: "/attendance" },
    { icon: CalendarOff, title: "Nghỉ phép", path: "/leave" },
    {
      icon: AlertTriangle,
      title: "Sự cố",
      path: "/incidents",
      matchPrefix: true,
    },
    { icon: MessageCircle, title: "Chat", path: "/chat" },
  ]

  const ops: LayoutNavItem[] = []
  if (showManagement) {
    ops.push({ icon: LayoutDashboard, title: "Tổng quan", path: "/" })
  }
  if (canAccessProjects) {
    ops.push({
      icon: FolderOpen,
      title: "Dự án",
      path: "/projects",
      matchPrefix: true,
    })
  }
  if (showManagement) {
    ops.push({ icon: CalendarRange, title: "Gantt tổng", path: "/gantt" })
    ops.push({ icon: Map, title: "Bản đồ", path: "/map" })
    ops.push({ icon: Workflow, title: "Điều phối", path: "/dispatch" })
    ops.push({ icon: BarChart3, title: "KPI", path: "/kpi" })
  }

  const biz: LayoutNavItem[] = []
  if (canAccessQuotations) {
    biz.push({
      icon: FileText,
      title: "Báo Giá",
      path: "/quotations",
      matchPrefix: true,
    })
  }
  if (canAccessContracts) {
    biz.push({
      icon: FileSignature,
      title: "Hợp Đồng",
      path: "/contracts",
      matchPrefix: true,
    })
  }

  const org: LayoutNavItem[] = []
  if (showManagement) {
    org.push({ icon: Users, title: "Nhân viên", path: "/staff" })
  }
  if (showCompanyManagement || showManagement) {
    org.push({ icon: Building2, title: "Công ty", path: "/company" })
  }

  const system: LayoutNavItem[] = []
  if (isSuperuser) {
    system.push({ icon: Users, title: "Admin", path: "/admin" })
  }

  const groups: LayoutNavGroup[] = [
    { key: "personal", label: "Cá nhân", items: personal },
    { key: "ops", label: "Vận hành", items: ops },
    { key: "biz", label: "Kinh doanh", items: biz },
    { key: "org", label: "Tổ chức", items: org },
    { key: "system", label: "Hệ thống", items: system },
  ]

  return groups.filter((group) => group.items.length > 0)
}

/**
 * Flattens grouped nav items — used where a flat list is still needed
 * (mobile bottom nav tabs/drawer).
 */
export function flattenLayoutNavGroups(
  groups: LayoutNavGroup[],
): LayoutNavItem[] {
  return groups.flatMap((group) => group.items)
}

/**
 * Builds bottom navigation groups including Cài đặt items for mobile shell.
 * The first group's items become the fixed tabs; the rest render inside the
 * "Thêm" drawer, grouped the same way as desktop.
 */
export function buildMobileNavGroups(
  access: LayoutNavAccess,
): LayoutNavGroup[] {
  const groups = buildLayoutNavGroups(access)
  const extras: LayoutNavItem[] = [
    { icon: UserRound, title: "Hồ sơ", path: "/profile" },
    { icon: Settings, title: "Cài đặt", path: "/settings" },
  ]
  return [...groups, { key: "account", label: "Tài khoản", items: extras }]
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
