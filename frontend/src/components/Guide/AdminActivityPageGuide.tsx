import { ExternalLink, ScrollText, Search } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function AdminActivityPageGuide() {
  return (
    <PageGuide
      title="Nhật ký hoạt động"
      description="Toàn bộ hành động ghi nhận trên hệ thống — ai làm gì, khi nào."
      triggerTestId="admin-activity-page-guide-trigger"
      panelTestId="admin-activity-page-guide"
      badges={<GuideMeta audience="Superuser / Admin" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Tra cứu audit log: ai đã tạo/sửa/xóa gì, lúc nào — phục vụ điều tra
          sự cố hoặc kiểm tra tuân thủ.
        </p>
      </section>

      <section aria-labelledby="admin-activity-guide-map">
        <h3
          id="admin-activity-guide-map"
          className="text-base font-bold text-slate-900"
        >
          Đọc 1 dòng nhật ký <Marker>1</Marker>
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-5 gap-2 border-b bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500">
            <span>Thời gian</span>
            <span>Người thực hiện</span>
            <span>Hành động</span>
            <span>Đối tượng</span>
            <span>Thay đổi</span>
          </div>
          <div className="grid grid-cols-5 gap-2 px-3 py-2 text-[11px]">
            <span className="text-slate-400">10/09 14:22</span>
            <span className="font-medium text-slate-700">Nguyễn Văn A</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
              task.updated
            </span>
            <span className="text-slate-500">task · 8f3a...</span>
            <span className="truncate text-slate-400">
              {"{status: done}"}
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="admin-activity-guide-filter">
        <h3
          id="admin-activity-guide-filter"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Search className="size-4" /> Tìm kiếm &amp; lọc <Marker>2</Marker>
        </h3>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Gõ tên người dùng hoặc tên hành động vào ô tìm kiếm; chọn{" "}
          <strong>Loại đối tượng</strong> (quotation, task, project...) để thu
          hẹp danh sách. Nhấn tên người thực hiện để mở thẳng trang chi tiết
          người dùng đó.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <ScrollText className="size-4 text-emerald-600" /> Lưu ý
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Danh sách chỉ tải 200 bản ghi gần nhất và tự làm mới mỗi phút — với
          sự cố xảy ra lâu hơn, thu hẹp bằng bộ lọc đối tượng trước khi tìm.
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
