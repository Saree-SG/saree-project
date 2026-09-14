import { Building2, ExternalLink } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function AdminCompaniesPageGuide() {
  return (
    <PageGuide
      title="Công ty & Phân quyền (Admin)"
      description="Tạo công ty mới và quản lý vai trò, phòng ban, thành viên của mọi công ty."
      triggerTestId="admin-companies-page-guide-trigger"
      panelTestId="admin-companies-page-guide"
      badges={<GuideMeta audience="Superuser" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Trang này giống trang <strong>Công ty</strong> thông thường nhưng
          cho phép chọn <strong>bất kỳ công ty nào</strong> trong hệ thống,
          không chỉ công ty của bạn — dành cho superuser vận hành nhiều
          tenant.
        </p>
      </section>

      <section aria-labelledby="admin-companies-guide-map">
        <h3
          id="admin-companies-guide-map"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Building2 className="size-4" /> Cách dùng <Marker>1</Marker>
        </h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Cột trái là <strong>danh sách công ty</strong> — chọn 1 công ty
              để xem chi tiết bên phải.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              4 tab bên phải: <strong>Thông tin</strong>,{" "}
              <strong>Vai trò</strong>, <strong>Phòng ban</strong>,{" "}
              <strong>Thành viên</strong> — thao tác giống hệt trang Công ty
              thông thường.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Nút <strong>+ Tạo công ty</strong> ở góc trên tạo tenant mới
              cho hệ thống.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="text-sm font-bold text-amber-900">Lưu ý quan trọng</h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Đây là trang duy nhất cho phép xem/sửa dữ liệu tổ chức của{" "}
          <strong>mọi công ty</strong> cùng lúc — chỉ superuser nên có quyền
          truy cập, tránh rò rỉ hoặc chỉnh sai dữ liệu công ty khác.
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
