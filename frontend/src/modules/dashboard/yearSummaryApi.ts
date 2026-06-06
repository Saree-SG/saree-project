import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type YearSummaryRow = {
  user_id: string
  user_name: string
  job_title: string | null
  work_hours: number
  days_worked: number
  tasks_total: number
  tasks_done: number
  tasks_on_time: number
  tasks_overdue: number
  completion_pct: number
  on_time_pct: number
  attendance_pct: number
  proofs_total: number
  proofs_approved: number
  quality_pct: number | null
  score: number
  rank: number
}

export type YearSummary = {
  year: number
  from: string
  to: string
  weights: Record<string, number>
  rows: YearSummaryRow[]
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

export async function getYearSummary(params: {
  year?: number
  fromMonth?: string
  toMonth?: string
  departmentId?: string
  projectId?: string
}): Promise<YearSummary> {
  const r = await axios.get<YearSummary>(
    `${OpenAPI.BASE}/api/v1/dashboard/year-summary`,
    {
      headers: authHeaders(),
      params: {
        year: params.year,
        from_month: params.fromMonth,
        to_month: params.toMonth,
        department_id: params.departmentId,
        project_id: params.projectId,
      },
    },
  )
  return r.data
}
