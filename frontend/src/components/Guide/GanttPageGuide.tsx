import { CalendarRange, ExternalLink, Filter, GitBranch } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function GanttPageGuide() {
  return (
    <PageGuide
      title="Gantt tổng công ty"
      description="Xem tiến độ toàn bộ dự án trên một trục thời gian, lọc theo dự án/phòng ban."
      triggerTestId="gantt-page-guide-trigger"
      panelTestId="gantt-page-guide"
      badges={<GuideMeta audience="Quản lý / Điều phối" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          So sánh tiến độ nhiều dự án cùng lúc, phát hiện công việc trễ hoặc
          xung đột lịch, và xem chuỗi phụ thuộc giữa các công việc.
        </p>
      </section>

      <section aria-labelledby="gantt-guide-tabs">
        <h3
          id="gantt-guide-tabs"
          className="text-base font-bold text-slate-900"
        >
          2 tab chính <Marker>1</Marker>
        </h3>
        <div className="mt-3 space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-sm font-bold text-slate-800">Tổng quan</p>
            <p className="mt-1 text-sm text-slate-600">
              Mỗi dự án là 1 thẻ tiến độ (thanh % hoàn thành, ngày bắt đầu/kết
              thúc) — phù hợp để quét nhanh dự án nào đang chậm.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-sm font-bold text-slate-800">Công việc</p>
            <p className="mt-1 text-sm text-slate-600">
              Biểu đồ Gantt đầy đủ: từng task là 1 thanh trên trục ngày, có
              đường nối thể hiện phụ thuộc (task nào phải xong trước task
              nào).
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="gantt-guide-filters">
        <h3
          id="gantt-guide-filters"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Filter className="size-4" /> Bộ lọc & tỉ lệ xem <Marker>2</Marker>
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-700">
          <li className="flex gap-3">
            <Marker>a</Marker>
            <span>
              Lọc theo <strong>công ty</strong> (nếu bạn quản lý nhiều công
              ty), <strong>dự án</strong> hoặc <strong>phòng ban</strong> để
              thu hẹp danh sách task hiển thị.
            </span>
          </li>
          <li className="flex gap-3">
            <Marker>b</Marker>
            <span>
              Đổi <strong>tỉ lệ thời gian</strong> (ngày/tuần/tháng) ở thanh
              công cụ để xem chi tiết hơn hoặc bao quát hơn.
            </span>
          </li>
          <li className="flex gap-3">
            <Marker>c</Marker>
            <span>
              Nút <strong>hôm nay</strong> cuộn nhanh biểu đồ về ngày hiện
              tại.
            </span>
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <GitBranch className="size-4" /> Đọc đường phụ thuộc
        </h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Task tô màu khác (đường viền đậm) là task nằm trên <strong>đường
          găng (critical path)</strong> — trễ task này sẽ kéo trễ toàn dự án.
          Ưu tiên xử lý các task này trước.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <CalendarRange className="size-4 text-emerald-600" /> Liên quan
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Xem tiến độ chi tiết từng dự án tại trang{" "}
          <strong>Dự án → Gantt</strong> (chỉ 1 dự án), hoặc xem điều phối
          nhân sự tại trang <strong>Điều phối</strong>.
        </p>
        <a
          href="/help"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
        >
          Xem hướng dẫn đầy đủ <ExternalLink className="size-3.5" />
        </a>
      </section>

      <p className="text-xs text-slate-400">
        Đã xác minh giao diện: đang chờ kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
