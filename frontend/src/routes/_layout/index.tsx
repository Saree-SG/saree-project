import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import {
  AlertTriangle,
  BarChart2,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  Users,
} from "lucide-react"
import { useMemo, useState } from "react"

import {
  ApiError,
  DashboardService,
  type ProjectCreate,
  type ProjectPublic,
  ProjectsService,
  RolesService,
  UsersService,
} from "@/client"
import { PermissionGuard } from "@/components/PermissionGuard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import { clearSession } from "@/modules/auth/tokenStore"
import { getMyPendingQuotations } from "@/modules/quotation/quotationApi"
import { STAGE_CONFIG } from "@/modules/quotation/stageConfig"
import { getMyPendingProcurementActions } from "@/modules/procurement/procurementApi"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { listCompanyMembers, readMyPermissions } from "@/modules/rbac/rbacApi"
import { canAccessDashboard } from "@/utils/accountAccess"

// ── Types ─────────────────────────────────────────────────────────────────────

type OverviewPayload = {
  total_projects: number
  total_tasks: number
  done_tasks: number
  completion_rate_pct: number
  overdue_tasks: number
}

type ProjectStatsPayload = {
  project_id: string
  name: string
  code: string | null
  end_date: string | null
  status: string
  total_tasks: number
  done_tasks: number
  overdue_tasks: number
  completion_pct: number
}

type LeaderboardPayload = {
  user_id: string
  user_name?: string
  total: number
  done: number
  on_time: number
  overdue: number
  completion_pct: number
}

type WorkloadPayload = {
  user_id: string
  user_name?: string
  active_tasks: number
}

type MemberCandidate = {
  id: string
  email: string
  full_name?: string | null
}

type OverdueTask = {
  task_id: string
  name: string
  status: string
  assignee_id: string
  assignee_name?: string
  start_time: string
  end_time: string
  project_id: string
  project_name?: string
  is_on_critical_path: boolean
}

type OverduePayload = {
  overdue_critical: OverdueTask[]
  overdue_local: OverdueTask[]
}

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_layout/")({
  beforeLoad: async () => {
    let permissions
    let me
    try {
      ;[permissions, me] = await Promise.all([
        readMyPermissions(),
        UsersService.readUserMe(),
      ])
    } catch (errorValue) {
      if (errorValue instanceof ApiError && errorValue.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw errorValue
    }
    const allowed = Boolean(me?.is_superuser) || canAccessDashboard(permissions)
    if (!allowed) {
      throw redirect({ to: "/tasks" })
    }
  },
  component: Dashboard,
  head: () => ({
    meta: [{ title: "Tổng quan quản lý" }],
  }),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function ProgressBar({
  value,
  className,
  color = "bg-primary",
}: {
  value: number
  className?: string
  color?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={`h-2 w-full rounded-full bg-muted ${className ?? ""}`}>
      <div
        className={`h-2 rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    planning:    { label: "Lên kế hoạch", variant: "secondary" },
    in_progress: { label: "Đang thực hiện", variant: "default" },
    on_hold:     { label: "Tạm dừng", variant: "outline" },
    completed:   { label: "Hoàn thành", variant: "default" },
    cancelled:   { label: "Hủy", variant: "destructive" },
  }
  const entry = map[status] ?? { label: status, variant: "secondary" as const }
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const { user: currentUser } = useAuth()
  const [projectFilter, setProjectFilter] = useState<string>("")
  const [departmentFilter, setDepartmentFilter] = useState<string>("")
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState("")
  const [projectMemberKeyword, setProjectMemberKeyword] = useState("")
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [projectMemberPickerOpen, setProjectMemberPickerOpen] = useState(false)
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: ["dashboard", "profile"],
    queryFn: () => RolesService.myAccountProfile(),
  })
  const primaryMembership = useMemo(
    () =>
      profileQuery.data?.memberships.find((m) => m.is_primary) ??
      profileQuery.data?.memberships[0],
    [profileQuery.data?.memberships],
  )

  const dashboardParams = useMemo(
    () => ({
      projectId: projectFilter || undefined,
      departmentId: departmentFilter || undefined,
    }),
    [departmentFilter, projectFilter],
  )

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview", dashboardParams],
    queryFn: async () =>
      (await DashboardService.overview(dashboardParams)) as OverviewPayload,
  })
  const projectStatsQuery = useQuery({
    queryKey: ["dashboard", "project-stats", dashboardParams],
    queryFn: async () =>
      (await DashboardService.projectStats(dashboardParams)) as ProjectStatsPayload[],
  })
  const leaderboardQuery = useQuery({
    queryKey: ["dashboard", "leaderboard", dashboardParams],
    queryFn: async () =>
      (await DashboardService.leaderboard(dashboardParams)) as LeaderboardPayload[],
  })
  const workloadQuery = useQuery({
    queryKey: ["dashboard", "workload", dashboardParams],
    queryFn: async () =>
      (await DashboardService.userWorkload(dashboardParams)) as WorkloadPayload[],
  })
  const overdueQuery = useQuery({
    queryKey: ["dashboard", "overdue", dashboardParams],
    queryFn: async () =>
      (await DashboardService.overdueReport(dashboardParams)) as OverduePayload,
  })
  const projectsQuery = useQuery({
    queryKey: ["dashboard", "projects-catalog"],
    queryFn: () => ProjectsService.listProjects({ limit: 200 }),
  })
  const usersQuery = useQuery({
    queryKey: ["dashboard", "users"],
    queryFn: async (): Promise<MemberCandidate[]> => {
      if (currentUser?.is_superuser) {
        return (await UsersService.readUsers({ limit: 500 })).data.map((u) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
        }))
      }
      if (!primaryMembership?.company_id) return []
      return (await listCompanyMembers(primaryMembership.company_id)).map(
        (m) => ({ id: m.user_id, email: m.email, full_name: m.full_name }),
      )
    },
    enabled: Boolean(
      currentUser && (currentUser.is_superuser || primaryMembership?.company_id),
    ),
  })
  const meQuery = useQuery({
    queryKey: ["dashboard", "me"],
    queryFn: () => UsersService.readUserMe(),
  })
  const departmentsQuery = useQuery({
    enabled: Boolean(primaryMembership?.company_id),
    queryKey: ["dashboard", "departments", primaryMembership?.company_id],
    queryFn: () =>
      RolesService.listDepartments({
        companyId: primaryMembership!.company_id,
      }),
  })

  const pendingQuotationsQuery = useQuery({
    queryKey: ["dashboard", "pending-quotations"],
    queryFn: getMyPendingQuotations,
    refetchInterval: 60_000,
  })

  const myPermissionsQuery = useMyPermissions()
  const myPermissions = myPermissionsQuery.data ?? []
  const pendingProcurementQuery = useQuery({
    queryKey: ["dashboard", "pending-procurement", myPermissions],
    queryFn: () => getMyPendingProcurementActions(myPermissions),
    enabled: myPermissionsQuery.isSuccess,
    refetchInterval: 60_000,
  })

  const createProjectMutation = useMutation({
    mutationFn: async (payload: ProjectCreate) => {
      const project = (await ProjectsService.createProject({
        requestBody: payload,
      })) as ProjectPublic
      for (const userId of selectedMemberIds) {
        const assignments = await RolesService.listUserCompanyRoles({ userId })
        const assignment =
          assignments.find(
            (row) =>
              row.is_primary &&
              row.company_id === (primaryMembership?.company_id ?? ""),
          ) ??
          assignments.find(
            (row) => row.company_id === (primaryMembership?.company_id ?? ""),
          )
        if (!assignment) continue
        await ProjectsService.addMember({
          projectId: project.id,
          userId,
          roleId: assignment.role_id,
        })
      }
      return project
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "projects-catalog"],
      })
      setCreateProjectOpen(false)
      setProjectNameDraft("")
      setProjectMemberKeyword("")
      setSelectedMemberIds([])
      window.location.href = `/projects/${project.id}`
    },
  })

  // ── Derived data ────────────────────────────────────────────────────────────

  const overview = overviewQuery.data
  const allProjects = useMemo(
    () => projectsQuery.data?.data ?? [],
    [projectsQuery.data],
  )

  const mergedProjects = useMemo(() => {
    return projectStatsQuery.data ?? []
  }, [projectStatsQuery.data])

  const projectsByStatus = useMemo(() => {
    const active: typeof mergedProjects = []
    const done: typeof mergedProjects = []
    const notStarted: typeof mergedProjects = []
    for (const p of mergedProjects) {
      if (p.status === "completed" || p.status === "cancelled") done.push(p)
      else if (p.status === "planning") notStarted.push(p)
      else active.push(p) // in_progress, on_hold, active, etc.
    }
    return { active, done, notStarted }
  }, [mergedProjects])

  const overdueTasks = useMemo(() => {
    const od = overdueQuery.data
    if (!od) return []
    return [
      ...od.overdue_critical.map((t) => ({ ...t, isCritical: true })),
      ...od.overdue_local.map((t) => ({ ...t, isCritical: false })),
    ].sort((a, b) => {
      if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1
      return new Date(a.end_time).getTime() - new Date(b.end_time).getTime()
    })
  }, [overdueQuery.data])

  const topWorkers = useMemo(
    () =>
      (leaderboardQuery.data ?? [])
        .slice()
        .sort((a, b) => b.done - a.done)
        .slice(0, 7),
    [leaderboardQuery.data],
  )

  const workloadSorted = useMemo(() => {
    const rows = (workloadQuery.data ?? [])
      .slice()
      .sort((a, b) => b.active_tasks - a.active_tasks)
      .slice(0, 8)
    const max = rows[0]?.active_tasks ?? 1
    return rows.map((r) => ({
      ...r,
      pct: Math.round((r.active_tasks / max) * 100),
    }))
  }, [workloadQuery.data])

  const memberCandidates = useMemo(() => {
    const keyword = projectMemberKeyword.trim().toLowerCase()
    const rows = (usersQuery.data ?? []).filter((r) => r.id !== meQuery.data?.id)
    if (!keyword) return rows.slice(0, 15)
    return rows
      .filter((r) => {
        const name = (r.full_name ?? "").toLowerCase()
        return name.includes(keyword) || r.email.toLowerCase().includes(keyword)
      })
      .slice(0, 15)
  }, [projectMemberKeyword, usersQuery.data, meQuery.data?.id])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 pb-24 md:px-0">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">
            Bao quát dự án, tiến độ và nguồn lực
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link to="/reports" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full gap-1.5 sm:w-auto">
              <BarChart2 className="size-4" />
              Báo cáo
            </Button>
          </Link>
          <PermissionGuard permission="PROJECT_CREATE">
            <LoadingButton
              loading={false}
              className="w-full shrink-0 sm:w-auto"
              onClick={() => setCreateProjectOpen(true)}
            >
              + Tạo dự án
            </LoadingButton>
          </PermissionGuard>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <Select
          value={projectFilter || "all"}
          onValueChange={(v) => setProjectFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-full sm:w-[200px]">
            <SelectValue placeholder="Tất cả dự án" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả dự án</SelectItem>
            {allProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={departmentFilter || "all"}
          onValueChange={(v) => setDepartmentFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-full sm:w-[200px]">
            <SelectValue placeholder="Tất cả phòng ban" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả phòng ban</SelectItem>
            {(departmentsQuery.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FolderOpen className="size-4" />
            <span className="text-xs font-medium">Dự án</span>
          </div>
          <p className="mt-2 text-3xl font-black">{overview?.total_projects ?? "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="size-4" />
            <span className="text-xs font-medium">Task hoàn thành</span>
          </div>
          <p className="mt-2 text-3xl font-black text-green-600">
            {overview?.done_tasks ?? "—"}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              / {overview?.total_tasks ?? "—"}
            </span>
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="size-4" />
            <span className="text-xs font-medium">Task trễ</span>
          </div>
          <p className={`mt-2 text-3xl font-black ${(overview?.overdue_tasks ?? 0) > 0 ? "text-red-600" : "text-muted-foreground"}`}>
            {overview?.overdue_tasks ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="size-4" />
            <span className="text-xs font-medium">Tỷ lệ hoàn thành</span>
          </div>
          <p className="mt-2 text-3xl font-black text-primary">
            {overview?.completion_rate_pct ?? "—"}%
          </p>
          <ProgressBar value={overview?.completion_rate_pct ?? 0} className="mt-2" />
        </div>
      </div>

      {/* ── Widget Báo Giá chờ xử lý ────────────────────────────────────────── */}
      {(pendingQuotationsQuery.data?.length ?? 0) > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-bold">Báo giá chờ xử lý</h2>
              <span className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {pendingQuotationsQuery.data!.length}
              </span>
            </div>
            <Link
              to="/quotations"
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Xem tất cả
            </Link>
          </div>
          <div className="space-y-2">
            {pendingQuotationsQuery.data!.slice(0, 5).map((q) => {
              const stageCfg = STAGE_CONFIG[q.current_stage]
              return (
                <Link
                  key={q.id}
                  to="/quotations/$quotationId"
                  params={{ quotationId: q.id }}
                  search={{ tab: "overview" }}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{q.project_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{q.client_company_name} · {q.quote_number}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${stageCfg.badgeBg} ${stageCfg.badgeText}`}>
                    {stageCfg.shortLabel}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Widget Mua hàng cần xử lý ──────────────────────────────────────── */}
      {(pendingProcurementQuery.data?.length ?? 0) > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🛒</span>
              <h2 className="text-sm font-bold">Mua hàng cần xử lý</h2>
              <span className="flex size-5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                {pendingProcurementQuery.data!.length}
              </span>
            </div>
            <a
              href="/procurement"
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Xem tất cả
            </a>
          </div>
          <div className="space-y-2">
            {pendingProcurementQuery.data!.slice(0, 6).map((action) => (
              <a
                key={`${action.actionType}-${action.id}`}
                href={action.url}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{action.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{action.subtitle}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  action.actionType === "tech_review" ? "bg-blue-100 text-blue-700" :
                  action.actionType === "director_approve" ? "bg-orange-100 text-orange-700" :
                  action.actionType === "select_supplier" ? "bg-yellow-100 text-yellow-700" :
                  action.actionType === "add_quotes" ? "bg-purple-100 text-purple-700" :
                  action.actionType === "mark_ordered" ? "bg-green-100 text-green-700" :
                  "bg-teal-100 text-teal-700"
                }`}>
                  {action.actionType === "tech_review" ? "KT duyệt" :
                   action.actionType === "director_approve" ? "BGĐ duyệt" :
                   action.actionType === "select_supplier" ? "Chọn NCC" :
                   action.actionType === "add_quotes" ? "Báo giá" :
                   action.actionType === "mark_ordered" ? "Đặt hàng" :
                   "Nhận hàng"}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Cảnh báo: Task trễ deadline ─────────────────────────────────────── */}
      {overdueTasks.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-500" />
            <h2 className="text-sm font-bold">
              Cảnh báo — Task trễ deadline
            </h2>
            <Badge variant="destructive">{overdueTasks.length}</Badge>
          </div>
          <div className="overflow-hidden rounded-xl border border-red-100">
            <div className="overflow-x-auto">
              <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow className="bg-red-50 hover:bg-red-50">
                  <TableHead className="w-[220px] text-red-700">Task</TableHead>
                  <TableHead className="text-red-700">Trạng thái hiện tại</TableHead>
                  <TableHead className="text-red-700">Dự án</TableHead>
                  <TableHead className="text-red-700">Phụ trách</TableHead>
                  <TableHead className="text-red-700">Ngày bắt đầu</TableHead>
                  <TableHead className="text-red-700">Deadline</TableHead>
                  <TableHead className="text-red-700">Mức độ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueTasks.slice(0, 8).map((task) => (
                  <TableRow key={task.task_id} className="hover:bg-red-50/50">
                    <TableCell className="max-w-[220px]">
                      <p className="truncate font-medium">{task.name}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={task.status || "in_progress"} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.project_name ?? task.project_id}
                    </TableCell>
                    <TableCell>{task.assignee_name ?? task.assignee_id}</TableCell>
                    <TableCell>{formatDate(task.start_time)}</TableCell>
                    <TableCell className="font-medium text-red-600">
                      {formatDate(task.end_time)}
                    </TableCell>
                    <TableCell>
                      {task.isCritical ? (
                        <Badge variant="destructive">Ảnh hưởng tiến độ</Badge>
                      ) : (
                        <Badge variant="outline">Cục bộ</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}

      {/* ── Danh sách dự án ─────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <FolderOpen className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold">Dự án</h2>
          <span className="text-xs text-muted-foreground">
            ({mergedProjects.length})
          </span>
        </div>

        {mergedProjects.length === 0 ? (
          <div className="rounded-xl border p-8 text-center">
            <p className="text-sm font-semibold">Chưa có dự án nào.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bấm <span className="font-semibold">+ Tạo dự án</span> để bắt đầu.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList className="mb-3 h-auto w-full justify-start overflow-x-auto whitespace-nowrap">
              <TabsTrigger value="all">
                Tất cả
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {mergedProjects.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="active">
                Đang thực hiện
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {projectsByStatus.active.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="notStarted">
                Chưa bắt đầu
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {projectsByStatus.notStarted.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="done">
                Hoàn thành
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {projectsByStatus.done.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {(["all", "active", "notStarted", "done"] as const).map((tab) => {
              const rows =
                tab === "all"
                  ? mergedProjects
                  : tab === "active"
                    ? projectsByStatus.active
                    : tab === "notStarted"
                      ? projectsByStatus.notStarted
                      : projectsByStatus.done
              return (
                <TabsContent key={tab} value={tab}>
                  <div className="overflow-hidden rounded-xl border">
                    {rows.length === 0 ? (
                      <p className="p-6 text-center text-sm text-muted-foreground">
                        Không có dự án nào.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table className="min-w-[760px] table-fixed">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[280px]">Tên dự án</TableHead>
                            <TableHead className="w-[140px]">Trạng thái</TableHead>
                            <TableHead className="w-[120px]">Deadline</TableHead>
                            <TableHead className="w-[90px] text-center">Task</TableHead>
                            <TableHead className="w-[70px] text-center">Trễ</TableHead>
                            <TableHead className="w-[160px]">Hoàn thành</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.slice(0, 50).map((project) => (
                            <TableRow key={project.project_id}>
                              <TableCell className="w-[280px] max-w-[280px]">
                                <Link
                                  to="/projects/$projectId"
                                  params={{ projectId: project.project_id }}
                                  className="block w-full truncate font-semibold hover:text-primary hover:underline"
                                  title={project.name}
                                >
                                  {project.name}
                                </Link>
                                {project.code && (
                                  <p
                                    className="w-full truncate text-xs text-muted-foreground"
                                    title={project.code}
                                  >
                                    {project.code}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={project.status ?? "planning"} />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {project.end_date ? (
                                  <span className={new Date(project.end_date).getTime() < Date.now() && project.status !== "completed" ? "text-red-600 font-semibold" : ""}>
                                    {formatDate(project.end_date)}
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                <span className="font-semibold text-green-600">
                                  {project.done_tasks}
                                </span>
                                <span className="text-muted-foreground">
                                  /{project.total_tasks}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                {project.overdue_tasks > 0 ? (
                                  <span className="font-semibold text-red-600">
                                    {project.overdue_tasks}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <ProgressBar
                                    value={project.completion_pct}
                                    className="flex-1"
                                  />
                                  <span className="w-8 text-right text-xs font-bold text-primary">
                                    {project.completion_pct}%
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>
        )}
      </section>

      {/* ── Workload + Leaderboard ───────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Workload */}
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Phân bổ nguồn lực</h2>
            <span className="text-xs text-muted-foreground">active tasks</span>
          </div>
          {workloadSorted.length === 0 ? (
            <p className="text-xs text-muted-foreground">Không có dữ liệu.</p>
          ) : (
            <div className="space-y-3">
              {workloadSorted.map((item) => (
                <div key={item.user_id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium">
                      {item.user_name ?? item.user_id}
                    </span>
                    <span className="ml-2 shrink-0 font-bold text-primary">
                      {item.active_tasks}
                    </span>
                  </div>
                  <ProgressBar
                    value={item.pct}
                    color={item.pct >= 80 ? "bg-orange-400" : "bg-blue-500"}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Leaderboard */}
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Hiệu suất nhân sự</h2>
            <span className="text-xs text-muted-foreground">top hoàn thành task</span>
          </div>
          {topWorkers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Không có dữ liệu.</p>
          ) : (
            <div className="space-y-2">
              {topWorkers.map((worker, index) => (
                <div
                  key={worker.user_id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/40"
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      index === 0
                        ? "bg-yellow-400 text-yellow-900"
                        : index === 1
                          ? "bg-slate-300 text-slate-700"
                          : index === 2
                            ? "bg-amber-600 text-white"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {worker.user_name ?? worker.user_id}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="text-green-600 font-medium">
                        {worker.done} done
                      </span>
                      <span>·</span>
                      <span>{worker.on_time} đúng hạn</span>
                      {worker.overdue > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-red-500">{worker.overdue} trễ</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-primary">
                    {worker.completion_pct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Create Project Dialog ────────────────────────────────────────────── */}
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tạo dự án mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Tên dự án
              </p>
              <Input
                value={projectNameDraft}
                onChange={(e) => setProjectNameDraft(e.target.value)}
                placeholder="Nhập tên dự án..."
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Chọn nhân viên tham gia (tuỳ chọn)
              </p>
              <Input
                value={projectMemberKeyword}
                onFocus={() => setProjectMemberPickerOpen(true)}
                onBlur={() => {
                  setTimeout(() => setProjectMemberPickerOpen(false), 120)
                }}
                onChange={(e) => setProjectMemberKeyword(e.target.value)}
                placeholder="Gõ tên hoặc email để tìm..."
              />
              {projectMemberPickerOpen ? (
                <div className="max-h-52 overflow-auto rounded-md border">
                  {memberCandidates.map((user) => {
                    const selected = selectedMemberIds.includes(user.id)
                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={[
                          "flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted",
                          selected ? "bg-muted" : "",
                        ].join(" ")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          setSelectedMemberIds((prev) =>
                            prev.includes(user.id)
                              ? prev.filter((id) => id !== user.id)
                              : [...prev, user.id],
                          )
                        }
                      >
                        <span className="font-medium">
                          {user.full_name || "N/A"}
                        </span>
                        <span className="text-muted-foreground">{user.email}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {selectedMemberIds.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Đã chọn: {selectedMemberIds.length} thành viên
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateProjectOpen(false)}
            >
              Hủy
            </Button>
            <LoadingButton
              loading={createProjectMutation.isPending}
              onClick={() => {
                const title = projectNameDraft.trim()
                if (!title) return
                const today = new Date()
                const end = new Date(today)
                end.setDate(today.getDate() + 30)
                const pad = (n: number) => String(n).padStart(2, "0")
                const toISODate = (d: Date) =>
                  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                createProjectMutation.mutate({
                  name: title,
                  code: `PRJ-${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`,
                  description: null,
                  start_date: toISODate(today),
                  end_date: toISODate(end),
                  status: "planning",
                  department_id: null,
                })
              }}
            >
              Tạo dự án
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
