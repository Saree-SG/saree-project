import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useCustomToast from "@/hooks/useCustomToast"
import {
  listActiveSessions,
  revokeSession,
} from "@/modules/admin/adminStatsApi"
import { handleError } from "@/utils"

function formatRelative(iso: string | null): string {
  if (!iso) return "—"
  const t = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - t)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s trước`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m trước`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h trước`
  return `${Math.floor(hr / 24)} ngày trước`
}

function formatTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("vi-VN")
}

function shortUA(ua: string | null): string {
  if (!ua) return "—"
  if (ua.length > 60) return `${ua.slice(0, 60)}…`
  return ua
}

export default function ActiveSessionsTable() {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats", "sessions"],
    queryFn: listActiveSessions,
    refetchInterval: 30_000,
  })

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => revokeSession(sessionId),
    onSuccess: async () => {
      showSuccessToast("Đã ngắt phiên đăng nhập")
      await qc.invalidateQueries({ queryKey: ["admin", "stats"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phiên đang hoạt động ({data?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[28rem] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Người dùng</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Trình duyệt</TableHead>
                <TableHead>Đăng nhập lúc</TableHead>
                <TableHead>Hoạt động cuối</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    Đang tải...
                  </TableCell>
                </TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    Không có phiên đang hoạt động.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((s) => (
                  <TableRow key={s.session_id}>
                    <TableCell>
                      {s.user_id ? (
                        <Link
                          to="/admin/users/$userId"
                          params={{ userId: s.user_id }}
                          className="block hover:underline"
                        >
                          <div className="font-medium">
                            {s.full_name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.email || s.user_id}
                          </div>
                        </Link>
                      ) : (
                        <>
                          <div className="font-medium">
                            {s.full_name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.email || "—"}
                          </div>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.ip_address || "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-xs text-muted-foreground"
                      title={s.user_agent || ""}
                    >
                      {shortUA(s.user_agent)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatTime(s.login_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatRelative(s.last_seen_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(s.session_id)}
                      >
                        <LogOut className="mr-1 h-3 w-3" />
                        Ngắt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
