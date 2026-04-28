export type ContractStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "signed"
  | "advance_received"
  | "in_production"
  | "completed"

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Bản nháp",
  pending_approval: "Chờ BGĐ duyệt",
  sent: "Đã gửi khách",
  signed: "Đã ký",
  advance_received: "Đã nhận tạm ứng",
  in_production: "Đang sản xuất",
  completed: "Hoàn thành",
}

export const CONTRACT_STATUS_ORDER: ContractStatus[] = [
  "draft",
  "pending_approval",
  "sent",
  "signed",
  "advance_received",
  "in_production",
  "completed",
]

export interface ContractAttachmentPublic {
  id: string
  contract_id: string
  uploaded_by: string
  file_url: string
  file_name: string
  file_type: string
  phase: string | null
  description: string | null
  uploaded_at: string
}

export interface ContractStatusTransitionPublic {
  id: string
  contract_id: string
  from_status: string | null
  to_status: string
  actor_id: string
  actor_name: string | null
  action: string
  note: string | null
  created_at: string
}

export interface ContractPublic {
  id: string
  company_id: string
  quotation_id: string
  project_id: string | null
  contract_number: string
  contract_date: string
  signing_date: string | null
  total_value: number
  currency: string
  advance_amount: number | null
  advance_paid_at: string | null
  advance_paid_by: string | null
  notes: string | null
  status: ContractStatus
  status_label: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ContractWithDetailsPublic extends ContractPublic {
  attachments: ContractAttachmentPublic[]
  transitions: ContractStatusTransitionPublic[]
}

export interface ContractsPublic {
  data: ContractPublic[]
  count: number
}

export interface ContractCreate {
  quotation_id: string
  project_id?: string | null
  contract_date: string
  total_value: number
  currency?: string
  advance_amount?: number | null
  notes?: string | null
}

export interface ContractUpdate {
  contract_date?: string
  total_value?: number
  currency?: string
  advance_amount?: number | null
  notes?: string | null
  signing_date?: string | null
}
