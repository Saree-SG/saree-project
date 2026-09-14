import { Building2, ClipboardList, ExternalLink, FolderOpen } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function ProjectsPageGuide() {
  return (
    <PageGuide
      title="Danh sách dự án"
      description="Xem toàn bộ dự án đang triển khai, lọc theo loại và tạo dự án mới."
      triggerTestId="projects-page-guide-trigger"
      panelTestId="projects-page-guide"
      badges={<GuideMeta audience="Quản lý / Điều phối" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Tìm nhanh một dự án theo tên/mã, lọc theo loại và tạo dự án mới —
          từ báo giá đã thắng hoặc tạo trực tiếp cho công việc nội bộ.
        </p>
      </section>

      <section aria-labelledby="projects-guide-map">
        <h3
          id="projects-guide-map"
          className="text-base font-bold text-slate-900"
        >
          Nhìn nhanh màn hình
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <p className="text-sm font-bold text-slate-800">
              Dự án <Marker>1</Marker>
            </p>
            <span className="rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white">
              + Tạo dự án <Marker>2</Marker>
            </span>
          </div>
          <div className="flex gap-2 py-3">
            <span className="flex-1 rounded-md border bg-white px-2 py-1.5 text-[10px] text-slate-400">
              Tìm theo tên hoặc mã dự án...
            </span>
            <span className="rounded-md border bg-white px-2 py-1.5 text-[10px] text-slate-500">
              Loại dự án <Marker>3</Marker>
            </span>
          </div>
          <div className="space-y-2">
            <div className="rounded-lg border border-slate-100 bg-white p-2.5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-800">
                  Kho lạnh An Phú
                </p>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-medium text-blue-700">
                  Dự án khách hàng
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                PRJ-BG-2026-014 <Marker>4</Marker>
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-white p-2.5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-800">
                  Sửa chữa xưởng nội bộ
                </p>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-medium text-purple-700">
                  Dự án nội bộ
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">INT-20260910</p>
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
              <strong>Danh sách hiển thị mọi dự án bạn có quyền xem</strong> —
              cả dự án khách hàng (tạo từ báo giá thắng) và dự án nội bộ.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              <strong>Tạo dự án mới.</strong> Chọn{" "}
              <strong>Dự án khách hàng</strong> để chuyển sang quy trình báo
              giá, hoặc <strong>Dự án nội bộ</strong> để nhập tên, ngày bắt
              đầu/kết thúc và tạo ngay — không cần báo giá.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              <strong>Lọc theo loại dự án</strong> khi danh sách quá dài.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>
              <strong>Nhấn vào một dự án</strong> để xem chi tiết: tiến độ,
              công việc, nhân sự và Gantt.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <Building2 className="size-4" /> Lưu ý
        </h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Dự án khách hàng luôn gắn với 1 báo giá đã thắng (won) — không thể
          tạo trực tiếp tại đây. Nếu thuộc nhiều công ty, hãy chọn đúng công ty
          khi tạo dự án nội bộ.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <ClipboardList className="size-4 text-emerald-600" /> Việc tiếp theo
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Mở một dự án để xem hướng dẫn về 4 chế độ xem công việc, cây công
          việc, mẫu và phụ thuộc.
        </p>
        <a
          href="/help"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
        >
          Xem hướng dẫn đầy đủ <ExternalLink className="size-3.5" />
        </a>
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <FolderOpen className="size-3.5" /> Đã xác minh giao diện: đang chờ
        kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
