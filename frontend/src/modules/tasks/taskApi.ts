import axios from "axios"

import { OpenAPI, type TaskPublic } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type TaskExtraAssigneePublic = {
  id: string
  task_id: string
  user_id: string
  user_name?: string | null
  assigned_by: string
  assigned_at: string
}

export type TaskObserverPublic = {
  task_id: string
  user_id: string
  user_name?: string | null
  added_at: string
}

export type TaskLinkedEntityPublic = {
  id: string
  task_id: string
  entity_type: string
  entity_id: string
  created_by: string
  created_at: string
}

export type TaskWithPeople = TaskPublic & {
  extra_assignees?: TaskExtraAssigneePublic[]
  observers?: TaskObserverPublic[]
  linked_entities?: TaskLinkedEntityPublic[]
  // Present on backend TaskPublic; not yet in generated client types.
  requires_checkin?: boolean
  checkin_lat?: number | null
  checkin_lng?: number | null
  checkin_radius_m?: number | null
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

/** Unlink the business entity from a task (clear linked_entity fields). */
export async function unlinkEntity(taskId: string): Promise<TaskPublic> {
  const res = await axios.patch<TaskPublic>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}`,
    { linked_entity_type: null, linked_entity_id: null },
    { headers: authHeaders() },
  )
  return res.data
}

/**
 * Add an extra assignee (co-worker) to a task.
 */
export async function addTaskExtraAssignee(
  taskId: string,
  userId: string,
): Promise<TaskWithPeople> {
  const res = await axios.post<TaskWithPeople>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/assignees`,
    { user_id: userId },
    { headers: authHeaders() },
  )
  return res.data
}

/**
 * Remove an extra assignee (co-worker) from a task.
 */
export async function removeTaskExtraAssignee(
  taskId: string,
  userId: string,
): Promise<TaskWithPeople> {
  const res = await axios.delete<TaskWithPeople>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/assignees/${userId}`,
    { headers: authHeaders() },
  )
  return res.data
}

/**
 * Add an observer (watch-only) to a task.
 */
export async function addTaskObserver(
  taskId: string,
  userId: string,
): Promise<TaskWithPeople> {
  const res = await axios.post<TaskWithPeople>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/observers`,
    { user_id: userId },
    { headers: authHeaders() },
  )
  return res.data
}

/**
 * Remove an observer from a task.
 */
export async function removeTaskObserver(
  taskId: string,
  userId: string,
): Promise<TaskWithPeople> {
  const res = await axios.delete<TaskWithPeople>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/observers/${userId}`,
    { headers: authHeaders() },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// Dispatch conflict check (Bước 6 — Gap 29–31)
// ---------------------------------------------------------------------------

export type ConflictOverlap = {
  task_id: string
  task_name: string
  project_name: string
}

export type TravelInfo = {
  distance_km: number
  travel_minutes: number
  feasible: boolean
  earliest_arrival: string
  message: string
}

export type ConflictCheckResult = {
  overlaps: ConflictOverlap[]
  travel: TravelInfo | null
}

export async function checkDispatchConflict(params: {
  assignee_id: string
  project_id: string
  start_time: string // ISO datetime
  end_time: string
  arrive_at?: string | null
}): Promise<ConflictCheckResult> {
  const res = await axios.post<ConflictCheckResult>(
    `${OpenAPI.BASE}/api/v1/tasks/check-conflict`,
    params,
    { headers: authHeaders() },
  )
  return res.data
}

export async function handoffTask(
  taskId: string,
  newAssigneeId: string,
  note?: string,
): Promise<TaskWithPeople> {
  const res = await axios.post<TaskWithPeople>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/handoff`,
    { new_assignee_id: newAssigneeId, note: note ?? null },
    { headers: authHeaders() },
  )
  return res.data
}

/**
 * Reassign primary assignee of a task.
 */
export async function reassignTask(
  taskId: string,
  newAssigneeId: string,
): Promise<TaskWithPeople> {
  const res = await axios.patch<TaskWithPeople>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/reassign`,
    { new_assignee_id: newAssigneeId },
    { headers: authHeaders() },
  )
  return res.data
}
