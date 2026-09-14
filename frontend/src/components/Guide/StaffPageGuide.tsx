import { CheckCircle2, ExternalLink, Users } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function StaffPageGuide() {
  return (
    <PageGuide
      title="Nhân viên"
      description="Duyệt yêu cầu kỹ năng và theo dõi tải trọng, năng suất từng người."
      triggerTestId="staff-page-guide-trigger"
      panelTestId="staff-page-guide"
      badges={<GuideMeta audience="Quản lý / HR" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Duyệt kỹ năng nhân viên tự khai báo, xem ai đang rảnh/quá tải và
          năng suất từng người trong tháng.
        </p>
      </section>

      <section aria-labelledby="staff-guide-approval">
        <h3
          id="staff-guide-approval"
          className="text-base font-bold text-slate-900"
        >
          Yêu cầu duyệt kỹ năng <Marker>1</Marker>
        </h3>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
              3
            </span>
            <p className="text-sm font-semibold text-amber-900">
              Yêu cầu duyệt kỹ năng
            </p>
          </div>
          <div className="mt-2 rounded-lg border bg-white p-2.5">
            <p className="text-xs font-semibold text-slate-800">
              Trần Thị B · 2 kỹ năng
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-800">
                Hàn TIG · Cấp 3
              </span>
            </div>
            <div className="mt-2 flex gap-1.5">
              <span className="rounded-lg bg-green-600 px-2.5 py-1 text-[10px] font-bold text-white">
                Duyệt <Marker>2</Marker>
              </span>
              <span className="rounded-lg border px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                Từ chối <Marker>3</Marker>
              </span>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Chỉ hiện khi có yêu cầu đang chờ. Nhân viên tự khai báo kỹ năng ở
          Hồ sơ; bạn <strong>Duyệt</strong> để kỹ năng được công nhận (dùng
          cho điều phối tự động), hoặc <strong>Từ chối</strong> kèm lý do.
        </p>
      </section>

      <section aria-labelledby="staff-guide-list">
        <h3
          id="staff-guide-list"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Users className="size-4" /> Danh sách nhân sự <Marker>4</Marker>
        </h3>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Mỗi thẻ hiển thị: phòng ban, trạng thái tải trọng (
          <strong>Rảnh</strong> / <strong>Đang làm</strong> /{" "}
          <strong>Quá tải</strong>), số công việc đang thực hiện, số giờ làm
          và % hoàn thành trong tháng — dùng để cân đối lại phân công khi ai
          đó quá tải.
        </p>
      </section>

      <a
        href="/help"
        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
      >
        <CheckCircle2 className="size-3.5" /> Xem hướng dẫn đầy đủ{" "}
        <ExternalLink className="size-3.5" />
      </a>

      <p className="text-xs text-slate-400">
        Đã xác minh giao diện: đang chờ kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
