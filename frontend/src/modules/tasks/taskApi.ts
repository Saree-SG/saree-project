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
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

export interface MaterialRequestLinkBody {
  item_name?: string
  quantity?: number
  unit?: string
  reason?: string
}

/** Create a material request linked to this task. */
export async function createLinkedEntity(
  taskId: string,
  body: MaterialRequestLinkBody = {},
): Promise<unknown> {
  const res = await axios.post<unknown>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/linked-entity`,
    body,
    { headers: authHeaders() },
  )
  return res.data
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
