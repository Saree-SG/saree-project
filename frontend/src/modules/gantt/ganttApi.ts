import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type GanttTask = {
  id: string
  project_id: string
  parent_id: string | null
  level: number
  name: string
  start_time: string
  end_time: string
  status: string
  computed_status: string | null
  is_on_critical_path: boolean
  reported_progress_total: number
  assignee_id?: string | null
  assignee_name: string | null
  assignor_name: string | null
  assignee_department_id?: string | null
  assignee_department_name?: string | null
  blocked_by?: Array<{ id: string; name: string; status: string }>
}

export type GanttDependency = {
  id: string
  blocking_task_id: string
  dependent_task_id: string
  dependency_type: string
  lag_hours: number
}

export type GanttData = {
  tasks: GanttTask[]
  dependencies: GanttDependency[]
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

export type CompanyGanttFilter = {
  project_id?: string
  department_id?: string
  assignee_id?: string
  start_date?: string
  end_date?: string
}

export async function fetchCompanyGantt(
  filter?: CompanyGanttFilter,
): Promise<GanttData> {
  const qs = new URLSearchParams()
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      if (v) qs.set(k, v)
    }
  }
  const r = await axios.get<GanttData>(
    `${OpenAPI.BASE}/api/v1/dashboard/gantt${qs.toString() ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  )
  return r.data
}

export async function fetchUserGantt(userId: string): Promise<GanttData> {
  const r = await axios.get<GanttData>(
    `${OpenAPI.BASE}/api/v1/dashboard/users/${userId}/gantt`,
    { headers: authHeaders() },
  )
  return r.data
}

export async function fetchProjectGantt(projectId: string): Promise<GanttData> {
  const r = await axios.get<GanttData>(
    `${OpenAPI.BASE}/api/v1/projects/${projectId}/gantt`,
    { headers: authHeaders() },
  )
  return r.data
}

/** One row of the project-level overview timeline (1 row = 1 project). */
export type ProjectTimelineRow = {
  id: string
  code: string
  name: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  progress: number // 0..100
  status: string
  department_id?: string | null
  department_name?: string | null
}

export async function fetchProjectTimeline(filter?: {
  department_id?: string
  include_finished?: boolean
}): Promise<ProjectTimelineRow[]> {
  const qs = new URLSearchParams()
  if (filter?.department_id) qs.set("department_id", filter.department_id)
  if (filter?.include_finished) qs.set("include_finished", "true")
  const r = await axios.get<ProjectTimelineRow[]>(
    `${OpenAPI.BASE}/api/v1/projects/timeline${qs.toString() ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  )
  return r.data
}

export async function updateTaskTimeline(
  taskId: string,
  startTime: string,
  endTime: string,
): Promise<void> {
  await axios.patch(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}`,
    { start_time: startTime, end_time: endTime },
    { headers: authHeaders() },
  )
}

export async function removeDependency(
  blockingTaskId: string,
  depId: string,
): Promise<void> {
  await axios.delete(
    `${OpenAPI.BASE}/api/v1/tasks/${blockingTaskId}/dependencies/${depId}`,
    { headers: authHeaders() },
  )
}

export async function addDependency(
  blockingTaskId: string,
  dependentTaskId: string,
): Promise<void> {
  await axios.post(
    `${OpenAPI.BASE}/api/v1/tasks/${blockingTaskId}/dependencies`,
    {
      blocking_task_id: blockingTaskId,
      dependent_task_id: dependentTaskId,
      dependency_type: "FS",
      lag_hours: 0,
    },
    { headers: authHeaders() },
  )
}
