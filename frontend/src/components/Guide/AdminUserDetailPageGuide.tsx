import { ExternalLink, UserCog } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function AdminUserDetailPageGuide() {
  return (
    <PageGuide
      title="Chi tiết người dùng"
      description="Xem và chỉnh sửa thông tin, vai trò, hoạt động và quyền của một tài khoản."
      triggerTestId="admin-user-detail-page-guide-trigger"
      panelTestId="admin-user-detail-page-guide"
      badges={<GuideMeta audience="Superuser / Admin" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Chỉnh sửa thông tin tài khoản, gán vai trò/phòng ban, và kiểm tra
          quyền hiệu lực hoặc lịch sử hoạt động của một người dùng cụ thể.
        </p>
      </section>

      <section aria-labelledby="admin-userdetail-guide-tabs">
        <h3
          id="admin-userdetail-guide-tabs"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <UserCog className="size-4" /> 4 tab <Marker>1</Marker>
        </h3>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border bg-white p-2.5">
            <p className="text-xs font-bold text-slate-800">Thông tin</p>
            <p className="text-[11px] text-slate-500">
              Sửa họ tên, trạng thái hoạt động, đặt lại mật khẩu.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-2.5">
            <p className="text-xs font-bold text-slate-800">
              Vai trò &amp; Phòng ban
            </p>
            <p className="text-[11px] text-slate-500">
              Thêm/gỡ người này khỏi một công ty, đổi vai trò hoặc phòng ban.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-2.5">
            <p className="text-xs font-bold text-slate-800">Hoạt động</p>
            <p className="text-[11px] text-slate-500">
              Lịch sử đăng nhập và hành động audit log liên quan đến người
              này.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-2.5">
            <p className="text-xs font-bold text-slate-800">Quyền</p>
            <p className="text-[11px] text-slate-500">
              Danh sách quyền hiệu lực hiện tại (suy ra từ vai trò đang giữ).
            </p>
          </div>
        </div>
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
