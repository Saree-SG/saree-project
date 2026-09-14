import { Building2, Camera, MapPin, ShieldCheck } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function AttendancePageGuide() {
  return (
    <PageGuide
      title="Chấm công"
      description="Chấm công vào và ra bằng ảnh cùng vị trí GPS tại nơi làm việc."
      triggerTestId="attendance-page-guide-trigger"
      panelTestId="attendance-page-guide"
      badges={<GuideMeta audience="Dành cho nhân viên" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm leading-5 text-blue-950">
        <strong>Chuẩn bị:</strong> bật GPS và cho phép camera trên thiết bị. Bạn
        cần chụp ảnh trực tiếp khi vào và khi rời nơi làm việc.
      </section>

      <section aria-labelledby="attendance-guide-map">
        <h3
          id="attendance-guide-map"
          className="text-base font-bold text-slate-900"
        >
          Nhìn nhanh màn hình
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Đây là giao diện mô phỏng. Số xanh chỉ đúng phần cần thao tác.
        </p>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="rounded-lg border bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full border bg-slate-50">
                <MapPin className="size-4 text-slate-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Chưa chấm công <Marker>1</Marker>
                </p>
                <p className="text-[10px] text-slate-500">
                  Hãy chọn công trình để bắt đầu
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border bg-white p-3">
            <p className="text-xs font-bold text-slate-800">
              Chấm công vào <Marker>2</Marker>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="rounded-md bg-blue-600 px-2 py-2 text-center text-[10px] font-bold text-white">
                <Building2 className="mr-1 inline size-3" /> Theo công trình{" "}
                <Marker>3</Marker>
              </span>
              <span className="rounded-md border px-2 py-2 text-center text-[10px] font-bold text-slate-600">
                Theo công ty <Marker>4</Marker>
              </span>
            </div>
            <span className="mt-3 block rounded border px-3 py-2 text-[10px] text-slate-500">
              Chọn công trình… <Marker>5</Marker>
            </span>
            <span className="mt-3 block rounded bg-blue-600 px-3 py-2 text-center text-[10px] font-bold text-white">
              <Camera className="mr-1 inline size-3" /> Chấm công vào{" "}
              <Marker>6</Marker>
            </span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Cách chấm công vào
        </h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Kiểm tra trạng thái. <strong>Chưa chấm công</strong> nghĩa là bạn
              có thể bắt đầu ca mới; <strong>Đang làm việc</strong> nghĩa là cần
              chấm công ra trước khi bắt đầu ca khác.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Chọn <strong>Theo công trình</strong> khi làm tại dự án đã được
              giao, sau đó chọn đúng công trình ở danh sách.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>
              Chọn <strong>Theo công ty</strong> khi làm việc không gắn với một
              công trình; chọn công ty và nhập nội dung công việc.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>6</Marker>
            <span>
              Nhấn <strong>Chấm công vào</strong> → chụp ảnh → kiểm tra lại ảnh
              và thời gian → xác nhận. Hệ thống sẽ lấy vị trí GPS khi gửi.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
          <ShieldCheck className="size-4" /> Kết thúc ca
        </h3>
        <p className="mt-1 text-sm leading-5 text-emerald-900">
          Khi hoàn thành công việc, mở lại trang này và chọn{" "}
          <strong>Chấm công ra</strong>. Bạn cũng cần chụp ảnh và bật GPS. Hãy
          chấm công ra trong ngày để giờ công được ghi nhận đầy đủ.
        </p>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
        <strong>Nếu không thể chấm công:</strong> kiểm tra kết nối mạng, GPS và
        quyền camera. Nếu đang ở ngoài vùng đã cấu hình, vẫn gửi theo hướng dẫn
        của quản lý và nêu rõ lý do khi được yêu cầu.
      </section>
    </PageGuide>
  )
}
