import { useCallback, useMemo, useState } from "react"

import TimelineChart, {
  type TimelineItem,
  type TimelineLink,
} from "./TimelineChart"
import { taskBarColor, WARNING_LABEL } from "./timelineColors"
import type { GanttFilter, GanttLink, GanttRow } from "./types"

/**
 * Keep rows matching the filter, plus every ancestor of a match.
 *
 * Dropping ancestors would orphan matched subtasks and silently flatten the
 * tree, so a parent that fails the filter is still rendered as context.
 */
function filterKeepingAncestors(
  rows: GanttRow[],
  filter: GanttFilter | undefined,
): GanttRow[] {
  const active =
    filter &&
    (filter.criticalOnly ||
      (filter.status?.length ?? 0) > 0 ||
      (filter.assigneeIds?.length ?? 0) > 0)
  if (!active || !filter) return rows

  const byId = new Map(rows.map((r) => [r.id, r]))
  const matches = (r: GanttRow) => {
    if (filter.criticalOnly && !r.is_on_critical_path) return false
    if ((filter.status?.length ?? 0) > 0 && !filter.status?.includes(r.status))
      return false
    if (
      (filter.assigneeIds?.length ?? 0) > 0 &&
      (!r.assignee_id || !filter.assigneeIds?.includes(r.assignee_id))
    )
      return false
    return true
  }

  const keep = new Set<string>()
  for (const r of rows) {
    if (!matches(r)) continue
    keep.add(r.id)
    let parentId = r.parent
    // Guard against a malformed parent chain looping forever.
    const seen = new Set<string>([r.id])
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      keep.add(parentId)
      parentId = byId.get(parentId)?.parent ?? null
    }
  }
  return rows.filter((r) => keep.has(r.id))
}

export type TaskTimelineProps = {
  rows: GanttRow[]
  /** Dependencies to draw as arrows. Endpoints on hidden rows are redirected to
   *  the nearest visible ancestor. */
  links?: GanttLink[]
  filter?: GanttFilter
  onTaskClick?: (taskId: string) => void
  scrollToToday?: number
  emptyText?: string
  labelHeader?: string
  /** Zoom: width of one week column (see WEEK_PX_BY_SCALE). */
  weekPx?: number
}

/** Task-level timeline: the task tree rendered in the demo's Gantt style. */
export default function TaskTimeline({
  rows,
  links,
  filter,
  onTaskClick,
  scrollToToday = 0,
  emptyText,
  labelHeader = "Công việc",
  weekPx,
}: TaskTimelineProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const items = useMemo<TimelineItem[]>(() => {
    const visible = filterKeepingAncestors(rows, filter)
    const present = new Set(visible.map((r) => r.id))
    const childrenOf = new Map<string | null, GanttRow[]>()

    for (const r of visible) {
      // A row whose parent was filtered out (or never loaded) is treated as a
      // root, otherwise its whole subtree would disappear.
      const key = r.parent && present.has(r.parent) ? r.parent : null
      const list = childrenOf.get(key)
      if (list) list.push(r)
      else childrenOf.set(key, [r])
    }
    for (const list of childrenOf.values()) {
      list.sort((a, b) => a.start.getTime() - b.start.getTime())
    }

    const out: TimelineItem[] = []
    const walk = (
      parentId: string | null,
      depth: number,
      seen: Set<string>,
    ) => {
      for (const r of childrenOf.get(parentId) ?? []) {
        if (seen.has(r.id)) continue // cycle guard
        const children = childrenOf.get(r.id) ?? []
        const isCollapsed = collapsed.has(r.id)
        const end = r.end < r.start ? r.start : r.end
        out.push({
          id: r.id,
          label: r.name,
          // Assignee lives in the tooltip only — display names often fall back to
          // an email, which made the bar text long and ugly.
          barText: r.name,
          tooltip: [
            r.name,
            r.assignee_name ? `Phụ trách: ${r.assignee_name}` : null,
            r.warning ? WARNING_LABEL[r.warning] : null,
            r.is_on_critical_path ? "Critical path" : null,
            r.blocked ? "Đang bị chặn" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          start: r.start,
          end,
          progress: r.progress,
          color: taskBarColor(r),
          depth,
          hasChildren: children.length > 0,
          collapsed: isCollapsed,
        })
        if (!isCollapsed) {
          walk(r.id, depth + 1, new Set([...seen, r.id]))
        }
      }
    }
    walk(null, 0, new Set())
    return out
  }, [rows, filter, collapsed])

  /* Redirect each endpoint to the nearest ancestor that is actually on screen.
     Without this, collapsing a parent would silently drop every arrow touching
     its subtree; instead the arrow now points at the collapsed parent row. */
  const visibleLinks = useMemo(() => {
    if (!links?.length) return []
    const shown = new Set(items.map((i) => i.id))
    const parentOf = new Map(rows.map((r) => [r.id, r.parent ?? null]))

    const resolve = (id: string): string | null => {
      let cur: string | null = id
      const seen = new Set<string>()
      while (cur && !shown.has(cur)) {
        if (seen.has(cur)) return null // cycle guard
        seen.add(cur)
        cur = parentOf.get(cur) ?? null
      }
      return cur
    }

    const seenPairs = new Set<string>()
    const out: TimelineLink[] = []
    for (const l of links) {
      const source = resolve(l.source)
      const target = resolve(l.target)
      // Both endpoints collapsing into the same row makes the arrow meaningless.
      if (!source || !target || source === target) continue
      const key = `${source}->${target}:${l.type}`
      if (seenPairs.has(key)) continue // collapsing can collapse duplicates too
      seenPairs.add(key)
      out.push({ id: l.id, source, target, type: l.type })
    }
    return out
  }, [links, items, rows])

  return (
    <TimelineChart
      items={items}
      links={visibleLinks}
      labelHeader={labelHeader}
      onItemClick={onTaskClick}
      onToggle={toggle}
      scrollToToday={scrollToToday}
      weekPx={weekPx}
      emptyText={emptyText ?? "Không có công việc trong phạm vi đã lọc."}
    />
  )
}
