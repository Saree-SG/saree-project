import { BarChart2, ExternalLink, Filter } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function ReportsPageGuide() {
  return (
    <PageGuide
      title="Báo cáo & Phân tích"
      description="Tổng hợp hiệu suất dự án, nhân sự và tiến độ; lọc theo dự án/phòng ban."
      triggerTestId="reports-page-guide-trigger"
      panelTestId="reports-page-guide"
      badges={<GuideMeta audience="Quản lý / Giám đốc" detail="3 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Xem tổng quan tiến độ dự án, hiệu suất nhân sự và các công việc trễ
          hạn — thu hẹp phạm vi bằng bộ lọc dự án/phòng ban.
        </p>
      </section>

      <section aria-labelledby="reports-guide-filter">
        <h3
          id="reports-guide-filter"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Filter className="size-4" /> Bộ lọc <Marker>1</Marker>
        </h3>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Chọn <strong>dự án</strong> và/hoặc <strong>phòng ban</strong>, nhấn{" "}
          <strong>Áp dụng</strong> để mọi biểu đồ bên dưới cùng lọc theo phạm
          vi đó; nhấn <strong>Xóa bộ lọc</strong> để quay về toàn công ty.
        </p>
      </section>

      <section aria-labelledby="reports-guide-charts">
        <h3
          id="reports-guide-charts"
          className="text-base font-bold text-slate-900"
        >
          Các nhóm biểu đồ <Marker>2</Marker>
        </h3>
        <div className="mt-3 space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-sm font-bold text-slate-800">
              Tiến độ hoàn thành theo dự án
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Top 10 dự án nhiều công việc nhất, so sánh % hoàn thành.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-sm font-bold text-slate-800">
              Phân bổ trạng thái dự án
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Bao nhiêu dự án đang lên kế hoạch / thi công / tạm dừng / hoàn
              thành.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-sm font-bold text-slate-800">
              Hiệu suất & phân bổ nguồn lực nhân sự
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Số công việc đang làm / tổng được giao mỗi người, để thấy ai
              đang tải nhiều hơn phần còn lại.
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 shadow-sm">
            <p className="text-sm font-bold text-red-800">
              Task trễ deadline
            </p>
            <p className="mt-1 text-xs text-red-700">
              Danh sách công việc đã quá hạn — nên xử lý ngay hoặc gia hạn kịp
              thời.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="reports-guide-detail">
        <h3
          id="reports-guide-detail"
          className="text-base font-bold text-slate-900"
        >
          Bảng chi tiết <Marker>3</Marker>
        </h3>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Cuộn xuống để xem <strong>Chi tiết tiến độ dự án</strong>,{" "}
          <strong>Hiệu suất nhân sự chi tiết</strong> và{" "}
          <strong>Thành viên công ty</strong> dạng bảng — dùng khi cần số liệu
          chính xác thay vì chỉ nhìn biểu đồ.
        </p>
      </section>

      <a
        href="/help"
        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
      >
        <BarChart2 className="size-3.5" /> Xem hướng dẫn đầy đủ{" "}
        <ExternalLink className="size-3.5" />
      </a>

      <p className="text-xs text-slate-400">
        Đã xác minh giao diện: đang chờ kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
