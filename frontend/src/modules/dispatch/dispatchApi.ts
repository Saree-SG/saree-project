import axios from "axios"
import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

function authHeaders() {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type Candidate = {
  user_id: string
  user_name: string
  skill_name: string
  skill_level: number
  workload_pct: number
  load_status: "free" | "stable" | "overloaded"
  current_task_name: string | null
  current_site_name: string | null
  distance_km: number | null
  eta_minutes: number | null
  score: number
  impact: "Ít ảnh hưởng" | "Ảnh hưởng vừa" | "Ảnh hưởng lớn"
}

export async function fetchCandidates(taskId: string, limit = 10): Promise<Candidate[]> {
  const res = await axios.get<Candidate[]>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/suggest-assignees`,
    { headers: authHeaders(), params: { limit } },
  )
  return res.data
}
