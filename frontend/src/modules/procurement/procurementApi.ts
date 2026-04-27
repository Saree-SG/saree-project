import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"
import type {
  POReceiveRequest,
  POSelectSuppliersRequest,
  PurchaseOrder,
  PurchaseOrderCreate,
  PurchaseOrdersPublic,
  PurchaseRequest,
  PurchaseRequestCreate,
  PurchaseRequestItemCreate,
  PurchaseRequestsPublic,
  PurchaseRequestUpdate,
  SupplierQuote,
  SupplierQuoteCreate,
  SupplierQuoteUpdate,
} from "./procurementTypes"

const BASE = () => `${OpenAPI.BASE}/api/v1`
const auth = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}` })

// Purchase Requests
export async function listRequests(params?: {
  status?: string
  project_id?: string
  urgency?: string
  skip?: number
  limit?: number
}): Promise<PurchaseRequestsPublic> {
  const q = new URLSearchParams()
  if (params?.status) q.set("status", params.status)
  if (params?.project_id) q.set("project_id", params.project_id)
  if (params?.urgency) q.set("urgency", params.urgency)
  if (params?.skip != null) q.set("skip", String(params.skip))
  if (params?.limit != null) q.set("limit", String(params.limit))
  const res = await axios.get<PurchaseRequestsPublic>(
    `${BASE()}/procurement/requests/?${q}`,
    { headers: auth() }
  )
  return res.data
}

export async function getRequest(id: string): Promise<PurchaseRequest> {
  const res = await axios.get<PurchaseRequest>(`${BASE()}/procurement/requests/${id}`, { headers: auth() })
  return res.data
}

export async function createRequest(body: PurchaseRequestCreate): Promise<PurchaseRequest> {
  const res = await axios.post<PurchaseRequest>(`${BASE()}/procurement/requests/`, body, { headers: auth() })
  return res.data
}

export async function updateRequest(id: string, body: PurchaseRequestUpdate): Promise<PurchaseRequest> {
  const res = await axios.patch<PurchaseRequest>(`${BASE()}/procurement/requests/${id}`, body, { headers: auth() })
  return res.data
}

export async function addRequestItem(
  id: string,
  body: PurchaseRequestItemCreate,
): Promise<PurchaseRequest> {
  const res = await axios.post<PurchaseRequest>(
    `${BASE()}/procurement/requests/${id}/items`,
    body,
    { headers: auth() },
  )
  return res.data
}

export async function deleteRequest(id: string): Promise<void> {
  await axios.delete(`${BASE()}/procurement/requests/${id}`, { headers: auth() })
}

export async function submitRequest(id: string): Promise<PurchaseRequest> {
  const res = await axios.post<PurchaseRequest>(`${BASE()}/procurement/requests/${id}/submit`, {}, { headers: auth() })
  return res.data
}

export async function techReviewRequest(
  id: string,
  body: { action: "approve" | "reject"; note?: string }
): Promise<PurchaseRequest> {
  const res = await axios.post<PurchaseRequest>(`${BASE()}/procurement/requests/${id}/tech-review`, body, { headers: auth() })
  return res.data
}

export async function directorApproveRequest(
  id: string,
  body: { action: "approve" | "reject"; note?: string }
): Promise<PurchaseRequest> {
  const res = await axios.post<PurchaseRequest>(`${BASE()}/procurement/requests/${id}/director-approve`, body, { headers: auth() })
  return res.data
}

// Purchase Orders
export async function listPOsForRequest(requestId: string): Promise<PurchaseOrdersPublic> {
  const res = await axios.get<PurchaseOrdersPublic>(`${BASE()}/procurement/requests/${requestId}/orders`, { headers: auth() })
  return res.data
}

export async function createPO(requestId: string, body: PurchaseOrderCreate): Promise<PurchaseOrder> {
  const res = await axios.post<PurchaseOrder>(`${BASE()}/procurement/requests/${requestId}/orders`, body, { headers: auth() })
  return res.data
}

export async function listAllOrders(params?: {
  status?: string
  skip?: number
  limit?: number
}): Promise<PurchaseOrdersPublic> {
  const q = new URLSearchParams()
  if (params?.status) q.set("status", params.status)
  if (params?.skip != null) q.set("skip", String(params.skip))
  if (params?.limit != null) q.set("limit", String(params.limit))
  const res = await axios.get<PurchaseOrdersPublic>(`${BASE()}/procurement/orders/?${q}`, { headers: auth() })
  return res.data
}

export async function getOrder(id: string): Promise<PurchaseOrder> {
  const res = await axios.get<PurchaseOrder>(`${BASE()}/procurement/orders/${id}`, { headers: auth() })
  return res.data
}

export async function addSupplierQuotes(
  poId: string,
  itemId: string,
  quotes: SupplierQuoteCreate[]
): Promise<SupplierQuote[]> {
  const res = await axios.post<SupplierQuote[]>(
    `${BASE()}/procurement/orders/${poId}/items/${itemId}/quotes`,
    quotes,
    { headers: auth() }
  )
  return res.data
}

export async function updateSupplierQuote(
  poId: string,
  itemId: string,
  quoteId: string,
  body: SupplierQuoteUpdate,
): Promise<SupplierQuote> {
  const res = await axios.patch<SupplierQuote>(
    `${BASE()}/procurement/orders/${poId}/items/${itemId}/quotes/${quoteId}`,
    body,
    { headers: auth() }
  )
  return res.data
}

export async function selectSuppliers(
  poId: string,
  body: POSelectSuppliersRequest
): Promise<PurchaseOrder> {
  const res = await axios.post<PurchaseOrder>(`${BASE()}/procurement/orders/${poId}/select-suppliers`, body, { headers: auth() })
  return res.data
}

export async function markOrdered(poId: string): Promise<PurchaseOrder> {
  const res = await axios.post<PurchaseOrder>(`${BASE()}/procurement/orders/${poId}/mark-ordered`, {}, { headers: auth() })
  return res.data
}

export async function receiveOrder(poId: string, body: POReceiveRequest): Promise<PurchaseOrder> {
  const res = await axios.post<PurchaseOrder>(`${BASE()}/procurement/orders/${poId}/receive`, body, { headers: auth() })
  return res.data
}

export type ProcurementPendingAction = {
  id: string
  label: string
  subtitle: string
  url: string
  actionType: "tech_review" | "director_approve" | "select_supplier" | "add_quotes" | "mark_ordered" | "receive"
}

export async function getMyPendingProcurementActions(
  permissions: string[]
): Promise<ProcurementPendingAction[]> {
  const actions: ProcurementPendingAction[] = []

  // Kỹ thuật duyệt
  if (permissions.includes("PROCUREMENT_TECH_REVIEW")) {
    const res = await listRequests({ status: "pending_tech", limit: 10 })
    for (const r of res.data) {
      actions.push({
        id: r.id,
        label: r.title,
        subtitle: `${r.request_number} · Chờ KT duyệt`,
        url: `/procurement/requests/${r.id}`,
        actionType: "tech_review",
      })
    }
  }

  // BGĐ duyệt
  if (permissions.includes("PROCUREMENT_DIRECTOR_APPROVE")) {
    const res = await listRequests({ status: "pending_director", limit: 10 })
    for (const r of res.data) {
      actions.push({
        id: r.id,
        label: r.title,
        subtitle: `${r.request_number} · Chờ BGĐ duyệt`,
        url: `/procurement/requests/${r.id}`,
        actionType: "director_approve",
      })
    }
    // Chọn NCC (cũng là quyền director)
    const resPos = await listAllOrders({ status: "pending_supplier_selection", limit: 10 })
    for (const po of resPos.data) {
      actions.push({
        id: po.id,
        label: po.po_number,
        subtitle: `Chờ chọn nhà cung cấp`,
        url: `/procurement/orders/${po.id}`,
        actionType: "select_supplier",
      })
    }
  }

  // Nhập báo giá / tạo PO
  if (permissions.includes("PROCUREMENT_PO_CREATE")) {
    const resDraft = await listAllOrders({ status: "draft", limit: 10 })
    for (const po of resDraft.data) {
      actions.push({
        id: po.id,
        label: po.po_number,
        subtitle: `Chờ nhập báo giá nhà cung cấp`,
        url: `/procurement/orders/${po.id}`,
        actionType: "add_quotes",
      })
    }
    const resApproved = await listAllOrders({ status: "approved", limit: 10 })
    for (const po of resApproved.data) {
      actions.push({
        id: po.id,
        label: po.po_number,
        subtitle: `Đã duyệt NCC · Chờ xác nhận đặt hàng`,
        url: `/procurement/orders/${po.id}`,
        actionType: "mark_ordered",
      })
    }
  }

  // Nhận hàng
  if (permissions.includes("PROCUREMENT_RECEIVE")) {
    const resOrdered = await listAllOrders({ status: "ordered", limit: 10 })
    const resPartial = await listAllOrders({ status: "partially_received", limit: 10 })
    for (const po of [...resOrdered.data, ...resPartial.data]) {
      actions.push({
        id: po.id,
        label: po.po_number,
        subtitle: `Chờ xác nhận nhận hàng`,
        url: `/procurement/orders/${po.id}`,
        actionType: "receive",
      })
    }
  }

  return actions
}
