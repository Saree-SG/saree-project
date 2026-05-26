import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type AdminUserListRow = {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  is_superuser: boolean
  company_id: string | null
  company_name: string | null
  department_id: string | null
  department_name: string | null
  primary_role_id: string | null
  primary_role_name: string | null
  primary_role_display_name: string | null
  primary_role_level: number | null
  last_login_at: string | null
  created_at: string | null
}

export type AdminUserMembership = {
  company_id: string
  company_name: string
  role_id: string
  role_name: string
  role_display_name: string
  role_level: number
  is_primary: boolean
  assigned_at: string | null
}

export type AdminUserSessionInfo = {
  session_id: string
  login_at: string | null
  last_seen_at: string | null
  ip_address: string | null
  user_agent: string | null
}

export type AdminUserActivityRow = {
  at: string
  type: "login" | "login_failed"
  ip_address: string | null
  user_agent: string | null
}

export type AdminUserDetail = {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  is_superuser: boolean
  job_title: string | null
  availability_status: string
  company_id: string | null
  company_name: string | null
  department_id: string | null
  department_name: string | null
  created_at: string | null
  memberships: AdminUserMembership[]
  active_sessions: AdminUserSessionInfo[]
  recent_activity: AdminUserActivityRow[]
}

export type MembershipCreatePayload = {
  company_id: string
  role_id: string
  department_id?: string | null
  is_primary?: boolean
}

export type MembershipUpdatePayload = {
  role_id?: string | null
  department_id?: string | null
  clear_department?: boolean
  is_primary?: boolean | null
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

const base = () => `${OpenAPI.BASE}/api/v1/admin/users`

export async function listAdminUsers(): Promise<AdminUserListRow[]> {
  const res = await axios.get<AdminUserListRow[]>(base(), {
    headers: authHeaders(),
  })
  return res.data
}

export async function getAdminUserDetail(
  userId: string,
): Promise<AdminUserDetail> {
  const res = await axios.get<AdminUserDetail>(`${base()}/${userId}/detail`, {
    headers: authHeaders(),
  })
  return res.data
}

export async function addUserMembership(
  userId: string,
  payload: MembershipCreatePayload,
): Promise<AdminUserMembership> {
  const res = await axios.post<AdminUserMembership>(
    `${base()}/${userId}/memberships`,
    payload,
    { headers: authHeaders() },
  )
  return res.data
}

export async function updateUserMembership(
  userId: string,
  companyId: string,
  payload: MembershipUpdatePayload,
): Promise<AdminUserMembership[]> {
  const res = await axios.patch<AdminUserMembership[]>(
    `${base()}/${userId}/memberships/${companyId}`,
    payload,
    { headers: authHeaders() },
  )
  return res.data
}

export type PermissionItem = {
  code: string
  module: string
  action: string
  scope: string
  description: string
}

export type UserPermissionsResponse = {
  user_id: string
  is_superuser: boolean
  source: "superuser" | "director" | "manager" | "assigned" | "none"
  total: number
  by_module: Record<string, PermissionItem[]>
}

export async function getUserPermissions(
  userId: string,
): Promise<UserPermissionsResponse> {
  const res = await axios.get<UserPermissionsResponse>(
    `${base()}/${userId}/permissions`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function deleteUserMembership(
  userId: string,
  companyId: string,
): Promise<void> {
  await axios.delete(`${base()}/${userId}/memberships/${companyId}`, {
    headers: authHeaders(),
  })
}
