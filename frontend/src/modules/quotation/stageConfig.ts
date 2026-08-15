import type { QuotationStage, QuotationStatus } from "./quotationTypes"

// ---------------------------------------------------------------------------
// Stage metadata — label, color, icon name, owner role
// ---------------------------------------------------------------------------

export interface StageConfig {
  label: string
  shortLabel: string
  filterLabel?: string
  description?: string
  ownerRole: "sales" | "director" | "technical" | "procurement" | "done"
  // Tailwind color classes
  badgeBg: string
  badgeText: string
  dotColor: string
  stepBg: string // for stepper active step
  stepText: string
}

export const STAGE_CONFIG: Record<QuotationStage, StageConfig> = {
  S1_SALES_COLLECT: {
    label: "Khảo sát",
    shortLabel: "Khảo sát",
    filterLabel: "Tạo hồ sơ / Khảo sát",
    ownerRole: "sales",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    dotColor: "bg-blue-500",
    stepBg: "bg-blue-600",
    stepText: "text-white",
  },
  S2_DIRECTOR_APPROVE_SURVEY: {
    label: "Giám đốc duyệt khảo sát",
    shortLabel: "Duyệt Khảo sát",
    ownerRole: "director",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
    stepBg: "bg-violet-600",
    stepText: "text-white",
  },
  S3_TECH_DESIGN: {
    label: "Kỹ thuật lên thiết kế",
    shortLabel: "Thiết kế",
    ownerRole: "technical",
    badgeBg: "bg-cyan-100",
    badgeText: "text-cyan-700",
    dotColor: "bg-cyan-500",
    stepBg: "bg-cyan-600",
    stepText: "text-white",
  },
  S3B_BOC_TACH: {
    label: "Bóc tách khối lượng",
    shortLabel: "Bóc tách",
    ownerRole: "technical",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-700",
    dotColor: "bg-sky-500",
    stepBg: "bg-sky-600",
    stepText: "text-white",
  },
  S4_DIRECTOR_APPROVE_DESIGN: {
    label: "Giám đốc duyệt thiết kế",
    shortLabel: "Duyệt Thiết kế",
    ownerRole: "director",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
    stepBg: "bg-violet-600",
    stepText: "text-white",
  },
  S5_PROCUREMENT_PRICING: {
    label: "Vật tư định giá",
    shortLabel: "Định giá vật tư",
    description:
      "Vật tư phải định giá xong trước khi Kinh doanh mới làm bước tiếp theo (S6).",
    ownerRole: "procurement",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    dotColor: "bg-orange-500",
    stepBg: "bg-orange-600",
    stepText: "text-white",
  },
  S6_SALES_FINALIZE: {
    label: "Kinh doanh điều chỉnh chào giá",
    shortLabel: "Hồ sơ chào giá",
    description:
      "Bước này chỉ thực hiện được sau khi Vật tư (S5) đã hoàn thành định giá.",
    ownerRole: "sales",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    dotColor: "bg-blue-500",
    stepBg: "bg-blue-600",
    stepText: "text-white",
  },
  S7_DIRECTOR_APPROVE_QUOTE: {
    label: "Giám đốc duyệt chào giá",
    shortLabel: "Duyệt chào giá",
    ownerRole: "director",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
    stepBg: "bg-violet-600",
    stepText: "text-white",
  },
  S8_SENT_TO_CLIENT: {
    label: "Chờ phản hồi khách hàng",
    shortLabel: "Chờ KH phản hồi",
    ownerRole: "sales",
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-700",
    dotColor: "bg-teal-500",
    stepBg: "bg-teal-600",
    stepText: "text-white",
  },
  S8B_NEGOTIATION_REVIEW: {
    label: "Giám đốc duyệt thương lượng",
    shortLabel: "GĐ duyệt TL",
    ownerRole: "director",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    dotColor: "bg-amber-500",
    stepBg: "bg-amber-600",
    stepText: "text-white",
  },
  S9_CLOSED: {
    label: "Đã kết thúc",
    shortLabel: "Kết thúc",
    ownerRole: "done",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-600",
    dotColor: "bg-slate-400",
    stepBg: "bg-slate-500",
    stepText: "text-white",
  },
}

export const STAGE_ORDER: QuotationStage[] = [
  "S1_SALES_COLLECT",
  "S2_DIRECTOR_APPROVE_SURVEY",
  "S3_TECH_DESIGN",
  "S3B_BOC_TACH",
  "S4_DIRECTOR_APPROVE_DESIGN",
  "S5_PROCUREMENT_PRICING",
  "S6_SALES_FINALIZE",
  "S7_DIRECTOR_APPROVE_QUOTE",
  "S8_SENT_TO_CLIENT",
  "S8B_NEGOTIATION_REVIEW",
  "S9_CLOSED",
]

// Stages where director can reject back to any earlier stage
export const DIRECTOR_REJECT_STAGES: QuotationStage[] = [
  "S2_DIRECTOR_APPROVE_SURVEY",
  "S4_DIRECTOR_APPROVE_DESIGN",
  "S7_DIRECTOR_APPROVE_QUOTE",
  "S8B_NEGOTIATION_REVIEW",
]

export function getStageIndex(stage: QuotationStage): number {
  return STAGE_ORDER.indexOf(stage)
}

/**
 * Return the stage label best suited for filter UI.
 */
export function getStageFilterLabel(stage: QuotationStage): string {
  return STAGE_CONFIG[stage].filterLabel ?? STAGE_CONFIG[stage].label
}

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

export interface StatusConfig {
  label: string
  badgeBg: string
  badgeText: string
}

export const STATUS_CONFIG: Record<QuotationStatus, StatusConfig> = {
  draft: {
    label: "Nháp",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-600",
  },
  in_review: {
    label: "Chờ duyệt",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
  },
  active: {
    label: "Đang xử lý",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
  },
  sent: {
    label: "Đã gửi KH",
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-700",
  },
  negotiating: {
    label: "Đang trao đổi với khách",
    badgeBg: "bg-cyan-100",
    badgeText: "text-cyan-700",
  },
  closed_won: {
    label: "Thắng",
    badgeBg: "bg-green-100",
    badgeText: "text-green-700",
  },
  closed_lost: {
    label: "Thua",
    badgeBg: "bg-red-100",
    badgeText: "text-red-700",
  },
}

// ---------------------------------------------------------------------------
// Equipment category options
// ---------------------------------------------------------------------------

export const EQUIPMENT_CATEGORIES = [
  "IQF",
  "Kho lạnh",
  "Băng chuyền",
  "Hệ thống lạnh",
  "Thiết bị lạnh",
  "Đường ống",
  "Panel cách nhiệt",
  "Khác",
] as const

// ---------------------------------------------------------------------------
// Lost reason options
// ---------------------------------------------------------------------------

export const LOST_REASON_LABELS: Record<string, string> = {
  price: "Giá không cạnh tranh",
  design: "Thiết kế không phù hợp",
  marketing: "Cách tiếp thị chưa tốt",
  other: "Lý do khác",
}

// ---------------------------------------------------------------------------
// Contact method options (negotiation log)
// ---------------------------------------------------------------------------

export const CONTACT_METHOD_LABELS: Record<string, string> = {
  phone: "Điện thoại",
  email: "Email",
  meeting: "Gặp mặt trực tiếp",
  site_visit: "Khảo sát hiện trường",
}

// ---------------------------------------------------------------------------
// Role → "đang chờ X" label for waiting state display
// ---------------------------------------------------------------------------

export const OWNER_ROLE_WAITING_LABEL: Record<
  StageConfig["ownerRole"],
  string
> = {
  sales: "Chờ Kinh Doanh",
  director: "Chờ Ban Giám Đốc",
  technical: "Chờ Kỹ Thuật",
  procurement: "Chờ Vật Tư",
  done: "Đã hoàn tất",
}
