import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type ProductivityRow = {
  user_id: string
  user_name: string
  work_hours: number
  days_worked: number
  tasks_total: number
  tasks_done: number
  tasks_overdue: number
  completion_pct: number
  tasks_per_hour: number | null
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
