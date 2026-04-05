import axios from "axios"
import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type OrgTreeMember = {
  user_id: string
  full_name: string | null
  email: string
  department_id: string | null
  department_name: string | null
  is_current_user: boolean
}

export type OrgTreeRoleNode = {
  role_id: string
  role_name: string
  role_display_name: string
  role_level: number
  relation_to_current: "below" | "peer" | "above"
  members: OrgTreeMember[]
}

export type OrgTreeDepartmentGroup = {
  department_id: string | null
  department_name: string
  roles: OrgTreeRoleNode[]
}

export type OrgTreeResponse = {
  company_id: string
  company_name: string
  current_user_id: string
  current_role_id: string | null
  current_role_level: number | null
  departments: OrgTreeDepartmentGroup[]
}

export const getOrgTree = async (params: {
  companyId: string
  departmentId?: string
}) => {
  const response = await axios.get<OrgTreeResponse>(
    `${OpenAPI.BASE}/api/v1/roles/org-tree`,
    {
      params: {
        company_id: params.companyId,
        department_id: params.departmentId,
      },
      headers: {
        Authorization: `Bearer ${getAccessToken() || ""}`,
      },
    },
  )
  return response.data
}
