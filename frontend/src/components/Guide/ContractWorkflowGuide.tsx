import { CheckCircle2, Paperclip } from "lucide-react"
import { useState } from "react"

import { GuideMeta, PageGuide } from "@/components/Guide/PageGuide"
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_ORDER,
  type ContractStatus,
} from "@/modules/contract/contractTypes"

const stepUi: Record<
  ContractStatus,
  { owner: string; document: string; action: string; secondary?: string }
> = {
  draft: {
    owner: "Kinh doanh",
    document: "Hợp đồng nháp và điều khoản đã kiểm tra.",
    action: "Nộp BGĐ duyệt",
  },
  pending_approval: {
    owner: "Giám đốc",
    document: "Bản hợp đồng, giá trị, tiến độ và điều khoản.",
    action: "Duyệt & Gửi khách hàng",
    secondary: "Từ chối",
  },
  sent: {
    owner: "Kinh doanh / khách hàng",
    document: "Bản hợp đồng đã gửi khách và bản ký lại.",
    action: "Xác nhận đã ký",
  },
  signed: {
    owner: "Kế toán / Kinh doanh",
    document: "Chứng từ tạm ứng và số tiền thực nhận.",
    action: "Xác nhận nhận tạm ứng",
  },
  advance_received: {
    owner: "Quản lý triển khai",
    document: "Kế hoạch bắt đầu thực hiện và ghi chú bàn giao.",
    action: "Chuyển sang sản xuất",
  },
  in_production: {
    owner: "Đội triển khai",
    document: "Biên bản nghiệm thu hoặc bằng chứng hoàn thành.",
    action: "Hoàn thành hợp đồng",
  },
  completed: {
    owner: "Toàn bộ đội ngũ",
    document: "Lịch sử, tài liệu ký và bằng chứng triển khai.",
    action: "Đã hoàn thành",
  },
}

export function ContractWorkflowGuide({
  currentStatus,
}: {
  currentStatus: ContractStatus
}) {
  const [selectedStatus, setSelectedStatus] = useState(currentStatus)
  const currentIndex = CONTRACT_STATUS_ORDER.indexOf(currentStatus)
  const selected = stepUi[selectedStatus]

  return (
    <PageGuide
      title="Quy trình hợp đồng"
      description={`Hợp đồng đang ở trạng thái: ${CONTRACT_STATUS_LABELS[currentStatus]}.`}
      triggerTestId="contract-workflow-guide-trigger"
      panelTestId="contract-workflow-guide"
      badges={<GuideMeta audience="Theo quyền được giao" detail="4 phút" />}
      initialFocusSelector="[data-guide-contract-current='true']"
    >
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-950">
        Hợp đồng nháp được tạo khi báo giá thắng. Chỉ chuyển trạng thái khi tài
        liệu và thông tin của bước đó đã hoàn chỉnh.
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Chọn trạng thái để xem UI thao tác
        </h3>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {CONTRACT_STATUS_ORDER.map((status, index) => {
            const isCurrent = status === currentStatus
            const isSelected = status === selectedStatus
            const disabled = index > currentIndex
            return (
              <button
                key={status}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedStatus(status)}
                className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-bold ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : disabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {index + 1}. {CONTRACT_STATUS_LABELS[status]}
                {isCurrent ? " • Hiện tại" : ""}
              </button>
            )
          })}
        </div>

        <div
          data-guide-contract-current={
            selectedStatus === currentStatus ? "true" : undefined
          }
          className="mt-3 overflow-hidden rounded-xl border-2 border-indigo-300 bg-white shadow-md"
        >
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-3 text-white">
            <div>
              <p className="text-xs text-indigo-100">
                Phụ trách: {selected.owner}
              </p>
              <h4 className="font-bold">
                {CONTRACT_STATUS_LABELS[selectedStatus]}
              </h4>
            </div>
            {selectedStatus === currentStatus ? (
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-indigo-700">
                Bạn đang ở đây
              </span>
            ) : null}
          </div>
          <div className="p-3 text-xs text-slate-600">
            <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50 p-3">
              <p className="font-bold text-indigo-950">Tài liệu cho bước này</p>
              <p className="mt-1">{selected.document}</p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-3 py-2 font-bold text-indigo-700"
              >
                <Paperclip className="size-3.5" /> Đính kèm tài liệu
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.secondary ? (
                <button
                  type="button"
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-bold text-amber-800"
                >
                  {selected.secondary}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-2 font-bold text-white"
              >
                {selected.action}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-blue-950">
          <CheckCircle2 className="size-4" /> Sau khi chuyển sang triển khai
        </h3>
        <p className="mt-1 text-sm leading-5 text-blue-950">
          Trạng thái <strong>Đang sản xuất</strong> ghi nhận hợp đồng đã sẵn
          sàng để đội dự án thực hiện. Theo dõi công việc tại Dự án đã tạo từ
          báo giá; sau nghiệm thu, quay lại đây để hoàn thành hợp đồng.
        </p>
      </section>
    </PageGuide>
  )
}
