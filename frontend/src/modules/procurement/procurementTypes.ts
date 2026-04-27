export type PRStatus =
  | "draft"
  | "pending_tech"
  | "pending_director"
  | "approved"
  | "ordered"
  | "received"
  | "cancelled";

export type POStatus =
  | "draft"
  | "pending_supplier_selection"
  | "approved"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export const PR_STATUS_LABELS: Record<PRStatus, string> = {
  draft: "Nháp",
  pending_tech: "Chờ bộ phận Kỹ thuật duyệt",
  pending_director: "Chờ BGĐ duyệt",
  approved: "Đã duyệt",
  ordered: "Đã đặt hàng",
  received: "Đã nhận hàng",
  cancelled: "Đã huỷ",
};

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: "Nháp",
  pending_supplier_selection: "Chờ chọn NCC",
  approved: "Đã duyệt",
  ordered: "Đã đặt hàng",
  partially_received: "Nhận một phần",
  received: "Đã nhận đủ",
  cancelled: "Đã huỷ",
};

export const PR_STATUS_ORDER: PRStatus[] = [
  "draft",
  "pending_tech",
  "pending_director",
  "approved",
  "ordered",
  "received",
];

export const PO_STATUS_ORDER: POStatus[] = [
  "draft",
  "pending_supplier_selection",
  "approved",
  "ordered",
  "partially_received",
  "received",
];

export interface PurchaseRequestItem {
  id: string;
  request_id: string;
  item_name: string;
  specifications?: string;
  unit: string;
  quantity: number;
  tech_note?: string;
  urgency_note?: string;
  ordered_quantity: number;
  received_quantity: number;
}

export interface PurchaseRequestItemCreate {
  item_name: string;
  specifications?: string;
  unit: string;
  quantity: number;
  urgency_note?: string;
}

export interface PurchaseRequest {
  id: string;
  company_id: string;
  project_id?: string;
  contract_id?: string;
  request_number: string;
  title: string;
  urgency: "normal" | "urgent" | "critical";
  notes?: string;
  status: PRStatus;
  requested_by?: string;
  tech_reviewed_by?: string;
  tech_reviewed_at?: string;
  tech_note?: string;
  director_approved_by?: string;
  director_approved_at?: string;
  director_note?: string;
  items: PurchaseRequestItem[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseRequestCreate {
  project_id?: string;
  contract_id?: string;
  title: string;
  urgency?: "normal" | "urgent" | "critical";
  notes?: string;
  items?: PurchaseRequestItemCreate[];
}

export interface PurchaseRequestUpdate {
  title?: string;
  urgency?: "normal" | "urgent" | "critical";
  notes?: string;
}

export interface PurchaseRequestsPublic {
  data: PurchaseRequest[];
  count: number;
}

export interface SupplierQuote {
  id: string;
  po_item_id: string;
  supplier_id?: string;
  supplier_name: string;
  unit_price: number;
  lead_time_days?: number;
  notes?: string;
  is_selected: boolean;
  created_at: string;
}

export interface SupplierQuoteCreate {
  supplier_id?: string;
  supplier_name?: string;
  unit_price: number;
  lead_time_days?: number;
  notes?: string;
}

export interface SupplierQuoteUpdate {
  supplier_id?: string;
  unit_price?: number;
  lead_time_days?: number;
  notes?: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  request_item_id?: string;
  item_name: string;
  specifications?: string;
  unit: string;
  quantity: number;
  selected_supplier_id?: string;
  unit_price?: number;
  total_price?: number;
  received_quantity: number;
  supplier_quotes: SupplierQuote[];
}

export interface PurchaseOrder {
  id: string;
  company_id: string;
  request_id: string;
  po_number: string;
  status: POStatus;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  ordered_at?: string;
  received_at?: string;
  total_amount?: number;
  expected_delivery_date?: string;
  notes?: string;
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderCreate {
  items: {
    item_name: string;
    specifications?: string;
    unit: string;
    quantity: number;
    request_item_id?: string;
  }[];
  expected_delivery_date?: string;
  notes?: string;
}

export interface PurchaseOrdersPublic {
  data: PurchaseOrder[];
  count: number;
}

export interface POSelectSuppliersRequest {
  selections: { po_item_id: string; supplier_quote_id: string }[];
}

export interface POReceiveItemInput {
  po_item_id: string;
  received_quantity: number;
}

export interface POReceiveRequest {
  items: POReceiveItemInput[];
  notes?: string;
}
