import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type AttendanceRecord = {
  id: string
  user_id: string
  project_id: string
  work_date: string
  check_in_at: string
  check_in_lat: number
  check_in_lng: number
  check_in_accuracy_m: number | null
  check_in_distance_m: number
  check_in_valid: boolean
  check_in_photo_url: string
  check_out_at: string | null
  check_out_lat: number | null
  check_out_lng: number | null
  check_out_accuracy_m: number | null
  check_out_distance_m: number | null
  check_out_valid: boolean | null
  check_out_photo_url: string | null
  work_hours: number | null
  is_capped: boolean
  is_auto_closed: boolean
  note: string | null
  created_at: string
}

export type AttendanceRecordsResponse = {
  data: AttendanceRecord[]
  count: number
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

const API = `${OpenAPI.BASE}/api/v1`

export async function checkIn(params: {
  projectId: string
  lat: number
  lng: number
  accuracyM: number | null
  file: File
  note?: string
}): Promise<AttendanceRecord> {
  const form = new FormData()
  form.append("file", params.file)
  form.append("project_id", params.projectId)
  form.append("lat", String(params.lat))
  form.append("lng", String(params.lng))
  if (params.accuracyM != null) form.append("accuracy_m", String(params.accuracyM))
  if (params.note) form.append("note", params.note)
  const r = await axios.post<AttendanceRecord>(`${API}/attendance/check-in`, form, {
    headers: authHeaders(),
  })
  return r.data
}

export async function checkOut(params: {
  recordId: string
  lat: number
  lng: number
  accuracyM: number | null
  file: File
}): Promise<AttendanceRecord> {
  const form = new FormData()
  form.append("file", params.file)
  form.append("record_id", params.recordId)
  form.append("lat", String(params.lat))
  form.append("lng", String(params.lng))
  if (params.accuracyM != null) form.append("accuracy_m", String(params.accuracyM))
  const r = await axios.post<AttendanceRecord>(`${API}/attendance/check-out`, form, {
    headers: authHeaders(),
  })
  return r.data
}

export async function listMyAttendance(params?: {
  dateFrom?: string
  dateTo?: string
}): Promise<AttendanceRecordsResponse> {
  const r = await axios.get<AttendanceRecordsResponse>(`${API}/attendance/me`, {
    headers: authHeaders(),
    params: { date_from: params?.dateFrom, date_to: params?.dateTo },
  })
  return r.data
}

export type ProjectLite = {
  id: string
  name: string
  code: string
  site_lat: number | null
  site_lng: number | null
  site_radius_m: number
}

export async function listProjectsForAttendance(): Promise<ProjectLite[]> {
  const r = await axios.get<{ data: ProjectLite[]; count: number }>(
    `${API}/projects/`,
    { headers: authHeaders() },
  )
  return r.data.data
}

export async function setSiteLocation(params: {
  projectId: string
  siteLat: number | null
  siteLng: number | null
  siteRadiusM: number
}): Promise<ProjectLite> {
  const r = await axios.patch<ProjectLite>(
    `${API}/projects/${params.projectId}/site-location`,
    {
      site_lat: params.siteLat,
      site_lng: params.siteLng,
      site_radius_m: params.siteRadiusM,
    },
    { headers: authHeaders() },
  )
  return r.data
}
