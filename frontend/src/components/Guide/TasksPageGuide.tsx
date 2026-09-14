import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ListTodo,
  MapPin,
} from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

/**
 * First contextual guide pattern. Subsequent page guides should reuse this
 * interaction model: a compact entry point, a page-specific HTML replica,
 * and task-oriented instructions rather than a long generic manual.
 */
export function TasksPageGuide() {
  return (
    <PageGuide
      title="Công việc của tôi"
      description="Xem việc ưu tiên, mở chi tiết công việc và cập nhật tiến độ đúng hạn."
      triggerTestId="tasks-page-guide-trigger"
      panelTestId="tasks-page-guide"
      badges={<GuideMeta audience="Dành cho nhân viên" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Biết việc nào cần xử lý trước, lọc theo dự án và đi tới trang chi tiết
          để báo cáo tiến độ.
        </p>
      </section>

      <section aria-labelledby="tasks-guide-map">
        <h3 id="tasks-guide-map" className="text-base font-bold text-slate-900">
          Nhìn nhanh màn hình
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Đây là mô phỏng giao diện. Các số xanh tương ứng với phần giải thích
          bên dưới.
        </p>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <p className="text-sm font-bold text-slate-800">
                Công việc của tôi <Marker>1</Marker>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                6 công việc · 2 cần làm gấp
              </p>
            </div>
            <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">
              <AlertTriangle className="mr-1 inline size-3" />2 gấp
            </span>
          </div>
          <div className="flex gap-1.5 overflow-hidden py-3 text-[10px] font-semibold">
            <span className="rounded-full bg-blue-600 px-2 py-1 text-white">
              Tất cả <Marker>2</Marker>
            </span>
            <span className="whitespace-nowrap rounded-full border bg-white px-2 py-1 text-slate-600">
              Kho lạnh An Phú
            </span>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-2">
            <p className="text-[11px] font-bold text-red-700">
              🔴 Cần làm gấp <Marker>3</Marker>
            </p>
            <div className="mt-2 rounded-lg border border-slate-100 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
                  QUÁ HẠN
                </span>
                <span className="text-[9px] text-slate-400">
                  Kho lạnh An Phú
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-800">
                Lắp đặt đường ống khu A <Marker>4</Marker>
              </p>
              <div className="mt-2 flex items-center gap-2 text-[10px]">
                <Clock3 className="size-3 text-red-500" />
                <span className="font-medium text-red-600">Quá hạn 2 ngày</span>
                <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                  <div className="h-full w-3/5 rounded-full bg-blue-500" />
                </div>
                <span className="font-semibold text-slate-600">
                  60% <Marker>5</Marker>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Cách sử dụng</h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              <strong>Kiểm tra tổng quan.</strong> Số việc và nhãn đỏ cho biết
              có việc nào cần ưu tiên ngay.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              <strong>Lọc theo dự án</strong> khi bạn đang tham gia nhiều dự án;
              chọn <strong>Tất cả</strong> để quay lại danh sách đầy đủ.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              <strong>Xử lý nhóm Cần làm gấp trước.</strong> Nhóm này gồm việc
              quá hạn, sắp đến hạn hoặc có cảnh báo.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>
              <strong>Nhấn vào thẻ công việc</strong> để xem chi tiết, trao đổi
              và gửi báo cáo tiến độ.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>5</Marker>
            <span>
              <strong>Đọc tiến độ và hạn.</strong> Thanh phần trăm là mức hoàn
              thành đã ghi nhận; hãy cập nhật tại trang chi tiết sau khi hoàn
              thành một phần việc.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <MapPin className="size-4" /> Lưu ý quan trọng
        </h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Nếu công việc bị chặn hoặc có nguy cơ trễ, vào chi tiết công việc để
          xem phụ thuộc và trao đổi với quản lý; không chỉ tăng phần trăm tiến
          độ khi chưa xử lý được việc thực tế.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <CheckCircle2 className="size-4 text-emerald-600" /> Việc tiếp theo
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Sau khi mở một công việc, xem hướng dẫn chi tiết về cập nhật tiến độ,
          nộp bằng chứng và yêu cầu gia hạn.
        </p>
        <a
          href="/help"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
        >
          Xem hướng dẫn đầy đủ <ExternalLink className="size-3.5" />
        </a>
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <ListTodo className="size-3.5" /> Đã xác minh giao diện: đang chờ kiểm
        thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
