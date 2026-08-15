import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type ProductivityRow = {
  user_id: string
  user_name: string
  department_name?: string | null
  work_hours: number
  days_worked: number
  tasks_total: number
  tasks_done: number
  tasks_overdue: number
  completion_pct: number
  tasks_per_hour: number | null
  // Cân bằng tải (Bước 2, Cách A) — có thể vắng nếu backend chưa cập nhật.
  capacity_hours?: number
  allocated_hours?: number
  workload_pct?: number
  load_status?: "free" | "stable" | "overloaded"
  recommendation?: string | null
}

export type StaffingSummary = {
  free: number
  assigned: number
  overloaded: number
  understaffed_tasks: number
  open_incidents: number
}

export async function getStaffingSummary(params?: {
  departmentId?: string
  projectId?: string
}): Promise<StaffingSummary> {
  const r = await axios.get<StaffingSummary>(
    `${OpenAPI.BASE}/api/v1/dashboard/staffing-summary`,
    {
      headers: authHeaders(),
      params: {
        department_id: params?.departmentId,
        project_id: params?.projectId,
      },
    },
  )
  return r.data
}

export type UnderstaffedTask = {
  task_id: string
  name: string
  project_id: string
  required: number
  assigned: number
  shortage: number
}

export async function getUnderstaffedTasks(params?: {
  departmentId?: string
  projectId?: string
}): Promise<UnderstaffedTask[]> {
  const r = await axios.get<UnderstaffedTask[]>(
    `${OpenAPI.BASE}/api/v1/dashboard/understaffed-tasks`,
    {
      headers: authHeaders(),
      params: {
        department_id: params?.departmentId,
        project_id: params?.projectId,
      },
    },
  )
  return r.data
}

export type TeamProductivity = {
  month: string
  rows: ProductivityRow[]
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

export async function getTeamProductivity(params: {
  month?: string
  departmentId?: string
  projectId?: string
}): Promise<TeamProductivity> {
  const r = await axios.get<TeamProductivity>(
    `${OpenAPI.BASE}/api/v1/dashboard/team-productivity`,
    {
      headers: authHeaders(),
      params: {
        month: params.month,
        department_id: params.departmentId,
        project_id: params.projectId,
      },
    },
  )
  return r.data
}
