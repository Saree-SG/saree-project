import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type AttendanceMode = "project" | "company"

export type AttendanceRecord = {
  id: string
  user_id: string
  mode: AttendanceMode
  project_id: string | null
  company_id: string | null
  customer_company_id: string | null
  task_label: string | null
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
  // Open past the check-out grace period → recorded as absent (vắng), no hours.
  is_absent: boolean
  // When the "please check out" reminder was pushed (null = not yet reminded).
  reminder_sent_at: string | null
  note: string | null
  created_at: string
}

export type AttendanceRecordsResponse = {
  data: AttendanceRecord[]
  count: number
}

// Team/management view: a record enriched with the employee name + a
// human-readable location label (project / company / customer company).
export type AttendanceTeamRecord = AttendanceRecord & {
  user_name: string | null
  user_email: string | null
  location_label: string | null
}

export type AttendanceTeamRecordsResponse = {
  data: AttendanceTeamRecord[]
  count: number
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

const API = `${OpenAPI.BASE}/api/v1`

export async function checkIn(params: {
  mode: AttendanceMode
  projectId?: string
  companyId?: string
  customerCompanyId?: string
  taskLabel?: string
  lat: number
  lng: number
  accuracyM: number | null
  file: File
  note?: string
}): Promise<AttendanceRecord> {
  const form = new FormData()
  form.append("file", params.file)
  form.append("mode", params.mode)
  if (params.projectId) form.append("project_id", params.projectId)
  if (params.companyId) form.append("company_id", params.companyId)
  if (params.customerCompanyId)
    form.append("customer_company_id", params.customerCompanyId)
  if (params.taskLabel) form.append("task_label", params.taskLabel)
  form.append("lat", String(params.lat))
  form.append("lng", String(params.lng))
  if (params.accuracyM != null)
    form.append("accuracy_m", String(params.accuracyM))
  if (params.note) form.append("note", params.note)
  const r = await axios.post<AttendanceRecord>(
    `${API}/attendance/check-in`,
    form,
    {
      headers: authHeaders(),
    },
  )
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
  if (params.accuracyM != null)
    form.append("accuracy_m", String(params.accuracyM))
  const r = await axios.post<AttendanceRecord>(
    `${API}/attendance/check-out`,
    form,
    {
      headers: authHeaders(),
    },
  )
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

// Manager/director view: all attendance for a company's members in a date range.
export async function listCompanyAttendance(params: {
  companyId: string
  dateFrom?: string
  dateTo?: string
}): Promise<AttendanceTeamRecordsResponse> {
  const r = await axios.get<AttendanceTeamRecordsResponse>(
    `${API}/companies/${params.companyId}/attendance`,
    {
      headers: authHeaders(),
      params: { date_from: params.dateFrom, date_to: params.dateTo },
    },
  )
  return r.data
}

// Manager correction of work hours (e.g. confirming a forgotten check-out).
export async function adjustAttendanceHours(params: {
  recordId: string
  workHours: number
  note?: string
}): Promise<AttendanceRecord> {
  const r = await axios.patch<AttendanceRecord>(
    `${API}/attendance/${params.recordId}/hours`,
    { work_hours: params.workHours, note: params.note },
    { headers: authHeaders() },
  )
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

export type CompanyLite = {
  id: string
  name: string
  slug: string
  is_active: boolean
  site_lat: number | null
  site_lng: number | null
  site_radius_m: number
}

// All companies (manager site-config). Worker check-in uses the scoped list below.
export async function listCompaniesForAttendance(): Promise<CompanyLite[]> {
  const r = await axios.get<CompanyLite[]>(`${API}/roles/companies`, {
    headers: authHeaders(),
  })
  return r.data
}

// Only the tenant companies the current account belongs to — used as the
// "Công ty của tôi" group in the by-company check-in picker.
export async function listMyCompaniesForAttendance(): Promise<CompanyLite[]> {
  const r = await axios.get<CompanyLite[]>(`${API}/roles/my-companies`, {
    headers: authHeaders(),
  })
  return r.data
}

export async function listTaskSuggestions(): Promise<string[]> {
  const r = await axios.get<string[]>(`${API}/attendance/task-suggestions`, {
    headers: authHeaders(),
  })
  return r.data
}

export async function setCompanySiteLocation(params: {
  companyId: string
  siteLat: number | null
  siteLng: number | null
  siteRadiusM: number
}): Promise<CompanyLite> {
  const r = await axios.patch<CompanyLite>(
    `${API}/companies/${params.companyId}/site-location`,
    {
      site_lat: params.siteLat,
      site_lng: params.siteLng,
      site_radius_m: params.siteRadiusM,
    },
    { headers: authHeaders() },
  )
  return r.data
}
