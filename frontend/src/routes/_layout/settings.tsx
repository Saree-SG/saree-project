import { createFileRoute, Link } from "@tanstack/react-router"
import { LogOut, ShieldCheck, UserRound } from "lucide-react"
import ChangePassword from "@/components/UserSettings/ChangePassword"
import DeleteAccount from "@/components/UserSettings/DeleteAccount"
import { Button } from "@/components/ui/button"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
  head: () => ({
    meta: [
      {
        title: "Cài đặt - Saree",
      },
    ],
  }),
})

function UserSettings() {
  const { user: currentUser, logout } = useAuth()

  if (!currentUser) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-1 pb-8 sm:px-2">
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
              <ShieldCheck className="size-6 text-primary" /> Cài đặt tài khoản
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Bảo mật và quản lý tài khoản. Xem hồ sơ cá nhân tại{" "}
              <Link to="/profile" className="text-primary underline">
                Hồ sơ của tôi
              </Link>
              .
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/profile">
                <UserRound className="size-4" /> Hồ sơ
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void logout()
              }}
            >
              <LogOut className="size-4" />
              Đăng xuất
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">Đổi mật khẩu</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Cập nhật mật khẩu để tăng cường bảo mật tài khoản.
        </p>
        <ChangePassword embedded />
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-destructive">
          Vùng nguy hiểm
        </h2>
        <p className="mb-1 text-sm text-muted-foreground">
          Xóa tài khoản là thao tác không thể hoàn tác.
        </p>
        <DeleteAccount />
      </section>
    </div>
  )
}
