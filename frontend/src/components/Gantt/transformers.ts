import type {
  GanttDependency as ApiGanttDependency,
  GanttTask as ApiGanttTask,
} from "@/modules/gantt/ganttApi"

import type {
  GanttDependencyType,
  GanttLink,
  GanttRow,
  GanttRowStatus,
  GanttWarning,
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

/**
 * Pull the schedule warning out of computed_status.
 *
 * The backend derives these on read (see compute_task_status) and they are NOT
 * workflow statuses — normalizeStatus() deliberately folds them into "todo", so
 * they must be read separately or the warning is lost.
 */
function normalizeWarning(s: string | null | undefined): GanttWarning {
  switch ((s ?? "").toLowerCase()) {
    case "overdue_critical":
      return "overdue_critical"
    case "overdue_local":
      return "overdue_local"
    case "due_soon":
      return "due_soon"
    default:
      return null
  }
}

/** API task → canonical row consumed by TaskTimeline. */
export function toGanttRow(t: ApiGanttTask): GanttRow {
  return {
    id: t.id,
    name: t.name,
    start: new Date(t.start_time),
    end: new Date(t.end_time),
    progress: Math.max(0, Math.min(100, t.reported_progress_total ?? 0)),
    parent: t.parent_id,
    status: normalizeStatus(t.computed_status ?? t.status),
    warning: normalizeWarning(t.computed_status),
    assignee_id: t.assignee_id ?? null,
    assignee_name: t.assignee_name ?? null,
    department_id: t.assignee_department_id ?? null,
    department_name: t.assignee_department_name ?? null,
    project_id: t.project_id ?? null,
    is_on_critical_path: t.is_on_critical_path ?? false,
    blocked: (t.blocked_by?.length ?? 0) > 0,
  }
}

/** API dependency → canonical link consumed by TaskTimeline. */
export function toGanttLink(d: ApiGanttDependency): GanttLink {
  const raw = (d.dependency_type || "FS").toUpperCase()
  const type: GanttDependencyType =
    raw === "SS" || raw === "FF" || raw === "SF" ? raw : "FS"
  return {
    id: d.id,
    source: d.blocking_task_id,
    target: d.dependent_task_id,
    type,
  }
}
