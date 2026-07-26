import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Calendar, Filter } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { fetchProjectTimeline } from "@/modules/gantt/ganttApi"

import ProjectTimeline from "./ProjectTimeline"
import TimelineLegend from "./TimelineLegend"

/** Statuses offered in the filter. completed/cancelled are reachable only via the
 *  "show finished" switch, which is a server-side flag. */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "planning", label: "Lên kế hoạch" },
  { value: "active", label: "Đang thực hiện" },
  { value: "on_hold", label: "Tạm dừng" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã huỷ" },
]

type Props = {
  /** Restrict to one department (omitted = every project the user can see). */
  departmentId?: string
  /** Render without the surrounding card chrome (caller supplies its own). */
  bare?: boolean
}

/**
 * Self-contained project-level Gantt overview: fetch + filter + timeline.
 * Shared by the dashboard section and the /gantt "Tổng quan" tab.
 */
export default function ProjectTimelineCard({
  departmentId,
  bare = false,
}: Props) {
  const navigate = useNavigate()
  const [scrollToToday, setScrollToToday] = useState(0)
  const [statuses, setStatuses] = useState<string[]>([])
  const [includeFinished, setIncludeFinished] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["projects", "timeline", departmentId ?? null, includeFinished],
    queryFn: () =>
      fetchProjectTimeline({
        department_id: departmentId,
        include_finished: includeFinished,
      }),
  })

  // Status filtering is client-side: every project the user can see is already
  // loaded (the view is unpaginated), so no refetch is needed.
  const rows = useMemo(() => {
    const all = data ?? []
    if (statuses.length === 0) return all
    return all.filter((r) => statuses.includes(r.status))
  }, [data, statuses])

  const toggleStatus = (s: string) =>
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )

  const filterActive = statuses.length > 0 || includeFinished

  const toolbar = (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={filterActive ? "default" : "outline"}
            size="sm"
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            Lọc
            {filterActive ? (
              <span className="ml-1 rounded-sm bg-background/30 px-1 text-xs">
                {statuses.length + (includeFinished ? 1 : 0)}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Trạng thái</DropdownMenuLabel>
          {STATUS_OPTIONS.map((s) => (
            <DropdownMenuCheckboxItem
              key={s.value}
              checked={statuses.includes(s.value)}
              onCheckedChange={() => toggleStatus(s.value)}
            >
              {s.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={includeFinished}
            onCheckedChange={(v) => setIncludeFinished(Boolean(v))}
          >
            Hiện cả dự án đã xong / huỷ
          </DropdownMenuCheckboxItem>
          {filterActive ? (
            <>
              <DropdownMenuSeparator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setStatuses([])
                  setIncludeFinished(false)
                }}
              >
                Xoá tất cả lọc
              </Button>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setScrollToToday((n) => n + 1)}
      >
        Hôm nay
      </Button>
    </div>
  )

  const chart = isLoading ? (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      Đang tải...
    </div>
  ) : error ? (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
      Không tải được tiến độ dự án.
    </div>
  ) : (
    <>
      <ProjectTimeline
        rows={rows}
        scrollToToday={scrollToToday}
        onProjectClick={(projectId) =>
          navigate({ to: "/projects/$projectId", params: { projectId } })
        }
      />
      {rows.length > 0 ? (
        <div className="mt-3 border-t pt-2">
          <TimelineLegend variant="project" />
        </div>
      ) : null}
    </>
  )

  if (bare) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">{toolbar}</div>
        {chart}
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold">Tiến độ dự án (Gantt)</h2>
          <span className="text-xs text-muted-foreground">
            ({rows.length}
            {statuses.length > 0 && data ? `/${data.length}` : ""})
          </span>
        </div>
        {toolbar}
      </div>
      {chart}
    </div>
  )
}
