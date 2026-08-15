import { useQuery } from "@tanstack/react-query"
import { ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getUserPermissions } from "@/modules/admin/adminUsersApi"

const sourceLabel: Record<string, { label: string; tone: string }> = {
  superuser: {
    label: "Superuser — toàn quyền",
    tone: "bg-rose-100 text-rose-700",
  },
  director: {
    label: "Giám đốc — toàn quyền công ty",
    tone: "bg-amber-100 text-amber-700",
  },
  manager: {
    label: "Quản lý — quyền tự động + quyền gán",
    tone: "bg-blue-100 text-blue-700",
  },
  assigned: {
    label: "Theo quyền được gán",
    tone: "bg-emerald-100 text-emerald-700",
  },
  none: { label: "Chưa có vai trò", tone: "bg-slate-100 text-slate-700" },
}

type Props = { userId: string }

export default function PermissionsTab({ userId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "user-permissions", userId],
    queryFn: () => getUserPermissions(userId),
  })

  if (isLoading) {
    return (
      <div className="rounded-md border p-10 text-center text-muted-foreground">
        Đang tải quyền...
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Không tải được danh sách quyền.
      </div>
    )
  }

  const meta = sourceLabel[data.source] ?? sourceLabel.none
  const modules = Object.keys(data.by_module).sort()

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Quyền hiệu lực ({data.total})
          </CardTitle>
          <Badge className={meta.tone}>{meta.label}</Badge>
        </CardHeader>
      </Card>

      {modules.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          Người dùng chưa có quyền nào.
        </div>
      ) : (
        modules.map((m) => (
          <Card key={m}>
            <CardHeader>
              <CardTitle className="text-base capitalize">
                {m} ({data.by_module[m].length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.by_module[m].map((p) => (
                  <div
                    key={p.code}
                    className="rounded-md border bg-muted/30 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs font-semibold">
                        {p.code}
                      </code>
                      <Badge variant="outline" className="text-[10px]">
                        {p.scope}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
