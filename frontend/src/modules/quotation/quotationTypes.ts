// ---------------------------------------------------------------------------
// Quotation domain types — mirrors backend/app/models/quotation.py
// ---------------------------------------------------------------------------

export type QuotationStatus =
  | "draft"
  | "in_review"
  | "active"
  | "sent"
  | "negotiating"
  | "closed_won"
  | "closed_lost"

export type QuotationStage =
  | "S1_SALES_COLLECT"
  | "S2_DIRECTOR_APPROVE_SURVEY"
  | "S3_TECH_DESIGN"
  | "S3B_BOC_TACH"
  | "S4_DIRECTOR_APPROVE_DESIGN"
  | "S5_PROCUREMENT_PRICING"
  | "S6_SALES_FINALIZE"
  | "S7_DIRECTOR_APPROVE_QUOTE"
  | "S8_SENT_TO_CLIENT"
  | "S8B_NEGOTIATION_REVIEW"
  | "S9_CLOSED"

export type QuotationOutcome = "won" | "lost"

export type LostReasonCategory = "price" | "design" | "marketing" | "other"

export type DocumentCategory =
  | "design_file"
  | "pricing_file"
  | "quote_document"
  | "negotiation"
  | "other"

// ---------------------------------------------------------------------------
// Quotation
// ---------------------------------------------------------------------------

export interface QuotationPublic {
  id: string
  company_id: string
  quote_number: string
  project_name: string
  client_company_id?: string | null
  client_company_name: string
  client_contact_name: string | null
  client_contact_title?: string | null
  client_contact_phone: string | null
  client_contact_email: string | null
  client_address: string | null
  equipment_category: string | null
  notes: string | null
  status: QuotationStatus
  current_stage: QuotationStage
  stage_label: string | null
  site_survey_date: string | null // ISO date
  survey_start_date?: string | null
  survey_end_date?: string | null
  created_by: string
  sales_owner_id: string
  sales_owner_name: string | null
  technical_owner_id: string | null
  technical_owner_name: string | null
  procurement_owner_id: string | null
  procurement_owner_name: string | null
  total_contract_value: number | null
  currency: string
  valid_until: string | null
  sent_to_client_at: string | null
  client_response_deadline: string | null
  outcome: QuotationOutcome | null
  lost_reason_category: LostReasonCategory | null
  lost_reason_detail: string | null
  won_project_id: string | null
  color: string | null
  created_at: string
  updated_at: string
}

export interface QuotationsPublic {
  data: QuotationPublic[]
  count: number
}

export interface QuotationCreate {
  project_name: string
  client_company_id?: string | null
  client_company_name: string
  equipment_category?: string | null
  client_contact_name?: string | null
  client_contact_title?: string | null
  client_contact_phone?: string | null
  client_contact_email?: string | null
  client_address?: string | null
  notes?: string | null
  survey_note?: string | null
  sales_owner_id?: string | null
}

export interface QuotationCompanyProfile {
  client_company_name: string
  client_contact_name?: string | null
  client_contact_title?: string | null
  client_contact_phone?: string | null
  client_contact_email?: string | null
  client_address?: string | null
  notes?: string | null
  survey_note?: string | null
  equipment_category?: string | null
}

export interface QuotationUpdate {
  project_name?: string
  client_company_id?: string | null
  client_company_name?: string
  client_contact_name?: string | null
  client_contact_phone?: string | null
  client_contact_email?: string | null
  client_address?: string | null
  equipment_category?: string | null
  notes?: string | null
  site_survey_date?: string | null
  valid_until?: string | null
  client_response_deadline?: string | null
  technical_owner_id?: string | null
  procurement_owner_id?: string | null
  color?: string | null
}

// ---------------------------------------------------------------------------
// Stage Transition History
// ---------------------------------------------------------------------------

export interface QuotationStageTransitionPublic {
  id: string
  quotation_id: string
  from_stage: string | null
  from_stage_label: string | null
  to_stage: string
  to_stage_label: string | null
  actor_id: string
  actor_name: string | null
  action: string
  action_label: string | null
  note: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Negotiation Logs
// ---------------------------------------------------------------------------

export interface QuotationNegotiationLogPublic {
  id: string
  quotation_id: string
  contact_date: string
  contact_method: string
  summary: string
  client_feedback: string | null
  requested_changes: string | null
  follow_up_date: string | null
  logged_by: string
  logged_by_name: string | null
  attachments: string[] | null
  created_at: string
}

export interface QuotationNegotiationLogCreate {
  contact_date: string
  contact_method: string
  summary: string
  client_feedback?: string | null
  requested_changes?: string | null
  follow_up_date?: string | null
  attachments?: string[] | null
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export interface QuotationAttachmentPublic {
  id: string
  quotation_id: string
  uploaded_by: string
  uploaded_by_name: string | null
  file_url: string
  file_name: string
  file_type: string
  document_category: DocumentCategory
  stage_uploaded: string
  description: string | null
  uploaded_at: string
}

export interface QuotationAttachmentCreate {
  file_url: string
  file_name: string
  file_type?: string
  document_category?: DocumentCategory
  description?: string | null
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export interface QuotationVersionPublic {
  id: string
  quotation_id: string
  version_number: number
  snapshot_data: unknown
  created_by: string
  created_by_name: string | null
  reason: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Workflow request bodies
// ---------------------------------------------------------------------------

export interface QuotationSubmitSurveyRequest {
  client_contact_name?: string | null
  client_contact_phone?: string | null
  client_contact_title?: string | null
  client_address?: string | null
  site_survey_date?: string | null
  survey_start_date?: string | null
  survey_end_date?: string | null
  note?: string | null
}

export interface QuotationApproveRequest {
  action: "approve" | "reject"
  note?: string | null
  target_stage?: QuotationStage | null
}

export interface QuotationSubmitDesignRequest {
  note?: string | null
}

export interface QuotationSubmitBocTachRequest {
  note?: string | null
}

export interface QuotationSubmitPricingRequest {
  total_contract_value: number
  note?: string | null
}

export interface QuotationFinalizeRequest {
  note?: string | null
}

export interface QuotationSendToClientRequest {
  valid_until?: string | null
  client_response_deadline?: string | null
  note?: string | null
}

export interface QuotationSubmitNegotiationRequest {
  note: string // bắt buộc — nội dung thương lượng
}

export interface QuotationCloseRequest {
  outcome: QuotationOutcome
  lost_reason_category?: LostReasonCategory | null
  lost_reason_detail?: string | null
  note?: string | null
  extra_role_ids?: string[] | null
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface QuotationReportSummary {
  total: number
  in_progress: number
  sent: number
  negotiating: number
  closed_won: number
  closed_lost: number
  win_rate: number | null
  total_won_value: number | null
  period_from: string | null
  period_to: string | null
}

export interface QuotationByClientRow {
  client_company_name: string
  total: number
  won: number
  lost: number
  in_progress: number
  win_rate: number | null
  total_won_value: number | null
}

export interface QuotationByEquipmentRow {
  equipment_category: string
  total: number
  won: number
  lost: number
  win_rate: number | null
}

export interface QuotationLostReasonRow {
  lost_reason_category: string
  count: number
  percentage: number
}

// ---------------------------------------------------------------------------
// Approval Participants (co-approver / delegate) — A3 feature
// ---------------------------------------------------------------------------

export type ApprovalParticipantRole = "co_approver" | "delegate" | "primary"

export interface ApprovalParticipant {
  id: string
  quotation_id: string
  stage: string
  user_id: string
  user_name: string | null
  role: ApprovalParticipantRole
  has_approved: boolean
  approved_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Query / filter params
// ---------------------------------------------------------------------------

export interface QuotationListParams {
  status?: QuotationStatus
  current_stage?: QuotationStage
  outcome?: QuotationOutcome
  equipment_category?: string
  client_company_name?: string
  sales_owner_id?: string
  date_from?: string
  date_to?: string
  skip?: number
  limit?: number
}
