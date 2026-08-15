import axios from "axios"
import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

function authHeaders() {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type MapSite = {
  project_id: string
  name: string
  lat: number | null
  lng: number | null
  status: string
  priority: string
  progress_pct: number
  staff_count: number
}

export type MapCustomer = {
  id: string
  name: string
  lat: number | null
  lng: number | null
  phone: string | null
  address: string | null
}

export type MapStaff = {
  user_id: string
  name: string
  status: string
  lat: number
  lng: number
  loc_source: string
}

export type MapOverviewData = {
  sites: MapSite[]
  customers: MapCustomer[]
  staff: MapStaff[]
}

export async function fetchMapOverview(
  companyId?: string,
): Promise<MapOverviewData> {
  const params = companyId ? { company_id: companyId } : {}
  const res = await axios.get<MapOverviewData>(
    `${OpenAPI.BASE}/api/v1/dashboard/map`,
    { headers: authHeaders(), params },
  )
  return res.data
}

export type CompanyOption = { id: string; name: string; slug: string }

export async function fetchAllCompanies(): Promise<CompanyOption[]> {
  const res = await axios.get<CompanyOption[]>(
    `${OpenAPI.BASE}/api/v1/roles/companies`,
    { headers: authHeaders() },
  )
  return res.data
}
