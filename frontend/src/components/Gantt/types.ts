/** Internal canonical types used by the timeline components. */

export type GanttRowStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "blocked"
  | "cancelled"

/** Schedule warning derived by the backend on read (compute_task_status).
 *  Separate from status: a task can be "in_progress" AND overdue. */
export type GanttWarning =
  | "overdue_critical"
  | "overdue_local"
  | "due_soon"
  | null

export type GanttRow = {
  id: string
  name: string
  warning?: GanttWarning
  start: Date
  end: Date
  progress: number // 0..100
  parent?: string | null
  status: GanttRowStatus
  assignee_id?: string | null
  assignee_name?: string | null
  department_id?: string | null
  department_name?: string | null
  project_id?: string | null
  project_name?: string | null
  is_on_critical_path?: boolean
  blocked?: boolean
}

/**
 * Task dependency, kept in the domain's own vocabulary:
 *   FS = finish-to-start (mặc định), SS = start-to-start,
 *   FF = finish-to-finish,           SF = start-to-finish.
 */
export type GanttDependencyType = "FS" | "SS" | "FF" | "SF"

export type GanttLink = {
  id: string
  /** Blocking task — the arrow starts here. */
  source: string
  /** Dependent task — the arrow points here. */
  target: string
  type: GanttDependencyType
}

/** Zoom level of the timeline — maps to a week column width, see
 *  WEEK_PX_BY_SCALE in TimelineChart.tsx. */
export type GanttScale = "day" | "week" | "month"

export type GanttFilter = {
  status?: GanttRowStatus[]
  assigneeIds?: string[]
  criticalOnly?: boolean
}
