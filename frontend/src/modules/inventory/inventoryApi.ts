import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"
import type {
  InventoryItem,
  InventoryItemCreate,
  InventoryItemsPublic,
  InventoryItemUpdate,
  MaterialIssueAttachment,
  MaterialIssue,
  MaterialIssueCreate,
  MaterialIssuesPublic,
  StockMovementsPublic,
} from "./inventoryTypes"

const BASE = () => `${OpenAPI.BASE}/api/v1`
const auth = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}` })

// Inventory items
export async function listItems(params?: {
  search?: string
  category?: string
  skip?: number
  limit?: number
}): Promise<InventoryItemsPublic> {
  const q = new URLSearchParams()
  if (params?.search) q.set("search", params.search)
  if (params?.category) q.set("category", params.category)
  if (params?.skip != null) q.set("skip", String(params.skip))
  if (params?.limit != null) q.set("limit", String(params.limit))
  const res = await axios.get<InventoryItemsPublic>(`${BASE()}/inventory/items/?${q}`, { headers: auth() })
  return res.data
}

export async function getItem(id: string): Promise<InventoryItem> {
  const res = await axios.get<InventoryItem>(`${BASE()}/inventory/items/${id}`, { headers: auth() })
  return res.data
}

export async function createItem(body: InventoryItemCreate): Promise<InventoryItem> {
  const res = await axios.post<InventoryItem>(`${BASE()}/inventory/items/`, body, { headers: auth() })
  return res.data
}

export async function updateItem(id: string, body: InventoryItemUpdate): Promise<InventoryItem> {
  const res = await axios.patch<InventoryItem>(`${BASE()}/inventory/items/${id}`, body, { headers: auth() })
  return res.data
}

export async function deleteItem(id: string): Promise<void> {
  await axios.delete(`${BASE()}/inventory/items/${id}`, { headers: auth() })
}

export async function getMovements(id: string, params?: { skip?: number; limit?: number }): Promise<StockMovementsPublic> {
  const q = new URLSearchParams()
  if (params?.skip != null) q.set("skip", String(params.skip))
  if (params?.limit != null) q.set("limit", String(params.limit))
  const res = await axios.get<StockMovementsPublic>(`${BASE()}/inventory/items/${id}/movements?${q}`, { headers: auth() })
  return res.data
}

export async function adjustStock(id: string, body: { quantity: number; notes?: string }): Promise<InventoryItem> {
  const res = await axios.post<InventoryItem>(`${BASE()}/inventory/items/${id}/adjust`, body, { headers: auth() })
  return res.data
}

export async function getLowStockAlerts(): Promise<InventoryItemsPublic> {
  const res = await axios.get<InventoryItemsPublic>(`${BASE()}/inventory/alerts/`, { headers: auth() })
  return res.data
}

// Material issues
export async function listIssues(params?: {
  status?: string
  project_id?: string
  skip?: number
  limit?: number
}): Promise<MaterialIssuesPublic> {
  const q = new URLSearchParams()
  if (params?.status) q.set("status", params.status)
  if (params?.project_id) q.set("project_id", params.project_id)
  if (params?.skip != null) q.set("skip", String(params.skip))
  if (params?.limit != null) q.set("limit", String(params.limit))
  const res = await axios.get<MaterialIssuesPublic>(`${BASE()}/inventory/issues/?${q}`, { headers: auth() })
  return res.data
}

export async function getIssue(id: string): Promise<MaterialIssue> {
  const res = await axios.get<MaterialIssue>(`${BASE()}/inventory/issues/${id}`, { headers: auth() })
  return res.data
}

export async function createIssue(body: MaterialIssueCreate): Promise<MaterialIssue> {
  const res = await axios.post<MaterialIssue>(`${BASE()}/inventory/issues/`, body, { headers: auth() })
  return res.data
}

export async function approveIssue(id: string, body: { action: "approve" | "reject"; note?: string }): Promise<MaterialIssue> {
  const res = await axios.post<MaterialIssue>(`${BASE()}/inventory/issues/${id}/approve`, body, { headers: auth() })
  return res.data
}

export async function executeIssue(id: string, body: { notes?: string }): Promise<MaterialIssue> {
  const res = await axios.post<MaterialIssue>(`${BASE()}/inventory/issues/${id}/execute`, body, { headers: auth() })
  return res.data
}

export async function uploadIssueAttachment(
  id: string,
  file: File,
  fileType = "document",
): Promise<MaterialIssueAttachment> {
  const formData = new FormData()
  formData.append("file", file)
  const res = await axios.post<MaterialIssueAttachment>(
    `${BASE()}/inventory/issues/${id}/attachments/upload?file_type=${encodeURIComponent(fileType)}`,
    formData,
    {
      headers: {
        ...auth(),
        "Content-Type": "multipart/form-data",
      },
    },
  )
  return res.data
}

export async function deleteIssue(id: string): Promise<void> {
  await axios.delete(`${BASE()}/inventory/issues/${id}`, { headers: auth() })
}
