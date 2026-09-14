import { Crosshair, MapPin, Save } from "lucide-react"

import { GuideMarker as Marker, PageGuide } from "@/components/Guide/PageGuide"

export function AttendanceConfigPageGuide() {
  return (
    <PageGuide
      title="Cấu hình vị trí chấm công"
      description="Thiết lập tâm vị trí và bán kính cho phép cho công trình hoặc công ty."
      triggerTestId="attendance-config-guide-trigger"
      panelTestId="attendance-config-guide"
      badges={
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
          Dành cho quản lý có quyền cấu hình
        </span>
      }
    >
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
        Chỉ cấu hình khi bạn đang có mặt tại công trình hoặc đã xác nhận chính
        xác địa chỉ/tọa độ. Thay đổi này ảnh hưởng tới việc kiểm tra GPS của
        nhân viên chấm công sau đó.
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Quy trình 4 bước</h3>
        <div className="mt-3 space-y-3">
          <div className="flex gap-3 rounded-xl border bg-white p-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Chọn đúng <strong>công trình</strong> hoặc{" "}
              <strong>công ty</strong>
              cần cấu hình. Dấu ✓ trong danh sách cho biết nơi đó đã có tọa độ.
            </span>
          </div>
          <div className="flex gap-3 rounded-xl border bg-white p-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Chọn một cách đặt tâm: <strong>Theo địa chỉ</strong> để tìm kiếm,
              <strong>Theo tọa độ</strong> để dán `lat, lng`, hoặc lấy vị trí
              hiện tại khi đang đứng tại địa điểm.
            </span>
          </div>
          <div className="flex gap-3 rounded-xl border bg-white p-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Kiểm tra điểm tâm trên bản đồ và đặt{" "}
              <strong>bán kính cho phép</strong>. Bán kính tối thiểu là 10m;
              chọn đủ rộng để phù hợp cổng/bãi xe nhưng không quá rộng khiến
              kiểm tra vị trí mất ý nghĩa.
            </span>
          </div>
          <div className="flex gap-3 rounded-xl border bg-white p-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>
              Chọn <strong>Lưu vị trí</strong>. Sau đó thử chấm công bằng một
              tài khoản nhân viên tại đúng địa điểm để xác nhận cấu hình.
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h3 className="text-sm font-bold text-slate-900">
          Mô phỏng vùng cấu hình
        </h3>
        <div className="mt-3 rounded-lg border bg-white p-3 text-xs text-slate-600">
          <span className="block rounded border px-3 py-2">
            Chọn công trình… <Marker>1</Marker>
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <span className="rounded bg-blue-600 px-2 py-2 text-center font-bold text-white">
              Theo địa chỉ <Marker>2</Marker>
            </span>
            <span className="rounded border px-2 py-2 text-center font-bold">
              Theo tọa độ
            </span>
          </div>
          <div className="mt-3 flex h-24 items-center justify-center rounded border border-dashed bg-slate-50 text-slate-400">
            <MapPin className="mr-1 size-4" /> Bản đồ kiểm tra tâm vị trí
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Crosshair className="size-4 text-blue-600" />
            <span className="flex-1 rounded border px-2 py-1.5">
              Bán kính: 150m <Marker>3</Marker>
            </span>
          </div>
          <span className="mt-3 block rounded bg-blue-600 px-3 py-2 text-center font-bold text-white">
            <Save className="mr-1 inline size-3" /> Lưu vị trí{" "}
            <Marker>4</Marker>
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-950">
        <strong>Lỗi thường gặp:</strong> chỉ nhập một trong hai vĩ độ/kinh độ,
        dán tọa độ sai định dạng, hoặc đặt bán kính dưới 10m. Hệ thống sẽ không
        lưu các giá trị này.
      </section>
    </PageGuide>
  )
}
