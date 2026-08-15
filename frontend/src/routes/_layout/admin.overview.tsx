import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Activity, Building2, LogIn, Network, Users, Wifi } from "lucide-react"

import ActiveSessionsTable from "@/components/Admin/Overview/ActiveSessionsTable"
import KpiCard from "@/components/Admin/Overview/KpiCard"
import LoginFrequencyChart from "@/components/Admin/Overview/LoginFrequencyChart"
import TopUsersChart from "@/components/Admin/Overview/TopUsersChart"
import { getAdminOverview } from "@/modules/admin/adminStatsApi"

export const Route = createFileRoute("/_layout/admin/overview")({
  component: AdminOverview,
})

function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats", "overview"],
    queryFn: getAdminOverview,
    refetchInterval: 30_000,
  })

  const fmt = (v?: number) =>
    isLoading || v === undefined ? "—" : v.toLocaleString("vi-VN")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Tổng quan hệ thống
        </h1>
        <p className="text-muted-foreground">
          Thống kê người dùng, phiên đăng nhập và hoạt động hệ thống.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tổng người dùng"
          value={fmt(data?.total_users)}
          hint={`Active: ${fmt(data?.active_users)}`}
          icon={Users}
          accent="blue"
        />
        <KpiCard
          label="Đang online"
          value={fmt(data?.online_now)}
          hint="Phiên đang hoạt động"
          icon={Wifi}
          accent="green"
        />
        <KpiCard
          label="Login hôm nay"
          value={fmt(data?.logins_today)}
          hint={`Active 30d: ${fmt(data?.active_users_30d)}`}
          icon={LogIn}
          accent="amber"
        />
        <KpiCard
          label="Tổ chức"
          value={`${fmt(data?.total_companies)} công ty`}
          hint={`${fmt(data?.total_departments)} phòng ban · ${fmt(
            data?.total_roles,
          )} vai trò`}
          icon={Building2}
          accent="violet"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LoginFrequencyChart days={30} />
        <TopUsersChart days={7} limit={10} />
      </div>

      <ActiveSessionsTable />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3 w-3" />
        Dữ liệu tự refresh mỗi 30s.
        <Network className="h-3 w-3 ml-2" />
      </div>
    </div>
  )
}
