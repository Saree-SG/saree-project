import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderOpen,
  MapPin,
  UserCheck,
} from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"

import { MapContainer, TileLayer, Marker } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { Card } from "@/components/ui/card"
import { StatCard } from "@/components/ui/stat-card"
import { cn } from "@/lib/utils"

// Fix Leaflet icon paths in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

import { Row, useDetail } from "./detail"
import {
  IncidentDetailLive,
  SiteDetailLive,
  StaffDetailLive,
  TaskDetailLive,
} from "./detailLive"
import {
  CANDIDATES,
  DISPATCH_TASK,
  INCIDENTS,
  LEADERBOARD,
  LOAD_META,
  SITE_STATUS_CLS,
  SITES,
  STAFF,
  TASKS,
  type DemoTask,
  type Incident,
  type Site,
  type Staff,
} from "./mock"

/** Card bấm được → mở chi tiết. */
const clickable = "cursor-pointer transition hover:ring-2 hover:ring-blue-200"

// Mock lịch sử suy ra deterministic từ nhân viên (chỉ để preview).
function mockAttendance(s: Staff) {
  const days = ["24/07", "23/07", "22/07", "21/07", "20/07"]
  return days.map((d, i) => ({
    date: d,
    in: "07:3" + i,
    out: "17:0" + ((i * 2) % 6),
    hours: 8 - (i % 2 === 0 ? 0 : 0.5),
    site: s.currentSite ?? "Nhà máy thực phẩm Long An",
  }))
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-3">
      <p className="mb-1 text-xs font-semibold text-slate-600">{title}</p>
      {children}
    </div>
  )
}

function StaffBody({ s }: { s: Staff }) {
  const open = useDetail()
  const currentSite = s.currentSite ? SITES.find((p) => p.name === s.currentSite) : null
  const myTasks = TASKS.filter((t) => t.assignees.includes(s.name))
  return (
    <div className="space-y-1 pt-2">
      <Row k="Tổ / Nhóm" v={s.group} />
      <Row k="Trạng thái" v={s.availability} />
      <Row k="Kỹ năng" v={s.skills.map((k) => `${k.name} (Cấp ${k.level})`).join(", ")} />
      <Row k="Giờ làm (30 ngày)" v={`${s.hours}h`} />
      <Row k="Tải trọng" v={<span className={s.load > 100 ? "text-red-600" : ""}>{s.load}%{s.load > 100 ? " · quá tải" : ""}</span>} />

      {currentSite && (
        <Section title="Đang thi công tại">
          <button
            className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
            onClick={() => open({ title: currentSite.name, subtitle: currentSite.address, accent: "green", body: <SiteBody p={currentSite} /> })}
          >
            <span className="text-sm text-slate-700">{currentSite.name}</span>
            <span className="text-xs text-slate-400">{s.currentTask} →</span>
          </button>
        </Section>
      )}

      {myTasks.length > 0 && (
        <Section title={`Công việc đang làm (${myTasks.length})`}>
          <div className="space-y-1">
            {myTasks.map((t) => (
              <button
                key={t.id}
                className="w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
                onClick={() => open({ title: t.name, subtitle: t.site, accent: "blue", body: <TaskBody t={t} /> })}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs text-slate-700">{t.name}</span>
                  <span className="shrink-0 text-xs text-blue-600">{t.progress}% →</span>
                </div>
                <p className="text-[11px] text-slate-400">{t.status} · Hạn {t.deadline}</p>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Chấm công gần đây">
        <div className="space-y-1">
          {mockAttendance(s).map((a) => (
            <div key={a.date} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
              <span className="text-slate-600">{a.date}</span>
              <span className="text-slate-500">{a.in}–{a.out}</span>
              <span className="font-medium text-slate-700">{a.hours}h</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
function staffBody(s: Staff) { return <StaffBody s={s} /> }

function SiteBody({ p }: { p: Site }) {
  const open = useDetail()
  const staff = STAFF.filter((s) => s.currentSite === p.name)
  const siteTasks = TASKS.filter((t) => t.site === p.name)
  return (
    <div className="space-y-1 pt-2">
      <Row k="Địa chỉ" v={p.address} />
      <Row k="Trạng thái" v={p.status} />
      <Row k="Tiến độ" v={`${p.pct}%`} />
      <Row k="Tọa độ GPS" v={`${p.lat}, ${p.lng}`} />
      <Row k="Số nhân sự" v={p.staffCount} />

      <Section title={`Công việc tại công trình (${siteTasks.length})`}>
        <div className="space-y-1">
          {siteTasks.length ? siteTasks.map((t) => (
            <button
              key={t.id}
              className="w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-left text-xs transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
              onClick={() => open({ title: t.name, subtitle: t.site, accent: "blue", body: <TaskBody t={t} /> })}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-slate-700">{t.name}</span>
                <span className="shrink-0 text-blue-600">{t.progress}%</span>
              </div>
              <p className="text-[11px] text-slate-400">{t.skill} · Hạn {t.deadline} · {t.assignees.length}/{t.need} người</p>
            </button>
          )) : <p className="text-sm text-slate-400">Chưa có công việc.</p>}
        </div>
      </Section>

      <Section title={`Nhân sự tại điểm (${staff.length})`}>
        <div className="space-y-1">
          {staff.length ? staff.map((s) => (
            <button
              key={s.id}
              className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
              onClick={() => open({ title: s.name, subtitle: s.group, accent: "amber", body: <StaffBody s={s} /> })}
            >
              <span className="text-sm text-slate-700">{s.name}</span>
              <span className="text-xs text-slate-400">{s.currentTask}</span>
            </button>
          )) : <p className="text-sm text-slate-400">—</p>}
        </div>
      </Section>
    </div>
  )
}
function siteBody(p: Site) { return <SiteBody p={p} /> }

function TaskBody({ t }: { t: DemoTask }) {
  const open = useDetail()
  const assignedStaff = STAFF.filter((s) => t.assignees.includes(s.name))
  const site = SITES.find((p) => p.name === t.site)
  return (
    <div className="space-y-1 pt-2">
      <Row k="Kỹ năng yêu cầu" v={t.skill} />
      <Row k="Trạng thái" v={t.status} />
      <Row k="Hạn" v={t.deadline} />
      <Row k="Tiến độ" v={`${t.progress}%`} />
      <Row k="Cần / Đã có" v={`${t.need} / ${t.assignees.length} người`} />
      {t.assignees.length < t.need && (
        <p className="pt-1 text-xs font-medium text-amber-600">⚠ Thiếu {t.need - t.assignees.length} người</p>
      )}

      {site && (
        <Section title="Công trình">
          <button
            className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
            onClick={() => open({ title: site.name, subtitle: site.address, accent: "green", body: <SiteBody p={site} /> })}
          >
            <span className="text-sm text-slate-700">{site.name}</span>
            <span className="text-xs text-slate-400">{site.pct}% hoàn thành →</span>
          </button>
        </Section>
      )}

      <Section title={`Nhân sự (${assignedStaff.length}/${t.need})`}>
        <div className="space-y-1">
          {assignedStaff.length ? assignedStaff.map((s) => (
            <button
              key={s.id}
              className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
              onClick={() => open({ title: s.name, subtitle: s.group, accent: "amber", body: <StaffBody s={s} /> })}
            >
              <span className="text-sm text-slate-700">{s.name}</span>
              <span className="text-xs text-slate-400">{s.group} →</span>
            </button>
          )) : <p className="text-sm text-slate-400">Chưa phân công</p>}
        </div>
      </Section>

      <Section title="Lịch sử tiến độ">
        <div className="space-y-1">
          {[
            { d: "24/07", note: `Cập nhật ${t.progress}%`, by: t.assignees[0] ?? "—" },
            { d: "22/07", note: "Cập nhật 30% · kèm ảnh hiện trường", by: t.assignees[0] ?? "—" },
            { d: "20/07", note: "Bắt đầu thi công", by: t.assignees[0] ?? "—" },
          ].map((h, i) => (
            <div key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-700">{h.note}</span>
                <span className="shrink-0 text-slate-400">{h.d}</span>
              </div>
              <p className="text-[11px] text-slate-400">bởi {h.by}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
function taskBody(t: DemoTask) { return <TaskBody t={t} /> }

function incidentBody(i: Incident) {
  return (
    <div className="space-y-1 pt-2">
      <Row k="Công trình" v={i.site} />
      <Row k="Mô tả" v={i.desc} />
      <Row k="Hệ thống" v={i.system} />
      <Row k="Địa chỉ" v={i.address} />
      <Row k="Ưu tiên" v={i.priority ? "Có" : "Không"} />
      <Row k="Người xử lý" v={i.handler ?? "Chưa phân"} />
      <p className="pt-3 text-[11px] text-slate-400">Bản thật: mở sự cố + nguyên nhân/giải pháp + ảnh + điều phối người.</p>
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────────
function Bar({ pct, cls = "bg-blue-600" }: { pct: number; cls?: string }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

function Chip({ text, cls }: { text: string; cls: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${cls}`}>{text}</span>
}

function Header({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="pb-1">
      <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{children}</p>
      {action}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLOR_DOT[status] ?? "bg-slate-300"
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
}

const STATUS_COLOR_DOT: Record<string, string> = {
  "active": "bg-blue-500", "in_progress": "bg-blue-500",
  "Đang thi công": "bg-blue-500", "planning": "bg-amber-400",
  "Lên kế hoạch": "bg-amber-400", "completed": "bg-emerald-500",
  "Hoàn thành": "bg-emerald-500", "on_hold": "bg-slate-400",
  "cancelled": "bg-red-400",
}

function AvatarInitials({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const words = name.trim().split(/\s+/)
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  const colors = ["bg-blue-500","bg-violet-500","bg-emerald-500","bg-orange-500","bg-pink-500","bg-teal-500","bg-indigo-500","bg-rose-500"]
  const color = colors[name.charCodeAt(0) % colors.length]
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs"
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", sz, color)}>
      {initials}
    </div>
  )
}

/** Lưới responsive: mobile 1 cột, desktop nhiều cột. */
function Grid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 2 && "md:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-2 md:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── 1. TỔNG QUAN ────────────────────────────────────────────────────────────
export type OverviewProps = {
  projects?: Site[]
  staff?: Staff[]
  leaderboard?: typeof LEADERBOARD
  completionAvg?: number
  overdue?: number
  understaffed?: number
}
export function OverviewView({
  projects = SITES,
  staff = STAFF,
  leaderboard = LEADERBOARD,
  completionAvg = 36,
  overdue = 2,
  understaffed = 3,
}: OverviewProps = {}) {
  const open = useDetail()
  const navigate = useNavigate()
  const free = staff.filter((s) => s.status === "free")
  const overloaded = staff.filter((s) => s.status === "overloaded")

  function openStaff(s: Staff) {
    open({
      title: s.name,
      accent: "blue",
      body: <StaffDetailLive userId={s.id} meta={{ name: s.name, group: s.group, load: s.load, status: s.status }} />,
    })
  }

  function openSiteDetail(p: Site) {
    navigate({ to: "/projects/$projectId", params: { projectId: p.id } })
  }

  const staffList = (list: Staff[]) => (
    <div className="space-y-1 pt-2">
      {list.length ? list.map((s) => (
        <button
          key={s.id}
          onClick={() => openStaff(s)}
          className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
        >
          <span className="truncate text-slate-700">{s.name}</span>
          <span className="shrink-0 text-xs text-slate-500">{s.group} · {s.load}% →</span>
        </button>
      )) : <p className="text-sm text-slate-400">Không có nhân viên.</p>}
    </div>
  )

  const projectList = (
    <div className="space-y-1 pt-2">
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => openSiteDetail(p)}
          className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
        >
          <span className="truncate text-slate-700">{p.name}</span>
          <span className="shrink-0 text-xs font-semibold text-blue-700">{p.pct}% →</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Stat cards — 2x2 horizontal compact */}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="text-left" onClick={() => open({ title: "Danh sách công trình", accent: "blue", body: projectList })}>
          <StatCard label="Dự án" value={projects.length} tone="info" icon={FolderOpen} />
        </button>
        <button type="button" className="text-left" onClick={() => open({ title: "Tiến độ công trình", accent: "green", body: projectList })}>
          <StatCard label="Hoàn thành TB" value={completionAvg} suffix="%" tone="success" icon={CheckCircle2} />
        </button>
        <button type="button" className="text-left" onClick={() => open({ title: "Nhân viên đang rảnh", accent: "amber", body: staffList(free) })}>
          <StatCard label="Đang rảnh" value={free.length} tone="warning" icon={UserCheck} />
        </button>
        <button type="button" className="text-left" onClick={() => open({ title: "Nhân viên quá tải", accent: "red", body: staffList(overloaded) })}>
          <StatCard label="Trễ tiến độ" value={overdue} tone="danger" icon={Clock} />
        </button>
      </div>

      {understaffed > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">{understaffed} việc thiếu người · {free.length} người rảnh</p>
          </div>
          <Link to="/dispatch" className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white">
            Bố trí
          </Link>
        </div>
      )}

      {/* Tiến độ công trình */}
      <section className="space-y-2.5">
        <SectionLabel>Tiến độ công trình</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => openSiteDetail(p)}
              className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:shadow-md hover:border-blue-200"
            >
              <div className="flex items-start justify-between gap-1">
                <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-800">{p.name}</p>
                <span className="shrink-0 text-base font-bold text-blue-600">{p.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${p.pct}%` }} />
              </div>
              <div className="flex items-center gap-1.5">
                <StatusDot status={p.status} />
                <span className="text-[11px] text-slate-400">{p.status}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Hiệu suất nhân sự */}
      <section className="space-y-2.5">
        <SectionLabel>Hiệu suất nhân sự</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {leaderboard.map((r, i) => (
            <div key={r.name} className={cn("flex items-center gap-3 px-4 py-2.5", i > 0 && "border-t border-slate-50")}>
              <span className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-200 text-slate-600" : i === 2 ? "bg-orange-200 text-orange-700" : "bg-slate-100 text-slate-400"
              )}>{i + 1}</span>
              <AvatarInitials name={r.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-slate-800">{r.name}</p>
                <p className="truncate text-[11px] text-slate-400">{r.dept}</p>
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-bold", r.completionPct >= 70 ? "text-emerald-600" : r.completionPct >= 40 ? "text-amber-600" : "text-slate-500")}>{r.completionPct}%</p>
                <p className="text-[10px] text-slate-400">{r.done}v · {r.onTime} hạn</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Phân bổ nguồn lực */}
      <section className="space-y-2.5">
        <SectionLabel action={<Link to="/kpi" className="text-[11px] font-semibold text-blue-500">Xem KPI →</Link>}>
          Phân bổ nguồn lực
        </SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {[...staff].sort((a, b) => b.load - a.load).filter((s) => s.load >= 80 || s.load === 0).map((s, i) => (
            <button key={s.id} onClick={() => openStaff(s)}
              className={cn("flex w-full items-center gap-3 px-4 py-2.5 hover:bg-slate-50", i > 0 && "border-t border-slate-50")}>
              <AvatarInitials name={s.name} size="sm" />
              <span className="w-24 shrink-0 truncate text-left text-[13px] font-medium text-slate-700">{s.name}</span>
              <Bar pct={s.load} cls={s.load >= 100 ? "bg-red-400" : s.load === 0 ? "bg-amber-300" : "bg-blue-400"} />
              <span className={cn("w-9 shrink-0 text-right text-[11px] font-bold", s.load >= 100 ? "text-red-600" : s.load === 0 ? "text-amber-600" : "text-slate-500")}>{s.load}%</span>
            </button>
          ))}
          {staff.filter((s) => s.load >= 80 || s.load === 0).length === 0 && (
            <p className="px-4 py-3 text-xs text-slate-400">Tất cả nhân viên đang ở mức tải bình thường.</p>
          )}
        </div>
      </section>

      {/* Chuyên môn theo tổ */}
      <ByDepartment staff={staff} onClickStaff={openStaff} />
    </div>
  )
}

/** Accordion nhóm nhân sự theo tổ + thanh bận rộn (ổn định/quá tải). */
function ByDepartment({ staff, onClickStaff }: { staff: Staff[]; onClickStaff?: (s: Staff) => void }) {
  const groups = new Map<string, Staff[]>()
  for (const s of staff) {
    const g = s.group || "Chưa có tổ"
    groups.set(g, [...(groups.get(g) ?? []), s])
  }
  if (groups.size === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">Chuyên môn theo tổ</h2>
      <div className="space-y-2">
        {[...groups.entries()].map(([g, members]) => {
          const over = members.filter((m) => m.status === "overloaded").length
          const freeN = members.filter((m) => m.status === "free").length
          const busy = members.length - freeN
          const busyPct = Math.round((busy / members.length) * 100)
          return (
            <details key={g} className="rounded-xl border border-slate-200 bg-white [&_summary]:cursor-pointer">
              <summary className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium text-slate-800">{g}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {members.length} người
                  {over > 0 && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">{over} quá tải</span>}
                </span>
              </summary>
              <div className="px-4 pb-3">
                <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-blue-500" style={{ width: `${busyPct}%` }} />
                  <div className="h-full bg-red-500" style={{ width: `${Math.round((over / members.length) * 100)}%` }} />
                </div>
                {members.map((m) => {
                  const l = LOAD_META[m.status]
                  return (
                    <button
                      key={m.id}
                      onClick={() => onClickStaff?.(m)}
                      className="flex w-full items-center justify-between py-1 text-xs hover:text-blue-700"
                    >
                      <span className="truncate text-slate-700">{m.name}</span>
                      <span className={l.text}>{l.label} · {m.load}% →</span>
                    </button>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}

// ── 2. BẢN ĐỒ / SƠ ĐỒ ───────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  "Đang thi công": "#3b82f6",  // blue
  "Chuẩn bị":      "#f59e0b",  // amber
  "Đã vận hành":   "#10b981",  // green
  "Tạm dừng":      "#ef4444",  // red
}

function siteMarker(status: string, pct: number) {
  const color = STATUS_COLOR[status] ?? "#6b7280"
  const svg = `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer">
      <div style="
        background:${color};color:#fff;border-radius:20px;padding:3px 8px;
        font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);
        border:2px solid white;
      ">${pct}%</div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};margin-top:-1px"></div>
    </div>`
  return L.divIcon({ html: svg, className: "", iconSize: [60, 36], iconAnchor: [30, 36], popupAnchor: [0, -36] })
}

export function MapView({ sites = SITES, staff = STAFF, live = false }: { sites?: Site[]; staff?: Staff[]; live?: boolean } = {}) {
  const open = useDetail()

  function openSite(s: Site) {
    const siteStaff = staff.filter((m) => m.currentSite === s.name)
    open({
      title: s.name,
      subtitle: s.address,
      accent: "green",
      body: live
        ? <SiteDetailLive projectId={s.id} address={s.address} />
        : (
          <div className="space-y-4">
            {siteBody(s)}
            {siteStaff.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Nhân sự đang thi công</p>
                <div className="space-y-2">
                  {siteStaff.map((m) => (
                    <div key={m.id} className="flex items-start justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{m.name}</p>
                        <p className="text-xs text-slate-400">{m.group}</p>
                      </div>
                      <p className="text-xs text-slate-500">{m.currentTask}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ),
    })
  }

  // Summary counts for the legend bar
  const byStatus = sites.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-3">
      <Header title="Sơ đồ vị trí dự án" sub="Click vào công trình để xem chi tiết" />

      {/* Legend + summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(byStatus).map(([status, count]) => (
          <span key={status} className="flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[status] ?? "#6b7280" }} />
            {status} ({count})
          </span>
        ))}
        <span className="flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">
          <MapPin className="h-3 w-3" /> {sites.reduce((a, s) => a + s.staffCount, 0)} nhân sự đang triển khai
        </span>
      </div>

      {/* Map full-width */}
      <div className="overflow-hidden rounded-xl border shadow-sm" style={{ height: 460 }}>
        <MapContainer
          center={[10.8, 106.65]}
          zoom={8}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
          zoomControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          {sites.filter((s) => s.lat && s.lng).map((s) => (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={siteMarker(s.status, s.pct)}
              eventHandlers={{ click: () => openSite(s) }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Site cards below map */}
      <Grid cols={3}>
        {sites.map((s) => (
          <Card
            key={s.id}
            className={cn("gap-2 py-3", clickable)}
            onClick={() => openSite(s)}
          >
            <div className="flex items-center justify-between px-4">
              <span className="truncate text-sm font-semibold text-slate-800">{s.name}</span>
              <Chip text={s.status} cls={SITE_STATUS_CLS[s.status]} />
            </div>
            <div className="px-4">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.address}</span>
                <span>{s.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: STATUS_COLOR[s.status] ?? "#6b7280" }} />
              </div>
            </div>
            <p className="px-4 text-xs text-slate-400">{s.staffCount} nhân sự đang thi công</p>
          </Card>
        ))}
      </Grid>
    </div>
  )
}

// ── 3. NHÂN VIÊN ─────────────────────────────────────────────────────────────
export function StaffView({ staff = STAFF, live = false }: { staff?: Staff[]; live?: boolean } = {}) {
  const open = useDetail()
  return (
    <div className="space-y-4">
      <Header title="Nhân viên" sub="Kỹ năng, phân công và khối lượng công việc" />
      <div className="space-y-2">
        {staff.map((s) => {
          const l = LOAD_META[s.status]
          return (
            <button
              key={s.id}
              onClick={() => open({
                title: s.name,
                subtitle: s.group,
                body: live ? <StaffDetailLive userId={s.id} meta={{ name: s.name, group: s.group, load: s.load, status: s.status }} /> : staffBody(s),
              })}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
            >
              <AvatarInitials name={s.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-slate-800">{s.name}</p>
                  <span className={cn("shrink-0 text-[11px] font-semibold", l.text)}>{s.availability}</span>
                </div>
                <p className="mb-1 truncate text-[11px] text-slate-400">{s.group} · {s.tasks} việc · {s.hours}h</p>
                <div className="flex items-center gap-2">
                  <Bar pct={s.load} cls={s.load >= 100 ? "bg-red-400" : s.load === 0 ? "bg-amber-300" : "bg-blue-400"} />
                  <span className="shrink-0 text-[11px] font-medium text-slate-500">{s.load}%</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── 4. CÔNG TRÌNH ────────────────────────────────────────────────────────────
export function SitesView({ sites = SITES, live = false }: { sites?: Site[]; live?: boolean } = {}) {
  const open = useDetail()
  return (
    <div className="space-y-4">
      <Header title="Công trình / Khách hàng" sub="Quản lý nhà máy, tọa độ GPS và tiến độ" />
      <SectionLabel>{sites.length} công trình</SectionLabel>
      <div className="space-y-2.5">
        {sites.map((p) => (
          <button
            key={p.id}
            onClick={() => open({
              title: p.name,
              subtitle: p.address,
              accent: "green",
              body: live ? <SiteDetailLive projectId={p.id} address={p.address} /> : siteBody(p),
            })}
            className="flex w-full flex-col gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[13px] font-semibold text-slate-800">{p.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                  <MapPin className="h-3 w-3 shrink-0" /> {p.address}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusDot status={p.status} />
                <span className="text-[11px] text-slate-500">{p.staffCount} người</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Bar pct={p.pct} cls="bg-blue-500" />
              <span className="w-9 shrink-0 text-right text-[11px] font-bold text-blue-600">{p.pct}%</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 5. CÔNG VIỆC ─────────────────────────────────────────────────────────────
export function TasksView({ tasks = TASKS, live = false }: { tasks?: DemoTask[]; live?: boolean } = {}) {
  const open = useDetail()
  return (
    <div className="space-y-3">
      <Header title="Công việc" sub="Theo dõi tiến độ và cập nhật hàng ngày" />
      <Grid cols={2}>
        {tasks.map((t) => (
          <Card
            key={t.id}
            className={cn("gap-2 py-3", clickable)}
            onClick={() =>
              open({
                title: t.name,
                subtitle: `${t.site} · ${t.skill}`,
                accent: "amber",
                body: live ? (
                  <TaskDetailLive taskId={t.id} meta={{ site: t.site, skill: t.skill, deadline: t.deadline, assignees: t.assignees }} />
                ) : (
                  taskBody(t)
                ),
              })
            }
          >
            <div className="flex items-center justify-between px-4">
              <span className="truncate text-sm font-semibold text-slate-800">{t.name}</span>
              <Chip
                text={t.status}
                cls={
                  t.status === "Đang làm"
                    ? "bg-blue-50 text-blue-700 ring-blue-200"
                    : t.status === "Chưa phân công"
                      ? "bg-red-50 text-red-700 ring-red-200"
                      : "bg-slate-100 text-slate-600 ring-slate-200"
                }
              />
            </div>
            <p className="px-4 text-xs text-slate-500">{t.skill} · {t.site} · Hạn {t.deadline}</p>
            <div className="flex items-center gap-2 px-4">
              <Bar pct={t.progress} />
              <span className="text-xs font-semibold text-blue-700">{t.progress}%</span>
            </div>
            <p className="px-4 text-xs text-slate-500">
              Nhân sự: {t.assignees.length > 0 ? t.assignees.join(", ") : <span className="text-red-600">Chưa phân công</span>}
              {t.assignees.length < t.need && <span className="text-amber-600"> · thiếu {t.need - t.assignees.length} người</span>}
            </p>
          </Card>
        ))}
      </Grid>
    </div>
  )
}

// ── 6. ĐIỀU PHỐI / BỐ TRÍ ────────────────────────────────────────────────────
export function DispatchView() {
  const impactCls: Record<string, string> = {
    "Ít ảnh hưởng": "text-green-600",
    "Ảnh hưởng vừa": "text-amber-600",
    "Ảnh hưởng lớn": "text-red-600",
  }
  return (
    <div className="space-y-4">
      <Header title="Điều phối" sub="Gợi ý nhân sự theo kỹ năng, tiến độ và khoảng cách" />
      <Card className="gap-1 border-amber-200 bg-amber-50 py-3">
        <p className="px-4 text-xs font-medium text-amber-800">Quy tắc phối hợp</p>
        <p className="px-4 text-[11px] text-amber-700">Hỗ trợ nhóm khác: Hàn, Máy trục vít, Hệ thống lạnh, Hệ thống điện, Lắp IQF</p>
        <p className="px-4 text-[11px] text-amber-700">Chỉ chuyên môn: Lắp panel, Bọc cách nhiệt</p>
      </Card>
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-700">Gợi ý bổ sung cho:</p>
        <Card className="gap-1 py-3">
          <p className="px-4 text-sm font-semibold text-slate-800">{DISPATCH_TASK.name}</p>
          <p className="px-4 text-xs text-slate-500">{DISPATCH_TASK.site} · {DISPATCH_TASK.skill}</p>
          <p className="px-4 text-xs font-medium text-red-600">Thiếu {DISPATCH_TASK.need} người</p>
        </Card>
      </div>
      <Grid cols={2}>
        {CANDIDATES.map((c) => (
          <Card key={c.name} className="gap-1 py-3">
            <div className="flex items-center justify-between px-4">
              <span className="text-sm font-medium text-slate-800">{c.name}</span>
              <span className={`text-xs font-semibold ${c.availability === "Rảnh" ? "text-amber-600" : "text-slate-500"}`}>{c.availability}</span>
            </div>
            <p className="px-4 text-xs text-slate-500">
              Đang ở: {c.currentSite} · {c.distanceKm}km (~{c.etaMin} phút) · Cấp {c.skillLevel}
            </p>
            <div className="flex items-center justify-between px-4">
              <span className={`text-[11px] font-medium ${impactCls[c.impact]}`}>{c.impact}</span>
              <span className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white">Phân công</span>
            </div>
          </Card>
        ))}
      </Grid>
    </div>
  )
}

// ── 7. SỬA CHỮA ──────────────────────────────────────────────────────────────
export function RepairView({ incidents = INCIDENTS, live = false }: { incidents?: Incident[]; live?: boolean } = {}) {
  const open = useDetail()
  return (
    <div className="space-y-3">
      <Header title="Sửa chữa" sub="Điều phối nhân viên tới công trình có sự cố" />
      <Grid cols={2}>
        {incidents.map((i) => (
          <Card
            key={i.id}
            className={cn("gap-1 py-3", clickable)}
            onClick={() =>
              open({
                title: i.site,
                subtitle: i.system,
                accent: "red",
                body: live ? <IncidentDetailLive incidentId={i.id} /> : incidentBody(i),
              })
            }
          >
            <div className="flex items-center justify-between px-4">
              <span className="truncate text-sm font-semibold text-slate-800">{i.site}</span>
              {i.priority && <Chip text="Ưu tiên" cls="bg-red-50 text-red-700 ring-red-200" />}
            </div>
            <p className="px-4 text-xs text-slate-600">{i.desc}</p>
            <p className="px-4 text-xs text-slate-500">{i.system} · {i.address}</p>
            <div className="flex items-center justify-between px-4">
              <span className="text-xs text-slate-500">Xử lý: {i.handler ?? "—"}</span>
              <span className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white">Điều phối</span>
            </div>
          </Card>
        ))}
      </Grid>
    </div>
  )
}

// ── 8. KPI ───────────────────────────────────────────────────────────────────
export function KpiView({ staff = STAFF, completionAvg = 36, live = false }: { staff?: Staff[]; completionAvg?: number; live?: boolean } = {}) {
  const open = useDetail()
  const free = staff.filter((s) => s.status === "free").length
  const over = staff.filter((s) => s.status === "overloaded").length
  const stable = staff.filter((s) => s.status === "stable").length
  return (
    <div className="space-y-5">
      <Header title="KPI & Báo cáo" sub="Đánh giá hiệu suất và cân bằng khối lượng công việc" />

      {/* Stat row — 2×2 compact */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Đang rảnh" value={free} tone="warning" icon={UserCheck} />
        <StatCard label="Quá tải" value={over} tone="danger" icon={AlertTriangle} />
        <StatCard label="Tiến độ TB" value={completionAvg} suffix="%" tone="info" icon={CheckCircle2} />
        <StatCard label="Ổn định" value={stable} tone="success" icon={CheckCircle2} />
      </div>

      {/* Phân bổ nguồn lực */}
      <section className="space-y-2.5">
        <SectionLabel>Phân bổ nguồn lực</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {[...staff].sort((a, b) => b.load - a.load).map((s, i) => (
            <div key={s.id} className={cn("flex items-center gap-3 px-4 py-2.5", i > 0 && "border-t border-slate-50")}>
              <AvatarInitials name={s.name} size="sm" />
              <span className="w-24 shrink-0 truncate text-[13px] font-medium text-slate-700">{s.name}</span>
              <Bar pct={s.load} cls={s.load >= 100 ? "bg-red-400" : s.load === 0 ? "bg-amber-300" : "bg-blue-400"} />
              <span className={cn("w-9 shrink-0 text-right text-[11px] font-bold", s.load >= 100 ? "text-red-600" : s.load === 0 ? "text-amber-600" : "text-slate-500")}>{s.load}%</span>
            </div>
          ))}
          <p className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-50">
            Tải trọng = giờ phân công ÷ giờ khả dụng · <span className="font-semibold text-red-500">&gt;100% = quá tải</span>
          </p>
        </div>
      </section>

      {/* KPI cá nhân */}
      <section className="space-y-2.5">
        <SectionLabel>KPI cá nhân (30 ngày)</SectionLabel>
        <div className="space-y-2">
          {staff.map((s) => {
            const l = LOAD_META[s.status]
            return (
              <button
                key={s.id}
                onClick={() => open({
                  title: s.name,
                  subtitle: s.group,
                  body: live ? <StaffDetailLive userId={s.id} meta={{ name: s.name, group: s.group, load: s.load, status: s.status }} /> : staffBody(s),
                })}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <AvatarInitials name={s.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-slate-800">{s.name}</p>
                    <span className={cn("shrink-0 text-[11px] font-bold", l.text)}>{l.label}</span>
                  </div>
                  <p className="mb-1.5 text-[11px] text-slate-400">{s.group} · {s.hours}h · {s.tasks} việc</p>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div className="rounded-lg bg-slate-50 py-1">
                      <p className="text-xs font-bold text-slate-800">{s.hours}h</p>
                      <p className="text-[9px] text-slate-400">Giờ làm</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 py-1">
                      <p className="text-xs font-bold text-slate-800">{s.tasks}</p>
                      <p className="text-[9px] text-slate-400">Việc</p>
                    </div>
                    <div className={cn("rounded-lg py-1", s.load >= 100 ? "bg-red-50" : s.load === 0 ? "bg-amber-50" : "bg-blue-50")}>
                      <p className={cn("text-xs font-bold", s.load >= 100 ? "text-red-600" : s.load === 0 ? "text-amber-600" : "text-blue-700")}>{s.load}%</p>
                      <p className="text-[9px] text-slate-400">Tải</p>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
