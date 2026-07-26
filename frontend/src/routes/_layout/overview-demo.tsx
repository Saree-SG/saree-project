import { createFileRoute } from "@tanstack/react-router"
import {
  BarChart3,
  Building,
  Building2,
  ClipboardList,
  LayoutGrid,
  Map,
  Users,
  Wrench,
  Workflow,
} from "lucide-react"
import { type ComponentType, useState } from "react"

import { DetailProvider } from "@/components/demo/detail"
import { LiveDispatch, LiveKpi, LiveOverview, LiveRepair, LiveSites, LiveStaff, LiveTasks } from "@/components/demo/live"
import { COMPANIES } from "@/components/demo/mock"
import {
  DispatchView,
  KpiView,
  MapView,
  OverviewView,
  RepairView,
  SitesView,
  StaffView,
  TasksView,
} from "@/components/demo/views"
import { cn } from "@/lib/utils"

/**
 * BỘ MÀN DEMO UI MỚI (mô phỏng POC "QL Thi Công").
 * 8 màn trong 1 route, chuyển bằng thanh tab trên đầu.
 * Đa công ty (multi-tenant): chọn công ty ở góc trên → dữ liệu lọc theo công ty.
 * Bấm bất kỳ card nào → mở panel chi tiết (drill-down).
 * ⚠️ Toàn bộ MOCK DATA — chỉ để duyệt giao diện. Data thật: docs/spec-poc-views.md
 */

const TABS = [
  { key: "overview", label: "Tổng quan", icon: LayoutGrid, View: OverviewView },
  { key: "map", label: "Sơ đồ", icon: Map, View: MapView },
  { key: "staff", label: "Nhân viên", icon: Users, View: StaffView },
  { key: "sites", label: "Công trình", icon: Building2, View: SitesView },
  { key: "tasks", label: "Công việc", icon: ClipboardList, View: TasksView },
  { key: "dispatch", label: "Điều phối", icon: Workflow, View: DispatchView },
  { key: "repair", label: "Sửa chữa", icon: Wrench, View: RepairView },
  { key: "kpi", label: "KPI", icon: BarChart3, View: KpiView },
] as const

export const Route = createFileRoute("/_layout/overview-demo")({
  component: DemoShell,
})

function DemoShell() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("overview")
  const [company, setCompany] = useState(COMPANIES[0].id)
  const [mode, setMode] = useState<"mock" | "live">("mock")
  const Current = TABS.find((t) => t.key === active)?.View ?? OverviewView
  // Bước 1: mới wire "live" cho Tổng quan. Các tab khác vẫn mock (sẽ wire dần).
  const liveReady: Record<string, boolean> = {
    overview: true,
    kpi: true,
    sites: true,
    tasks: true,
    repair: true,
    staff: true,
    dispatch: true,
  }
  const LIVE: Partial<Record<string, ComponentType>> = {
    overview: LiveOverview,
    kpi: LiveKpi,
    sites: LiveSites,
    tasks: LiveTasks,
    repair: LiveRepair,
    staff: LiveStaff,
    dispatch: LiveDispatch,
  }
  const LiveComp = LIVE[active]

  return (
    <div className="mx-auto w-full max-w-lg md:max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-amber-50 px-4 py-2">
        <span className="text-[11px] font-medium text-amber-700">
          DEMO giao diện mới · responsive · bấm card để xem chi tiết
        </span>
        {/* Toggle Mock / Thật (live API) */}
        <div className="flex overflow-hidden rounded-lg border border-amber-200 text-[11px] font-medium">
          {(["mock", "live"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("px-2.5 py-1", mode === m ? "bg-amber-600 text-white" : "bg-white text-slate-500")}
            >
              {m === "mock" ? "Mock" : "Dữ liệu thật"}
            </button>
          ))}
        </div>
        {/* Chọn công ty (multi-tenant) */}
        <label className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs">
          <Building className="h-3.5 w-3.5 text-amber-600" />
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-700 outline-none"
          >
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Thanh điều hướng nội bộ — tab cuộn ngang */}
      <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b bg-white/95 px-2 py-2 backdrop-blur">
        {TABS.map((t) => {
          const Icon = t.icon
          const on = t.key === active
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                on
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:text-slate-700",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </nav>

      <DetailProvider>
        <div className="px-4 py-5 pb-24">
          {mode === "live" && !liveReady[active] && (
            <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-500">
              Màn này chưa wire dữ liệu thật (đang hiển thị mock). Sẽ wire ở các bước sau.
            </p>
          )}
          {mode === "live" && LiveComp ? <LiveComp /> : <Current />}
        </div>
      </DetailProvider>
    </div>
  )
}
