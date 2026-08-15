import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import ActivityTab from "@/components/Admin/Users/ActivityTab"
import InfoTab from "@/components/Admin/Users/InfoTab"
import MembershipTab from "@/components/Admin/Users/MembershipTab"
import PermissionsTab from "@/components/Admin/Users/PermissionsTab"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getAdminUserDetail } from "@/modules/admin/adminUsersApi"

export const Route = createFileRoute("/_layout/admin/users/$userId")({
  component: AdminUserDetailPage,
})

function initials(name: string | null, email: string): string {
  const src = (name || email).trim()
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?"
}

function AdminUserDetailPage() {
  const { userId } = Route.useParams()

  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "user-detail", userId],
    queryFn: () => getAdminUserDetail(userId),
  })

  if (isLoading) {
    return (
      <div className="rounded-md border p-10 text-center text-muted-foreground">
        Đang tải...
      </div>
    )
  }
  if (error || !user) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Không tải được thông tin người dùng.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/admin/users">
            <ArrowLeft className="mr-1 h-4 w-4" /> Danh sách người dùng
          </Link>
        </Button>
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">
              {initials(user.full_name, user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">
                {user.full_name || user.email}
              </h1>
              {user.is_superuser ? (
                <Badge
                  variant="outline"
                  className="border-rose-300 text-rose-700"
                >
                  Superuser
                </Badge>
              ) : null}
              {user.is_active ? (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Inactive
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.company_name || user.department_name ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {user.company_name ? `Công ty: ${user.company_name}` : ""}
                {user.company_name && user.department_name ? " · " : ""}
                {user.department_name
                  ? `Phòng ban: ${user.department_name}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="membership">Vai trò & Phòng ban</TabsTrigger>
          <TabsTrigger value="activity">Hoạt động</TabsTrigger>
          <TabsTrigger value="permissions">Quyền</TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="mt-4">
          <InfoTab user={user} />
        </TabsContent>
        <TabsContent value="membership" className="mt-4">
          <MembershipTab user={user} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab user={user} />
        </TabsContent>
        <TabsContent value="permissions" className="mt-4">
          <PermissionsTab userId={user.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
