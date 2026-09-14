import { ExternalLink, MapPin, Users } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function MapPageGuide() {
  return (
    <PageGuide
      title="Bản đồ công trình"
      description="Xem vị trí công trình, khách hàng và nhân sự đang hoạt động trên bản đồ."
      triggerTestId="map-page-guide-trigger"
      panelTestId="map-page-guide"
      badges={<GuideMeta audience="Quản lý / Điều phối" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Nắm nhanh công trình nào đang thi công ở đâu, tiến độ bao nhiêu %,
          và nhân sự nào đang ở gần để điều phối khi cần hỗ trợ gấp.
        </p>
      </section>

      <section aria-labelledby="map-guide-markers">
        <h3
          id="map-guide-markers"
          className="text-base font-bold text-slate-900"
        >
          3 loại điểm trên bản đồ <Marker>1</Marker>
        </h3>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              🏗
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">Công trình</p>
              <p className="text-xs text-slate-500">
                Nhãn hiển thị % hoàn thành; màu đổi theo trạng thái dự án
                (đang thi công / lên kế hoạch / tạm dừng / hoàn thành).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
              🏢
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">Khách hàng</p>
              <p className="text-xs text-slate-500">
                Vị trí công ty khách hàng liên quan đến các dự án.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <Users className="size-6 shrink-0 text-slate-500" />
            <div>
              <p className="text-sm font-bold text-slate-800">Nhân viên</p>
              <p className="text-xs text-slate-500">
                Vị trí nhân sự đang chấm công/làm việc gần đó nhất.
              </p>
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
              Các điểm gần nhau tự động <strong>gộp cụm (cluster)</strong> —
              nhấn vào cụm để phóng to và tách ra từng điểm.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Nhấn vào một điểm để xem chi tiết (tên, % tiến độ hoặc trạng
              thái) trong popup.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <MapPin className="size-4" /> Lưu ý
        </h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Công trình/nhân viên chưa có tọa độ (chưa cấu hình vị trí) sẽ không
          hiển thị trên bản đồ. Vào Dự án hoặc Chấm công để bổ sung tọa độ.
        </p>
      </section>

      <a
        href="/help"
        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
      >
        Xem hướng dẫn đầy đủ <ExternalLink className="size-3.5" />
      </a>

      <p className="text-xs text-slate-400">
        Đã xác minh giao diện: đang chờ kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
