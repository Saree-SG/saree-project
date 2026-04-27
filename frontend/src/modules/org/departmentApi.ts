import axios from "axios"
import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type Department = {
  id: string
  company_id: string
  parent_id: string | null
  name: string
  dept_type: string | null
  is_active: boolean
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

export async function listDepartments(companyId: string): Promise<Department[]> {
  const response = await axios.get<Department[]>(
    `${OpenAPI.BASE}/api/v1/roles/companies/${companyId}/departments`,
    { headers: authHeaders() },
  )
  return response.data
}

export async function createDepartment(
  companyId: string,
  body: { name: string; dept_type?: string | null; parent_id?: string | null },
): Promise<Department> {
  const response = await axios.post<Department>(
    `${OpenAPI.BASE}/api/v1/roles/companies/${companyId}/departments`,
    body,
    { headers: authHeaders() },
  )
  return response.data
}

export async function updateDepartment(
  companyId: string,
  departmentId: string,
  body: {
    name?: string
    dept_type?: string | null
    is_active?: boolean
    parent_id?: string | null
  },
): Promise<Department> {
  const response = await axios.patch<Department>(
    `${OpenAPI.BASE}/api/v1/roles/companies/${companyId}/departments/${departmentId}`,
    body,
    { headers: authHeaders() },
  )
  return response.data
}

export async function deleteDepartment(
  companyId: string,
  departmentId: string,
): Promise<void> {
  await axios.delete(
    `${OpenAPI.BASE}/api/v1/roles/companies/${companyId}/departments/${departmentId}`,
    { headers: authHeaders() },
  )
}

export async function assignUserToDepartment(
  companyId: string,
  departmentId: string,
  userId: string,
): Promise<Department> {
  const response = await axios.post<Department>(
    `${OpenAPI.BASE}/api/v1/roles/companies/${companyId}/departments/${departmentId}/assign-user`,
    { user_id: userId, department_id: departmentId },
    { headers: authHeaders() },
  )
  return response.data
}

export async function unassignUserFromDepartment(
  companyId: string,
  userId: string,
): Promise<void> {
  await axios.delete(
    `${OpenAPI.BASE}/api/v1/roles/companies/${companyId}/members/${userId}/department`,
    { headers: authHeaders() },
  )
}
