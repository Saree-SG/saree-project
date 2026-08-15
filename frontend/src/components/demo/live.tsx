import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import {
  DashboardService,
  IncidentsService,
  ProjectsService,
  TasksService,
} from "@/client"
import {
  getStaffingSummary,
  getTeamProductivity,
  getUnderstaffedTasks,
  type ProductivityRow,
  type UnderstaffedTask,
} from "@/modules/dashboard/productivityApi"
import { type Candidate, fetchCandidates } from "@/modules/dispatch/dispatchApi"
import { addTaskExtraAssignee } from "@/modules/tasks/taskApi"

import type { DemoTask, Incident, LoadStatus, Site, Staff } from "./mock"
import {
  KpiView,
  OverviewView,
  RepairView,
  SitesView,
  StaffView,
  TasksView,
} from "./views"

/**
 * Container "LIVE" — fetch API thật rồi truyền vào View (thay mock).
 * Bước 1: chỉ dùng endpoint đã có (overview, projectStats, leaderboard, userWorkload).
 * Các số chưa có (tải trọng thật, thiếu người) để Bước 2.
 */

type OverviewResp = {
  total_projects?: number
  completion_rate_pct?: number
  overdue_tasks?: number
}
type ProjectStat = {
  project_id: string
  name: string
  status?: string
  completion_pct?: number
}
type BoardRow = {
  user_id: string
  user_name?: string
  completion_pct?: number
  done?: number
  on_time?: number
}

const STATUS_MAP: Record<string, Site["status"]> = {
  planning: "Chuẩn bị",
  active: "Đang thi công",
  in_progress: "Đang thi công",
  done: "Đã vận hành",
  completed: "Đã vận hành",
}

// Chuyển 1 row team-productivity → Staff (dùng workload_pct/load_status THẬT nếu có).
function prodRowToStaff(r: ProductivityRow, maxTasks: number): Staff {
  const load =
    r.workload_pct != null
      ? Math.round(r.workload_pct)
      : Math.round((r.tasks_total / maxTasks) * 100)
  const status: LoadStatus =
    r.load_status ??
    (r.tasks_total === 0 ? "free" : load >= 90 ? "overloaded" : "stable")
  return {
    id: r.user_id,
    name: r.user_name,
    group: r.department_name ?? "Chưa có tổ",
    skills: [],
    status,
    availability: r.tasks_total === 0 ? "Rảnh" : "Đang làm",
    tasks: r.tasks_total,
    hours: r.work_hours,
    load,
    progress: Math.round(r.completion_pct),
  }
}
function prodRowsToStaff(rows: ProductivityRow[]): Staff[] {
  const maxTasks = Math.max(1, ...rows.map((r) => r.tasks_total))
  return rows.map((r) => prodRowToStaff(r, maxTasks))
}

export function LiveOverview() {
  const overview = useQuery({
    queryKey: ["live", "overview"],
    queryFn: () =>
      DashboardService.overview({}) as unknown as Promise<OverviewResp>,
  })
  const projectList = useQuery({
    queryKey: ["live", "projects"],
    queryFn: () =>
      ProjectsService.listProjects() as unknown as Promise<
        { data?: ProjectRow[] } | ProjectRow[]
      >,
  })
  const stats = useQuery({
    queryKey: ["live", "projectStats"],
    queryFn: () =>
      DashboardService.projectStats({}) as unknown as Promise<ProjectStat[]>,
  })
  const board = useQuery({
    queryKey: ["live", "leaderboard"],
    queryFn: () =>
      DashboardService.leaderboard({}) as unknown as Promise<BoardRow[]>,
  })
  const prod = useQuery({
    queryKey: ["live", "team-productivity"],
    queryFn: () => getTeamProductivity({}),
  })
  const summary = useQuery({
    queryKey: ["live", "staffing-summary"],
    queryFn: () => getStaffingSummary({}),
  })

  if (overview.isLoading || projectList.isLoading) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Đang tải dữ liệu thật...
      </p>
    )
  }

  const o = overview.data ?? {}
  const pctById = new Map(
    (stats.data ?? []).map((s) => [
      s.project_id,
      Math.round(s.completion_pct ?? 0),
    ]),
  )
  const statusById = new Map(
    (stats.data ?? []).map((s) => [s.project_id, s.status ?? ""]),
  )
  const mappedProjects: Site[] = projectsArray(projectList.data).map((p) => ({
    id: p.id,
    name: p.name,
    address: "",
    status:
      STATUS_MAP[statusById.get(p.id) ?? p.status ?? ""] ?? "Đang thi công",
    pct: pctById.get(p.id) ?? 0,
    staffCount: 0,
    lat: p.site_lat ?? 0,
    lng: p.site_lng ?? 0,
  }))
  const leaderboard = (board.data ?? []).map((r) => ({
    name: r.user_name ?? r.user_id,
    dept: "",
    done: r.done ?? 0,
    onTime: r.on_time ?? 0,
    completionPct: Math.round(r.completion_pct ?? 0),
  }))
  const staff = prodRowsToStaff(prod.data?.rows ?? [])

  return (
    <OverviewView
      projects={mappedProjects}
      staff={staff}
      leaderboard={leaderboard}
      completionAvg={Math.round(o.completion_rate_pct ?? 0)}
      overdue={o.overdue_tasks ?? 0}
      understaffed={summary.data?.understaffed_tasks ?? 0}
    />
  )
}

export function LiveKpi() {
  const prod = useQuery({
    queryKey: ["live", "team-productivity"],
    queryFn: () => getTeamProductivity({}),
  })

  if (prod.isLoading) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Đang tải KPI thật...
      </p>
    )
  }

  const rows = prod.data?.rows ?? []
  const staff = prodRowsToStaff(rows)
  const completionAvg = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.completion_pct, 0) / rows.length)
    : 0

  return <KpiView staff={staff} completionAvg={completionAvg} live />
}

// ── Công trình ──────────────────────────────────────────────────────────────
type ProjectRow = {
  id: string
  name: string
  status?: string
  site_lat?: number | null
  site_lng?: number | null
}

function useProjects() {
  return useQuery({
    queryKey: ["live", "projects"],
    queryFn: () =>
      ProjectsService.listProjects() as unknown as Promise<
        { data?: ProjectRow[] } | ProjectRow[]
      >,
  })
}
function projectsArray(
  d: { data?: ProjectRow[] } | ProjectRow[] | undefined,
): ProjectRow[] {
  if (!d) return []
  return Array.isArray(d) ? d : (d.data ?? [])
}

export function LiveSites() {
  const list = useProjects()
  const stats = useQuery({
    queryKey: ["live", "projectStats"],
    queryFn: () =>
      DashboardService.projectStats({}) as unknown as Promise<ProjectStat[]>,
  })
  if (list.isLoading)
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Đang tải công trình...
      </p>
    )

  const pctById = new Map(
    (stats.data ?? []).map((s) => [
      s.project_id,
      Math.round(s.completion_pct ?? 0),
    ]),
  )
  const sites: Site[] = projectsArray(list.data).map((p) => ({
    id: p.id,
    name: p.name,
    address: "",
    status: STATUS_MAP[p.status ?? ""] ?? "Đang thi công",
    pct: pctById.get(p.id) ?? 0,
    staffCount: 0,
    lat: p.site_lat ?? 0,
    lng: p.site_lng ?? 0,
  }))
  return <SitesView sites={sites} live />
}

// ── Công việc (của tôi) ─────────────────────────────────────────────────────
type TaskItem = {
  task: {
    id: string
    name: string
    status: string
    computed_status?: string
    end_time: string
    assignee_name?: string
    reported_progress_total?: number
    module_tag?: string
    project_id: string
  }
}
type MyDash = {
  overdue_critical?: TaskItem[]
  overdue_local?: TaskItem[]
  due_soon?: TaskItem[]
  today?: TaskItem[]
  ongoing?: TaskItem[]
}

export function LiveTasks() {
  const dash = useQuery({
    queryKey: ["live", "myTasks"],
    queryFn: () => TasksService.myDashboard() as unknown as Promise<MyDash>,
  })
  const list = useProjects()
  if (dash.isLoading)
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Đang tải công việc...
      </p>
    )

  const nameById = new Map(projectsArray(list.data).map((p) => [p.id, p.name]))
  const d = dash.data ?? {}
  const items = [
    ...(d.overdue_critical ?? []),
    ...(d.overdue_local ?? []),
    ...(d.due_soon ?? []),
    ...(d.today ?? []),
    ...(d.ongoing ?? []),
  ]
  const seen = new Set<string>()
  const tasks: DemoTask[] = items
    .map((it) => it.task)
    .filter((t) => (seen.has(t.name) ? false : (seen.add(t.name), true)))
    .map((t, i) => {
      const st = t.computed_status ?? t.status
      const status: DemoTask["status"] = !t.assignee_name
        ? "Chưa phân công"
        : st === "todo"
          ? "Chờ làm"
          : "Đang làm"
      return {
        id: t.id ?? `${i}`,
        name: t.name,
        skill: t.module_tag ?? "—",
        site: nameById.get(t.project_id) ?? "—",
        status,
        deadline: t.end_time
          ? new Date(t.end_time).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
            })
          : "—",
        progress: Math.round(t.reported_progress_total ?? 0),
        need: 1,
        assignees: t.assignee_name ? [t.assignee_name] : [],
      }
    })
  return <TasksView tasks={tasks} live />
}

// ── Sửa chữa (sự cố) ────────────────────────────────────────────────────────
type IncidentRow = {
  id: string
  title: string
  description: string
  category: string
  severity: string
  status: string
  project_id?: string | null
  resolved_by?: string | null
}

export function LiveRepair() {
  const inc = useQuery({
    queryKey: ["live", "incidents"],
    queryFn: () =>
      IncidentsService.listIncidents() as unknown as Promise<
        { data?: IncidentRow[] } | IncidentRow[]
      >,
  })
  const list = useProjects()
  if (inc.isLoading)
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Đang tải sự cố...
      </p>
    )

  const nameById = new Map(projectsArray(list.data).map((p) => [p.id, p.name]))
  const raw = Array.isArray(inc.data) ? inc.data : (inc.data?.data ?? [])
  const incidents: Incident[] = raw
    .filter((i) => i.status !== "resolved" && i.status !== "closed")
    .map((i) => ({
      id: i.id,
      site: (i.project_id ? nameById.get(i.project_id) : undefined) ?? i.title,
      desc: i.description || i.title,
      system: i.category,
      address: "",
      priority: i.severity === "high" || i.severity === "critical",
      handler: i.resolved_by ?? undefined,
    }))
  return <RepairView incidents={incidents} live />
}

// ── Nhân viên (Bước 3) ───────────────────────────────────────────────────────
export function LiveStaff() {
  const prod = useQuery({
    queryKey: ["live", "team-productivity"],
    queryFn: () =>
      getTeamProductivity({ month: new Date().toISOString().slice(0, 7) }),
  })

  if (prod.isLoading)
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Đang tải nhân sự...
      </p>
    )

  const rows: ProductivityRow[] = Array.isArray(prod.data)
    ? prod.data
    : ((prod.data as { rows?: ProductivityRow[] })?.rows ?? [])

  const staff: Staff[] = rows.map((r) => ({
    id: r.user_id,
    name: r.user_name ?? r.user_id,
    group: r.department_name ?? "—",
    skills: [],
    status: (r.load_status as LoadStatus) ?? "stable",
    availability: r.load_status === "free" ? "Rảnh" : "Đang làm",
    tasks: r.tasks_total ?? 0,
    hours: Math.round(r.work_hours ?? 0),
    load: Math.round(r.workload_pct ?? 0),
    progress: Math.round(r.completion_pct ?? 0),
    currentTask: undefined,
    currentSite: undefined,
  }))

  return <StaffView staff={staff} live />
}

// ── Điều phối (Bước 4) ───────────────────────────────────────────────────────

const LOAD_COLOR: Record<string, string> = {
  free: "text-green-600",
  stable: "text-amber-600",
  overloaded: "text-red-600",
}
const LOAD_LABEL: Record<string, string> = {
  free: "Rảnh",
  stable: "Đang làm",
  overloaded: "Quá tải",
}
const IMPACT_COLOR: Record<string, string> = {
  "Ít ảnh hưởng": "text-green-600",
  "Ảnh hưởng vừa": "text-amber-600",
  "Ảnh hưởng lớn": "text-red-600",
}

function CandidateCard({
  c,
  onAssign,
  assigning,
}: {
  c: Candidate
  onAssign: () => void
  assigning: boolean
}) {
  const dots = [1, 2, 3, 4, 5]
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{c.user_name}</p>
          <p className="text-xs text-slate-500">
            {c.skill_name} · Cấp {c.skill_level}
          </p>
        </div>
        <div className="flex gap-0.5 mt-0.5">
          {dots.map((d) => (
            <span
              key={d}
              className={`h-2 w-2 rounded-full ${d <= c.skill_level ? "bg-blue-500" : "bg-slate-200"}`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-xs">
        <div className="rounded-lg bg-slate-50 px-2 py-1 text-center">
          <p className={`font-semibold ${LOAD_COLOR[c.load_status]}`}>
            {LOAD_LABEL[c.load_status]}
          </p>
          <p className="text-[10px] text-slate-400">Tải trọng</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1 text-center">
          <p className="font-semibold text-slate-700">
            {c.distance_km != null ? `${c.distance_km}km` : "—"}
          </p>
          <p className="text-[10px] text-slate-400">Khoảng cách</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1 text-center">
          <p className="font-semibold text-slate-700">
            {c.eta_minutes != null ? `~${c.eta_minutes}p` : "—"}
          </p>
          <p className="text-[10px] text-slate-400">Di chuyển</p>
        </div>
      </div>

      {c.current_site_name && (
        <p className="text-xs text-slate-500">Đang ở: {c.current_site_name}</p>
      )}

      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${IMPACT_COLOR[c.impact]}`}>
          {c.impact}
        </span>
        <span className="text-xs text-slate-400">Điểm: {c.score}</span>
      </div>

      <button
        disabled={assigning}
        onClick={onAssign}
        className="w-full rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {assigning ? "Đang bố trí..." : "Bố trí ngay"}
      </button>
    </div>
  )
}

export function LiveDispatch() {
  const qc = useQueryClient()
  const [selectedTask, setSelectedTask] = useState<UnderstaffedTask | null>(
    null,
  )
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assigned, setAssigned] = useState<Set<string>>(new Set())

  const understaffed = useQuery({
    queryKey: ["live", "understaffed"],
    queryFn: () => getUnderstaffedTasks(),
  })

  const candidates = useQuery({
    queryKey: ["dispatch", "candidates", selectedTask?.task_id],
    queryFn: () => fetchCandidates(selectedTask!.task_id),
    enabled: !!selectedTask,
  })

  async function handleAssign(candidate: Candidate) {
    if (!selectedTask) return
    setAssigningId(candidate.user_id)
    try {
      await addTaskExtraAssignee(selectedTask.task_id, candidate.user_id)
      setAssigned((prev) => new Set([...prev, candidate.user_id]))
      qc.invalidateQueries({ queryKey: ["live", "understaffed"] })
      qc.invalidateQueries({
        queryKey: ["dispatch", "candidates", selectedTask.task_id],
      })
    } finally {
      setAssigningId(null)
    }
  }

  if (understaffed.isLoading)
    return (
      <p className="py-10 text-center text-sm text-slate-400">Đang tải...</p>
    )

  const tasks = understaffed.data ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Điều phối nhân sự</h1>
        <p className="text-sm text-slate-500">
          Gợi ý tự động theo kỹ năng · tải trọng · khoảng cách
        </p>
      </div>

      {tasks.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 text-center">
          <p className="text-sm font-medium text-green-700">
            Tất cả công việc đủ nhân sự
          </p>
        </div>
      )}

      {/* Danh sách task thiếu người */}
      {tasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            {tasks.length} công việc đang thiếu người:
          </p>
          {tasks.map((t) => (
            <button
              key={t.task_id}
              onClick={() => {
                setSelectedTask(t)
                setAssigned(new Set())
              }}
              className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                selectedTask?.task_id === t.task_id
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  Thiếu {t.shortage} người
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Cần {t.required} · Đã có {t.assigned}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Danh sách gợi ý */}
      {selectedTask && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              Gợi ý cho:{" "}
              <span className="text-blue-700">{selectedTask.name}</span>
            </p>
            <button
              onClick={() => setSelectedTask(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ✕ Đóng
            </button>
          </div>

          {candidates.isLoading && (
            <p className="py-4 text-center text-sm text-slate-400">
              Đang phân tích nhân sự...
            </p>
          )}

          {candidates.data?.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">
              Không tìm thấy nhân sự phù hợp.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {(candidates.data ?? [])
              .filter((c) => !assigned.has(c.user_id))
              .map((c) => (
                <CandidateCard
                  key={c.user_id}
                  c={c}
                  assigning={assigningId === c.user_id}
                  onAssign={() => handleAssign(c)}
                />
              ))}
          </div>

          {assigned.size > 0 && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              ✓ Đã bố trí {assigned.size} người. Danh sách gợi ý đã được cập
              nhật.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
