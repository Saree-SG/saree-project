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
  assignee_name: string | null
  assignor_name: string | null
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

export async function fetchProjectGantt(projectId: string): Promise<GanttData> {
  const r = await axios.get<GanttData>(
    `${OpenAPI.BASE}/api/v1/projects/${projectId}/gantt`,
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
