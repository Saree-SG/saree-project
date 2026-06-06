import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type DashboardOverview = {
  total_projects: number
  total_tasks: number
  done_tasks: number
  completion_rate_pct: number
  overdue_tasks: number
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

export async function getOverview(params?: {
  departmentId?: string
  projectId?: string
}): Promise<DashboardOverview> {
  const r = await axios.get<DashboardOverview>(
    `${OpenAPI.BASE}/api/v1/dashboard/overview`,
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
