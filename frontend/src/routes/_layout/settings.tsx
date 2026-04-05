import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Building2, Lock, LogOut, Mail, UserRound } from "lucide-react"

import { RolesService } from "@/client"
import ChangePassword from "@/components/UserSettings/ChangePassword"
import UserInformation from "@/components/UserSettings/UserInformation"
import OrgTreePanel from "@/components/OrgTree/OrgTreePanel"
import { Button } from "@/components/ui/button"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
  head: () => ({
    meta: [
      {
        title: "Settings - FastAPI Template",
      },
    ],
  }),
})

function UserSettings() {
  const { user: currentUser, logout } = useAuth()
  const { data: accountProfile } = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser),
  })
  const primaryMembership =
    accountProfile?.memberships.find((membership) => membership.is_primary) ||
    accountProfile?.memberships[0]

  const { data: companyRoles } = useQuery({
    queryKey: ["roles", "catalog", primaryMembership?.company_id || ""],
    queryFn: () =>
      RolesService.listCompanyRoles({
        companyId: primaryMembership?.company_id || "",
      }),
    enabled: Boolean(primaryMembership?.company_id),
  })

  const currentRole = companyRoles?.find(
    (role) => role.id === primaryMembership?.role_id,
  )

  if (!currentUser) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-1 pb-8 sm:px-2">
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              void logout()
            }}
          >
            <LogOut className="size-4" />
            Đăng xuất
          </Button>
        </div>
      </section>

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
            Company
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
            Role
          </p>
          <p className="mt-1 text-sm font-medium">
            {primaryMembership?.role_display_name || "Chưa có role"}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-3">
          <h2 className="mb-2 text-lg font-semibold">Thông tin tài khoản</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Cập nhật hồ sơ cá nhân và kiểm tra role theo công ty.
          </p>
          <UserInformation embedded />
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">Đổi mật khẩu</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Cập nhật mật khẩu để tăng cường bảo mật tài khoản.
          </p>
          <ChangePassword embedded />
        </div>
      </section>

      {primaryMembership && currentRole ? (
        <OrgTreePanel
          companyId={primaryMembership.company_id}
          companyName={primaryMembership.company_name}
          departmentId={currentUser.department_id || undefined}
        />
      ) : (
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Sơ đồ tổ chức</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chưa đủ dữ liệu để hiển thị sơ đồ tổ chức.
          </p>
        </section>
      )}
    </div>
  )
}
