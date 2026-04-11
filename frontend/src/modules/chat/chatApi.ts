import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type ChatRoom = {
  id: string
  company_id: string
  room_type: "direct" | "group" | string
  name: string | null
  room_color: string | null
  created_by: string
  created_at: string
}

export type ChatMessage = {
  id: string
  room_id: string
  sender_id: string
  message_type: "text" | "system" | "file" | string
  content: string | null
  created_at: string
}

export type ChatAttachment = {
  id: string
  message_id: string
  filename: string
  mime_type: string | null
  size_bytes: number | null
  public_url: string | null
  created_at: string
}

export type ChatMember = {
  room_id: string
  user_id: string
  role: string
  joined_at: string
  left_at: string | null
  email: string
  full_name: string | null
}

export type UserPublic = {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  is_superuser: boolean
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getAccessToken() || ""}`,
  }
}

export async function listMyChatRooms(): Promise<ChatRoom[]> {
  const r = await axios.get<ChatRoom[]>(`${OpenAPI.BASE}/api/v1/chat/rooms`, {
    headers: authHeaders(),
  })
  return r.data
}

export async function createChatRoom(body: {
  room_type?: "direct" | "group"
  name?: string | null
  room_color?: string | null
  member_user_ids?: string[]
}): Promise<ChatRoom> {
  const r = await axios.post<ChatRoom>(
    `${OpenAPI.BASE}/api/v1/chat/rooms`,
    body,
    {
      headers: authHeaders(),
    },
  )
  return r.data
}

export async function updateChatRoom(params: {
  roomId: string
  name?: string | null
  room_color?: string | null
}): Promise<ChatRoom> {
  const r = await axios.patch<ChatRoom>(
    `${OpenAPI.BASE}/api/v1/chat/rooms/${params.roomId}`,
    {
      name: params.name,
      room_color: params.room_color,
    },
    { headers: authHeaders() },
  )
  return r.data
}

export async function deleteChatRoom(roomId: string): Promise<void> {
  await axios.delete(`${OpenAPI.BASE}/api/v1/chat/rooms/${roomId}`, {
    headers: authHeaders(),
  })
}

export async function getUserByEmail(email: string): Promise<UserPublic> {
  const r = await axios.get<UserPublic>(
    `${OpenAPI.BASE}/api/v1/users/by-email`,
    {
      params: { email },
      headers: authHeaders(),
    },
  )
  return r.data
}

export async function listRoomMembers(roomId: string): Promise<ChatMember[]> {
  const r = await axios.get<ChatMember[]>(
    `${OpenAPI.BASE}/api/v1/chat/rooms/${roomId}/members`,
    { headers: authHeaders() },
  )
  return r.data
}

export async function addRoomMember(params: {
  roomId: string
  userId: string
  role?: "owner" | "admin" | "member"
}): Promise<ChatMember> {
  const r = await axios.post<ChatMember>(
    `${OpenAPI.BASE}/api/v1/chat/rooms/${params.roomId}/members`,
    { user_id: params.userId, role: params.role ?? "member" },
    { headers: authHeaders() },
  )
  return r.data
}

export async function removeRoomMember(params: {
  roomId: string
  userId: string
}): Promise<void> {
  await axios.delete(
    `${OpenAPI.BASE}/api/v1/chat/rooms/${params.roomId}/members/${params.userId}`,
    {
      headers: authHeaders(),
    },
  )
}

export async function listRoomMessages(params: {
  roomId: string
  skip?: number
  limit?: number
}): Promise<ChatMessage[]> {
  const r = await axios.get<ChatMessage[]>(
    `${OpenAPI.BASE}/api/v1/chat/rooms/${params.roomId}/messages`,
    {
      params: { skip: params.skip ?? 0, limit: params.limit ?? 50 },
      headers: authHeaders(),
    },
  )
  return r.data
}

export async function sendRoomMessage(params: {
  roomId: string
  content: string
}): Promise<ChatMessage> {
  const r = await axios.post<ChatMessage>(
    `${OpenAPI.BASE}/api/v1/chat/rooms/${params.roomId}/messages`,
    { content: params.content },
    { headers: authHeaders() },
  )
  return r.data
}

export async function uploadRoomAttachment(params: {
  roomId: string
  file: File
}): Promise<ChatAttachment> {
  const form = new FormData()
  form.append("file", params.file)
  const r = await axios.post<ChatAttachment>(
    `${OpenAPI.BASE}/api/v1/chat/rooms/${params.roomId}/attachments`,
    form,
    { headers: { ...authHeaders(), "Content-Type": "multipart/form-data" } },
  )
  return r.data
}
