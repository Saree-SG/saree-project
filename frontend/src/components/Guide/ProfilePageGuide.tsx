import { CalendarOff, ClipboardCheck, ExternalLink, UserRound } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function ProfilePageGuide() {
  return (
    <PageGuide
      title="Hồ sơ cá nhân"
      description="Thông tin tài khoản, lối tắt chấm công/nghỉ phép và lịch sử đơn nghỉ gần đây."
      triggerTestId="profile-page-guide-trigger"
      panelTestId="profile-page-guide"
      badges={<GuideMeta audience="Mọi nhân viên" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Xem nhanh công ty/vai trò của mình, cập nhật thông tin cá nhân, và
          đi thẳng tới chấm công hoặc xin nghỉ mà không cần tìm menu.
        </p>
      </section>

      <section aria-labelledby="profile-guide-map">
        <h3
          id="profile-guide-map"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <UserRound className="size-4" /> Nhìn nhanh màn hình
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-white p-2 text-center">
              <p className="text-[9px] text-slate-400">Email</p>
              <p className="truncate text-[10px] font-semibold">a@vd.vn</p>
            </div>
            <div className="rounded-lg border bg-white p-2 text-center">
              <p className="text-[9px] text-slate-400">Công ty</p>
              <p className="truncate text-[10px] font-semibold">Saree JSC</p>
            </div>
            <div className="rounded-lg border bg-white p-2 text-center">
              <p className="text-[9px] text-slate-400">Vai trò</p>
              <p className="truncate text-[10px] font-semibold">Kỹ thuật</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <span className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white">
              <ClipboardCheck className="size-3" /> Chấm công <Marker>1</Marker>
            </span>
            <span className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white">
              <CalendarOff className="size-3" /> Xin nghỉ <Marker>2</Marker>
            </span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Các phần chính</h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              2 nút lối tắt đi thẳng tới <strong>Chấm công</strong> và{" "}
              <strong>Xin nghỉ phép</strong>.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              <strong>Đơn nghỉ gần đây</strong> — 5 đơn mới nhất kèm trạng
              thái, chỉ hiện khi có dữ liệu.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              <strong>Thông tin tài khoản</strong> — sửa họ tên và các trường
              cá nhân khác.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>
              <strong>Sơ đồ tổ chức</strong> của công ty chính bạn đang thuộc
              về, để biết mình nằm ở đâu trong cây tổ chức.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="text-sm font-bold text-amber-900">Lưu ý</h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Nút <strong>Làm mới ứng dụng</strong> ở cuối trang chỉ cần dùng khi
          app hiển thị sai hoặc chưa cập nhật phiên bản mới — thông báo đẩy
          của bạn vẫn được giữ nguyên sau khi làm mới.
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
