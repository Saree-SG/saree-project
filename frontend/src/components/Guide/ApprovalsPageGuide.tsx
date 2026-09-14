import { CheckCircle2, ExternalLink, Inbox } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function ApprovalsPageGuide() {
  return (
    <PageGuide
      title="Phê duyệt"
      description="Hộp thư duyệt tập trung: nghỉ phép, kỹ năng, báo giá và hợp đồng đang chờ bạn."
      triggerTestId="approvals-page-guide-trigger"
      panelTestId="approvals-page-guide"
      badges={<GuideMeta audience="Quản lý / Giám đốc" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Xem mọi thứ đang chờ quyết định của bạn trong 1 trang — không cần đi
          từng module riêng lẻ để tìm việc cần duyệt.
        </p>
      </section>

      <section aria-labelledby="approvals-guide-sections">
        <h3
          id="approvals-guide-sections"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Inbox className="size-4" /> 5 khu vực trên trang <Marker>1</Marker>
        </h3>
        <div className="mt-3 space-y-2">
          {[
            ["Nghỉ phép chờ duyệt", "Đơn nghỉ của cấp dưới đang chờ bạn duyệt/từ chối."],
            ["Yêu cầu kỹ năng của tôi", "Kỹ năng bạn tự khai báo, đang chờ Giám đốc/Quản lý xác nhận."],
            ["Kỹ năng chờ duyệt", "Yêu cầu kỹ năng của nhân viên khác đang chờ bạn duyệt."],
            ["Báo giá chờ xử lý", "Hồ sơ báo giá đang ở bước cần bạn thao tác (khảo sát/thiết kế/duyệt...)."],
            ["Hợp đồng chờ phê duyệt", "Hợp đồng đã nộp, đang chờ Ban Giám Đốc duyệt."],
          ].map(([title, desc]) => (
            <div
              key={title}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <p className="text-sm font-bold text-slate-800">{title}</p>
              <p className="mt-1 text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Mỗi khu vực chỉ hiện khi có việc đang chờ, và hiển thị số lượng ở
          góc phải (ví dụ "3 mục").
        </p>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Cách sử dụng</h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Với nghỉ phép và kỹ năng: nhấn <strong>Duyệt</strong> hoặc{" "}
              <strong>Từ chối</strong> ngay tại thẻ, không cần rời trang.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Với báo giá/hợp đồng: nhấn vào thẻ để{" "}
              <strong>mở đúng trang chi tiết</strong> và thực hiện thao tác
              (thao tác các bước duyệt được xử lý ở trang chi tiết, không lặp
              lại ở đây).
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <CheckCircle2 className="size-4 text-emerald-600" /> Lưu ý
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Trang này chỉ hiện việc <strong>bạn có quyền duyệt</strong> — nếu
          không thấy khu vực nào, có thể bạn không giữ vai trò duyệt tương
          ứng (vd: chỉ Giám đốc mới thấy Hợp đồng chờ phê duyệt).
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
