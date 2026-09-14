import { Camera, FileCheck2, MessageCircle, TimerReset } from "lucide-react"

import { GuideMarker as Marker, PageGuide } from "@/components/Guide/PageGuide"

export function TaskDetailPageGuide() {
  return (
    <PageGuide
      title="Chi tiết công việc"
      description="Cập nhật tiến độ có bằng chứng, trao đổi với nhóm và xử lý khi có nguy cơ trễ hạn."
      triggerTestId="task-detail-guide-trigger"
      panelTestId="task-detail-guide"
      badges={
        <>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
            Người làm công việc
          </span>
          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
            Có phần cho quản lý
          </span>
        </>
      }
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm leading-5 text-blue-950">
        <strong>Trước khi bắt đầu:</strong> chỉ cập nhật phần công việc đã hoàn
        thành thực tế. Chuẩn bị một ảnh hoặc tài liệu hiện trường để gửi kèm báo
        cáo tiến độ.
      </section>

      <section aria-labelledby="task-detail-guide-map">
        <h3
          id="task-detail-guide-map"
          className="text-base font-bold text-slate-900"
        >
          Nhìn nhanh màn hình
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Mô phỏng HTML dưới đây minh hoạ nơi cần thao tác, không phải dữ liệu
          của công việc thật.
        </p>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-amber-700">
                📌 CÒN 2 NGÀY · 60%
              </span>
              <span className="rounded border px-1.5 py-0.5 text-[10px] text-slate-500">
                Quản lý ⋯ <Marker>1</Marker>
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-slate-800">
              Lắp đặt đường ống khu A
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-3/5 bg-blue-500" />
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              Hạn: 18/09/2026 · Người làm: Nguyễn Văn An <Marker>2</Marker>
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <span className="rounded-lg border border-blue-200 bg-blue-50 px-1 py-2 text-center text-[10px] font-bold text-blue-700">
                ✓ Cập nhật <Marker>3</Marker>
              </span>
              <span className="rounded-lg border bg-slate-50 px-1 py-2 text-center text-[10px] font-bold text-slate-700">
                💬 Thảo luận <Marker>4</Marker>
              </span>
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-1 py-2 text-center text-[10px] font-bold text-amber-700">
                ⏰ Gia hạn <Marker>5</Marker>
              </span>
            </div>
          </div>
          <div className="mt-3 rounded-lg border bg-white p-3">
            <div className="flex gap-1 text-[10px] font-semibold text-slate-500">
              <span className="rounded bg-blue-100 px-2 py-1 text-blue-700">
                Tiến độ
              </span>
              <span className="px-2 py-1">Thảo luận</span>
              <span className="px-2 py-1">Việc con</span>
              <span className="px-2 py-1">Lịch sử</span>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_82px] gap-2">
              <span className="rounded border px-2 py-2 text-[10px] text-slate-400">
                Chọn ảnh / tài liệu <Marker>6</Marker>
              </span>
              <span className="rounded border px-2 py-2 text-[10px] text-slate-500">
                20% <Marker>7</Marker>
              </span>
            </div>
            <span className="mt-2 block rounded bg-blue-600 px-3 py-2 text-center text-[10px] font-bold text-white">
              Gửi báo cáo <Marker>8</Marker>
            </span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Cách cập nhật tiến độ
        </h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Đọc <strong>hạn hoàn thành, người làm và % hiện tại</strong>. Nếu
              công việc có việc con, tiến độ cha có thể được tổng hợp từ các
              việc con.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Chọn <strong>Cập nhật tiến độ</strong> hoặc tab{" "}
              <strong>Tiến độ</strong> để mở form báo cáo.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>6</Marker>
            <span>
              Chọn <strong>ảnh hoặc tài liệu</strong> làm bằng chứng. Hệ thống
              yêu cầu file trước khi gửi báo cáo.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>7</Marker>
            <span>
              Nhập % hoàn thành cho lần báo cáo. Tổng tiến độ không được vượt
              100%; chỉ phần đã duyệt mới được tính là hoàn thành.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>8</Marker>
            <span>
              Chọn <strong>Gửi báo cáo</strong>. Khi đủ 100%, công việc sẽ
              chuyển sang chờ kiểm tra thay vì tự hoàn thành ngay.
            </span>
          </li>
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <MessageCircle className="size-4 text-blue-600" /> Cần trao đổi?
          </h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Chọn <strong>Thảo luận</strong> để ghi nội dung liên quan trực tiếp
            tới công việc; các thành viên được cập nhật theo thời gian thực.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <TimerReset className="size-4" /> Có nguy cơ trễ?
          </h3>
          <p className="mt-1 text-sm leading-5 text-amber-900">
            Người làm chính chọn <strong>Xin gia hạn</strong> và nêu lý do. Chỉ
            có một yêu cầu chờ duyệt tại một thời điểm.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-900">
          <FileCheck2 className="size-4" /> Dành cho quản lý
        </h3>
        <p className="mt-1 text-sm leading-5 text-violet-900">
          Menu <strong>⋯</strong> chỉ hiện với người có quyền quản lý. Tại đây
          có thể duyệt/đổi trạng thái, đổi người làm, thêm người cùng làm, điều
          chỉnh thời gian hoặc bàn giao công việc.
        </p>
      </section>

      <section className="rounded-xl border bg-slate-50 p-3 text-sm leading-5 text-slate-700">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <Camera className="size-4 text-slate-600" /> Lưu ý về bằng chứng
        </h3>
        <p className="mt-1">
          Nếu công việc yêu cầu check-in vị trí, hãy cho phép định vị trên thiết
          bị trước khi gửi báo cáo. Khi không lấy được vị trí, ghi rõ lý do
          trong ghi chú để quản lý kiểm tra.
        </p>
      </section>
    </PageGuide>
  )
}
