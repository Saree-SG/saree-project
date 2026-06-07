import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Building2,
  CalendarOff,
  ClipboardCheck,
  Lock,
  Mail,
  UserRound,
} from "lucide-react"

import { RolesService } from "@/client"
import CompanyOrgChartPanel from "@/components/Company/CompanyOrgChartPanel"
import UserInformation from "@/components/UserSettings/UserInformation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import useAuth from "@/hooks/useAuth"
import {
  LEAVE_STATUS_BADGE,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  type LeaveStatus,
  type LeaveType,
  listMyLeaveRequests,
} from "@/modules/leave/leaveApi"

export const Route = createFileRoute("/_layout/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [{ title: "Hồ sơ cá nhân - Saree" }],
  }),
})

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("vi-VN")
  } catch {
    return d
  }
}

function ProfilePage() {
  const { user: currentUser } = useAuth()

  const { data: accountProfile } = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser),
  })
  const primaryMembership =
    accountProfile?.memberships.find((m) => m.is_primary) ||
    accountProfile?.memberships[0]

  const { data: myLeave } = useQuery({
    queryKey: ["leave-me"],
    queryFn: () => listMyLeaveRequests(),
    enabled: Boolean(currentUser),
  })
  const recentLeave = (myLeave?.data ?? []).slice(0, 5)

  if (!currentUser) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-1 pb-8 sm:px-2">
      {/* Header */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              {currentUser.full_name || currentUser.email}
            </h1>
            <p className="text-sm text-muted-foreground">
              {primaryMembership?.role_display_name || "Chưa có role"}
              {primaryMembership?.company_name
                ? ` - ${primaryMembership.company_name}`
                : ""}
            </p>
          </div>
        </div>
      </section>

      {/* Info cards */}
      <section className="grid grid-cols-1 gap-3 min-[540px]:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="size-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Email
          </p>
          <p className="mt-1 break-all text-sm font-medium">
            {currentUser.email}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Công ty
          </p>
          <p className="mt-1 text-sm font-medium">
            {primaryMembership?.company_name || "Chưa có công ty"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm min-[540px]:col-span-2 lg:col-span-1">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lock className="size-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vai trò
          </p>
          <p className="mt-1 text-sm font-medium">
            {primaryMembership?.role_display_name || "Chưa có role"}
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-5 text-primary" /> Chấm công
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Chấm công vào/ra tại công trình hoặc công ty.
            </p>
            <Button asChild className="w-full sm:w-auto">
              <Link to="/attendance">Đi tới chấm công</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarOff className="size-5 text-primary" /> Xin nghỉ phép
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Tạo đơn xin nghỉ và theo dõi trạng thái duyệt.
            </p>
            <Button asChild className="w-full sm:w-auto">
              <Link to="/leave">Đi tới xin nghỉ</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Recent leave activity */}
      {recentLeave.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Đơn nghỉ gần đây</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentLeave.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <span>
                  {LEAVE_TYPE_LABELS[item.leave_type as LeaveType] ??
                    item.leave_type}{" "}
                  · {fmtDate(item.start_date)} → {fmtDate(item.end_date)}
                </span>
                <Badge
                  className={
                    LEAVE_STATUS_BADGE[item.status as LeaveStatus] ?? ""
                  }
                  variant="secondary"
                >
                  {LEAVE_STATUS_LABELS[item.status as LeaveStatus] ??
                    item.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Account information (editable) */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">Thông tin tài khoản</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Cập nhật hồ sơ cá nhân và kiểm tra vai trò theo công ty.
        </p>
        <UserInformation embedded />
      </section>

      {/* Org chart */}
      {primaryMembership ? (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <CompanyOrgChartPanel companyId={primaryMembership.company_id} />
        </section>
      ) : null}
    </div>
  )
}
