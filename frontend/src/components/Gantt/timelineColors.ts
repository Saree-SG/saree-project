import type { GanttRow } from "./types"

/**
 * Single source of truth for timeline bar colours.
 *
 * Both the bars and the legend read from here — when they were defined separately
 * the legend drifted from what was actually drawn.
 *
 * Hex (not CSS vars) because bars need alpha-suffixed variants (`${c}28`) for the
 * unfilled background and border.
 */

/** Schedule warnings. These outrank workflow status on a bar. */
export const WARNING_COLOR = {
  overdue_critical: "#b91c1c",
  overdue_local: "#f97316",
  due_soon: "#eab308",
} as const

export const BLOCKED_COLOR = "#d97706"
export const CRITICAL_PATH_COLOR = "#dc2626"

/** Task workflow status. */
export const TASK_STATUS_COLOR = {
  todo: "#64748b",
  in_progress: "#2563eb",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: BLOCKED_COLOR,
  cancelled: "#94a3b8",
} as const

/** Project status (ProjectTimeline). */
export const PROJECT_STATUS_COLOR = {
  planning: "#64748b",
  active: "#2563eb",
  on_hold: "#d97706",
  completed: "#16a34a",
  cancelled: "#dc2626",
} as const

export const DEFAULT_PROJECT_COLOR = PROJECT_STATUS_COLOR.active

export const WARNING_LABEL = {
  overdue_critical: "TRỄ HẠN (nghiêm trọng)",
  overdue_local: "Trễ hạn",
  due_soon: "Sắp đến hạn (<24h)",
} as const

/**
 * Bar colour for a task row. Order matters: the first match wins.
 *
 * Schedule warnings outrank workflow status — an overdue task must not look like
 * an ordinary "in progress" one. Finished/cancelled tasks never warn.
 */
export function taskBarColor(row: GanttRow): string {
  if (row.status !== "done" && row.status !== "cancelled") {
    if (row.warning && row.warning in WARNING_COLOR) {
      return WARNING_COLOR[row.warning as keyof typeof WARNING_COLOR]
    }
    if (row.blocked) return BLOCKED_COLOR
    if (row.is_on_critical_path) return CRITICAL_PATH_COLOR
  }
  return TASK_STATUS_COLOR[row.status] ?? TASK_STATUS_COLOR.todo
}
