import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import AddUser from "@/components/Admin/AddUser"
import UserListTable from "@/components/Admin/Users/UserListTable"
import { Skeleton } from "@/components/ui/skeleton"
import { listAdminUsers } from "@/modules/admin/adminUsersApi"

export const Route = createFileRoute("/_layout/admin/users/")({
  component: AdminUsers,
})

function AdminUsers() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: listAdminUsers,
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Người dùng</h1>
          <p className="text-muted-foreground">
            Quản lý tài khoản, vai trò và phòng ban.
          </p>
        </div>
        <AddUser />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Không tải được danh sách người dùng.
        </div>
      ) : (
        <UserListTable users={data ?? []} />
      )}
    </div>
  )
}
