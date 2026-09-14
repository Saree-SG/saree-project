import { ExternalLink, Lock, ShieldAlert } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function SettingsPageGuide() {
  return (
    <PageGuide
      title="Cài đặt tài khoản"
      description="Đổi mật khẩu và các thao tác bảo mật tài khoản — kể cả xóa tài khoản."
      triggerTestId="settings-page-guide-trigger"
      panelTestId="settings-page-guide"
      badges={<GuideMeta audience="Mọi nhân viên" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Trang này chỉ tập trung vào bảo mật — thông tin cá nhân (họ tên,
          công ty...) chỉnh ở trang <strong>Hồ sơ</strong>.
        </p>
      </section>

      <section aria-labelledby="settings-guide-password">
        <h3
          id="settings-guide-password"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Lock className="size-4" /> Đổi mật khẩu <Marker>1</Marker>
        </h3>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Nhập mật khẩu hiện tại và mật khẩu mới — nên đổi ngay nếu nghi ngờ
          tài khoản bị lộ, hoặc định kỳ theo chính sách công ty.
        </p>
      </section>

      <section className="rounded-xl border border-red-200 bg-red-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-red-800">
          <ShieldAlert className="size-4" /> Vùng nguy hiểm <Marker>2</Marker>
        </h3>
        <p className="mt-1 text-sm leading-5 text-red-800">
          <strong>Xóa tài khoản</strong> là thao tác{" "}
          <strong>không thể hoàn tác</strong> — mất quyền truy cập toàn bộ dữ
          liệu, task và lịch sử gắn với tài khoản. Chỉ dùng khi thực sự chắc
          chắn; nếu chỉ muốn tạm ngưng, liên hệ quản lý để khóa tài khoản
          thay vì xóa.
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
