import { Link, useRouterState } from "@tanstack/react-router"
import {
  Activity,
  Building2,
  LayoutDashboard,
  Network,
  Users,
} from "lucide-react"

import useAuth from "@/hooks/useAuth"
import { cn } from "@/lib/utils"

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  superuserOnly?: boolean
}

const items: NavItem[] = [
  {
    to: "/admin/overview",
    label: "Tổng quan",
    icon: LayoutDashboard,
    superuserOnly: true,
  },
  { to: "/admin/users", label: "Người dùng", icon: Users, superuserOnly: true },
  { to: "/admin/organization", label: "Sơ đồ tổ chức", icon: Network },
  {
    to: "/admin/activity",
    label: "Nhật ký hoạt động",
    icon: Activity,
    superuserOnly: true,
  },
  {
    to: "/admin/companies",
    label: "Công ty & Phân quyền",
    icon: Building2,
    superuserOnly: true,
  },
]

type Props = {
  /** Called after a nav item is clicked — used to close mobile drawer */
  onNavigate?: () => void
  /** When true, render without the sticky aside wrapper (for mobile drawer) */
  embedded?: boolean
}

export default function AdminSidebar({ onNavigate, embedded }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { user } = useAuth()
  const isSuperuser = Boolean(user?.is_superuser)

  const visible = items.filter((i) => !i.superuserOnly || isSuperuser)

  const content = (
    <>
      <div className="px-4 py-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Quản trị
        </p>
        <h2 className="text-lg font-semibold">Admin</h2>
      </div>
      <nav className="flex flex-col gap-1 px-2 pb-4">
        {visible.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </>
  )

  if (embedded) {
    return <div className="flex h-full flex-col">{content}</div>
  }

  return (
    <aside className="hidden w-56 shrink-0 border-r bg-muted/30 md:block">
      {content}
    </aside>
  )
}
