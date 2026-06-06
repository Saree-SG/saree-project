import { Gantt, Willow } from "@svar-ui/react-gantt"
import "@svar-ui/react-gantt/all.css"
import "./gantt-overrides.css"
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react"

import {
  applyFilter,
  applyGrouping,
  buildSvarLinks,
  buildSvarTasks,
} from "./transformers"
import type {
  GanttFilter,
  GanttGroupBy,
  GanttLink,
  GanttRow,
  GanttScale,
} from "./types"

/**
 * SVAR scale config — uses % tokens documented in v2 docs.
 *   %Y = year, %F = full month name, %M = short month, %j = day of month, %W = week.
 */
const SCALE_PRESET: Record<GanttScale, Array<Record<string, unknown>>> = {
  day: [
    { unit: "month", step: 1, format: "%F %Y" },
    { unit: "day", step: 1, format: "%j" },
  ],
  week: [
    { unit: "month", step: 1, format: "%F %Y" },
    { unit: "week", step: 1, format: "T%W" },
  ],
  month: [
    { unit: "year", step: 1, format: "%Y" },
    { unit: "month", step: 1, format: "%M" },
  ],
}

const TASK_TYPES = [
  { id: "task", label: "Task" },
  { id: "summary", label: "Nhóm" },
  { id: "milestone", label: "Cột mốc" },
  { id: "critical", label: "Critical" },
  { id: "blocked", label: "Blocked" },
]

/** Highlight today + weekend cells (read by CSS). */
const today = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})()

function highlightTime(d: Date, unit: string): string {
  if (unit !== "day") return ""
  const dt = new Date(d)
  dt.setHours(0, 0, 0, 0)
  if (dt.getTime() === today) return "wx-today-cell"
  if (dt.getDay() === 0 || dt.getDay() === 6) return "wx-weekend"
  return ""
}

export type GanttViewHandle = {
  getElement: () => HTMLDivElement | null
  exec: (action: string, payload?: unknown) => void
}

export type GanttViewProps = {
  rows: GanttRow[]
  links: GanttLink[]
  scale?: GanttScale
  groupBy?: GanttGroupBy
  filter?: GanttFilter
  readOnly?: boolean
  scrollToToday?: number
  onTaskUpdate?: (
    taskId: string,
    patch: { start?: Date; end?: Date; progress?: number; text?: string },
  ) => void
  onTaskClick?: (taskId: string) => void
  onLinkAdd?: (sourceId: string, targetId: string) => void
  onLinkRemove?: (linkId: string) => void
}

const GanttView = forwardRef<GanttViewHandle, GanttViewProps>(function GanttView(
  {
    rows,
    links,
    scale = "day",
    groupBy = "none",
    filter,
    readOnly = false,
    scrollToToday = 0,
    onTaskUpdate,
    onTaskClick,
    onLinkAdd,
    onLinkRemove,
  },
  ref,
) {
  const apiRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    getElement: () => containerRef.current,
    exec: (action, payload) => apiRef.current?.exec?.(action, payload),
  }))

  const { svarTasks, svarLinks, idToUuid } = useMemo(() => {
    const filtered = applyFilter(rows, filter)
    const grouped = applyGrouping(filtered, groupBy)
    const built = buildSvarTasks(grouped)
    return {
      svarTasks: built.tasks,
      svarLinks: buildSvarLinks(links, built.uuidToId),
      idToUuid: built.idToUuid,
    }
  }, [rows, links, filter, groupBy])

  const resolveUuid = (numericId: unknown): string | null => {
    const n = Number(numericId)
    if (Number.isNaN(n)) return null
    return idToUuid.get(n) ?? null
  }

  const scales = SCALE_PRESET[scale]
  const cellWidth = scale === "day" ? 36 : scale === "week" ? 70 : 90

  const columns = useMemo(
    () => [
      {
        id: "text",
        header: "Công việc",
        flexgrow: 3,
        width: 320,
        editor: readOnly ? undefined : "text",
      },
      {
        id: "start",
        header: "Bắt đầu",
        align: "center",
        width: 110,
        editor: readOnly ? undefined : "datepicker",
      },
      {
        id: "duration",
        header: "Số ngày",
        align: "center",
        width: 80,
        editor: readOnly ? undefined : "text",
      },
      ...(readOnly
        ? []
        : [{ id: "add-task", header: "", width: 40, align: "center" }]),
    ],
    [readOnly],
  )

  const init = (api: any) => {
    apiRef.current = api
    if (!api?.on) return

    api.on("update-task", (ev: any) => {
      if (!onTaskUpdate || readOnly || ev.inProgress) return
      const uuid = resolveUuid(ev.id)
      if (!uuid || uuid.startsWith("__group__")) return
      const t = ev.task ?? {}
      onTaskUpdate(uuid, {
        start: t.start ? new Date(t.start) : undefined,
        end: t.end ? new Date(t.end) : undefined,
        progress:
          typeof t.progress === "number" ? Math.round(t.progress) : undefined,
        text: typeof t.text === "string" ? t.text : undefined,
      })
    })

    api.on("select-task", (ev: any) => {
      if (!onTaskClick) return
      const uuid = resolveUuid(ev?.id)
      if (!uuid || uuid.startsWith("__group__")) return
      onTaskClick(uuid)
    })

    api.on("add-link", (ev: any) => {
      if (readOnly || !onLinkAdd) return
      const l = ev?.link ?? ev
      const s = resolveUuid(l?.source)
      const t = resolveUuid(l?.target)
      if (s && t) onLinkAdd(s, t)
    })

    api.on("delete-link", (ev: any) => {
      if (readOnly || !onLinkRemove) return
      const id = ev?.id
      if (id != null) onLinkRemove(String(id))
    })
  }

  // Scroll-to-today: SVAR has no direct method, scroll the chart programmatically
  useEffect(() => {
    if (!containerRef.current) return
    try {
      const el = containerRef.current.querySelector<HTMLDivElement>(
        ".wx-gantt-chart, .wx-chart, [class*='chart-scroll']",
      )
      if (!el) return
      const first = svarTasks[0] as any
      if (!first?.start) return
      const start = first.start instanceof Date ? first.start : new Date(first.start)
      const now = new Date()
      const days = Math.max(0, (now.getTime() - start.getTime()) / 86400000 - 3)
      el.scrollLeft = days * cellWidth
    } catch {
      // ignore
    }
  }, [scrollToToday, cellWidth, svarTasks])

  return (
    <div
      ref={containerRef}
      className="gantt-host overflow-hidden rounded-md border bg-card"
      style={{ height: 640 }}
    >
      <Willow>
        <Gantt
          tasks={svarTasks as any}
          links={svarLinks as any}
          scales={scales as any}
          columns={columns as any}
          taskTypes={TASK_TYPES as any}
          cellWidth={cellWidth}
          cellHeight={36}
          scaleHeight={36}
          readonly={readOnly}
          highlightTime={highlightTime}
          init={init}
        />
      </Willow>
    </div>
  )
})

export default GanttView
