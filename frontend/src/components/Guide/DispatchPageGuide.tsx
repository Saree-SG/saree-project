import { ExternalLink, UserPlus, Zap } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function DispatchPageGuide() {
  return (
    <PageGuide
      title="Điều phối nhân sự"
      description="Tìm công việc thiếu người và bổ sung nhân sự phù hợp chỉ với 1 lần bấm."
      triggerTestId="dispatch-page-guide-trigger"
      panelTestId="dispatch-page-guide"
      badges={<GuideMeta audience="Quản lý / Điều phối" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Hệ thống tự phát hiện công việc đang thiếu người và gợi ý nhân sự
          phù hợp nhất theo kỹ năng, tải trọng công việc hiện tại và khoảng
          cách di chuyển.
        </p>
      </section>

      <section aria-labelledby="dispatch-guide-map">
        <h3
          id="dispatch-guide-map"
          className="text-base font-bold text-slate-900"
        >
          Nhìn nhanh màn hình
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">
            2 công việc đang thiếu người: <Marker>1</Marker>
          </p>
          <div className="mt-2 rounded-lg border border-blue-500 bg-blue-50 p-2.5 ring-1 ring-blue-500">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-800">
                Lắp đặt đường ống khu B
              </p>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                Thiếu 2 người
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Cần 4 · Đã có 2
            </p>
          </div>

          <p className="mt-3 text-sm font-semibold text-slate-700">
            Gợi ý cho: Lắp đặt đường ống khu B <Marker>2</Marker>
          </p>
          <div className="mt-2 rounded-lg border bg-white p-2.5 shadow-sm">
            <p className="text-xs font-bold text-slate-800">Nguyễn Văn A</p>
            <p className="text-[10px] text-slate-500">
              Lắp đặt IQF · Cấp 4 · Cách 2.1km · Rảnh
            </p>
            <span className="mt-1 inline-block rounded bg-blue-600 px-2 py-1 text-[10px] font-bold text-white">
              + Bố trí <Marker>3</Marker>
            </span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Cách sử dụng</h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              <strong>Chọn 1 công việc</strong> trong danh sách đang thiếu
              người để xem gợi ý nhân sự.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Mỗi thẻ gợi ý hiển thị <strong>kỹ năng phù hợp</strong>,{" "}
              <strong>tải trọng hiện tại</strong> (Rảnh / Đang làm / Quá tải)
              và <strong>khoảng cách di chuyển</strong> đến công trình.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Nhấn <strong>Bố trí</strong> để thêm người đó vào công việc —
              danh sách thiếu người và gợi ý tự cập nhật ngay.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <Zap className="size-4" /> Lưu ý
        </h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Điểm gợi ý ưu tiên người có kỹ năng cao, ít việc đang làm và gần
          công trình nhất — nhưng vẫn cần bạn xác nhận phù hợp thực tế (nghỉ
          phép, ca làm) trước khi bố trí.
        </p>
      </section>

      <a
        href="/help"
        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
      >
        <UserPlus className="size-3.5" /> Xem hướng dẫn đầy đủ{" "}
        <ExternalLink className="size-3.5" />
      </a>

      <p className="text-xs text-slate-400">
        Đã xác minh giao diện: đang chờ kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
