export type IssueStatus = "pending" | "approved" | "issued" | "cancelled"

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  issued: "Đã xuất",
  cancelled: "Đã huỷ",
}

export interface InventoryItem {
  id: string
  company_id: string
  item_name: string
  item_code?: string
  specifications?: string
  unit: string
  category?: string
  min_stock_alert: number
  current_stock: number
  created_at: string
  updated_at: string
}

export interface InventoryItemCreate {
  item_name: string
  item_code?: string
  specifications?: string
  unit: string
  category?: string
  min_stock_alert?: number
}

export interface InventoryItemUpdate {
  item_name?: string
  item_code?: string
  specifications?: string
  unit?: string
  category?: string
  min_stock_alert?: number
}

export interface InventoryItemsPublic {
  data: InventoryItem[]
  count: number
}

export interface StockMovement {
  id: string
  item_id: string
  movement_type: "in" | "out"
  quantity: number
  unit_price?: number
  reference_type: string
  reference_id?: string
  notes?: string
  movement_date: string
  handled_by?: string
}

export interface StockMovementsPublic {
  data: StockMovement[]
  count: number
}

export interface MaterialIssueItem {
  id: string
  inventory_item_id: string
  item_name?: string
  item_code?: string
  unit?: string
  current_stock?: number
  quantity_requested: number
  quantity_issued?: number
}

export interface MaterialIssueItemCreate {
  inventory_item_id: string
  quantity_requested: number
}

export interface MaterialIssueAttachment {
  id: string
  issue_id: string
  uploaded_by: string
  file_url: string
  file_name: string
  file_type: string
  size_bytes: number
  created_at: string
}

export interface MaterialIssue {
  id: string
  company_id: string
  project_id?: string
  contract_id?: string
  task_id?: string
  issue_number: string
  requested_by?: string
  approved_by?: string
  issued_by?: string
  status: IssueStatus
  notes?: string
  items: MaterialIssueItem[]
  attachments: MaterialIssueAttachment[]
  created_at: string
  updated_at: string
}

export interface MaterialIssueCreate {
  project_id?: string
  contract_id?: string
  notes?: string
  items: MaterialIssueItemCreate[]
}

export interface MaterialIssuesPublic {
  data: MaterialIssue[]
  count: number
}
