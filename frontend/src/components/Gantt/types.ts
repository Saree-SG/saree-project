/** Internal canonical types used by the GanttView component. */

export type GanttRowStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "blocked"
  | "cancelled"

export type GanttRow = {
  id: string
  name: string
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

export type GanttLink = {
  id: string
  source: string
  target: string
  type: "e2s" | "e2e" | "s2s" | "s2e" // SVAR types; map FS→e2s
}

export type GanttScale = "day" | "week" | "month"

export type GanttGroupBy =
  | "none"
  | "assignee"
  | "department"
  | "status"
  | "project"

export type GanttFilter = {
  status?: GanttRowStatus[]
  assigneeIds?: string[]
  criticalOnly?: boolean
}
