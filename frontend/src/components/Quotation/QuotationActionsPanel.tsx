import { Button } from "@/components/ui/button"
import { OWNER_ROLE_WAITING_LABEL, STAGE_CONFIG } from "@/modules/quotation/stageConfig"
import type { QuotationPublic } from "@/modules/quotation/quotationTypes"

export type QuotationActionId =
  | "submit_survey"
  | "approve_survey"
  | "reject_survey"
  | "submit_design"
  | "approve_design"
  | "reject_design"
  | "submit_pricing"
  | "finalize"
  | "approve_final"
  | "reject_final"
  | "send_to_client"
  | "submit_negotiation"
  | "approve_negotiation"
  | "reject_negotiation"
  | "close_won"
  | "close_lost"

interface QuotationActionsPanelProps {
  quotation: QuotationPublic
  permissions: string[]
  busy: boolean
  onAction: (actionId: QuotationActionId) => void
}

function canDo(permissions: string[], permissionCode: string): boolean {
  return permissions.includes(permissionCode)
}

function getAvailableActions(
  quotation: QuotationPublic,
  permissions: string[],
): QuotationActionId[] {
  const stage = quotation.current_stage

  if (stage === "S1_SALES_COLLECT" && canDo(permissions, "QUOTATION_SUBMIT_SURVEY")) {
    return ["submit_survey"]
  }
  if (stage === "S2_DIRECTOR_APPROVE_SURVEY" && canDo(permissions, "QUOTATION_APPROVE_SURVEY")) {
    return ["approve_survey", "reject_survey"]
  }
  if (stage === "S3_TECH_DESIGN" && canDo(permissions, "QUOTATION_DESIGN")) {
    return ["submit_design"]
  }
  if (stage === "S4_DIRECTOR_APPROVE_DESIGN" && canDo(permissions, "QUOTATION_APPROVE_DESIGN")) {
    return ["approve_design", "reject_design"]
  }
  if (stage === "S5_PROCUREMENT_PRICING" && canDo(permissions, "QUOTATION_FILL_PRICE")) {
    return ["submit_pricing"]
  }
  if (stage === "S6_SALES_FINALIZE" && canDo(permissions, "QUOTATION_FINALIZE")) {
    return ["finalize"]
  }
  if (stage === "S7_DIRECTOR_APPROVE_QUOTE" && canDo(permissions, "QUOTATION_APPROVE_FINAL")) {
    return ["approve_final", "reject_final"]
  }
  if (stage === "S8_SENT_TO_CLIENT") {
    const actions: QuotationActionId[] = []
    if (canDo(permissions, "QUOTATION_SEND_CLIENT")) {
      if (quotation.status === "active" || quotation.status === "sent") {
        actions.push("send_to_client")
      }
      if (quotation.status === "sent" || quotation.status === "negotiating") {
        actions.push("submit_negotiation")
      }
    }
    if (canDo(permissions, "QUOTATION_CLOSE")) {
      // Must "send to client" before closing won/lost.
      if (quotation.status === "sent" || quotation.status === "negotiating") {
        actions.push("close_won", "close_lost")
      }
    }
    return actions
  }
  if (stage === "S8B_NEGOTIATION_REVIEW" && canDo(permissions, "QUOTATION_APPROVE_NEGOTIATION")) {
    return ["approve_negotiation", "reject_negotiation"]
  }
  return []
}

function actionLabel(actionId: QuotationActionId): string {
  if (actionId === "submit_survey") return "Nộp khảo sát"
  if (actionId === "approve_survey") return "Duyệt khảo sát"
  if (actionId === "reject_survey") return "Yêu cầu bổ sung"
  if (actionId === "submit_design") return "Nộp thiết kế"
  if (actionId === "approve_design") return "Duyệt thiết kế"
  if (actionId === "reject_design") return "Yêu cầu điều chỉnh"
  if (actionId === "submit_pricing") return "Xác nhận định giá"
  if (actionId === "finalize") return "Hoàn thiện báo giá"
  if (actionId === "approve_final") return "Duyệt báo giá"
  if (actionId === "reject_final") return "Yêu cầu chỉnh lại"
  if (actionId === "send_to_client") return "Ghi nhận đã gửi khách"
  if (actionId === "submit_negotiation") return "Trình thương lượng lên Giám đốc"
  if (actionId === "approve_negotiation") return "Đồng ý điều chỉnh"
  if (actionId === "reject_negotiation") return "Tiếp tục trao đổi thêm"
  if (actionId === "close_won") return "Thắng hợp đồng"
  return "Đóng hồ sơ (thua)"
}

function isDestructiveAction(actionId: QuotationActionId): boolean {
  return (
    actionId === "reject_survey" ||
    actionId === "reject_design" ||
    actionId === "reject_final" ||
    actionId === "reject_negotiation" ||
    actionId === "close_lost"
  )
}

function actionHint(stage: QuotationPublic["current_stage"]): string {
  if (stage === "S1_SALES_COLLECT") return "Điền đầy đủ thông tin khảo sát, đính kèm tài liệu nếu có, rồi nộp cho Giám đốc duyệt."
  if (stage === "S2_DIRECTOR_APPROVE_SURVEY") return "Xem lại nội dung khảo sát. Duyệt để chuyển sang Kỹ thuật, hoặc yêu cầu bổ sung nếu thông tin chưa đủ."
  if (stage === "S3_TECH_DESIGN") return "Upload file thiết kế (tab Tài liệu), sau đó nộp cho Giám đốc duyệt."
  if (stage === "S4_DIRECTOR_APPROVE_DESIGN") return "Xem lại file thiết kế. Duyệt để chuyển sang bước báo đơn giá, hoặc yêu cầu điều chỉnh."
  if (stage === "S5_PROCUREMENT_PRICING") return "Upload file Excel đã điền giá (tab Tài liệu), nhập tổng giá trị hợp đồng, rồi xác nhận."
  if (stage === "S6_SALES_FINALIZE") return "Upload file hợp đồng chào giá (tab Tài liệu), rồi hoàn thiện để Giám đốc duyệt."
  if (stage === "S7_DIRECTOR_APPROVE_QUOTE") return "Xem xét báo giá tổng thể. Duyệt để gửi khách hàng, hoặc yêu cầu điều chỉnh."
  if (stage === "S8_SENT_TO_CLIENT") return "Ghi nhận đã gửi khách hàng → khi khách trao đổi thương lượng thì trình lên Giám đốc để duyệt."
  if (stage === "S8B_NEGOTIATION_REVIEW") return "Xem xét nội dung thương lượng. Đồng ý để Kinh doanh cập nhật bảng giá, hoặc từ chối để tiếp tục trao đổi thêm."
  return ""
}

export function QuotationActionsPanel({
  quotation,
  permissions,
  busy,
  onAction,
}: QuotationActionsPanelProps) {
  const actions = getAvailableActions(quotation, permissions)
  const stageConfig = STAGE_CONFIG[quotation.current_stage]
  const waitingLabel = OWNER_ROLE_WAITING_LABEL[stageConfig.ownerRole]
  const hint = actionHint(quotation.current_stage)

  if (quotation.current_stage === "S9_CLOSED") {
    return (
      <div className="rounded-lg border bg-card px-4 py-3">
        <p className="text-sm font-medium text-muted-foreground">Hồ sơ đã kết thúc.</p>
      </div>
    )
  }

  if (actions.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${stageConfig.badgeBg} ${stageConfig.badgeText}`}
        >
          {waitingLabel}
        </span>
        {hint ? (
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`rounded-lg border ${stageConfig.badgeBg}/30 bg-card px-4 py-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${stageConfig.badgeBg} ${stageConfig.badgeText}`}
          >
            Lượt của bạn
          </span>
          {hint ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((actionId) => (
            <Button
              key={actionId}
              size="sm"
              disabled={busy}
              variant={isDestructiveAction(actionId) ? "outline" : "default"}
              className={
                isDestructiveAction(actionId)
                  ? "border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  : actionId === "close_won"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : ""
              }
              onClick={() => onAction(actionId)}
            >
              {actionLabel(actionId)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
