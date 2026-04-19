import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type Notification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  entity_type: string
  entity_id: string
  is_read: boolean
  created_at: string
}

export type UnreadCount = {
  count: number
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getAccessToken() || ""}`,
  }
}

export async function listNotifications(params?: {
  skip?: number
  limit?: number
}): Promise<Notification[]> {
  const r = await axios.get<Notification[]>(
    `${OpenAPI.BASE}/api/v1/notifications`,
    {
      params: { skip: params?.skip ?? 0, limit: params?.limit ?? 50 },
      headers: authHeaders(),
    },
  )
  return r.data
}

export async function getUnreadCount(): Promise<UnreadCount> {
  const r = await axios.get<UnreadCount>(
    `${OpenAPI.BASE}/api/v1/notifications/unread-count`,
    { headers: authHeaders() },
  )
  return r.data
}

export async function markRead(notificationId: string): Promise<Notification> {
  const r = await axios.patch<Notification>(
    `${OpenAPI.BASE}/api/v1/notifications/${notificationId}/read`,
    {},
    { headers: authHeaders() },
  )
  return r.data
}

export async function markAllRead(): Promise<void> {
  await axios.patch(
    `${OpenAPI.BASE}/api/v1/notifications/read-all`,
    {},
    { headers: authHeaders() },
  )
}
