import { Building2, ClipboardList, FileCheck2 } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function NewQuotationPageGuide() {
  return (
    <PageGuide
      title="Tạo hồ sơ báo giá"
      description="Tạo đúng thông tin đầu vào để các bộ phận có thể tiếp tục khảo sát và chào giá."
      triggerTestId="new-quotation-page-guide-trigger"
      panelTestId="new-quotation-page-guide"
      badges={
        <GuideMeta audience="Người có quyền tạo báo giá" detail="2 phút" />
      }
    >
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-5 text-blue-950">
        Hồ sơ mới bắt đầu ở bước <strong>Khảo sát</strong>. Hãy dùng tên dự án
        dễ nhận biết để mọi người tra cứu thống nhất.
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Hai bước nhập liệu
        </h3>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="rounded-lg border bg-white p-3 text-slate-600">
            <p className="font-bold text-slate-800">
              Bước 1/2 — Thông tin công ty khách hàng <Marker>1</Marker>
            </p>
            <div className="mt-3 rounded border px-2 py-2">
              Tên công ty khách hàng * <Marker>2</Marker>
            </div>
            <div className="mt-2 rounded border px-2 py-2 text-slate-500">
              Người liên hệ, điện thoại, email, địa chỉ
            </div>
            <div className="mt-3 rounded bg-blue-600 px-3 py-2 text-center font-bold text-white">
              Tiếp tục <Marker>3</Marker>
            </div>
          </div>
          <div className="my-2 border-l-2 border-dashed border-blue-300 pl-3 text-blue-700">
            Bước 2/2 — Tên dự án, hạng mục thiết bị và ghi chú khảo sát.
          </div>
        </div>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Nếu khách hàng đã có trong hệ thống, chọn từ danh sách để dùng lại
              thông tin; nếu chưa có, chuyển sang nhập công ty mới.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Tên công ty khách hàng là bắt buộc. Điền thông tin liên hệ đủ để
              đội khảo sát không phải hỏi lại.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Nhấn <strong>Tiếp tục</strong> để sang bước dự án. Tại đó, tên dự
              án là trường bắt buộc trước khi tạo hồ sơ.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-950">
          <Building2 className="size-4" /> Tránh tạo trùng khách hàng
        </h3>
        <p className="mt-1 text-sm leading-5 text-amber-950">
          Hãy tìm trong danh sách công ty trước khi tạo mới. Việc này giữ lịch
          sử báo giá của cùng một khách hàng ở một nơi.
        </p>
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-950">
          <ClipboardList className="size-4" /> Sau khi tạo
        </h3>
        <p className="mt-1 text-sm leading-5 text-violet-950">
          Hệ thống chuyển đến chi tiết hồ sơ và lịch sử. Bổ sung kết quả khảo
          sát rồi gửi bước tiếp theo khi thao tác tương ứng xuất hiện.
        </p>
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <FileCheck2 className="size-3.5" /> Không tạo nhiều hồ sơ chỉ để thử;
        dùng một hồ sơ thật, đúng khách hàng và dự án.
      </p>
    </PageGuide>
  )
}
