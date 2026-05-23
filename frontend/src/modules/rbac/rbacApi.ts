import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type PermissionCatalogItem = {
  id: string
  code: string
  module: string
  action: string
  scope: string
  description: string
}

export type RolePermissionAssignResponse = {
  role_id: string
  assigned_permission_codes: string[]
}

export type CompanyMember = {
  user_id: string
  email: string
  full_name: string | null
  role_id: string
  role_name: string
  role_display_name: string
  role_level: number
  is_primary: boolean
}

export type CompanyRole = {
  id: string
  name: string
  display_name: string
  level: number
  is_system: boolean
}

export type UpdateCompanyMemberRolePayload = {
  companyId: string
  userId: string
  currentRoleId: string
  newRoleId: string
  isPrimary: boolean
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getAccessToken() || ""}`,
  }
}

export type Company = {
  id: string
  name: string
  slug: string
  is_active: boolean
}

/**
 * List companies the current user belongs to.
 */
export async function listMyCompanies(): Promise<Company[]> {
  const response = await axios.get<Company[]>(
    `${OpenAPI.BASE}/api/v1/roles/my-companies`,
    { headers: authHeaders() },
  )
  return response.data
}

/**
 * Read all effective permission codes of current user.
 */
export async function readMyPermissions(): Promise<string[]> {
  const response = await axios.get<string[]>(
    `${OpenAPI.BASE}/api/v1/roles/my-permissions`,
    { headers: authHeaders() },
  )
  return response.data
}

/**
 * Read full permissions catalog for role editor UI.
 */
export async function listPermissionsCatalog(): Promise<PermissionCatalogItem[]> {
  const response = await axios.get<PermissionCatalogItem[]>(
    `${OpenAPI.BASE}/api/v1/roles/permissions-catalog`,
    { headers: authHeaders() },
  )
  return response.data
}

/**
 * Read current permission codes assigned to a role.
 */
export async function readRolePermissions(roleId: string): Promise<string[]> {
  const response = await axios.get<string[]>(
    `${OpenAPI.BASE}/api/v1/roles/${roleId}/permissions`,
    { headers: authHeaders() },
  )
  return response.data
}

/**
 * List all members of a company with company-role assignment.
 */
export async function listCompanyMembers(
  companyId: string,
): Promise<CompanyMember[]> {
  const response = await axios.get<CompanyMember[]>(
    `${OpenAPI.BASE}/api/v1/roles/companies/${companyId}/members`,
    { headers: authHeaders() },
  )
  return response.data
}

/**
 * List roles available in a company for dropdown/selection UI.
 * Excludes admin by default (backend handles this).
 */
export async function listCompanyRoles(companyId: string): Promise<CompanyRole[]> {
  const response = await axios.get<CompanyRole[]>(
    `${OpenAPI.BASE}/api/v1/roles/catalog`,
    { headers: authHeaders(), params: { company_id: companyId } },
  )
  return response.data
}

/**
 * Update role assignment for a company member.
 */
export async function updateCompanyMemberRole(
  payload: UpdateCompanyMemberRolePayload,
): Promise<void> {
  await axios.patch(
    `${OpenAPI.BASE}/api/v1/roles/companies/${payload.companyId}/members/${payload.userId}`,
    {
      current_role_id: payload.currentRoleId,
      new_role_id: payload.newRoleId,
      is_primary: payload.isPrimary,
    },
    { headers: authHeaders() },
  )
}

/**
 * Remove role assignment from a company member.
 */
export async function removeCompanyMemberRole(payload: {
  companyId: string
  userId: string
  roleId: string
}): Promise<void> {
  await axios.delete(
    `${OpenAPI.BASE}/api/v1/roles/companies/${payload.companyId}/members/${payload.userId}/roles/${payload.roleId}`,
    { headers: authHeaders() },
  )
}

/**
 * Replace a role's permission set by permission codes.
 */
export async function assignRolePermissions(params: {
  roleId: string
  permissionCodes: string[]
}): Promise<RolePermissionAssignResponse> {
  const response = await axios.post<RolePermissionAssignResponse>(
    `${OpenAPI.BASE}/api/v1/roles/${params.roleId}/permissions`,
    { permission_codes: params.permissionCodes },
    { headers: authHeaders() },
  )
  return response.data
}
