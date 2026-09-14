import { BookOpen, Search } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function HelpPageGuide() {
  return (
    <PageGuide
      title="Hướng dẫn sử dụng"
      description="Tài liệu tổng hợp toàn hệ thống — có mục lục và tìm kiếm."
      triggerTestId="help-page-guide-trigger"
      panelTestId="help-page-guide"
      badges={<GuideMeta audience="Mọi nhân viên" detail="30 giây" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Đây là trang khác với panel "Hướng dẫn trang này" (nhanh, theo ngữ
          cảnh) — trang này là <strong>tài liệu đầy đủ</strong>, dùng khi cần
          tra cứu sâu hơn hoặc đọc trước khi bắt đầu dùng hệ thống.
        </p>
      </section>

      <section aria-labelledby="help-guide-map">
        <h3
          id="help-guide-map"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <BookOpen className="size-4" /> Cách dùng <Marker>1</Marker>
        </h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              <strong>Mục lục bên trái</strong> liệt kê mọi phần theo cấp bậc
              — nhấn để nhảy thẳng tới đúng đoạn.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Ô <strong>Tìm trong hướng dẫn</strong> ở đầu mục lục — gõ từ
              khóa để làm nổi bật (highlight vàng) mọi chỗ xuất hiện trong
              tài liệu, không nhảy trang.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Search className="size-4 text-emerald-600" /> Lưu ý
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Nội dung trang này chỉ tổng hợp các trang đã được xác nhận đầy đủ —
          nếu chưa thấy phần bạn cần, dùng panel{" "}
          <strong>Hướng dẫn trang này</strong> ngay tại trang đó thay thế.
        </p>
      </section>

      <p className="text-xs text-slate-400">
        Đã xác minh giao diện: đang chờ kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
