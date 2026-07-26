import { useQuery } from "@tanstack/react-query"
import { useMemo, useRef, useState } from "react"

import { fetchProjectGantt } from "@/modules/gantt/ganttApi"

import GanttToolbar from "./GanttToolbar"
import TaskQuickEdit from "./TaskQuickEdit"
import TaskTimeline from "./TaskTimeline"
import { WEEK_PX_BY_SCALE } from "./TimelineChart"
import TimelineLegend from "./TimelineLegend"
import { toGanttLink, toGanttRow } from "./transformers"
import type { GanttFilter, GanttRow, GanttScale } from "./types"

type Props = { projectId: string }

export default function ProjectGanttV2({ projectId }: Props) {
  const queryKey = ["gantt", "project", projectId]

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchProjectGantt(projectId),
  })

  const rows: GanttRow[] = useMemo(
    () => (data?.tasks ?? []).map(toGanttRow),
    [data?.tasks],
  )
  const links = useMemo(
    () => (data?.dependencies ?? []).map(toGanttLink),
    [data?.dependencies],
  )

  const [scale, setScale] = useState<GanttScale>("week")
  const [filter, setFilter] = useState<GanttFilter>({})
  const [scrollToToday, setScrollToToday] = useState(0)
  const [editingRow, setEditingRow] = useState<GanttRow | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  /* Timelines are read-only: rescheduling goes through the TaskQuickEdit dialog
     (start/end/progress/status), not by dragging bars. */
  const handleTaskClick = (taskId: string) => {
    const row = rows.find((r) => r.id === taskId)
    if (row) setEditingRow(row)
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border text-muted-foreground">
        Đang tải Gantt...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Không tải được Gantt.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <GanttToolbar
        rows={rows}
        scale={scale}
        onScaleChange={setScale}
        filter={filter}
        onFilterChange={setFilter}
        onScrollToToday={() => setScrollToToday((n) => n + 1)}
        getExportElement={() => containerRef.current}
      />

      <div ref={containerRef} className="rounded-md border bg-card p-3">
        <TaskTimeline
          rows={rows}
          links={links}
          filter={filter}
          scrollToToday={scrollToToday}
          weekPx={WEEK_PX_BY_SCALE[scale]}
          onTaskClick={handleTaskClick}
        />
        {rows.length > 0 ? (
          <div className="mt-3 border-t pt-2">
            <TimelineLegend variant="task" showDependencyHint />
          </div>
        ) : null}
      </div>

      <TaskQuickEdit
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        row={editingRow}
        invalidateKeys={[queryKey, ["tasks"]]}
      />
    </div>
  )
}
