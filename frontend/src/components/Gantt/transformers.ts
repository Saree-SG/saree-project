import type {
  GanttDependency,
  GanttTask as ApiGanttTask,
} from "@/modules/gantt/ganttApi"

import type {
  GanttFilter,
  GanttGroupBy,
  GanttLink,
  GanttRow,
  GanttRowStatus,
} from "./types"

function normalizeStatus(s: string | null | undefined): GanttRowStatus {
  switch ((s ?? "").toLowerCase()) {
    case "in_progress":
    case "doing":
      return "in_progress"
    case "review":
      return "review"
    case "done":
    case "completed":
      return "done"
    case "blocked":
      return "blocked"
    case "cancelled":
    case "canceled":
      return "cancelled"
    default:
      return "todo"
  }
}

export function toGanttRow(t: ApiGanttTask): GanttRow {
  return {
    id: t.id,
    name: t.name,
    start: new Date(t.start_time),
    end: new Date(t.end_time),
    progress: Math.max(0, Math.min(100, t.reported_progress_total ?? 0)),
    parent: t.parent_id,
    status: normalizeStatus(t.computed_status ?? t.status),
    assignee_id: t.assignee_id ?? null,
    assignee_name: t.assignee_name ?? null,
    department_id: t.assignee_department_id ?? null,
    department_name: t.assignee_department_name ?? null,
    project_id: t.project_id ?? null,
    is_on_critical_path: t.is_on_critical_path ?? false,
    blocked: (t.blocked_by?.length ?? 0) > 0,
  }
}

export function toGanttLink(d: GanttDependency): GanttLink {
  const t = (d.dependency_type || "FS").toUpperCase()
  const mapped: GanttLink["type"] =
    t === "SS" ? "s2s" : t === "FF" ? "e2e" : t === "SF" ? "s2e" : "e2s"
  return {
    id: d.id,
    source: d.blocking_task_id,
    target: d.dependent_task_id,
    type: mapped,
  }
}

export function applyFilter(rows: GanttRow[], filter?: GanttFilter): GanttRow[] {
  if (!filter) return rows
  return rows.filter((r) => {
    if (filter.criticalOnly && !r.is_on_critical_path) return false
    if (filter.status && filter.status.length > 0 && !filter.status.includes(r.status))
      return false
    if (
      filter.assigneeIds &&
      filter.assigneeIds.length > 0 &&
      (!r.assignee_id || !filter.assigneeIds.includes(r.assignee_id))
    )
      return false
    return true
  })
}

export function applyGrouping(
  rows: GanttRow[],
  groupBy: GanttGroupBy,
): GanttRow[] {
  if (groupBy === "none") return rows

  const keyFn = (r: GanttRow): { key: string; label: string } => {
    switch (groupBy) {
      case "assignee":
        return {
          key: r.assignee_id || r.assignee_name || "__unassigned__",
          label: r.assignee_name || "Chưa gán",
        }
      case "department":
        return {
          key: r.department_id || "__no_dept__",
          label: r.department_name || "Chưa có phòng ban",
        }
      case "status":
        return { key: r.status, label: statusLabel(r.status) }
      case "project":
        return {
          key: r.project_id || "__no_project__",
          label: r.project_name || "Chưa có dự án",
        }
      default:
        return { key: "__all__", label: "Tất cả" }
    }
  }

  const groupMap = new Map<string, { label: string; children: GanttRow[] }>()
  for (const r of rows) {
    const { key, label } = keyFn(r)
    if (!groupMap.has(key)) groupMap.set(key, { label, children: [] })
    groupMap.get(key)!.children.push(r)
  }

  // Output: summary parent row + children referencing parent id
  const out: GanttRow[] = []
  for (const [key, { label, children }] of groupMap.entries()) {
    children.sort((a, b) => a.start.getTime() - b.start.getTime())
    const starts = children.map((c) => c.start.getTime())
    const ends = children.map((c) => c.end.getTime())
    const groupId = `__group__${key}`
    out.push({
      id: groupId,
      name: `${label} (${children.length})`,
      start: new Date(Math.min(...starts)),
      end: new Date(Math.max(...ends)),
      progress: Math.round(
        children.reduce((s, c) => s + c.progress, 0) / children.length,
      ),
      parent: null,
      status: "in_progress",
    })
    for (const c of children) {
      out.push({ ...c, parent: groupId })
    }
  }
  return out
}

function statusLabel(s: GanttRowStatus): string {
  switch (s) {
    case "todo":
      return "Chưa làm"
    case "in_progress":
      return "Đang làm"
    case "review":
      return "Đang review"
    case "done":
      return "Hoàn thành"
    case "blocked":
      return "Bị chặn"
    case "cancelled":
      return "Đã huỷ"
  }
}

function rowToSvarShape(
  r: GanttRow,
  idMap: Map<string, number>,
): Record<string, unknown> {
  const isGroup = r.id.startsWith("__group__")
  let type = "task"
  if (isGroup) type = "summary"
  else if (r.is_on_critical_path) type = "critical"
  else if (r.blocked) type = "blocked"

  const numericId = idMap.get(r.id)!
  const parentId = r.parent ? idMap.get(r.parent) ?? 0 : 0

  const node: Record<string, unknown> = {
    id: numericId,
    text: r.name,
    start: r.start,
    end: r.end,
    progress: r.progress,
    type,
    parent: parentId,
  }
  // SVAR's tree walker crashes when open=true on a node whose .data is null.
  // Only mark summary rows as open — leaves never get `open`.
  if (isGroup) node.open = true
  return node
}

/**
 * Build SVAR-compatible flat task array with numeric IDs.
 * Returns both the array and the id<->uuid maps for translating events back.
 */
export function buildSvarTasks(rows: GanttRow[]): {
  tasks: Record<string, unknown>[]
  idToUuid: Map<number, string>
  uuidToId: Map<string, number>
} {
  const uuidToId = new Map<string, number>()
  rows.forEach((r, i) => uuidToId.set(r.id, i + 1))
  const idToUuid = new Map<number, string>()
  for (const [k, v] of uuidToId.entries()) idToUuid.set(v, k)

  const tasks = rows.map((r) => rowToSvarShape(r, uuidToId))
  return { tasks, idToUuid, uuidToId }
}

export function buildSvarLinks(
  links: GanttLink[],
  uuidToId: Map<string, number>,
): Record<string, unknown>[] {
  return links
    .filter((l) => uuidToId.has(l.source) && uuidToId.has(l.target))
    .map((l, i) => ({
      id: i + 1,
      source: uuidToId.get(l.source)!,
      target: uuidToId.get(l.target)!,
      type: l.type,
    }))
}

// Legacy helpers kept for any straggling import (unused after refactor)
export function toSvarTask(_r: GanttRow): Record<string, unknown> {
  return {}
}
export function toSvarTree(_rows: GanttRow[]): Record<string, unknown>[] {
  return []
}

export function toSvarLink(l: GanttLink): Record<string, unknown> {
  return { id: l.id, source: l.source, target: l.target, type: l.type }
}
