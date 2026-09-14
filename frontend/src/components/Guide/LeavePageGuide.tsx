import { CalendarDays, CheckCircle2, Inbox, XCircle } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function LeavePageGuide() {
  return (
    <PageGuide
      title="Xin nghỉ phép"
      description="Tạo đơn, theo dõi trạng thái và xử lý đơn cần duyệt theo đúng vai trò."
      triggerTestId="leave-page-guide-trigger"
      panelTestId="leave-page-guide"
      badges={<GuideMeta audience="Nhân viên & người duyệt" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm leading-5 text-blue-950">
        Đơn nghỉ được gửi theo quy trình duyệt của công ty. Sau khi gửi, theo
        dõi trạng thái ngay tại danh sách <strong>Đơn của tôi</strong>.
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Tạo đơn mới</h3>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs font-bold text-slate-800">
              <CalendarDays className="mr-1 inline size-4 text-blue-600" /> Tạo
              đơn mới
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
              <span className="rounded border px-2 py-2">
                Loại nghỉ <Marker>1</Marker>
              </span>
              <span className="rounded border px-2 py-2">
                Nửa ngày <Marker>2</Marker>
              </span>
              <span className="rounded border px-2 py-2">
                Từ ngày <Marker>3</Marker>
              </span>
              <span className="rounded border px-2 py-2">
                Đến ngày <Marker>3</Marker>
              </span>
            </div>
            <span className="mt-2 block rounded border px-2 py-3 text-[10px] text-slate-500">
              Lý do xin nghỉ (tuỳ chọn) <Marker>4</Marker>
            </span>
            <span className="mt-3 block rounded bg-blue-600 px-3 py-2 text-center text-[10px] font-bold text-white">
              Gửi đơn <Marker>5</Marker>
            </span>
          </div>
        </div>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Chọn loại nghỉ: nghỉ phép năm, nghỉ bệnh hoặc không lương.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Chỉ chọn <strong>nửa ngày</strong> khi ngày bắt đầu và kết thúc là
              cùng một ngày.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Chọn thời gian nghỉ. Ngày kết thúc không được trước ngày bắt đầu.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>
              Thêm lý do để người duyệt có đủ thông tin, đặc biệt với đơn gấp
              hoặc nghỉ nhiều ngày.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>5</Marker>
            <span>
              Chọn <strong>Gửi đơn</strong>. Trạng thái ban đầu là{" "}
              <strong>Chờ duyệt</strong>.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="text-sm font-bold text-slate-900">
          Theo dõi hoặc hủy đơn
        </h3>
        <p className="mt-1 text-sm leading-5 text-slate-700">
          Mỗi đơn hiển thị trạng thái Chờ duyệt, Đã duyệt, Từ chối hoặc Đã hủy.
          Bạn chỉ có thể <strong>Hủy đơn</strong> khi đơn còn chờ duyệt. Nếu bị
          từ chối, mở đơn để xem lý do của người duyệt.
        </p>
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-900">
          <Inbox className="size-4" /> Dành cho người duyệt
        </h3>
        <p className="mt-1 text-sm leading-5 text-violet-900">
          Khi có quyền duyệt, phần <strong>Cần tôi duyệt</strong> sẽ xuất hiện.
          Kiểm tra nhân viên, loại nghỉ, thời gian và lý do trước khi quyết
          định.
        </p>
        <div className="mt-3 flex gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1.5 text-white">
            <CheckCircle2 className="size-3" /> Duyệt
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1.5 text-white">
            <XCircle className="size-3" /> Từ chối
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-violet-900">
          Khi từ chối, nhập lý do rõ ràng để nhân viên biết cần điều chỉnh gì.
        </p>
      </section>
    </PageGuide>
  )
}
