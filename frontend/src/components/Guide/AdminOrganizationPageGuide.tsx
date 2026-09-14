import { ExternalLink, Network } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function AdminOrganizationPageGuide() {
  return (
    <PageGuide
      title="Sơ đồ tổ chức"
      description="Cây vị trí công ty theo phòng ban và vai trò, xuất được ra ảnh PNG."
      triggerTestId="admin-organization-page-guide-trigger"
      panelTestId="admin-organization-page-guide"
      badges={<GuideMeta audience="Superuser / Giám đốc" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Xem trực quan ai thuộc phòng ban nào, giữ vai trò gì — và xuất sơ đồ
          thành ảnh để đưa vào tài liệu/báo cáo.
        </p>
      </section>

      <section aria-labelledby="admin-org-guide-map">
        <h3
          id="admin-org-guide-map"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Network className="size-4" /> Cách dùng <Marker>1</Marker>
        </h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Chọn <strong>công ty</strong> ở góc trên — superuser thấy mọi
              công ty, người dùng thường chỉ thấy công ty mình thuộc về.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Cây hiển thị theo <strong>phòng ban</strong>, trong mỗi phòng
              ban xếp theo <strong>cấp bậc vai trò</strong> (cao → thấp).
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Nhấn <strong>Xuất PNG</strong> để tải ảnh sơ đồ hiện tại về máy.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="text-sm font-bold text-slate-900">Lưu ý</h3>
        <p className="mt-1 text-sm text-slate-600">
          Nếu công ty chưa có phòng ban hoặc thành viên, sơ đồ sẽ rỗng — vào
          trang <strong>Công ty</strong> để tạo phòng ban và thêm thành viên
          trước.
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
