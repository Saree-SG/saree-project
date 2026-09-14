import { Clock, ExternalLink, Star } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function SkillRequestsPageGuide() {
  return (
    <PageGuide
      title="Yêu cầu kỹ năng"
      description="Theo dõi trạng thái yêu cầu kỹ năng của bạn, và duyệt yêu cầu của người khác."
      triggerTestId="skill-requests-page-guide-trigger"
      panelTestId="skill-requests-page-guide"
      badges={<GuideMeta audience="Nhân viên / Quản lý" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Xem yêu cầu nâng cấp kỹ năng của mình đang ở trạng thái nào, và (nếu
          là quản lý) duyệt/từ chối yêu cầu của nhân viên.
        </p>
      </section>

      <section aria-labelledby="skillreq-guide-map">
        <h3
          id="skillreq-guide-map"
          className="text-base font-bold text-slate-900"
        >
          Nhìn nhanh màn hình
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="text-xs font-bold uppercase text-amber-700">
              Cần tôi duyệt <Marker>1</Marker>
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 pb-2">
            <Clock className="size-3.5 text-violet-600" />
            <span className="text-xs font-bold uppercase text-slate-600">
              Đơn của tôi <Marker>2</Marker>
            </span>
          </div>
          <div className="rounded-lg border bg-white p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                12/09/2026 · 2 kỹ năng
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                Chờ duyệt <Marker>3</Marker>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Cách sử dụng</h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              <strong>Cần tôi duyệt</strong> chỉ hiện nếu bạn có quyền duyệt
              kỹ năng — duyệt hoặc từ chối (kèm lý do) yêu cầu của người khác.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              <strong>Đơn của tôi</strong> là lịch sử yêu cầu bạn đã gửi —
              theo dõi trạng thái theo thời gian.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              4 trạng thái: <strong>Chờ duyệt</strong>,{" "}
              <strong>Đã duyệt</strong>, <strong>Từ chối</strong>,{" "}
              <strong>Đã huỷ</strong>.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Star className="size-4 text-violet-600" /> Gửi yêu cầu mới
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Khai báo/nâng cấp kỹ năng từ thẻ của bạn ở trang{" "}
          <strong>Nhân viên</strong> — yêu cầu sẽ xuất hiện tại đây để theo
          dõi.
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
