import { AlertTriangle, Search, Wrench } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function IncidentsPageGuide() {
  return (
    <PageGuide
      title="Sự cố thi công"
      description="Ghi nhận, tra cứu và xử lý sự cố để đội ngũ có kinh nghiệm cho lần sau."
      triggerTestId="incidents-page-guide-trigger"
      panelTestId="incidents-page-guide"
      badges={
        <GuideMeta audience="Người báo & quản lý xử lý" detail="2 phút" />
      }
    >
      <section className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-950">
        Báo sự cố ngay khi phát hiện. Ghi mô tả theo hiện tượng thực tế; nguyên
        nhân và giải pháp có thể bổ sung khi đã xử lý xong.
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Báo sự cố mới</h3>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="rounded-lg border bg-white p-3 text-xs text-slate-600">
            <p className="font-bold text-slate-800">
              <AlertTriangle className="mr-1 inline size-4 text-red-600" /> Báo
              sự cố <Marker>1</Marker>
            </p>
            <span className="mt-3 block rounded border px-2 py-2">
              Tiêu đề sự cố <Marker>2</Marker>
            </span>
            <span className="mt-2 block rounded border px-2 py-4">
              Mô tả hiện tượng… <Marker>3</Marker>
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <span className="rounded border px-2 py-2">
                Hạng mục <Marker>4</Marker>
              </span>
              <span className="rounded border px-2 py-2">
                Mức độ <Marker>4</Marker>
              </span>
            </div>
            <span className="mt-3 block rounded bg-blue-600 px-3 py-2 text-center font-bold text-white">
              Ghi nhận sự cố <Marker>5</Marker>
            </span>
          </div>
        </div>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Đặt tiêu đề ngắn, dễ tìm lại: ví dụ “Rò gas dàn lạnh khu A”.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Mô tả hiện tượng, vị trí, thời điểm và ảnh hưởng. Đây là trường
              bắt buộc.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>Chọn hạng mục và mức độ để quản lý ưu tiên xử lý đúng.</span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>5</Marker>
            <span>
              Gửi để tạo sự cố ở trạng thái <strong>Đang mở</strong>.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Search className="size-4 text-blue-600" /> Tìm lại sự cố
        </h3>
        <p className="mt-1 text-sm leading-5 text-slate-700">
          Dùng ô tìm kiếm theo tiêu đề, mô tả hoặc giải pháp; lọc thêm theo hạng
          mục và trạng thái. Nhấn một thẻ sự cố để xem chi tiết, ảnh đính kèm và
          quá trình xử lý.
        </p>
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-900">
          <Wrench className="size-4" /> Dành cho người xử lý
        </h3>
        <p className="mt-1 text-sm leading-5 text-violet-900">
          Người có quyền xử lý mở chi tiết sự cố, ghi{" "}
          <strong>nguyên nhân gốc</strong> và <strong>giải pháp</strong>, sau đó
          đánh dấu đã xử lý. Đính kèm ảnh/tài liệu nếu cần làm bằng chứng.
        </p>
      </section>
    </PageGuide>
  )
}
