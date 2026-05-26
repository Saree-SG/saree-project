import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CalendarRange } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { ProjectsService, RolesService } from "@/client"
import GanttToolbar from "@/components/Gantt/GanttToolbar"
import GanttView, { type GanttViewHandle } from "@/components/Gantt/GanttView"
import { toGanttLink, toGanttRow } from "@/components/Gantt/transformers"
import type {
  GanttFilter,
  GanttGroupBy,
  GanttScale,
} from "@/components/Gantt/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchCompanyGantt } from "@/modules/gantt/ganttApi"
import { listDepartments } from "@/modules/org/departmentApi"

const ALL = "__all__"

export const Route = createFileRoute("/_layout/gantt")({
  component: CompanyGanttPage,
  head: () => ({ meta: [{ title: "Gantt tổng" }] }),
})

function CompanyGanttPage() {
  // Server-side filters (sent to API)
  const [companyId, setCompanyId] = useState<string>("")
  const [projectId, setProjectId] = useState<string>(ALL)
  const [departmentId, setDepartmentId] = useState<string>(ALL)
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")

  // Client-side filters (toolbar)
  const [scale, setScale] = useState<GanttScale>("day")
  const [groupBy, setGroupBy] = useState<GanttGroupBy>("project")
  const [clientFilter, setClientFilter] = useState<GanttFilter>({})
  const [scrollToToday, setScrollToToday] = useState(0)
  const ganttRef = useRef<GanttViewHandle>(null)

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
    queryKey: [
      "gantt",
      "company",
      projectId,
      departmentId,
      startDate,
      endDate,
    ],
    queryFn: () =>
      fetchCompanyGantt({
        project_id: projectId === ALL ? undefined : projectId,
        department_id: departmentId === ALL ? undefined : departmentId,
        start_date: startDate
          ? new Date(`${startDate}T00:00:00`).toISOString()
          : undefined,
        end_date: endDate
          ? new Date(`${endDate}T23:59:59`).toISOString()
          : undefined,
      }),
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

      <div className="grid grid-cols-1 gap-3 rounded-md border bg-card p-3 md:grid-cols-5">
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
              {(((projects as any)?.data ?? projects ?? []) as Array<{
                id: string
                name: string
              }>).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <GanttToolbar
        rows={rows}
        scale={scale}
        onScaleChange={setScale}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        filter={clientFilter}
        onFilterChange={setClientFilter}
        onScrollToToday={() => setScrollToToday((n) => n + 1)}
        enableProjectGroup
        enableDepartmentGroup
        getExportElement={() => ganttRef.current?.getElement() ?? null}
      />

      {ganttQuery.isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-md border text-muted-foreground">
          Đang tải...
        </div>
      ) : ganttQuery.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Không tải được Gantt.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          Không có công việc trong phạm vi đã lọc.
        </div>
      ) : (
        <GanttView
          ref={ganttRef}
          rows={rows}
          links={links}
          scale={scale}
          groupBy={groupBy}
          filter={clientFilter}
          scrollToToday={scrollToToday}
          readOnly
        />
      )}
    </div>
  )
}
