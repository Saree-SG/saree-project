import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import {
  AlignLeft,
  ArrowLeft,
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Eye,
  EyeOff,
  Paperclip,
  Strikethrough,
  Underline,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { StageTransitionTimeline, type ActionConfig, type TransitionAttachment, type TransitionEntry } from "@/components/Common/StageTransitionTimeline"
import { QuotationActionsPanel, type QuotationActionId } from "@/components/Quotation/QuotationActionsPanel"
import { QUOTATION_CREATE_STEP, StageStepper } from "@/components/Quotation/StageStepper"
import { Button } from "@/components/ui/button"
import { FileTypeIcon } from "@/components/ui/FileTypeIcon"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useCustomToast from "@/hooks/useCustomToast"
import { clearSession } from "@/modules/auth/tokenStore"
import { listContracts } from "@/modules/contract/contractApi"
import {
  addNegotiationLog,
  approveDesign,
  approveFinal,
  approveNegotiation,
  approveSurvey,
  closeQuotation,
  finalizeQuotation,
  getQuotation,
  listAttachments,
  listHistory,
  listNegotiations,
  sendToClient,
  submitDesign,
  submitNegotiation,
  submitPricing,
  submitSurvey,
  uploadQuotationAttachmentFile,
} from "@/modules/quotation/quotationApi"
import {
  CONTACT_METHOD_LABELS,
  getStageFilterLabel,
  LOST_REASON_LABELS,
  STAGE_CONFIG,
  STATUS_CONFIG,
} from "@/modules/quotation/stageConfig"
import type { QuotationAttachmentPublic, QuotationStage, QuotationStageTransitionPublic } from "@/modules/quotation/quotationTypes"
import { hasPermission } from "@/utils/accountAccess"
import { resolveBackendMediaUrl } from "@/utils/mediaUrl"
import { listCompanyRoles, type CompanyRole } from "@/modules/rbac/rbacApi"

type QuotationTab = "overview" | "negotiations" | "attachments" | "history"
type QuotationHistoryStepFilter = QuotationStage | typeof QUOTATION_CREATE_STEP

interface WorkflowPayload {
  clientContactName?: string
  clientContactPhone?: string
  clientContactTitle?: string
  clientAddress?: string
  surveyStartDate?: string
  surveyEndDate?: string
  note?: string
  totalContractValue?: number
  validUntil?: string
  clientResponseDeadline?: string
  lostReasonCategory?: "price" | "design" | "marketing" | "other"
  lostReasonDetail?: string
  extraRoleIds?: string[]
}

/**
 * Normalize history action from API (including legacy/generic values)
 * into timeline action keys used by QUOTATION_ACTION_CONFIG.
 */
function normalizeHistoryAction(input: {
  action: string
  from_stage: string | null
  to_stage: string
}): string {
  const action = input.action
  if (QUOTATION_ACTION_CONFIG[action]) {
    return action
  }
  const aliasMap: Record<string, string> = {
    "quotation.design_submitted": "submit_design",
    "quotation.pricing_submitted": "submit_pricing",
    "quotation.finalized": "finalize",
    "quotation.sent_to_client": "send_to_client",
    "quotation.negotiation_submitted": "submit_negotiation",
  }
  if (aliasMap[action]) {
    return aliasMap[action]
  }
  if (action === "approve") {
    if (input.from_stage === "S2_DIRECTOR_APPROVE_SURVEY") return "approve_survey"
    if (input.from_stage === "S4_DIRECTOR_APPROVE_DESIGN") return "approve_design"
    if (input.from_stage === "S7_DIRECTOR_APPROVE_QUOTE") return "approve_final"
    if (input.from_stage === "S8B_NEGOTIATION_REVIEW") return "approve_negotiation"
  }
  if (action === "reject") {
    if (input.from_stage === "S2_DIRECTOR_APPROVE_SURVEY") return "reject_survey"
    if (input.from_stage === "S4_DIRECTOR_APPROVE_DESIGN") return "reject_design"
    if (input.from_stage === "S7_DIRECTOR_APPROVE_QUOTE") return "reject_final"
    if (input.from_stage === "S8B_NEGOTIATION_REVIEW") return "reject_negotiation"
  }
  return action
}

/**
 * Resolve review-request grouping for quotation history.
 */
function resolveQuotationHistoryGroup(input: {
  action: string
  from_stage: string | null
  to_stage: string
  negotiationRound?: number
}): { groupKey: string; groupSubject?: string } {
  const action = normalizeHistoryAction(input)
  if (action === "submit_survey" || action === "approve_survey" || action === "reject_survey") {
    return { groupKey: "review_survey", groupSubject: "Khảo sát trình Giám đốc duyệt" }
  }
  if (action === "submit_design" || action === "approve_design" || action === "reject_design") {
    return { groupKey: "review_design", groupSubject: "Thiết kế kỹ thuật trình Giám đốc duyệt" }
  }
  if (action === "finalize" || action === "approve_final" || action === "reject_final") {
    const round = input.negotiationRound ?? 0
    if (round > 0) {
      return {
        groupKey: `review_final_quote_round_${round + 1}`,
        groupSubject: `Chào giá điều chỉnh lần ${round} trình Giám đốc duyệt`,
      }
    }
    return { groupKey: "review_final_quote", groupSubject: "Chào giá hoàn thiện trình Giám đốc duyệt" }
  }
  if (action === "submit_negotiation" || action === "approve_negotiation" || action === "reject_negotiation") {
    return { groupKey: "review_negotiation", groupSubject: "Thương lượng giá trình Giám đốc duyệt" }
  }
  if (action === "submit_pricing") {
    return { groupKey: "pricing", groupSubject: "Vật tư báo đơn giá" }
  }
  if (action === "send_to_client") {
    return { groupKey: "send_to_client", groupSubject: "Gửi báo giá cho khách hàng" }
  }
  if (action === "close_won" || action === "close_lost") {
    return { groupKey: "closing", groupSubject: "Kết quả báo giá" }
  }
  return {
    groupKey: action,
    groupSubject: QUOTATION_ACTION_CONFIG[action]?.subject,
  }
}

function resolveQuotationAttachmentGroupKey(stageUploaded: string): string {
  if (stageUploaded === "S1_SALES_COLLECT" || stageUploaded === "S2_DIRECTOR_APPROVE_SURVEY") {
    return "review_survey"
  }
  if (stageUploaded === "S3_TECH_DESIGN" || stageUploaded === "S4_DIRECTOR_APPROVE_DESIGN") {
    return "review_design"
  }
  if (stageUploaded === "S5_PROCUREMENT_PRICING") {
    return "pricing"
  }
  if (stageUploaded === "S6_SALES_FINALIZE" || stageUploaded === "S7_DIRECTOR_APPROVE_QUOTE") {
    return "review_final_quote"
  }
  if (stageUploaded === "S8B_NEGOTIATION_REVIEW") {
    return "review_negotiation"
  }
  if (stageUploaded === "S8_SENT_TO_CLIENT") {
    return "send_to_client"
  }
  return stageUploaded
}

function resolveAttachmentLibraryGroup(stageUploaded: string): {
  key: "survey" | "design" | "pricing" | "final_quote" | "other"
  label: string
} {
  if (stageUploaded === "S1_SALES_COLLECT" || stageUploaded === "S2_DIRECTOR_APPROVE_SURVEY") {
    return { key: "survey", label: "File khảo sát" }
  }
  if (stageUploaded === "S3_TECH_DESIGN" || stageUploaded === "S4_DIRECTOR_APPROVE_DESIGN") {
    return { key: "design", label: "File thiết kế" }
  }
  if (stageUploaded === "S5_PROCUREMENT_PRICING") {
    return { key: "pricing", label: "File định giá" }
  }
  if (stageUploaded === "S6_SALES_FINALIZE" || stageUploaded === "S7_DIRECTOR_APPROVE_QUOTE") {
    return { key: "final_quote", label: "File hồ sơ chào giá" }
  }
  return { key: "other", label: "File khác" }
}

function buildQuotationTimelineEntries(
  entries: QuotationStageTransitionPublic[],
): TransitionEntry[] {
  const chronological = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  let negotiationRound = 0

  return chronological.map((entry) => {
    const group = resolveQuotationHistoryGroup({
      action: entry.action,
      from_stage: entry.from_stage,
      to_stage: entry.to_stage,
      negotiationRound,
    })
    const normalizedAction = normalizeHistoryAction({
      action: entry.action,
      from_stage: entry.from_stage,
      to_stage: entry.to_stage,
    })

    if (
      normalizedAction === "approve_negotiation" ||
      normalizedAction === "reject_negotiation"
    ) {
      negotiationRound += 1
    }

    const sameStage = Boolean(entry.from_stage) && entry.from_stage === entry.to_stage
    return {
      ...group,
      id: entry.id,
      from_key: sameStage ? undefined : entry.from_stage,
      to_key: entry.to_stage,
      from_label: sameStage ? undefined : (entry.from_stage_label ?? entry.from_stage ?? undefined),
      to_label: entry.to_stage_label ?? entry.to_stage,
      attachmentKey: group.groupKey,
      action: normalizedAction,
      actor_name: entry.actor_name,
      created_at: entry.created_at,
      note: entry.note,
    }
  }).reverse()
}

function buildQuotationTimelineAttachments(
  attachments: QuotationAttachmentPublic[],
  entries: QuotationStageTransitionPublic[],
): TransitionAttachment[] {
  const negotiationDecisionTimes = [...entries]
    .filter((entry) => {
      const action = normalizeHistoryAction({
        action: entry.action,
        from_stage: entry.from_stage,
        to_stage: entry.to_stage,
      })
      return action === "approve_negotiation" || action === "reject_negotiation"
    })
    .map((entry) => new Date(entry.created_at).getTime())
    .sort((a, b) => a - b)

  return attachments.map((attachment): TransitionAttachment => {
    if (
      attachment.stage_uploaded === "S6_SALES_FINALIZE" ||
      attachment.stage_uploaded === "S7_DIRECTOR_APPROVE_QUOTE"
    ) {
      const uploadedAt = new Date(attachment.uploaded_at).getTime()
      const round = negotiationDecisionTimes.filter((time) => time < uploadedAt).length
      return {
        id: attachment.id,
        stage_key: round > 0 ? `review_final_quote_round_${round + 1}` : "review_final_quote",
        file_name: attachment.file_name,
        file_url: attachment.file_url,
        file_type: attachment.file_type,
        uploaded_at: attachment.uploaded_at,
      }
    }

    return {
      id: attachment.id,
      stage_key: resolveQuotationAttachmentGroupKey(attachment.stage_uploaded),
      file_name: attachment.file_name,
      file_url: attachment.file_url,
      file_type: attachment.file_type,
      uploaded_at: attachment.uploaded_at,
    }
  })
}

/**
 * Format currency in VND.
 */
function formatVnd(value: number | null): string {
  if (value == null) {
    return "—"
  }
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Format ISO date to Vietnamese locale text.
 */
function formatDate(value: string | null): string {
  if (!value) {
    return "—"
  }
  return new Date(value).toLocaleDateString("vi-VN")
}

/**
 * Extract error detail message from API error payload.
 */
function getErrorDetail(error: unknown): string {
  const maybeError = error as { response?: { data?: { detail?: string } } }
  return maybeError.response?.data?.detail ?? "Vui lòng thử lại."
}

/**
 * Return true when attachment is an image by mime type or file extension.
 */
function isImageAttachment(fileType: string | null, fileName: string): boolean {
  const normalizedType = (fileType ?? "").toLowerCase()
  if (normalizedType.startsWith("image/")) {
    return true
  }
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName)
}

/**
 * Trigger browser download for an attachment URL.
 */
function triggerAttachmentDownload(fileUrl: string, fileName: string): void {
  const downloadLink = document.createElement("a")
  downloadLink.href = resolveBackendMediaUrl(fileUrl)
  downloadLink.download = fileName || "attachment"
  downloadLink.rel = "noreferrer"
  document.body.appendChild(downloadLink)
  downloadLink.click()
  document.body.removeChild(downloadLink)
}

/**
 * Convert lightweight markdown blocks to display-friendly HTML.
 */
function renderLightMarkdown(note: string): string {
  const lines = note.split("\n")
  const html: string[] = []
  let inList = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      continue
    }
    if (line.startsWith("## ")) {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      html.push(`<h3 class="mt-3 mb-1 text-sm font-semibold">${line.slice(3)}</h3>`)
      continue
    }
    if (line.startsWith("# ")) {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      html.push(`<h2 class="mb-2 text-base font-semibold">${line.slice(2)}</h2>`)
      continue
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push('<ul class="list-disc pl-5 space-y-1">')
        inList = true
      }
      html.push(`<li>${line.slice(2)}</li>`)
      continue
    }
    if (line.startsWith("<") && line.endsWith(">")) {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      html.push(line)
      continue
    }
    if (inList) {
      html.push("</ul>")
      inList = false
    }
    html.push(`<p class="text-sm leading-6">${line}</p>`)
  }

  if (inList) {
    html.push("</ul>")
  }
  return html.join("")
}

/**
 * Build a formatted note block from title, content, and image URL.
 */
function buildWorkflowNote(
  title: string,
  contentHtml: string,
): string {
  const blocks: string[] = []
  if (title.trim()) {
    blocks.push(`# ${title.trim()}`)
  }
  if (contentHtml.trim()) {
    blocks.push(contentHtml.trim())
  }
  return blocks.join("\n\n").trim()
}

/**
 * Describes what happened at each step of the quotation workflow.
 * subject = tên tài liệu/đối tượng, status = kết quả rõ ràng cho khách đọc.
 */
const QUOTATION_ACTION_CONFIG: Record<string, ActionConfig> = {
  create:              { subject: "Hồ sơ báo giá",         status: "Đã tạo",                statusType: "created",  groupKey: "created" },
  submit_survey:       { subject: "Thông tin khảo sát",    status: "Đã nộp – chờ phê duyệt", statusType: "pending",  groupKey: "survey" },
  approve_survey:      { subject: "Thông tin khảo sát",    status: "Đã được phê duyệt",      statusType: "approved", groupKey: "survey" },
  reject_survey:       { subject: "Thông tin khảo sát",    status: "Cần bổ sung thêm",        statusType: "rejected", groupKey: "survey" },
  submit_design:       { subject: "Hồ sơ thiết kế",        status: "Đã nộp – chờ phê duyệt", statusType: "pending",  groupKey: "design" },
  approve_design:      { subject: "Hồ sơ thiết kế",        status: "Đã được phê duyệt",      statusType: "approved", groupKey: "design" },
  reject_design:       { subject: "Hồ sơ thiết kế",        status: "Cần chỉnh sửa",           statusType: "rejected", groupKey: "design" },
  submit_pricing:      { subject: "Bảng định giá nội bộ",  status: "Đã nộp – chờ hoàn thiện hồ sơ chào giá", statusType: "pending",  groupKey: "pricing" },
  finalize:            { subject: "Hồ sơ chào giá",        status: "Nộp hồ sơ chào giá",           statusType: "pending",  groupKey: "final_quote" },
  approve_final:       { subject: "Hồ sơ chào giá",        status: "Đã được phê duyệt",      statusType: "approved", groupKey: "final_quote" },
  reject_final:        { subject: "Hồ sơ chào giá",        status: "Cần điều chỉnh lại",      statusType: "rejected", groupKey: "final_quote" },
  send_to_client:      { subject: "Gửi báo giá",            status: "Đã ghi nhận gửi khách",  statusType: "sent",     groupKey: "client_send" },
  submit_negotiation:  { subject: "Đề xuất điều chỉnh giá", status: "Đang chờ BGĐ phê duyệt", statusType: "pending",  groupKey: "negotiation" },
  approve_negotiation: { subject: "Đề xuất điều chỉnh giá", status: "Được chấp thuận",         statusType: "approved", groupKey: "negotiation" },
  reject_negotiation:  { subject: "Đề xuất điều chỉnh giá", status: "Chưa đồng ý",             statusType: "rejected", groupKey: "negotiation" },
  close_won:           { subject: "Kết quả đàm phán",      status: "Thắng hợp đồng 🎉",       statusType: "won",      groupKey: "closing" },
  close_lost:          { subject: "Kết quả đàm phán",      status: "Không thành công",        statusType: "lost",     groupKey: "closing" },
}


/**
 * Resolve card title for the latest reject request by current stage.
 */
function getRejectRequestTitleByStage(stage: string): string {
  if (stage === "S1_SALES_COLLECT") {
    return "Yêu cầu bổ sung khảo sát"
  }
  if (stage === "S3_TECH_DESIGN") {
    return "Yêu cầu điều chỉnh thiết kế"
  }
  if (stage === "S6_SALES_FINALIZE") {
    return "Yêu cầu điều chỉnh báo giá"
  }
  return "Yêu cầu nộp lại gần nhất"
}

export const Route = createFileRoute("/_layout/quotations/$quotationId")({
  validateSearch: (search: Record<string, unknown>) => {
    const tabRaw = search.tab
    const allowedTabs: QuotationTab[] = [
      "overview",
      "negotiations",
      "attachments",
      "history",
    ]
    const tab = typeof tabRaw === "string" && allowedTabs.includes(tabRaw as QuotationTab)
      ? (tabRaw as QuotationTab)
      : "history"
    return { tab }
  },
  beforeLoad: async () => {
    let permissions
    try {
      permissions = await import("@/modules/rbac/rbacApi").then((m) =>
        m.readMyPermissions(),
      )
    } catch (err: unknown) {
      const e = err as { status?: number }
      if (e?.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw err
    }
    const allowed =
      hasPermission(permissions, "QUOTATION_VIEW") ||
      hasPermission(permissions, "QUOTATION_VIEW_ALL")
    if (!allowed) {
      throw redirect({ to: "/quotations" })
    }
    return { permissions }
  },
  component: QuotationDetailPage,
  head: () => ({ meta: [{ title: "Chi tiết hồ sơ báo giá" }] }),
})

/** Compact label+value display used in overview cards. */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value ?? "—"}</p>
    </div>
  )
}

/**
 * Detail page for quotation workflow, tabs, and stage actions.
 */
function QuotationDetailPage() {
  const { quotationId } = Route.useParams()
  const search = Route.useSearch()
  const { permissions } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedAction, setSelectedAction] = useState<QuotationActionId | null>(null)
  const [noteTitle, setNoteTitle] = useState("")
  const [noteBodyHtml, setNoteBodyHtml] = useState("")
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [dialogUploadedAttachments, setDialogUploadedAttachments] = useState<{
    id: string
    file_url: string
    file_name: string
    file_type: string
  }[]>([])
  const [totalContractValueInput, setTotalContractValueInput] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [clientResponseDeadline, setClientResponseDeadline] = useState("")
  const [surveyContactName, setSurveyContactName] = useState("")
  const [surveyContactPhone, setSurveyContactPhone] = useState("")
  const [surveyContactTitle, setSurveyContactTitle] = useState("")
  const [surveyLocation, setSurveyLocation] = useState("")
  const [surveyStartDate, setSurveyStartDate] = useState("")
  const [surveyEndDate, setSurveyEndDate] = useState("")
  const [lostReasonCategory, setLostReasonCategory] = useState<"price" | "design" | "marketing" | "other">("price")
  const [lostReasonDetail, setLostReasonDetail] = useState("")
  const [extraRoleIds, setExtraRoleIds] = useState<string[]>([])
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imagePreviewName, setImagePreviewName] = useState("")
  const [priceVisible, setPriceVisible] = useState(false)
  // Add negotiation log state (Negotiations tab, S8)
  const [addLogOpen, setAddLogOpen] = useState(false)
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [logMethod, setLogMethod] = useState("phone")
  const [logSummary, setLogSummary] = useState("")
  const [logFeedback, setLogFeedback] = useState("")
  const [logFollowUp, setLogFollowUp] = useState("")
  const noteBodyRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const docInputRef = useRef<HTMLInputElement | null>(null)
  const attachTabFileRef = useRef<HTMLInputElement | null>(null)
  const historyTabRef = useRef<HTMLDivElement | null>(null)
  const [selectedHistoryStage, setSelectedHistoryStage] =
    useState<QuotationHistoryStepFilter | null>(null)

  const quotationQuery = useQuery({
    queryKey: ["quotation", quotationId],
    queryFn: () => getQuotation(quotationId),
  })

  const negotiationsQuery = useQuery({
    queryKey: ["quotation", quotationId, "negotiations"],
    queryFn: () => listNegotiations(quotationId),
    enabled: search.tab === "negotiations",
  })

  const attachmentsQuery = useQuery({
    queryKey: ["quotation", quotationId, "attachments"],
    queryFn: () => listAttachments(quotationId),
    enabled: true,
  })

  const historyQuery = useQuery({
    queryKey: ["quotation", quotationId, "history"],
    queryFn: () => listHistory(quotationId),
    enabled: true,
  })

  const companyRolesQuery = useQuery({
    queryKey: ["company-roles", quotationQuery.data?.company_id],
    queryFn: () => listCompanyRoles(quotationQuery.data!.company_id),
    enabled: !!quotationQuery.data?.company_id && selectedAction === "close_won",
  })

  const workflowMutation = useMutation({
    mutationFn: async (args: { actionId: QuotationActionId; payload: WorkflowPayload }) => {
      const { actionId, payload } = args
      if (actionId === "submit_survey") {
        return submitSurvey(quotationId, {
          client_contact_name: payload.clientContactName || undefined,
          client_contact_phone: payload.clientContactPhone || undefined,
          client_contact_title: payload.clientContactTitle || undefined,
          client_address: payload.clientAddress || undefined,
          site_survey_date: payload.surveyStartDate || undefined,
          survey_start_date: payload.surveyStartDate || undefined,
          survey_end_date: payload.surveyEndDate || undefined,
          note: payload.note || undefined,
        })
      }
      if (actionId === "approve_survey") {
        return approveSurvey(quotationId, {
          action: "approve",
          note: payload.note || undefined,
        })
      }
      if (actionId === "reject_survey") {
        return approveSurvey(quotationId, {
          action: "reject",
          note: payload.note || undefined,
        })
      }
      if (actionId === "submit_design") {
        return submitDesign(quotationId, {
          note: payload.note || undefined,
        })
      }
      if (actionId === "approve_design") {
        return approveDesign(quotationId, {
          action: "approve",
          note: payload.note || undefined,
        })
      }
      if (actionId === "reject_design") {
        return approveDesign(quotationId, {
          action: "reject",
          note: payload.note || undefined,
        })
      }
      if (actionId === "submit_pricing") {
        return submitPricing(quotationId, {
          total_contract_value: payload.totalContractValue!,
          note: payload.note || undefined,
        })
      }
      if (actionId === "finalize") {
        return finalizeQuotation(quotationId, {
          note: payload.note || undefined,
        })
      }
      if (actionId === "approve_final") {
        return approveFinal(quotationId, {
          action: "approve",
          note: payload.note || undefined,
        })
      }
      if (actionId === "reject_final") {
        return approveFinal(quotationId, {
          action: "reject",
          note: payload.note || undefined,
        })
      }
      if (actionId === "send_to_client") {
        return sendToClient(quotationId, {
          note: payload.note || undefined,
          valid_until: payload.validUntil || undefined,
          client_response_deadline: payload.clientResponseDeadline || undefined,
        })
      }
      if (actionId === "submit_negotiation") {
        if (!payload.note) throw new Error("Bạn phải nhập nội dung thương lượng.")
        return submitNegotiation(quotationId, { note: payload.note })
      }
      if (actionId === "approve_negotiation") {
        return approveNegotiation(quotationId, { action: "approve", note: payload.note || undefined })
      }
      if (actionId === "reject_negotiation") {
        return approveNegotiation(quotationId, { action: "reject", note: payload.note || undefined })
      }
      if (actionId === "close_won") {
        return closeQuotation(quotationId, {
          outcome: "won",
          note: payload.note || undefined,
          extra_role_ids: payload.extraRoleIds?.length ? payload.extraRoleIds : undefined,
        })
      }
      return closeQuotation(quotationId, {
        outcome: "lost",
        lost_reason_category: payload.lostReasonCategory,
        lost_reason_detail: payload.lostReasonDetail || undefined,
        note: payload.note || undefined,
      })
    },
    onSuccess: async (_result, variables) => {
      setDialogOpen(false)
      showSuccessToast("Cập nhật workflow thành công.")
      await queryClient.invalidateQueries({ queryKey: ["quotation", quotationId] })
      await queryClient.invalidateQueries({ queryKey: ["quotations"] })
      await queryClient.invalidateQueries({ queryKey: ["quotation", quotationId, "history"] })
      if (variables.actionId === "close_won") {
        const contracts = await listContracts({ limit: 200 })
        const matchedContract = [...contracts.data]
          .filter((item) => item.quotation_id === quotationId)
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )[0]
        if (matchedContract) {
          navigate({
            to: "/contracts/$contractId",
            params: { contractId: matchedContract.id },
          })
        }
      }
    },
    onError: (error) => {
      showErrorToast(getErrorDetail(error))
    },
  })

  const addLogMutation = useMutation({
    mutationFn: () =>
      addNegotiationLog(quotationId, {
        contact_date: logDate,
        contact_method: logMethod,
        summary: logSummary.trim(),
        client_feedback: logFeedback.trim() || undefined,
        follow_up_date: logFollowUp || undefined,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã thêm bản ghi thương lượng.")
      setAddLogOpen(false)
      setLogSummary("")
      setLogFeedback("")
      setLogFollowUp("")
      setLogDate(new Date().toISOString().slice(0, 10))
      await queryClient.invalidateQueries({ queryKey: ["quotation", quotationId, "negotiations"] })
    },
    onError: (error) => showErrorToast(getErrorDetail(error)),
  })

  const requiresRejectNote = selectedAction === "reject_survey" || selectedAction === "reject_design" || selectedAction === "reject_final"
  const requiresNote = selectedAction === "submit_negotiation"
  const showsTotalContractValue = selectedAction === "submit_pricing"
  const requiresLostReason = selectedAction === "close_lost"
  const requiresClientDates = selectedAction === "send_to_client"

  const dialogTitle = useMemo(() => {
    if (selectedAction === "submit_survey") return "Nộp khảo sát"
    if (selectedAction === "approve_survey") return "Duyệt khảo sát"
    if (selectedAction === "reject_survey") return "Yêu cầu sửa khảo sát"
    if (selectedAction === "submit_design") return "Nộp thiết kế"
    if (selectedAction === "approve_design") return "Duyệt thiết kế"
    if (selectedAction === "reject_design") return "Yêu cầu sửa thiết kế"
    if (selectedAction === "submit_pricing") return "Xác nhận định giá"
    if (selectedAction === "finalize") return "Hoàn thiện báo giá"
    if (selectedAction === "approve_final") return "Duyệt báo giá cuối"
    if (selectedAction === "reject_final") return "Yêu cầu sửa báo giá"
    if (selectedAction === "send_to_client") return "Ghi nhận gửi khách hàng"
    if (selectedAction === "submit_negotiation") return "Trình thương lượng lên Giám đốc"
    if (selectedAction === "approve_negotiation") return "Đồng ý điều chỉnh giá"
    if (selectedAction === "reject_negotiation") return "Tiếp tục trao đổi thêm"
    if (selectedAction === "close_won") return "Đóng hồ sơ thắng"
    if (selectedAction === "close_lost") return "Đóng hồ sơ thua"
    return "Xác nhận hành động"
  }, [selectedAction])

  const latestSubmittedForCurrentStage = useMemo(() => {
    if (!historyQuery.data?.length) {
      return null
    }
    const submitActions = new Set(["submit_survey", "submit_design", "submit_pricing", "finalize", "send_to_client", "submit_negotiation"])
    const candidates = historyQuery.data.filter(
      (entry) =>
        entry.to_stage === quotationQuery.data?.current_stage &&
        submitActions.has(entry.action) &&
        Boolean(entry.note?.trim()),
    )
    if (!candidates.length) {
      return null
    }
    return candidates.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]
  }, [historyQuery.data, quotationQuery.data?.current_stage])

  const latestRejectForCurrentStage = useMemo(() => {
    if (!historyQuery.data?.length) {
      return null
    }
    const currentStage = quotationQuery.data?.current_stage
    if (!currentStage) {
      return null
    }
    const rejectActions = new Set(["reject_survey", "reject_design", "reject_final", "reject_negotiation"])
    const candidates = historyQuery.data.filter(
      (entry) =>
        entry.to_stage === currentStage &&
        rejectActions.has(entry.action) &&
        Boolean(entry.note?.trim()),
    )
    if (!candidates.length) {
      return null
    }
    const latestReject = candidates.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]
    if (!latestReject) {
      return null
    }
    if (
      latestSubmittedForCurrentStage &&
      new Date(latestSubmittedForCurrentStage.created_at).getTime() >
        new Date(latestReject.created_at).getTime()
    ) {
      return null
    }
    return latestReject
  }, [historyQuery.data, latestSubmittedForCurrentStage, quotationQuery.data?.current_stage])

  const historyEntriesNewestFirst = useMemo(() => {
    if (!historyQuery.data?.length) {
      return []
    }
    return [...historyQuery.data].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }, [historyQuery.data])

  const filteredHistoryEntries = useMemo(() => {
    if (!selectedHistoryStage) {
      return historyEntriesNewestFirst
    }
    if (selectedHistoryStage === QUOTATION_CREATE_STEP) {
      return historyEntriesNewestFirst.filter(
        (entry) =>
          normalizeHistoryAction({
            action: entry.action,
            from_stage: entry.from_stage,
            to_stage: entry.to_stage,
          }) === "create",
      )
    }
    return historyEntriesNewestFirst.filter(
      (entry) =>
        entry.to_stage === selectedHistoryStage ||
        entry.from_stage === selectedHistoryStage,
    )
  }, [historyEntriesNewestFirst, selectedHistoryStage])

  const timelineEntries = useMemo(
    () => buildQuotationTimelineEntries(filteredHistoryEntries),
    [filteredHistoryEntries],
  )

  const timelineAttachments = useMemo(
    () => buildQuotationTimelineAttachments(attachmentsQuery.data ?? [], historyQuery.data ?? []),
    [attachmentsQuery.data, historyQuery.data],
  )
  const groupedLibraryAttachments = useMemo(() => {
    const grouped = new Map<
      string,
      {
        label: string
        items: Array<
          QuotationAttachmentPublic & {
            versionLabel: string
            isApprovedVersion: boolean
          }
        >
      }
    >()

    const sortedAttachments = [...(attachmentsQuery.data ?? [])].sort(
      (a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime(),
    )

    for (const attachment of sortedAttachments) {
      const group = resolveAttachmentLibraryGroup(attachment.stage_uploaded)
      const existingGroup = grouped.get(group.key) ?? { label: group.label, items: [] }
      const versionNumber = existingGroup.items.length + 1

      existingGroup.items.push({
        ...attachment,
        versionLabel: `${group.label} lần ${versionNumber}`,
        isApprovedVersion: false,
      })
      grouped.set(group.key, existingGroup)
    }

    return ["survey", "design", "pricing", "final_quote", "other"]
      .map((key) => grouped.get(key))
      .filter((group): group is NonNullable<typeof group> => Boolean(group))
      .map((group) => ({
        ...group,
        items: [...group.items]
          .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
          .map((item, index) => ({
            ...item,
            isApprovedVersion: index === 0,
          })),
      }))
  }, [attachmentsQuery.data])

  const attachmentsForCurrentStage = useMemo(() => {
    if (!attachmentsQuery.data?.length) {
      return []
    }
    const currentStage = quotationQuery.data?.current_stage
    if (!currentStage) {
      return []
    }

    const stageScope: string[] = (() => {
      if (currentStage === "S2_DIRECTOR_APPROVE_SURVEY") {
        return ["S1_SALES_COLLECT", "S2_DIRECTOR_APPROVE_SURVEY"]
      }
      if (currentStage === "S4_DIRECTOR_APPROVE_DESIGN") {
        return ["S3_TECH_DESIGN", "S4_DIRECTOR_APPROVE_DESIGN"]
      }
      if (currentStage === "S7_DIRECTOR_APPROVE_QUOTE") {
        return ["S6_SALES_FINALIZE", "S7_DIRECTOR_APPROVE_QUOTE"]
      }
      return [currentStage]
    })()

    return attachmentsQuery.data
      .filter((item) => stageScope.includes(item.stage_uploaded))
      .sort(
        (a, b) =>
          new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
      )
  }, [attachmentsQuery.data, quotationQuery.data?.current_stage])

  // Reset the contentEditable editor DOM whenever the dialog opens/closes
  useEffect(() => {
    if (noteBodyRef.current) {
      noteBodyRef.current.innerHTML = ""
    }
  }, [dialogOpen])

  function resetWorkflowForm() {
    setNoteTitle("")
    setNoteBodyHtml("")
    setTotalContractValueInput("")
    setValidUntil("")
    setClientResponseDeadline("")
    setSurveyContactName("")
    setSurveyContactPhone("")
    setSurveyContactTitle("")
    setSurveyLocation("")
    setSurveyStartDate("")
    setSurveyEndDate("")
    setLostReasonCategory("price")
    setLostReasonDetail("")
    setExtraRoleIds([])
    setDialogUploadedAttachments([])
  }

  function handleOpenAction(actionId: QuotationActionId) {
    setSelectedAction(actionId)
    resetWorkflowForm()
    if (actionId === "submit_survey") {
      setSurveyContactName(quotation.client_contact_name || "A")
      setSurveyContactPhone(quotation.client_contact_phone || "09999999")
      setSurveyContactTitle(quotation.client_contact_title || "Giám đốc")
      setSurveyLocation(quotation.client_address || "Xưởng A")
      setSurveyStartDate(quotation.survey_start_date || "2026-04-25")
      setSurveyEndDate(quotation.survey_end_date || "2026-04-26")
    }
    setDialogOpen(true)
  }

  function handleStageStepClick(stage: QuotationHistoryStepFilter) {
    setSelectedHistoryStage(stage)
    navigate({
      to: "/quotations/$quotationId",
      params: { quotationId },
      search: { tab: "history" },
      replace: true,
    })
    requestAnimationFrame(() => {
      historyTabRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  function handleConfirmAction() {
    if (!selectedAction) {
      return
    }
    const mergedNote = buildWorkflowNote(noteTitle, noteBodyHtml)

    if ((requiresRejectNote || requiresNote) && !mergedNote) {
      showErrorToast("Bạn phải nhập nội dung ghi chú.")
      return
    }
    if (showsTotalContractValue) {
      const parsed = Number.parseFloat(totalContractValueInput.replace(/[,.]/g, ""))
      if (Number.isNaN(parsed) || parsed <= 0) {
        showErrorToast("Vui lòng nhập tổng giá trị hợp đồng hợp lệ (> 0).")
        return
      }
      workflowMutation.mutate({
        actionId: selectedAction,
        payload: { totalContractValue: parsed, note: buildWorkflowNote(noteTitle, noteBodyHtml) || undefined },
      })
      return
    }
    if (requiresLostReason && !lostReasonCategory) {
      showErrorToast("Bạn phải chọn lý do thua.")
      return
    }

    workflowMutation.mutate({
      actionId: selectedAction,
      payload: {
        clientContactName: surveyContactName,
        clientContactPhone: surveyContactPhone,
        clientContactTitle: surveyContactTitle,
        clientAddress: surveyLocation,
        surveyStartDate,
        surveyEndDate,
        note: mergedNote || undefined,
        validUntil: validUntil || undefined,
        clientResponseDeadline: clientResponseDeadline || undefined,
        lostReasonCategory: requiresLostReason ? lostReasonCategory : undefined,
        lostReasonDetail: lostReasonDetail.trim() || undefined,
        extraRoleIds: selectedAction === "close_won" ? extraRoleIds : undefined,
      },
    })
  }

  /**
   * Apply rich-text command on the editable note body.
   */
  function applyEditorCommand(command: string, value?: string) {
    const editor = noteBodyRef.current
    if (!editor) {
      return
    }
    editor.focus()
    document.execCommand(command, false, value)
    setNoteBodyHtml(editor.innerHTML)
  }

  /**
   * Upload selected files and persist as quotation attachments.
   */
  async function handlePickFiles(eventValue: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(eventValue.target.files ?? [])
    if (!files.length) {
      return
    }
    setUploadingAttachment(true)
    try {
      for (const file of files) {
        const uploaded = await uploadQuotationAttachmentFile(quotationId, file, noteTitle || undefined)
        setDialogUploadedAttachments((prev) => [
          ...prev,
          {
            id: uploaded.id,
            file_url: uploaded.file_url,
            file_name: uploaded.file_name,
            file_type: uploaded.file_type,
          },
        ])
      }
      showSuccessToast(`Đã upload ${files.length} file.`)
      await queryClient.invalidateQueries({
        queryKey: ["quotation", quotationId, "attachments"],
      })
    } catch (error) {
      showErrorToast(getErrorDetail(error))
    } finally {
      setUploadingAttachment(false)
    }
    eventValue.target.value = ""
  }

  /**
   * Open image attachments in popup, download non-image files.
   */
  function handleViewAttachment(fileUrl: string, fileName: string, fileType: string | null) {
    if (isImageAttachment(fileType, fileName)) {
      setImagePreviewUrl(resolveBackendMediaUrl(fileUrl))
      setImagePreviewName(fileName)
      return
    }
    triggerAttachmentDownload(fileUrl, fileName)
  }

  if (quotationQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (quotationQuery.isError || !quotationQuery.data) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-destructive">
        Không thể tải hồ sơ. Vui lòng thử lại.
      </div>
    )
  }

  const quotation = quotationQuery.data
  const stageConfig = STAGE_CONFIG[quotation.current_stage]
  const statusConfig = STATUS_CONFIG[quotation.status]

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Link to="/quotations" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Danh sách báo giá
          </Link>
          <h1 className="text-2xl font-bold">{quotation.quote_number}</h1>
          <p className="text-sm text-muted-foreground">{quotation.project_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${statusConfig.badgeBg} ${statusConfig.badgeText}`}>
            {statusConfig.label}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${stageConfig.badgeBg} ${stageConfig.badgeText}`}>
            {stageConfig.label}
          </span>
        </div>
      </div>

      <StageStepper
        currentStage={quotation.current_stage}
        selectedStage={selectedHistoryStage}
        onStepClick={handleStageStepClick}
      />

      {latestRejectForCurrentStage ? (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {getRejectRequestTitleByStage(quotation.current_stage)}
          </p>
          <p className="mt-1 text-xs text-amber-800/90">
            {latestRejectForCurrentStage.actor_name ?? "Người duyệt"} ·{" "}
            {new Date(latestRejectForCurrentStage.created_at).toLocaleString("vi-VN")}
          </p>
          <div
            className="mt-2 max-h-56 overflow-auto rounded-md border border-amber-200 bg-background/80 p-3 text-sm"
            dangerouslySetInnerHTML={{
              __html: renderLightMarkdown(latestRejectForCurrentStage.note ?? ""),
            }}
          />
        </div>
      ) : null}

      {(quotation.current_stage === "S2_DIRECTOR_APPROVE_SURVEY" ||
        quotation.current_stage === "S4_DIRECTOR_APPROVE_DESIGN" ||
        quotation.current_stage === "S7_DIRECTOR_APPROVE_QUOTE") && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nội dung nộp chờ duyệt
          </p>
          {historyQuery.isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Đang tải nội dung...
            </p>
          ) : latestSubmittedForCurrentStage?.note ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                {latestSubmittedForCurrentStage.actor_name ?? "Người dùng"} ·{" "}
                {new Date(
                  latestSubmittedForCurrentStage.created_at,
                ).toLocaleString("vi-VN")}
              </p>
              <div
                className="max-h-56 overflow-auto rounded-md border bg-muted/20 p-3 text-sm"
                dangerouslySetInnerHTML={{
                  __html: renderLightMarkdown(latestSubmittedForCurrentStage.note),
                }}
              />
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  File đính kèm cùng giai đoạn
                </p>
                {attachmentsQuery.isLoading ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Đang tải file...
                  </p>
                ) : attachmentsForCurrentStage.length ? (
                  <div className="mt-2 space-y-1">
                    {attachmentsForCurrentStage.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="block max-w-full truncate text-left text-xs text-primary underline"
                        title={file.file_name}
                        onClick={() => handleViewAttachment(file.file_url, file.file_name, file.file_type)}
                      >
                        {file.file_name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Chưa có file đính kèm ở giai đoạn này.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Chưa có nội dung nộp ở bước hiện tại.
            </p>
          )}
        </div>
      )}

      <QuotationActionsPanel
        quotation={quotation}
        permissions={permissions}
        busy={workflowMutation.isPending}
        onAction={handleOpenAction}
      />

      <Tabs
        value={search.tab}
        onValueChange={(value) => {
          navigate({
            to: "/quotations/$quotationId",
            params: { quotationId },
            search: { tab: value as QuotationTab },
            replace: true,
          })
        }}
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="negotiations">Trao đổi với khách</TabsTrigger>
          <TabsTrigger value="attachments">Tài liệu</TabsTrigger>
          <TabsTrigger value="history">Lịch sử</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          {/* Outcome banner */}
          {quotation.outcome === "won" && (
            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              Hợp đồng thắng
              {quotation.won_project_id ? (
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: quotation.won_project_id }}
                  className="ml-2 underline"
                >
                  Xem dự án
                </Link>
              ) : null}
            </div>
          )}
          {quotation.outcome === "lost" && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span className="font-medium">Hồ sơ thua —</span>{" "}
              {LOST_REASON_LABELS[quotation.lost_reason_category ?? ""] ?? quotation.lost_reason_category ?? "Không rõ lý do"}
              {quotation.lost_reason_detail ? (
                <p className="mt-1 text-xs">{quotation.lost_reason_detail}</p>
              ) : null}
            </div>
          )}

          {/* Thông tin khách hàng */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Khách hàng</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tên công ty" value={quotation.client_company_name} />
              <Field label="Hạng mục thiết bị" value={quotation.equipment_category} />
              <Field label="Người liên hệ" value={quotation.client_contact_name} />
              <Field label="Điện thoại" value={quotation.client_contact_phone} />
              <Field label="Email" value={quotation.client_contact_email} />
              <Field label="Địa chỉ" value={quotation.client_address} />
            </div>
          </div>

          {/* Phụ trách */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phụ trách</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Kinh doanh" value={quotation.sales_owner_name} />
              <Field label="Kỹ thuật" value={quotation.technical_owner_name} />
              <Field label="Vật tư" value={quotation.procurement_owner_name} />
            </div>
          </div>

          {/* Tài chính */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tài chính</p>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setPriceVisible((prev) => !prev)}
                aria-pressed={priceVisible}
                aria-label={priceVisible ? "Ẩn số tiền" : "Hiện số tiền"}
                title={priceVisible ? "Ẩn giá" : "Hiện giá"}
              >
                {priceVisible ? (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                )}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Tổng giá trị hợp đồng"
                value={priceVisible ? formatVnd(quotation.total_contract_value) : "••••••"}
              />
              <Field label="Đồng tiền" value={quotation.currency} />
            </div>
          </div>

          {/* Mốc thời gian */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thời gian</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Ngày tạo" value={formatDate(quotation.created_at)} />
              <Field label="Ngày khảo sát" value={formatDate(quotation.site_survey_date)} />
              <Field label="Hiệu lực báo giá đến" value={formatDate(quotation.valid_until)} />
              <Field label="Hạn phản hồi KH" value={formatDate(quotation.client_response_deadline)} />
              <Field label="Ngày gửi KH" value={formatDate(quotation.sent_to_client_at)} />
            </div>
          </div>

          {quotation.notes ? (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ghi chú</p>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{quotation.notes}</p>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="negotiations" className="space-y-3">
          {/* Add log form — show for users who can view quotation */}
          <div className="rounded-lg border bg-card p-4">
            {addLogOpen ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Thêm bản ghi thương lượng
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">Ngày tiếp xúc *</p>
                    <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                  </div>
                  <div className="w-44 space-y-1">
                    <p className="text-xs text-muted-foreground">Hình thức *</p>
                    <select
                      title="Hình thức liên hệ"
                      value={logMethod}
                      onChange={(e) => setLogMethod(e.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      {Object.entries(CONTACT_METHOD_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <Input
                  placeholder="Tóm tắt nội dung trao đổi *"
                  value={logSummary}
                  onChange={(e) => setLogSummary(e.target.value)}
                />
                <Input
                  placeholder="Phản hồi của khách hàng (tuỳ chọn)"
                  value={logFeedback}
                  onChange={(e) => setLogFeedback(e.target.value)}
                />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Lịch follow-up (tuỳ chọn)</p>
                  <Input type="date" value={logFollowUp} onChange={(e) => setLogFollowUp(e.target.value)} />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={addLogMutation.isPending || !logSummary.trim()}
                    onClick={() => addLogMutation.mutate()}
                  >
                    {addLogMutation.isPending ? "Đang lưu..." : "Lưu bản ghi"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddLogOpen(false)}>
                    Huỷ
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setAddLogOpen(true)}>
                + Thêm bản ghi thương lượng
              </Button>
            )}
          </div>

          {/* Existing logs */}
          <div className="rounded-lg border bg-card">
            {negotiationsQuery.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Đang tải...</p>
            ) : negotiationsQuery.isError ? (
              <p className="p-4 text-sm text-destructive">Không thể tải bản ghi thương lượng.</p>
            ) : !negotiationsQuery.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">Chưa có bản ghi thương lượng nào.</p>
            ) : (
              <div className="divide-y">
                {negotiationsQuery.data.map((log) => (
                  <div key={log.id} className="p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(log.contact_date)}</span>
                      <span>·</span>
                      <span>{CONTACT_METHOD_LABELS[log.contact_method] ?? log.contact_method}</span>
                      <span>·</span>
                      <span>{log.logged_by_name ?? "—"}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{log.summary}</p>
                    {log.client_feedback ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Phản hồi KH: {log.client_feedback}
                      </p>
                    ) : null}
                    {log.follow_up_date ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Follow-up: {formatDate(log.follow_up_date)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="attachments" className="space-y-3">
          {/* Upload button */}
          <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
            <input
              ref={attachTabFileRef}
              type="file"
              multiple
              title="Chọn file đính kèm"
              className="hidden"
              onChange={handlePickFiles}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploadingAttachment}
              onClick={() => attachTabFileRef.current?.click()}
            >
              <Paperclip className="mr-1.5 h-4 w-4" />
              {uploadingAttachment ? "Đang upload..." : "Upload file đính kèm"}
            </Button>
            <p className="text-xs text-muted-foreground">Hỗ trợ mọi định dạng file.</p>
          </div>

          {/* File list with icons */}
          <div className="rounded-lg border bg-card">
            {attachmentsQuery.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Đang tải...</p>
            ) : attachmentsQuery.isError ? (
              <p className="p-4 text-sm text-destructive">Không thể tải file đính kèm.</p>
            ) : !groupedLibraryAttachments.length ? (
              <p className="p-4 text-sm text-muted-foreground">Chưa có file đính kèm nào.</p>
            ) : (
              <div className="divide-y">
                {groupedLibraryAttachments.map((group) => (
                  <div key={group.label} className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{group.label}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {group.items.length} file
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 rounded-lg border px-3 py-3"
                        >
                          <FileTypeIcon fileName={item.file_name} />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() =>
                              handleViewAttachment(item.file_url, item.file_name, item.file_type)
                            }
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium text-blue-600 hover:underline">
                                {item.versionLabel}
                              </p>
                              {item.isApprovedVersion ? (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                                  Được duyệt
                                </span>
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.file_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {STAGE_CONFIG[item.stage_uploaded as QuotationStage]?.label ??
                                item.stage_uploaded}
                              {" · "}
                              {item.uploaded_by_name ?? "—"}
                              {" · "}
                              {new Date(item.uploaded_at).toLocaleDateString("vi-VN")}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="history"
          className="rounded-lg border bg-card p-4"
          ref={historyTabRef}
        >
          {selectedHistoryStage ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Đang lọc theo bước:{" "}
                <span className="font-semibold text-foreground">
                  {selectedHistoryStage === QUOTATION_CREATE_STEP
                    ? "Tạo hồ sơ"
                    : getStageFilterLabel(selectedHistoryStage)}
                </span>
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedHistoryStage(null)}>
                Bỏ lọc
              </Button>
            </div>
          ) : null}
          {historyQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải lịch sử chuyển bước...</p>
          ) : historyQuery.isError ? (
            <p className="text-sm text-destructive">Không thể tải lịch sử chuyển bước.</p>
          ) : (
            <StageTransitionTimeline
              entries={timelineEntries}
              attachments={timelineAttachments}
              actionConfig={QUOTATION_ACTION_CONFIG}
              onViewAttachment={(att) => handleViewAttachment(att.file_url, att.file_name, att.file_type ?? null)}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            setSelectedAction(null)
            resetWorkflowForm()
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[min(92vw,700px)] max-w-[700px] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              Xác nhận thao tác workflow cho hồ sơ {quotation.quote_number}.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {selectedAction === "submit_survey" ? (
              <div className="grid gap-3 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Tên khách hàng</p>
                  <Input
                    value={surveyContactName}
                    onChange={(eventValue) => setSurveyContactName(eventValue.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">SDT</p>
                  <Input
                    value={surveyContactPhone}
                    onChange={(eventValue) => setSurveyContactPhone(eventValue.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Chức vụ</p>
                  <Input
                    value={surveyContactTitle}
                    onChange={(eventValue) => setSurveyContactTitle(eventValue.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Vị trí khảo sát</p>
                  <Input
                    value={surveyLocation}
                    onChange={(eventValue) => setSurveyLocation(eventValue.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Thời gian bắt đầu khảo sát</p>
                  <Input
                    type="date"
                    value={surveyStartDate}
                    onChange={(eventValue) => setSurveyStartDate(eventValue.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Thời gian kết thúc khảo sát</p>
                  <Input
                    type="date"
                    value={surveyEndDate}
                    onChange={(eventValue) => setSurveyEndDate(eventValue.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {showsTotalContractValue ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Tổng giá trị hợp đồng (VND) <span className="text-destructive">*</span>
                </p>
                <Input
                  inputMode="decimal"
                  placeholder="Ví dụ: 250000000"
                  value={totalContractValueInput}
                  onChange={(e) => setTotalContractValueInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Nhập tổng giá trị từ file Excel báo giá đã điền.
                </p>
              </div>
            ) : null}

            {requiresClientDates ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Hiệu lực báo giá</p>
                  <Input
                    type="date"
                    value={validUntil}
                    onChange={(eventValue) => setValidUntil(eventValue.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Hạn phản hồi khách hàng</p>
                  <Input
                    type="date"
                    value={clientResponseDeadline}
                    onChange={(eventValue) => setClientResponseDeadline(eventValue.target.value)}
                  />
                </div>
              </>
            ) : null}

            {selectedAction === "close_won" ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Thêm role vào dự án{" "}
                  <span className="text-muted-foreground/60">(ngoài BGĐ & Quản lý đã được thêm tự động)</span>
                </p>
                {companyRolesQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Đang tải danh sách role...</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(companyRolesQuery.data ?? [])
                      .filter((r: CompanyRole) => r.level > 2)
                      .map((role: CompanyRole) => {
                        const checked = extraRoleIds.includes(role.id)
                        return (
                          <label
                            key={role.id}
                            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                              checked
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() =>
                                setExtraRoleIds((prev) =>
                                  checked ? prev.filter((id) => id !== role.id) : [...prev, role.id],
                                )
                              }
                            />
                            {role.display_name}
                          </label>
                        )
                      })}
                    {(companyRolesQuery.data ?? []).filter((r: CompanyRole) => r.level > 2).length === 0 && (
                      <p className="text-xs text-muted-foreground">Không có role nào khác.</p>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {requiresLostReason ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Lý do thua</p>
                  <select
                    title="Chọn lý do thua"
                    value={lostReasonCategory}
                    onChange={(eventValue) => setLostReasonCategory(eventValue.target.value as "price" | "design" | "marketing" | "other")}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {Object.entries(LOST_REASON_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Chi tiết</p>
                  <Input
                    placeholder="Mô tả chi tiết lý do thua"
                    value={lostReasonDetail}
                    onChange={(eventValue) => setLostReasonDetail(eventValue.target.value)}
                  />
                </div>
              </>
            ) : null}

            {/* Note body — contentEditable, NO dangerouslySetInnerHTML to avoid cursor-flip */}
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Nội dung cho bước này {(requiresRejectNote || requiresNote) ? "(bắt buộc)" : "(tuỳ chọn)"}
              </p>
              <Input
                placeholder="Tiêu đề"
                value={noteTitle}
                onChange={(eventValue) => setNoteTitle(eventValue.target.value)}
              />
              <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => applyEditorCommand("bold")} title="Đậm">
                  <Bold className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => applyEditorCommand("italic")} title="Nghiêng">
                  <Italic className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => applyEditorCommand("underline")} title="Gạch chân">
                  <Underline className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => applyEditorCommand("strikeThrough")} title="Gạch ngang">
                  <Strikethrough className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => applyEditorCommand("formatBlock", "h2")} title="Heading">
                  <Heading2 className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => applyEditorCommand("justifyLeft")} title="Căn trái">
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => applyEditorCommand("insertUnorderedList")} title="Danh sách bullet">
                  <List className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => applyEditorCommand("insertOrderedList")} title="Danh sách số">
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </div>
              {/* Do NOT pass dangerouslySetInnerHTML here — it causes React to reset innerHTML on
                  every render, moving the cursor to the start and reversing typed text.
                  Instead we initialise via useEffect and read via onInput only. */}
              <div
                ref={noteBodyRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-40 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                onInput={(eventValue) =>
                  setNoteBodyHtml((eventValue.currentTarget as HTMLDivElement).innerHTML)
                }
              />
            </div>

            {/* File attachments — kept OUTSIDE the note box so adding files doesn't resize it */}
            <div className="flex gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                title="Chọn ảnh đính kèm"
                className="hidden"
                onChange={handlePickFiles}
              />
              <input
                ref={docInputRef}
                type="file"
                multiple
                title="Chọn tài liệu đính kèm"
                className="hidden"
                onChange={handlePickFiles}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAttachment}
                onClick={() => imageInputRef.current?.click()}
              >
                <Paperclip className="mr-1 h-4 w-4" />
                Thêm ảnh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAttachment}
                onClick={() => docInputRef.current?.click()}
              >
                <Paperclip className="mr-1 h-4 w-4" />
                Thêm tài liệu
              </Button>
            </div>
            {uploadingAttachment ? (
              <p className="text-xs text-muted-foreground">Đang upload file vào hệ thống...</p>
            ) : null}
            {dialogUploadedAttachments.length ? (
              <div className="rounded-md border bg-muted/10 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  File vừa upload ({dialogUploadedAttachments.length})
                </p>
                <div className="mt-2 space-y-1">
                  {dialogUploadedAttachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      className="block max-w-full truncate text-left text-xs text-primary underline"
                      title={att.file_name}
                      onClick={() => handleViewAttachment(att.file_url, att.file_name, att.file_type)}
                    >
                      {att.file_name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={workflowMutation.isPending}
              onClick={() => setDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button disabled={workflowMutation.isPending} onClick={handleConfirmAction}>
              {workflowMutation.isPending ? "Đang xử lý..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(imagePreviewUrl)}
        onOpenChange={(open) => {
          if (!open) {
            setImagePreviewUrl(null)
            setImagePreviewName("")
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-[min(95vw,56rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{imagePreviewName || "Xem ảnh đính kèm"}</DialogTitle>
          </DialogHeader>
          {imagePreviewUrl ? (
            <img
              src={imagePreviewUrl}
              alt={imagePreviewName || "Ảnh đính kèm"}
              className="mx-auto max-h-[min(70vh,80dvh)] w-full max-w-full object-contain"
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImagePreviewUrl(null)
                setImagePreviewName("")
              }}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
