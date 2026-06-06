import { useQuery } from "@tanstack/react-query"
import {
  Building2,
  CheckCircle2,
  FolderKanban,
  Layers,
  ListTodo,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { getOverview } from "@/modules/dashboard/overviewApi"
import { listDepartments } from "@/modules/org/departmentApi"
import {
  type Company,
  listCompanyMembers,
  listCompanyRoles,
} from "@/modules/rbac/rbacApi"

function Stat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  tone?: "default" | "good" | "warn"
}) {
  const toneClass =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-600"
      : tone === "warn"
        ? "bg-red-500/10 text-red-600"
        : "bg-primary/10 text-primary"
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex size-10 items-center justify-center rounded-lg ${toneClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs">{label}</div>
          <div className="truncate text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

/** Company detail overview: company info + KPI + org counts. */
export default function CompanyOverviewPanel({
  company,
}: {
  company: Company | null
}) {
  const selected = company?.id ?? null

  const overviewQuery = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => getOverview(),
  })
  const o = overviewQuery.data

  const membersQuery = useQuery({
    queryKey: ["company-members-count", selected],
    queryFn: () => listCompanyMembers(selected as string),
    enabled: Boolean(selected),
  })
  const rolesQuery = useQuery({
    queryKey: ["company-roles-count", selected],
    queryFn: () => listCompanyRoles(selected as string),
    enabled: Boolean(selected),
  })
  const deptsQuery = useQuery({
    queryKey: ["company-departments-count", selected],
    queryFn: () => listDepartments(selected as string),
    enabled: Boolean(selected),
  })

  const memberCount = new Set((membersQuery.data ?? []).map((m) => m.user_id))
    .size
  const roleCount = (rolesQuery.data ?? []).length
  const deptCount = (deptsQuery.data ?? []).length

  return (
    <div className="space-y-5">
      {/* Company identity */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl">
              <Building2 className="size-6" />
            </div>
            <div>
              <div className="text-lg font-semibold">
                {company?.name ?? "—"}
              </div>
              <div className="text-muted-foreground text-xs">
                {company ? (
                  <>
                    Mã: {company.slug} ·{" "}
                    <span
                      className={
                        company.is_active ? "text-emerald-600" : "text-red-600"
                      }
                    >
                      {company.is_active ? "Đang hoạt động" : "Ngừng hoạt động"}
                    </span>
                  </>
                ) : (
                  "Chưa chọn công ty"
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Org structure counts */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          icon={<Users className="size-5" />}
          label="Nhân sự"
          value={memberCount}
        />
        <Stat
          icon={<ShieldCheck className="size-5" />}
          label="Vai trò (roles)"
          value={roleCount}
        />
        <Stat
          icon={<Layers className="size-5" />}
          label="Phòng ban"
          value={deptCount}
        />
      </div>

      {/* Work KPI */}
      <div>
        <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
          Tình hình công việc (phạm vi bạn quản lý)
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat
            icon={<FolderKanban className="size-5" />}
            label="Dự án"
            value={o?.total_projects ?? "—"}
          />
          <Stat
            icon={<ListTodo className="size-5" />}
            label="Tổng công việc"
            value={o?.total_tasks ?? "—"}
          />
          <Stat
            icon={<CheckCircle2 className="size-5" />}
            label="Đã hoàn thành"
            value={o?.done_tasks ?? "—"}
            tone="good"
          />
          <Stat
            icon={<CheckCircle2 className="size-5" />}
            label="% Hoàn thành"
            value={o ? `${o.completion_rate_pct}%` : "—"}
            tone="good"
          />
          <Stat
            icon={<Timer className="size-5" />}
            label="Trễ hạn"
            value={o?.overdue_tasks ?? "—"}
            tone="warn"
          />
        </div>
      </div>
    </div>
  )
}
