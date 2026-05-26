import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type AdminOverview = {
  total_users: number
  active_users: number
  active_users_30d: number
  total_companies: number
  total_departments: number
  total_roles: number
  logins_today: number
  online_now: number
}

export type ActiveSession = {
  session_id: string
  user_id: string | null
  email: string | null
  full_name: string | null
  login_at: string | null
  last_seen_at: string | null
  ip_address: string | null
  user_agent: string | null
}

export type LoginFrequencyPoint = {
  date: string
  login_count: number
  unique_users: number
}

export type UserActivityRow = {
  user_id: string
  full_name: string | null
  email: string
  login_count: number
  last_login: string | null
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

const base = () => `${OpenAPI.BASE}/api/v1/admin/stats`

export async function getAdminOverview(): Promise<AdminOverview> {
  const res = await axios.get<AdminOverview>(`${base()}/overview`, {
    headers: authHeaders(),
  })
  return res.data
}

export async function listActiveSessions(): Promise<ActiveSession[]> {
  const res = await axios.get<ActiveSession[]>(`${base()}/sessions/active`, {
    headers: authHeaders(),
  })
  return res.data
}

export async function getLoginFrequency(
  days = 30,
): Promise<LoginFrequencyPoint[]> {
  const res = await axios.get<LoginFrequencyPoint[]>(
    `${base()}/logins?days=${days}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function getUsersActivity(
  days = 7,
  limit = 10,
): Promise<UserActivityRow[]> {
  const res = await axios.get<UserActivityRow[]>(
    `${base()}/users/activity?days=${days}&limit=${limit}`,
    { headers: authHeaders() },
  )
  return res.data
}

export type AuditLogEntry = {
  id: string
  actor_id: string
  actor_name: string | null
  actor_email: string | null
  action: string
  entity_type: string
  entity_id: string
  old_value: unknown
  new_value: unknown
  ip_address: string | null
  created_at: string | null
}

export async function listAuditLog(params?: {
  limit?: number
  action?: string
  entity_type?: string
  actor_id?: string
}): Promise<AuditLogEntry[]> {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set("limit", String(params.limit))
  if (params?.action) qs.set("action", params.action)
  if (params?.entity_type) qs.set("entity_type", params.entity_type)
  if (params?.actor_id) qs.set("actor_id", params.actor_id)
  const res = await axios.get<AuditLogEntry[]>(
    `${base()}/audit${qs.toString() ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function revokeSession(sessionId: string): Promise<void> {
  await axios.delete(`${base()}/sessions/${sessionId}`, {
    headers: authHeaders(),
  })
}
