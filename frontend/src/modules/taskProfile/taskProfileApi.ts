import axios from "axios"
import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

function authHeaders() {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function apiUrl(path: string) {
  return `${OpenAPI.BASE}/api/v1${path}`
}

export interface TaskProfileItem {
  id: string
  profile_id: string
  parent_item_id: string | null
  name: string
  level: number
  duration_days: number
  order_index: number
  description: string | null
  module_tag: string | null
  color: string | null
}

export interface TaskProfile {
  id: string
  name: string
  description: string | null
  created_by: string
  created_by_name: string | null
  created_at: string
  items: TaskProfileItem[]
}

export async function listProfiles(): Promise<TaskProfile[]> {
  const res = await axios.get(apiUrl("/task-profiles/"), { headers: authHeaders() })
  return res.data
}

export async function listProfilesByCompany(companyId: string): Promise<TaskProfile[]> {
  const res = await axios.get(apiUrl(`/task-profiles/?company_id=${companyId}`), { headers: authHeaders() })
  return res.data
}

export async function getProfile(id: string): Promise<TaskProfile> {
  const res = await axios.get(apiUrl(`/task-profiles/${id}`), { headers: authHeaders() })
  return res.data
}

export async function createProfile(body: { name: string; description?: string }): Promise<TaskProfile> {
  const res = await axios.post(apiUrl("/task-profiles/"), body, { headers: authHeaders() })
  return res.data
}

export async function updateProfile(id: string, body: { name?: string; description?: string }): Promise<TaskProfile> {
  const res = await axios.patch(apiUrl(`/task-profiles/${id}`), body, { headers: authHeaders() })
  return res.data
}

export async function deleteProfile(id: string): Promise<void> {
  await axios.delete(apiUrl(`/task-profiles/${id}`), { headers: authHeaders() })
}

export async function applyProfile(
  profileId: string,
  body: { project_id: string; parent_task_id: string | null; assignee_id: string }
): Promise<{ id: string; name: string; level: number }[]> {
  const res = await axios.post(apiUrl(`/task-profiles/${profileId}/apply`), body, { headers: authHeaders() })
  return res.data
}

export async function saveTaskAsProfile(
  taskId: string,
  body: { name: string; description?: string }
): Promise<TaskProfile> {
  const res = await axios.post(apiUrl(`/task-profiles/from-task/${taskId}`), body, { headers: authHeaders() })
  return res.data
}
