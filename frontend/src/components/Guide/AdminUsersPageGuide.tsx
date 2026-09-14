import { ExternalLink, ShieldCheck, UserPlus } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function AdminUsersPageGuide() {
  return (
    <PageGuide
      title="Người dùng (Admin)"
      description="Tạo tài khoản mới, tìm người dùng và mở chi tiết để quản lý vai trò/quyền."
      triggerTestId="admin-users-page-guide-trigger"
      panelTestId="admin-users-page-guide"
      badges={<GuideMeta audience="Superuser / Admin" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Quản trị toàn bộ tài khoản trong hệ thống: tạo mới, tìm kiếm, và mở
          chi tiết để chỉnh sửa vai trò, phòng ban, quyền của từng người.
        </p>
      </section>

      <section aria-labelledby="admin-users-guide-map">
        <h3
          id="admin-users-guide-map"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <UserPlus className="size-4" /> Tạo tài khoản mới <Marker>1</Marker>
        </h3>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Nút <strong>+ Thêm người dùng</strong> ở góc trên bên phải mở form
          tạo tài khoản (email, mật khẩu, họ tên). Sau khi tạo, vào chi tiết
          người dùng để gán vai trò/phòng ban.
        </p>
      </section>

      <section aria-labelledby="admin-users-guide-detail">
        <h3
          id="admin-users-guide-detail"
          className="text-base font-bold text-slate-900"
        >
          4 tab chi tiết người dùng <Marker>2</Marker>
        </h3>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border bg-white p-2.5">
            <p className="text-xs font-bold text-slate-800">Thông tin</p>
            <p className="text-[11px] text-slate-500">
              Họ tên, email, trạng thái active/inactive, đổi mật khẩu.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-2.5">
            <p className="text-xs font-bold text-slate-800">
              Vai trò &amp; Phòng ban
            </p>
            <p className="text-[11px] text-slate-500">
              Danh sách công ty/vai trò người này đang giữ — có thể thuộc
              nhiều công ty cùng lúc.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-2.5">
            <p className="text-xs font-bold text-slate-800">Hoạt động</p>
            <p className="text-[11px] text-slate-500">
              Lịch sử đăng nhập và hành động gần đây của người này.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-2.5">
            <p className="text-xs font-bold text-slate-800">Quyền</p>
            <p className="text-[11px] text-slate-500">
              Toàn bộ quyền hiệu lực (suy ra từ vai trò) — chỉ để xem, sửa
              quyền phải làm ở cấp vai trò tại trang Công ty.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <ShieldCheck className="size-4" /> Lưu ý
        </h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Nhãn <strong>Superuser</strong> là quyền quản trị toàn hệ thống,
          vượt trên mọi công ty — chỉ gán cho người thực sự cần vận hành hệ
          thống.
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
