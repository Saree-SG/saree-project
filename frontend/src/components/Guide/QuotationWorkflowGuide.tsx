import { ArrowRight, FileCheck2, RotateCcw, Workflow } from "lucide-react"
import { useState } from "react"

import { GuideMeta, PageGuide } from "@/components/Guide/PageGuide"
import type { QuotationStage } from "@/modules/quotation/quotationTypes"
import { STAGE_CONFIG } from "@/modules/quotation/stageConfig"

type WorkflowStep = {
  stage: Exclude<QuotationStage, "S9_CLOSED">
  owner: string
  input: string
  action: string
  returnTo?: string
}

const workflowSteps: WorkflowStep[] = [
  {
    stage: "S1_SALES_COLLECT",
    owner: "Kinh doanh",
    input: "Thông tin khách hàng, hiện trạng, biên bản/ảnh khảo sát.",
    action: "Đính kèm tài liệu ở tab Tài liệu, rồi Nộp khảo sát.",
  },
  {
    stage: "S2_DIRECTOR_APPROVE_SURVEY",
    owner: "Giám đốc",
    input: "Khảo sát và file Kinh doanh đã nộp.",
    action: "Duyệt khảo sát để chuyển Kỹ thuật, hoặc Yêu cầu bổ sung.",
    returnTo: "Trả về Kinh doanh (S1).",
  },
  {
    stage: "S3_TECH_DESIGN",
    owner: "Kỹ thuật",
    input: "Yêu cầu đã được duyệt và dữ liệu hiện trường.",
    action: "Tải bản vẽ/thông số lên tab Tài liệu, rồi Nộp thiết kế.",
  },
  {
    stage: "S3B_BOC_TACH",
    owner: "Kỹ thuật",
    input: "Bản vẽ thiết kế đã hoàn thiện.",
    action: "Lập bảng khối lượng, đính kèm Excel và Hoàn thành bóc tách.",
  },
  {
    stage: "S4_DIRECTOR_APPROVE_DESIGN",
    owner: "Giám đốc",
    input: "Bản vẽ và bảng bóc tách.",
    action:
      "Duyệt thiết kế & bóc tách để chuyển Vật tư, hoặc Yêu cầu điều chỉnh.",
    returnTo: "Trả về Kỹ thuật (S3).",
  },
  {
    stage: "S5_PROCUREMENT_PRICING",
    owner: "Vật tư",
    input: "Khối lượng đã duyệt và báo giá nhà cung cấp.",
    action:
      "Đính kèm bảng giá, nhập tổng giá trị hợp đồng rồi Xác nhận định giá.",
  },
  {
    stage: "S6_SALES_FINALIZE",
    owner: "Kinh doanh",
    input: "Giá từ Vật tư và điều khoản thương mại.",
    action: "Tải báo giá chính thức lên rồi Hoàn thiện báo giá để trình duyệt.",
  },
  {
    stage: "S7_DIRECTOR_APPROVE_QUOTE",
    owner: "Giám đốc",
    input: "Báo giá hoàn chỉnh, giá trị và điều khoản.",
    action: "Duyệt báo giá để cho phép gửi khách, hoặc Yêu cầu chỉnh lại.",
    returnTo: "Trả về Kinh doanh (S6).",
  },
  {
    stage: "S8_SENT_TO_CLIENT",
    owner: "Kinh doanh",
    input: "Báo giá đã được duyệt và phản hồi khách hàng.",
    action:
      "Ghi nhận đã gửi khách; lưu trao đổi, trình thương lượng, hoặc đóng thắng/thua.",
  },
  {
    stage: "S8B_NEGOTIATION_REVIEW",
    owner: "Giám đốc",
    input: "Đề xuất thương lượng và lịch sử trao đổi với khách.",
    action: "Đồng ý điều chỉnh hoặc trả về để tiếp tục trao đổi thêm.",
    returnTo: "Quay lại bước chờ phản hồi khách (S8).",
  },
]

export function QuotationWorkflowGuide({
  currentStage,
}: {
  currentStage: QuotationStage
}) {
  const current = STAGE_CONFIG[currentStage]
  const [selectedStage, setSelectedStage] =
    useState<QuotationStage>(currentStage)
  const selectedStep = workflowSteps.find(
    (step) => step.stage === selectedStage,
  )
  const selectedConfig = selectedStep
    ? STAGE_CONFIG[selectedStep.stage]
    : current

  return (
    <PageGuide
      title="Quy trình báo giá từng bước"
      description={`Hồ sơ đang ở: ${current.label}. Mở từng bước bên dưới để biết đúng việc cần làm.`}
      triggerTestId="quotation-workflow-guide-trigger"
      panelTestId="quotation-workflow-guide"
      badges={<GuideMeta audience="Theo quyền được giao" detail="6 phút" />}
      initialFocusSelector="[data-guide-current-stage='true']"
    >
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-5 text-blue-950">
        Chỉ bấm nút chuyển bước sau khi đã kiểm tra đủ đầu vào. Các nút trên màn
        hình chỉ hiện với người có quyền ở giai đoạn hiện tại.
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-950">
          <Workflow className="size-4" /> Cách đọc trang chi tiết
        </h3>
        <p className="mt-1 text-sm leading-5 text-violet-950">
          Thanh bước ở đầu trang cho biết vị trí của hồ sơ. Dùng tab{" "}
          <strong>Tài liệu</strong> để nộp file và tab <strong>Lịch sử</strong>{" "}
          để kiểm tra người đã chuyển bước, thời điểm và ghi chú.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-bold text-slate-900">
          Chọn giai đoạn để xem màn hình thao tác
        </h3>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {workflowSteps.map((step, index) => {
            const isCurrent = step.stage === currentStage
            const isSelected = step.stage === selectedStage
            return (
              <button
                key={step.stage}
                type="button"
                onClick={() => setSelectedStage(step.stage)}
                className={`shrink-0 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition-colors ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                }`}
              >
                {index + 1}. {STAGE_CONFIG[step.stage].shortLabel}
                {isCurrent ? " • Hiện tại" : ""}
              </button>
            )
          })}
        </div>

        {selectedStep ? (
          <article
            data-guide-current-stage={
              selectedStage === currentStage ? "true" : undefined
            }
            className="overflow-hidden rounded-xl border-2 border-indigo-300 bg-white shadow-md"
          >
            <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-3 text-white">
              <div>
                <p className="text-xs font-semibold text-blue-100">
                  Bước {workflowSteps.indexOf(selectedStep) + 1} ·{" "}
                  {selectedStep.owner}
                </p>
                <h4 className="font-bold">{selectedConfig.label}</h4>
              </div>
              {selectedStage === currentStage ? (
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-indigo-700">
                  Bạn đang ở đây
                </span>
              ) : null}
            </div>

            <div className="p-3 text-xs text-slate-600">
              <div className="flex gap-2 border-b pb-2 font-semibold">
                <span className="rounded-md bg-indigo-100 px-2 py-1 text-indigo-700">
                  Tài liệu
                </span>
                <span className="px-2 py-1">Lịch sử</span>
                <span className="px-2 py-1">Trao đổi</span>
              </div>
              <div className="mt-3 rounded-lg border border-dashed border-indigo-300 bg-indigo-50 p-3">
                <p className="font-bold text-indigo-950">Tài liệu đầu vào</p>
                <p className="mt-1 leading-5">{selectedStep.input}</p>
                <button
                  type="button"
                  className="mt-3 rounded-md border border-indigo-300 bg-white px-3 py-2 font-bold text-indigo-700"
                >
                  + Đính kèm tài liệu
                </button>
              </div>
              <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                <p className="font-bold text-slate-900">Thao tác ở bước này</p>
                <p className="mt-1 flex gap-1.5 leading-5">
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-indigo-600" />
                  {selectedStep.action}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedStep.returnTo ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-bold text-amber-800"
                  >
                    <RotateCcw className="size-3.5" /> Yêu cầu bổ sung
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-md bg-indigo-600 px-3 py-2 font-bold text-white"
                >
                  {selectedStep.action.split(".")[0]}
                </button>
              </div>
              {selectedStep.returnTo ? (
                <p className="mt-2 flex items-center gap-1.5 text-amber-800">
                  <RotateCcw className="size-3.5" /> Trả về:{" "}
                  {selectedStep.returnTo}
                </p>
              ) : null}
            </div>
          </article>
        ) : null}
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-950">
          <FileCheck2 className="size-4" /> Kết thúc hồ sơ
        </h3>
        <p className="mt-1 text-sm leading-5 text-emerald-950">
          Khi chọn <strong>Thắng hợp đồng</strong>, hệ thống tự tạo một{" "}
          <strong>Dự án</strong> và một <strong>Hợp đồng nháp</strong> từ báo
          giá này. Việc tiếp theo: vào <strong>Hợp đồng</strong>, mở hợp đồng
          vừa tạo, nộp BGĐ duyệt, gửi khách ký, xác nhận tạm ứng rồi chuyển sang
          triển khai. Chỉ chọn <strong>Đóng hồ sơ</strong> khi không thành công
          và ghi rõ lý do.
        </p>
      </section>
    </PageGuide>
  )
}
