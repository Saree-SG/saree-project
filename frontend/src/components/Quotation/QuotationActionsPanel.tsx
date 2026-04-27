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
  | "negotiate"
  | "request_revision"
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
      const isReadyToSend =
        quotation.status === "active" || quotation.status === "sent"
      const isNegotiationOpen =
        quotation.status === "sent" || quotation.status === "negotiating"
      // S8 mới vào hoặc sau vòng revise có thể ghi nhận gửi khách.
      if (isReadyToSend) {
        actions.push("send_to_client")
      }
      // Khi đã gửi hoặc đang thương lượng: cho phép lặp thương lượng nhiều lần.
      if (isNegotiationOpen) {
        actions.push("negotiate")
        actions.push("request_revision")
      }
    }
    if (canDo(permissions, "QUOTATION_CLOSE")) {
      actions.push("close_won", "close_lost")
    }
    return actions
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
  if (actionId === "negotiate") return "Đang thương lượng"
  if (actionId === "request_revision") return "Yêu cầu điều chỉnh giá"
  if (actionId === "close_won") return "Thắng hợp đồng"
  return "Đóng hồ sơ (thua)"
}

function isDestructiveAction(actionId: QuotationActionId): boolean {
  return (
    actionId === "reject_survey" ||
    actionId === "reject_design" ||
    actionId === "reject_final" ||
    actionId === "request_revision" ||
    actionId === "close_lost"
  )
}

function actionHint(stage: QuotationPublic["current_stage"]): string {
  if (stage === "S1_SALES_COLLECT") return "Điền đầy đủ thông tin khảo sát, đính kèm tài liệu nếu có, rồi nộp cho Ban Giám đốc duyệt."
  if (stage === "S2_DIRECTOR_APPROVE_SURVEY") return "Xem lại nội dung khảo sát bên dưới. Duyệt để chuyển sang Kỹ thuật, hoặc yêu cầu bổ sung nếu thông tin chưa đủ."
  if (stage === "S3_TECH_DESIGN") return "Thêm hạng mục thiết bị (tab Hạng mục), đính kèm bản vẽ nếu có, rồi nộp cho Ban Giám đốc duyệt."
  if (stage === "S4_DIRECTOR_APPROVE_DESIGN") return "Xem lại thiết kế và hạng mục. Duyệt để chuyển sang Vật tư định giá, hoặc yêu cầu điều chỉnh."
  if (stage === "S5_PROCUREMENT_PRICING") return "Điền giá mua và thông tin nhà cung cấp vào từng hạng mục (tab Hạng mục), rồi xác nhận định giá."
  if (stage === "S6_SALES_FINALIZE") return "Tab Hạng mục: nhấn 'Set giá bán' để nhập từng hạng mục. Hoặc nhập hệ số giá toàn cục khi bấm Hoàn thiện. Nếu dùng hệ số, hệ thống sẽ tính đè lên giá đã set thủ công."
  if (stage === "S7_DIRECTOR_APPROVE_QUOTE") return "Xem xét báo giá tổng thể. Duyệt để gửi khách hàng, hoặc yêu cầu điều chỉnh."
  if (stage === "S8_SENT_TO_CLIENT") return "Ghi nhận đã gửi khách → đánh dấu thương lượng khi khách phản hồi → nếu khách yêu cầu điều chỉnh giá thì dùng 'Yêu cầu điều chỉnh giá' để quay lại S6 → BGĐ duyệt lại → gửi lại."
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
