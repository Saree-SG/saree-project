import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type DelayWarning = {
  severity: "red" | "orange" | "yellow"
  layer: 1 | 2 | 3 | 4
  title: string
  detail: string
  task_id: string | null
  task_name: string | null
  estimated_delay_days: number | null
}

export type DelayWarningsData = {
  warnings: DelayWarning[]
  analyzed_at: string
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

export async function fetchDelayWarnings(
  projectId: string,
): Promise<DelayWarningsData> {
  const r = await axios.get<DelayWarningsData>(
    `${OpenAPI.BASE}/api/v1/projects/${projectId}/delay-warnings`,
    { headers: authHeaders() },
  )
  return r.data
}
