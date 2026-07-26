import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CalendarRange } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { ProjectsService, RolesService } from "@/client"
import GanttToolbar from "@/components/Gantt/GanttToolbar"
import ProjectTimelineCard from "@/components/Gantt/ProjectTimelineCard"
import TaskTimeline from "@/components/Gantt/TaskTimeline"
import { WEEK_PX_BY_SCALE } from "@/components/Gantt/TimelineChart"
import TimelineLegend from "@/components/Gantt/TimelineLegend"
import { toGanttLink, toGanttRow } from "@/components/Gantt/transformers"
import type { GanttFilter, GanttScale } from "@/components/Gantt/types"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchCompanyGantt } from "@/modules/gantt/ganttApi"
import { listDepartments } from "@/modules/org/departmentApi"

const ALL = "__all__"

export const Route = createFileRoute("/_layout/gantt")({
  component: CompanyGanttPage,
  head: () => ({ meta: [{ title: "Gantt tổng" }] }),
})

type TabKey = "overview" | "tasks"

function CompanyGanttPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>("overview")

  // Server-side filters (sent to API)
  const [companyId, setCompanyId] = useState<string>("")
  const [projectId, setProjectId] = useState<string>(ALL)
  const [departmentId, setDepartmentId] = useState<string>(ALL)

  // Client-side filters (toolbar)
  const [scale, setScale] = useState<GanttScale>("week")
  const [clientFilter, setClientFilter] = useState<GanttFilter>({})
  const [scrollToToday, setScrollToToday] = useState(0)
  const chartRef = useRef<HTMLDivElement>(null)

  const { data: companies = [] } = useQuery({
    queryKey: ["roles", "companies"],
    queryFn: () => RolesService.listCompanies(),
  })

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => ProjectsService.listProjects(),
  })

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", companyId],
    queryFn: () => listDepartments(companyId),
    enabled: Boolean(companyId),
  })

  const ganttQuery = useQuery({
    queryKey: ["gantt", "company", projectId, departmentId],
    queryFn: () =>
      fetchCompanyGantt({
        project_id: projectId === ALL ? undefined : projectId,
        department_id: departmentId === ALL ? undefined : departmentId,
      }),
    // Don't pull the full task set while the overview tab is showing.
    enabled: tab === "tasks",
  })

  const rows = useMemo(
    () =>
      (ganttQuery.data?.tasks ?? []).map((t) => {
        const r = toGanttRow(t)
        return {
          ...r,
          project_id: t.project_id,
          project_name: (t as any).project_name ?? null,
        }
      }),
    [ganttQuery.data?.tasks],
  )
  const links = useMemo(
    () => (ganttQuery.data?.dependencies ?? []).map(toGanttLink),
    [ganttQuery.data?.dependencies],
  )

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <CalendarRange className="h-5 w-5" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gantt tổng</h1>
          <p className="text-muted-foreground">
            Tổng quan công việc toàn công ty theo thời gian.
          </p>
        </div>
      </div>

      {/* Both tabs are plain-DOM timelines now, so mobile can use either one —
          the old forced redirect existed only because SVAR needed a fixed height. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="overview">Tổng quan dự án</TabsTrigger>
          <TabsTrigger value="tasks">Chi tiết task</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* The overview intentionally has no filters of its own — the filter panel
          below belongs to the task view, and reusing its department selection here
          would apply a filter the user cannot see on this tab. */}
      {tab === "overview" ? (
        <ProjectTimelineCard />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 rounded-md border bg-card p-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Công ty</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn công ty" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phòng ban</Label>
              <Select
                value={departmentId}
                onValueChange={setDepartmentId}
                disabled={!companyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả phòng ban</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dự án</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả dự án" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả dự án</SelectItem>
                  {(
                    ((projects as any)?.data ?? projects ?? []) as Array<{
                      id: string
                      name: string
                    }>
                  ).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <GanttToolbar
            rows={rows}
            scale={scale}
            onScaleChange={setScale}
            filter={clientFilter}
            onFilterChange={setClientFilter}
            onScrollToToday={() => setScrollToToday((n) => n + 1)}
            getExportElement={() => chartRef.current}
          />

          {ganttQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-md border text-muted-foreground">
              Đang tải...
            </div>
          ) : ganttQuery.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
              Không tải được Gantt.
            </div>
          ) : (
            <div ref={chartRef} className="rounded-md border bg-card p-3">
              <TaskTimeline
                rows={rows}
                links={links}
                filter={clientFilter}
                scrollToToday={scrollToToday}
                weekPx={WEEK_PX_BY_SCALE[scale]}
                onTaskClick={(taskId) =>
                  navigate({ to: "/tasks/$taskId", params: { taskId } })
                }
              />
              {rows.length > 0 ? (
                <div className="mt-3 border-t pt-2">
                  <TimelineLegend variant="task" showDependencyHint />
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}
