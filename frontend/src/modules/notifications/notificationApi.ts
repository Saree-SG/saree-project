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

// Two notification zones: "chat" = chat messages, "other" = everything else.
export type NotificationCategory = "chat" | "other"

function authHeaders() {
  return {
    Authorization: `Bearer ${getAccessToken() || ""}`,
  }
}

export async function listNotifications(params?: {
  skip?: number
  limit?: number
  category?: NotificationCategory
}): Promise<Notification[]> {
  const r = await axios.get<Notification[]>(
    `${OpenAPI.BASE}/api/v1/notifications`,
    {
      params: {
        skip: params?.skip ?? 0,
        limit: params?.limit ?? 50,
        ...(params?.category ? { category: params.category } : {}),
      },
      headers: authHeaders(),
    },
  )
  return r.data
}

export async function getUnreadCount(
  category?: NotificationCategory,
): Promise<UnreadCount> {
  const r = await axios.get<UnreadCount>(
    `${OpenAPI.BASE}/api/v1/notifications/unread-count`,
    {
      params: category ? { category } : {},
      headers: authHeaders(),
    },
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

export async function markAllRead(
  category?: NotificationCategory,
): Promise<void> {
  await axios.patch(
    `${OpenAPI.BASE}/api/v1/notifications/read-all`,
    {},
    {
      params: category ? { category } : {},
      headers: authHeaders(),
    },
  )
}

export type PushSubscribePayload = {
  endpoint: string
  p256dh: string
  auth: string
}

export async function getVapidKey(): Promise<string | null> {
  const r = await axios.get<{ public_key: string | null }>(
    `${OpenAPI.BASE}/api/v1/notifications/push/vapid-key`,
    { headers: authHeaders() },
  )
  return r.data.public_key
}

export async function subscribePush(payload: PushSubscribePayload): Promise<void> {
  await axios.post(
    `${OpenAPI.BASE}/api/v1/notifications/push/subscribe`,
    payload,
    { headers: authHeaders() },
  )
}

export async function unsubscribePush(payload: PushSubscribePayload): Promise<void> {
  await axios.delete(`${OpenAPI.BASE}/api/v1/notifications/push/unsubscribe`, {
    data: payload,
    headers: authHeaders(),
  })
}
