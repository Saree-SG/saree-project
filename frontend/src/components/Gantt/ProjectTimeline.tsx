import { useMemo } from "react"

import type { ProjectTimelineRow } from "@/modules/gantt/ganttApi"

import TimelineChart, {
  parseLocalDate,
  type TimelineItem,
} from "./TimelineChart"
import { DEFAULT_PROJECT_COLOR, PROJECT_STATUS_COLOR } from "./timelineColors"

export type ProjectTimelineProps = {
  rows: ProjectTimelineRow[]
  onProjectClick?: (projectId: string) => void
  scrollToToday?: number
}

/** Project-level overview: 1 row = 1 project, read-only. */
export default function ProjectTimeline({
  rows,
  onProjectClick,
  scrollToToday = 0,
}: ProjectTimelineProps) {
  const items = useMemo<TimelineItem[]>(
    () =>
      rows
        .map((row): TimelineItem | null => {
          const start = parseLocalDate(row.start_date)
          const end = parseLocalDate(row.end_date)
          if (!start || !end) return null
          return {
            id: row.id,
            label: row.name,
            barText: row.name,
            // Tooltip carries the code — the only place it still shows, since the
            // label column truncates long names.
            tooltip: `${row.code} · ${row.name}`,
            start,
            // Guard against bad data (end before start) so the bar never inverts.
            end: end < start ? start : end,
            progress: row.progress,
            color:
              PROJECT_STATUS_COLOR[
                row.status as keyof typeof PROJECT_STATUS_COLOR
              ] ?? DEFAULT_PROJECT_COLOR,
          }
        })
        .filter((x): x is TimelineItem => x !== null),
    [rows],
  )

  return (
    <TimelineChart
      items={items}
      labelHeader="Dự án"
      onItemClick={onProjectClick}
      scrollToToday={scrollToToday}
      emptyText="Chưa có dự án đang thực hiện."
    />
  )
}
