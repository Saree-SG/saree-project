import { Eye, FilePlus2, Filter, Workflow } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function QuotationsPageGuide() {
  return (
    <PageGuide
      title="Hồ sơ báo giá"
      description="Tạo, tìm và theo dõi hồ sơ từ khảo sát đến phản hồi khách hàng."
      triggerTestId="quotations-page-guide-trigger"
      panelTestId="quotations-page-guide"
      badges={
        <GuideMeta audience="Kinh doanh & bộ phận liên quan" detail="3 phút" />
      }
    >
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-5 text-blue-950">
        Một hồ sơ đi qua nhiều người phụ trách. Hãy mở hồ sơ có nhãn{" "}
        <strong>Việc của tôi</strong> để thực hiện bước đang chờ bạn.
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Nhìn nhanh danh sách
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between border-b pb-2 text-xs">
            <span className="font-bold text-slate-800">Hồ sơ Báo Giá</span>
            <span className="rounded bg-blue-600 px-2 py-1 font-bold text-white">
              + Tạo hồ sơ <Marker>1</Marker>
            </span>
          </div>
          <div className="mt-3 flex gap-2 text-[10px] text-slate-600">
            <span className="rounded border bg-white px-2 py-1">
              <Filter className="mr-1 inline size-3" /> Bộ lọc{" "}
              <Marker>2</Marker>
            </span>
            <span className="rounded border bg-white px-2 py-1">Giai đoạn</span>
          </div>
          <div className="mt-3 rounded-lg border bg-white p-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-bold text-blue-700">
                BG-2026-014
              </span>
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-600">
                Việc của tôi <Marker>3</Marker>
              </span>
            </div>
            <p className="mt-2 font-semibold text-slate-800">
              Kho lạnh khách hàng An Phú <Marker>4</Marker>
            </p>
            <span className="mt-2 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-violet-700">
              Duyệt khảo sát <Marker>5</Marker>
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
              Người có quyền tạo chọn <strong>Tạo hồ sơ mới</strong>, nhập khách
              hàng trước rồi nhập tên dự án và hạng mục thiết bị.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Tìm theo khách hàng; lọc theo hạng mục, trạng thái hoặc giai đoạn
              khi cần thu hẹp danh sách.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Nhãn đỏ nghĩa là bước hiện tại đang chờ quyền của bạn. Xử lý hồ sơ
              này để luồng không bị dừng.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>
              Nhấn mã hoặc tên dự án để mở chi tiết, lịch sử và thao tác của
              giai đoạn hiện tại.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>5</Marker>
            <span>
              Giai đoạn cho biết bước và bộ phận đang chịu trách nhiệm; trạng
              thái cho biết tình hình chung của hồ sơ.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-950">
          <Workflow className="size-4" /> Luồng báo giá
        </h3>
        <p className="mt-1 text-sm leading-5 text-violet-950">
          Luồng đi từ khảo sát, duyệt, thiết kế/bóc tách, định giá, hoàn thiện
          chào giá, gửi khách hàng, thương lượng rồi kết thúc thắng hoặc thua.
          Bạn chỉ cần thao tác ở bước được mở cho quyền của mình.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Eye className="size-4 text-blue-600" /> Lưu ý về giá bán
        </h3>
        <p className="mt-1 text-sm leading-5 text-slate-700">
          Cột giá bán mặc định được ẩn. Nhấn biểu tượng con mắt ở tiêu đề cột để
          hiện hoặc ẩn khi cần đối chiếu.
        </p>
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <FilePlus2 className="size-3.5" /> Hướng dẫn tạo hồ sơ và xử lý từng
        giai đoạn sẽ được đặt tại trang tương ứng.
      </p>
    </PageGuide>
  )
}
