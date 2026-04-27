import type { QuotationStage, QuotationStatus } from "./quotationTypes"

// ---------------------------------------------------------------------------
// Stage metadata — label, color, icon name, owner role
// ---------------------------------------------------------------------------

export interface StageConfig {
  label: string
  shortLabel: string
  ownerRole: "sales" | "director" | "technical" | "procurement" | "done"
  // Tailwind color classes
  badgeBg: string
  badgeText: string
  dotColor: string
  stepBg: string      // for stepper active step
  stepText: string
}

export const STAGE_CONFIG: Record<QuotationStage, StageConfig> = {
  S1_SALES_COLLECT: {
    label: "Thu thập thông tin",
    shortLabel: "Thu thập",
    ownerRole: "sales",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    dotColor: "bg-blue-500",
    stepBg: "bg-blue-600",
    stepText: "text-white",
  },
  S2_DIRECTOR_APPROVE_SURVEY: {
    label: "BGĐ duyệt khảo sát",
    shortLabel: "BGĐ duyệt",
    ownerRole: "director",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
    stepBg: "bg-violet-600",
    stepText: "text-white",
  },
  S3_TECH_DESIGN: {
    label: "Kỹ thuật thiết kế",
    shortLabel: "KT thiết kế",
    ownerRole: "technical",
    badgeBg: "bg-cyan-100",
    badgeText: "text-cyan-700",
    dotColor: "bg-cyan-500",
    stepBg: "bg-cyan-600",
    stepText: "text-white",
  },
  S4_DIRECTOR_APPROVE_DESIGN: {
    label: "BGĐ duyệt thiết kế",
    shortLabel: "BGĐ duyệt KT",
    ownerRole: "director",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
    stepBg: "bg-violet-600",
    stepText: "text-white",
  },
  S5_PROCUREMENT_PRICING: {
    label: "Vật tư định giá",
    shortLabel: "Vật tư giá",
    ownerRole: "procurement",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    dotColor: "bg-orange-500",
    stepBg: "bg-orange-600",
    stepText: "text-white",
  },
  S6_SALES_FINALIZE: {
    label: "KD hoàn thiện",
    shortLabel: "KD hoàn thiện",
    ownerRole: "sales",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    dotColor: "bg-blue-500",
    stepBg: "bg-blue-600",
    stepText: "text-white",
  },
  S7_DIRECTOR_APPROVE_QUOTE: {
    label: "BGĐ duyệt báo giá",
    shortLabel: "BGĐ duyệt cuối",
    ownerRole: "director",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
    stepBg: "bg-violet-600",
    stepText: "text-white",
  },
  S8_SENT_TO_CLIENT: {
    label: "Đã gửi khách hàng",
    shortLabel: "Đã gửi KH",
    ownerRole: "sales",
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-700",
    dotColor: "bg-teal-500",
    stepBg: "bg-teal-600",
    stepText: "text-white",
  },
  S9_CLOSED: {
    label: "Kết thúc",
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
  "S4_DIRECTOR_APPROVE_DESIGN",
  "S5_PROCUREMENT_PRICING",
  "S6_SALES_FINALIZE",
  "S7_DIRECTOR_APPROVE_QUOTE",
  "S8_SENT_TO_CLIENT",
  "S9_CLOSED",
]

export function getStageIndex(stage: QuotationStage): number {
  return STAGE_ORDER.indexOf(stage)
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
    label: "Đang thương lượng",
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

export const OWNER_ROLE_WAITING_LABEL: Record<StageConfig["ownerRole"], string> = {
  sales: "Chờ Kinh Doanh",
  director: "Chờ Ban Giám Đốc",
  technical: "Chờ Kỹ Thuật",
  procurement: "Chờ Vật Tư",
  done: "Đã hoàn tất",
}
