import { CheckCircle2, FileSignature } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function ContractsPageGuide() {
  return (
    <PageGuide
      title="Hợp đồng"
      description="Theo dõi hợp đồng được tạo từ báo giá thắng và tiến độ thực hiện sau ký."
      triggerTestId="contracts-page-guide-trigger"
      panelTestId="contracts-page-guide"
      badges={
        <GuideMeta audience="Kinh doanh, BGĐ & triển khai" detail="2 phút" />
      }
    >
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-950">
        Khi báo giá được chốt thắng, hệ thống tự tạo dự án và hợp đồng nháp. Mở
        hợp đồng để tiếp tục quy trình ký kết, tạm ứng và triển khai.
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Nhìn nhanh danh sách
        </h3>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-bold text-slate-800">
              <FileSignature className="mr-1 inline size-4 text-indigo-600" />{" "}
              Hợp đồng
            </span>
            <span className="rounded bg-indigo-600 px-2 py-1 font-bold text-white">
              + Tạo hợp đồng <Marker>1</Marker>
            </span>
          </div>
          <div className="mt-3 inline-flex rounded border bg-white px-2 py-2 text-slate-600">
            Trạng thái: Tất cả <Marker>2</Marker>
          </div>
          <div className="mt-3 rounded-lg border bg-white p-2">
            <div className="flex justify-between gap-2">
              <span className="font-bold text-indigo-700">
                HD-2026-014 <Marker>3</Marker>
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                Chờ BGĐ duyệt <Marker>4</Marker>
              </span>
            </div>
            <p className="mt-2 text-slate-500">
              500.000.000 VND · từ báo giá BG-2026-014
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3 text-sm leading-5 text-slate-700">
        <p className="flex gap-3">
          <Marker>1</Marker>
          <span>
            Chỉ tạo thủ công khi có quyền và báo giá đã kết thúc. Báo giá thắng
            thường đã có hợp đồng nháp tự tạo.
          </span>
        </p>
        <p className="flex gap-3">
          <Marker>2</Marker>
          <span>
            Lọc theo trạng thái để biết hợp đồng nào đang chờ duyệt, chờ ký hoặc
            đang triển khai.
          </span>
        </p>
        <p className="flex gap-3">
          <Marker>3</Marker>
          <span>
            Nhấn số hợp đồng để mở chi tiết, tài liệu và Lịch sử chuyển trạng
            thái.
          </span>
        </p>
        <p className="flex gap-3">
          <Marker>4</Marker>
          <span>
            Đọc trạng thái để biết nút thao tác kế tiếp sẽ thuộc về ai.
          </span>
        </p>
      </section>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-950">
          <CheckCircle2 className="size-4" /> Luồng sau khi thắng báo giá
        </h3>
        <p className="mt-1 text-sm leading-5 text-indigo-950">
          Hợp đồng nháp → BGĐ duyệt → gửi khách → xác nhận đã ký → xác nhận tạm
          ứng → chuyển triển khai → hoàn thành. Hướng dẫn chi tiết từng trạng
          thái có tại trang chi tiết hợp đồng.
        </p>
      </section>
    </PageGuide>
  )
}
