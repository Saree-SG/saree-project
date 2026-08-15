import axios from "axios"
import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

function authHeaders() {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const base = () => `${OpenAPI.BASE}/api/v1/skills`

export type Skill = {
  id: string
  company_id: string
  name: string
  category: string
  description: string | null
}

export type UserSkill = {
  id: string
  user_id: string
  skill_id: string
  skill_name: string
  skill_category: string
  level: number
}

export async function fetchSkills(): Promise<Skill[]> {
  const res = await axios.get<Skill[]>(base(), { headers: authHeaders() })
  return res.data
}

export async function createSkill(data: {
  name: string
  category?: string
  description?: string
}): Promise<Skill> {
  const res = await axios.post<Skill>(base(), data, { headers: authHeaders() })
  return res.data
}

export async function fetchUserSkills(userId: string): Promise<UserSkill[]> {
  const res = await axios.get<UserSkill[]>(`${base()}/users/${userId}`, {
    headers: authHeaders(),
  })
  return res.data
}

export async function saveUserSkills(
  userId: string,
  skills: { skill_id: string; level: number }[],
): Promise<UserSkill[]> {
  const res = await axios.put<UserSkill[]>(
    `${base()}/users/${userId}`,
    skills,
    { headers: authHeaders() },
  )
  return res.data
}

// ── Yêu cầu thay đổi kỹ năng ────────────────────────────────────────────────

export type SkillRequest = {
  id: string
  user_id: string
  user_name?: string
  requested_skills: { skill_id: string; level: number }[]
  status: "pending" | "approved" | "rejected" | "cancelled"
  note?: string
  created_at: string
  reviewed_by?: string
}

export async function submitSkillRequest(
  skills: { skill_id: string; level: number }[],
): Promise<SkillRequest> {
  const res = await axios.post<SkillRequest>(
    `${OpenAPI.BASE}/api/v1/skills/requests`,
    { requested_skills: skills },
    { headers: authHeaders() },
  )
  return res.data
}

export async function fetchPendingSkillRequests(): Promise<SkillRequest[]> {
  const res = await axios.get<SkillRequest[]>(
    `${OpenAPI.BASE}/api/v1/skills/requests/pending`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function fetchMySkillRequests(): Promise<SkillRequest[]> {
  const res = await axios.get<SkillRequest[]>(
    `${OpenAPI.BASE}/api/v1/skills/requests/my`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function approveSkillRequest(id: string): Promise<SkillRequest> {
  const res = await axios.post<SkillRequest>(
    `${OpenAPI.BASE}/api/v1/skills/requests/${id}/approve`,
    {},
    { headers: authHeaders() },
  )
  return res.data
}

export async function rejectSkillRequest(
  id: string,
  note?: string,
): Promise<SkillRequest> {
  const res = await axios.post<SkillRequest>(
    `${OpenAPI.BASE}/api/v1/skills/requests/${id}/reject`,
    { note },
    { headers: authHeaders() },
  )
  return res.data
}
