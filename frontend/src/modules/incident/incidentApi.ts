import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export const INCIDENT_CATEGORIES = [
  { value: "electrical", label: "Điện" },
  { value: "welding", label: "Hàn" },
  { value: "conveyor", label: "Băng chuyền" },
  { value: "cooling", label: "Lạnh" },
  { value: "insulation", label: "Bọc cách nhiệt" },
  { value: "panel", label: "Kho lạnh / Panel" },
  { value: "other", label: "Khác" },
] as const

export const INCIDENT_SEVERITIES = [
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Trung bình" },
  { value: "high", label: "Cao" },
] as const

export function categoryLabel(v: string): string {
  return INCIDENT_CATEGORIES.find((c) => c.value === v)?.label ?? v
}
export function severityLabel(v: string): string {
  return INCIDENT_SEVERITIES.find((s) => s.value === v)?.label ?? v
}

export type IncidentAttachment = {
  id: string
  file_url: string
  file_type: string
  uploaded_at: string
}

export type Incident = {
  id: string
  company_id: string
  project_id: string | null
  task_id: string | null
  title: string
  description: string
  category: string
  severity: string
  root_cause: string | null
  solution: string | null
  status: string
  reported_by: string
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  attachments: IncidentAttachment[]
}

export type IncidentsResponse = { data: Incident[]; count: number }

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}
const API = `${OpenAPI.BASE}/api/v1`

export async function listIncidents(params?: {
  category?: string
  status?: string
  projectId?: string
  q?: string
}): Promise<IncidentsResponse> {
  const r = await axios.get<IncidentsResponse>(`${API}/incidents`, {
    headers: authHeaders(),
    params: {
      category: params?.category,
      status: params?.status,
      project_id: params?.projectId,
      q: params?.q,
    },
  })
  return r.data
}

export async function getIncident(id: string): Promise<Incident> {
  const r = await axios.get<Incident>(`${API}/incidents/${id}`, {
    headers: authHeaders(),
  })
  return r.data
}

export async function createIncident(body: {
  title: string
  description: string
  category: string
  severity: string
  project_id?: string | null
  task_id?: string | null
  root_cause?: string | null
  solution?: string | null
}): Promise<Incident> {
  const r = await axios.post<Incident>(`${API}/incidents`, body, {
    headers: authHeaders(),
  })
  return r.data
}

export async function resolveIncident(
  id: string,
  body: { root_cause: string; solution: string },
): Promise<Incident> {
  const r = await axios.post<Incident>(`${API}/incidents/${id}/resolve`, body, {
    headers: authHeaders(),
  })
  return r.data
}

export async function uploadIncidentAttachment(
  id: string,
  file: File,
): Promise<IncidentAttachment> {
  const form = new FormData()
  form.append("file", file)
  const r = await axios.post<IncidentAttachment>(
    `${API}/incidents/${id}/attachments`,
    form,
    { headers: authHeaders() },
  )
  return r.data
}
