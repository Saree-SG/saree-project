import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

import type {
  ApprovalParticipant,
  QuotationApproveRequest,
  QuotationAttachmentCreate,
  QuotationAttachmentPublic,
  QuotationByClientRow,
  QuotationByEquipmentRow,
  QuotationCloseRequest,
  QuotationCompanyProfile,
  QuotationCreate,
  QuotationFinalizeRequest,
  QuotationListParams,
  QuotationLostReasonRow,
  QuotationNegotiationLogCreate,
  QuotationNegotiationLogPublic,
  QuotationPublic,
  QuotationReportSummary,
  QuotationSendToClientRequest,
  QuotationStageTransitionPublic,
  QuotationSubmitBocTachRequest,
  QuotationSubmitDesignRequest,
  QuotationSubmitNegotiationRequest,
  QuotationSubmitPricingRequest,
  QuotationSubmitSurveyRequest,
  QuotationsPublic,
  QuotationUpdate,
  QuotationVersionPublic,
} from "./quotationTypes"

const BASE = () => `${OpenAPI.BASE}/api/v1`

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listQuotations(
  params: QuotationListParams = {},
): Promise<QuotationsPublic> {
  const query = new URLSearchParams()
  if (params.status) query.set("status", params.status)
  if (params.current_stage) query.set("current_stage", params.current_stage)
  if (params.outcome) query.set("outcome", params.outcome)
  if (params.equipment_category)
    query.set("equipment_category", params.equipment_category)
  if (params.client_company_name)
    query.set("client_company_name", params.client_company_name)
  if (params.sales_owner_id) query.set("sales_owner_id", params.sales_owner_id)
  if (params.date_from) query.set("date_from", params.date_from)
  if (params.date_to) query.set("date_to", params.date_to)
  if (params.skip != null) query.set("skip", String(params.skip))
  if (params.limit != null) query.set("limit", String(params.limit))

  const url = `${BASE()}/quotations/${query.toString() ? `?${query}` : ""}`
  const res = await axios.get<QuotationsPublic>(url, { headers: authHeaders() })
  return res.data
}

export async function getMyPendingQuotations(): Promise<QuotationPublic[]> {
  const res = await axios.get<QuotationPublic[]>(
    `${BASE()}/quotations/my-pending`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function listQuotationCompanies(): Promise<string[]> {
  const res = await axios.get<string[]>(`${BASE()}/quotations/companies`, {
    headers: authHeaders(),
  })
  return res.data
}

export async function listQuotationCompanyProfiles(): Promise<
  QuotationCompanyProfile[]
> {
  const res = await axios.get<QuotationCompanyProfile[]>(
    `${BASE()}/quotations/company-profiles`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function getQuotation(id: string): Promise<QuotationPublic> {
  const res = await axios.get<QuotationPublic>(`${BASE()}/quotations/${id}`, {
    headers: authHeaders(),
  })
  return res.data
}

export async function createQuotation(
  body: QuotationCreate,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(`${BASE()}/quotations/`, body, {
    headers: authHeaders(),
  })
  return res.data
}

export async function updateQuotation(
  id: string,
  body: QuotationUpdate,
): Promise<QuotationPublic> {
  const res = await axios.patch<QuotationPublic>(
    `${BASE()}/quotations/${id}`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function deleteQuotation(id: string): Promise<void> {
  await axios.delete(`${BASE()}/quotations/${id}`, { headers: authHeaders() })
}

// ---------------------------------------------------------------------------
// Workflow transitions
// ---------------------------------------------------------------------------

export async function submitSurvey(
  id: string,
  body: QuotationSubmitSurveyRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/submit-survey`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function approveSurvey(
  id: string,
  body: QuotationApproveRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/approve-survey`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function submitDesign(
  id: string,
  body: QuotationSubmitDesignRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/submit-design`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function submitBocTach(
  id: string,
  body: QuotationSubmitBocTachRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/submit-boc-tach`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function approveDesign(
  id: string,
  body: QuotationApproveRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/approve-design`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function submitPricing(
  id: string,
  body: QuotationSubmitPricingRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/submit-pricing`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function finalizeQuotation(
  id: string,
  body: QuotationFinalizeRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/finalize`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function approveFinal(
  id: string,
  body: QuotationApproveRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/approve-final`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function sendToClient(
  id: string,
  body: QuotationSendToClientRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/send-to-client`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function submitNegotiation(
  id: string,
  body: QuotationSubmitNegotiationRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/submit-negotiation`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function approveNegotiation(
  id: string,
  body: QuotationApproveRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/approve-negotiation`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function closeQuotation(
  id: string,
  body: QuotationCloseRequest,
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${id}/close`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function listHistory(
  quotationId: string,
): Promise<QuotationStageTransitionPublic[]> {
  const res = await axios.get<QuotationStageTransitionPublic[]>(
    `${BASE()}/quotations/${quotationId}/history`,
    { headers: authHeaders() },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// Negotiations
// ---------------------------------------------------------------------------

export async function listNegotiations(
  quotationId: string,
): Promise<QuotationNegotiationLogPublic[]> {
  const res = await axios.get<QuotationNegotiationLogPublic[]>(
    `${BASE()}/quotations/${quotationId}/negotiations`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function addNegotiationLog(
  quotationId: string,
  body: QuotationNegotiationLogCreate,
): Promise<QuotationNegotiationLogPublic> {
  const res = await axios.post<QuotationNegotiationLogPublic>(
    `${BASE()}/quotations/${quotationId}/negotiations`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function listAttachments(
  quotationId: string,
): Promise<QuotationAttachmentPublic[]> {
  const res = await axios.get<QuotationAttachmentPublic[]>(
    `${BASE()}/quotations/${quotationId}/attachments`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function addAttachment(
  quotationId: string,
  body: QuotationAttachmentCreate,
): Promise<QuotationAttachmentPublic> {
  const res = await axios.post<QuotationAttachmentPublic>(
    `${BASE()}/quotations/${quotationId}/attachments`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function uploadQuotationAttachmentFile(
  quotationId: string,
  file: File,
  description?: string,
): Promise<QuotationAttachmentPublic> {
  const form = new FormData()
  form.append("file", file)
  const query = new URLSearchParams()
  if (description?.trim()) {
    query.set("description", description.trim())
  }
  const res = await axios.post<QuotationAttachmentPublic>(
    `${BASE()}/quotations/${quotationId}/attachments/upload${query.toString() ? `?${query}` : ""}`,
    form,
    {
      headers: {
        ...authHeaders(),
        "Content-Type": "multipart/form-data",
      },
    },
  )
  return res.data
}

export async function deleteAttachment(
  quotationId: string,
  attId: string,
): Promise<void> {
  await axios.delete(
    `${BASE()}/quotations/${quotationId}/attachments/${attId}`,
    { headers: authHeaders() },
  )
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function listVersions(
  quotationId: string,
): Promise<QuotationVersionPublic[]> {
  const res = await axios.get<QuotationVersionPublic[]>(
    `${BASE()}/quotations/${quotationId}/versions`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function getVersion(
  quotationId: string,
  versionId: string,
): Promise<QuotationVersionPublic> {
  const res = await axios.get<QuotationVersionPublic>(
    `${BASE()}/quotations/${quotationId}/versions/${versionId}`,
    { headers: authHeaders() },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function reportSummary(params?: {
  date_from?: string
  date_to?: string
  equipment_category?: string
  client_company_name?: string
}): Promise<QuotationReportSummary> {
  const query = new URLSearchParams()
  if (params?.date_from) query.set("date_from", params.date_from)
  if (params?.date_to) query.set("date_to", params.date_to)
  if (params?.equipment_category)
    query.set("equipment_category", params.equipment_category)
  if (params?.client_company_name)
    query.set("client_company_name", params.client_company_name)

  const res = await axios.get<QuotationReportSummary>(
    `${BASE()}/quotations/reports/summary${query.toString() ? `?${query}` : ""}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function reportByClient(params?: {
  date_from?: string
  date_to?: string
}): Promise<QuotationByClientRow[]> {
  const query = new URLSearchParams()
  if (params?.date_from) query.set("date_from", params.date_from)
  if (params?.date_to) query.set("date_to", params.date_to)

  const res = await axios.get<QuotationByClientRow[]>(
    `${BASE()}/quotations/reports/by-client${query.toString() ? `?${query}` : ""}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function reportByEquipment(params?: {
  date_from?: string
  date_to?: string
}): Promise<QuotationByEquipmentRow[]> {
  const query = new URLSearchParams()
  if (params?.date_from) query.set("date_from", params.date_from)
  if (params?.date_to) query.set("date_to", params.date_to)

  const res = await axios.get<QuotationByEquipmentRow[]>(
    `${BASE()}/quotations/reports/by-equipment${query.toString() ? `?${query}` : ""}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function reportLostAnalysis(params?: {
  date_from?: string
  date_to?: string
}): Promise<QuotationLostReasonRow[]> {
  const query = new URLSearchParams()
  if (params?.date_from) query.set("date_from", params.date_from)
  if (params?.date_to) query.set("date_to", params.date_to)

  const res = await axios.get<QuotationLostReasonRow[]>(
    `${BASE()}/quotations/reports/lost-analysis${query.toString() ? `?${query}` : ""}`,
    { headers: authHeaders() },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// Approval participants (co-approver / delegate) — A3 feature
// ---------------------------------------------------------------------------

export async function listApprovalParticipants(
  quotationId: string,
): Promise<ApprovalParticipant[]> {
  const res = await axios.get<ApprovalParticipant[]>(
    `${BASE()}/quotations/${quotationId}/approval-participants`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function addApprovalParticipant(
  quotationId: string,
  body: { user_id: string; role: string },
): Promise<ApprovalParticipant> {
  const res = await axios.post<ApprovalParticipant>(
    `${BASE()}/quotations/${quotationId}/approval-participants`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function removeApprovalParticipant(
  quotationId: string,
  participantId: string,
): Promise<void> {
  await axios.delete(
    `${BASE()}/quotations/${quotationId}/approval-participants/${participantId}`,
    { headers: authHeaders() },
  )
}

export async function participantApprove(
  quotationId: string,
  body: { note?: string },
): Promise<QuotationPublic> {
  const res = await axios.post<QuotationPublic>(
    `${BASE()}/quotations/${quotationId}/participant-approve`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}
