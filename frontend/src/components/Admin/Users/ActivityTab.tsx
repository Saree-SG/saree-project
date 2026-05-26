import { CheckCircle2, Clock, XCircle } from "lucide-react"
import { useMemo } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  AdminUserActivityRow,
  AdminUserDetail,
} from "@/modules/admin/adminUsersApi"

type Props = { user: AdminUserDetail }

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export default function ActivityTab({ user }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, AdminUserActivityRow[]>()
    for (const r of user.recent_activity) {
      const k = dayKey(r.at)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return [...map.entries()]
  }, [user.recent_activity])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
      <Card>
        <CardHeader>
          <CardTitle>
            Phiên đang hoạt động ({user.active_sessions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user.active_sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Không có phiên đang hoạt động.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {user.active_sessions.map((s) => (
                <li
                  key={s.session_id}
                  className="rounded-md border bg-muted/30 p-3"
                >
                  <div className="font-mono text-xs">{s.ip_address || "—"}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {s.login_at
                      ? new Date(s.login_at).toLocaleString("vi-VN")
                      : "—"}
                  </div>
                  <div
                    className="mt-1 truncate text-xs text-muted-foreground"
                    title={s.user_agent ?? ""}
                  >
                    {s.user_agent || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử đăng nhập</CardTitle>
        </CardHeader>
        <CardContent>
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([day, items]) => (
                <div key={day}>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    {day}
                  </p>
                  <ul className="space-y-1 border-l-2 pl-3">
                    {items.map((r, i) => (
                      <li
                        key={`${r.at}-${i}`}
                        className="relative flex items-center gap-3 py-1 text-sm"
                      >
                        <span className="absolute -left-[7px] top-2.5 h-3 w-3 rounded-full border-2 border-background bg-muted" />
                        {r.type === "login" ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
                        )}
                        <span className="font-mono text-xs">
                          {formatTime(r.at)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.type === "login" ? "Đăng nhập" : "Login thất bại"}
                          {r.ip_address ? ` · ${r.ip_address}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
