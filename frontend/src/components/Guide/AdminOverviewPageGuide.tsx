import { Activity, ExternalLink, Users } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function AdminOverviewPageGuide() {
  return (
    <PageGuide
      title="Tổng quan hệ thống"
      description="Số liệu người dùng, phiên đăng nhập và hoạt động toàn hệ thống."
      triggerTestId="admin-overview-page-guide-trigger"
      panelTestId="admin-overview-page-guide"
      badges={<GuideMeta audience="Superuser / Admin" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Theo dõi sức khỏe hệ thống ở tầm nhìn cao nhất: bao nhiêu người
          dùng, ai đang online, tổ chức có bao nhiêu công ty/phòng ban/vai
          trò.
        </p>
      </section>

      <section aria-labelledby="admin-overview-guide-kpi">
        <h3
          id="admin-overview-guide-kpi"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Users className="size-4" /> 4 số liệu chính <Marker>1</Marker>
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-white p-2.5 text-center">
            <p className="text-[10px] text-slate-400">Tổng người dùng</p>
            <p className="text-lg font-extrabold text-blue-700">248</p>
          </div>
          <div className="rounded-lg border bg-white p-2.5 text-center">
            <p className="text-[10px] text-slate-400">Đang online</p>
            <p className="text-lg font-extrabold text-emerald-600">37</p>
          </div>
          <div className="rounded-lg border bg-white p-2.5 text-center">
            <p className="text-[10px] text-slate-400">Login hôm nay</p>
            <p className="text-lg font-extrabold text-amber-600">64</p>
          </div>
          <div className="rounded-lg border bg-white p-2.5 text-center">
            <p className="text-[10px] text-slate-400">Tổ chức</p>
            <p className="text-lg font-extrabold text-violet-600">5 CT</p>
          </div>
        </div>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Dữ liệu tự làm mới mỗi 30 giây — không cần tải lại trang.
        </p>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Biểu đồ &amp; bảng bên dưới
        </h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              <strong>Tần suất đăng nhập</strong> 30 ngày qua — phát hiện sụt
              giảm bất thường (nhân viên nghỉ, tài khoản khóa...).
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              <strong>Top người dùng hoạt động nhiều nhất</strong> trong 7
              ngày.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              <strong>Phiên đang hoạt động</strong> — danh sách chi tiết ai
              đang đăng nhập, từ thiết bị/IP nào.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Activity className="size-4 text-emerald-600" /> Liên quan
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Chi tiết từng thay đổi (ai sửa gì) xem ở trang{" "}
          <strong>Nhật ký hoạt động</strong>.
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
