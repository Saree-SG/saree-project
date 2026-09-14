import { Megaphone, Paperclip, SendHorizontal, Users } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function ChatPageGuide() {
  return (
    <PageGuide
      title="Trao đổi trong Chat"
      description="Tạo nhóm, trao đổi nhanh và theo dõi thông báo chung trong công ty."
      triggerTestId="chat-page-guide-trigger"
      panelTestId="chat-page-guide"
      badges={<GuideMeta audience="Toàn bộ thành viên" detail="2 phút" />}
    >
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-5 text-blue-950">
        Mỗi phòng chat chỉ hiển thị cho thành viên của phòng. Chọn một phòng ở
        cột bên trái để đọc hoặc bắt đầu trao đổi.
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Tạo và chọn nhóm chat
        </h3>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="rounded-lg border bg-white p-3 text-xs text-slate-600">
            <div className="flex items-center justify-between border-b pb-2 font-bold text-slate-800">
              <span>Chat</span>
              <span className="flex items-center gap-2">
                <Megaphone className="size-4 text-amber-600" />
                <span className="rounded-full bg-slate-100 p-1 text-sm">
                  + <Marker>1</Marker>
                </span>
              </span>
            </div>
            <div className="mt-3 rounded-lg bg-blue-50 px-2 py-2 font-semibold text-blue-800">
              Nhóm triển khai <Marker>2</Marker>
              <span className="mt-1 block font-normal text-slate-500">
                Trao đổi tiến độ hôm nay…
              </span>
            </div>
          </div>
        </div>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Nhấn <strong>+</strong> để tạo nhóm mới. Đặt tên rõ theo dự án,
              phòng ban hoặc mục đích trao đổi.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Nhấn tên nhóm để mở hội thoại; danh sách tự thể hiện tin nhắn mới
              nhất.
            </span>
          </li>
        </ol>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">
          Gửi tin nhắn và tệp
        </h3>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 rounded-2xl border bg-white px-2 py-1.5 text-xs text-slate-500">
            <Paperclip className="size-4 shrink-0" /> <Marker>3</Marker>
            <span className="flex-1">Nhập tin nhắn…</span>
            <span className="flex size-7 items-center justify-center rounded-full bg-blue-600 text-white">
              <SendHorizontal className="size-3.5" /> <Marker>4</Marker>
            </span>
          </div>
        </div>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>3</Marker>
            <span>
              Nhấn kẹp giấy để đính kèm ảnh hoặc tệp. Tệp sẽ được gửi vào phòng
              chat đang mở.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>4</Marker>
            <span>
              Gõ nội dung và nhấn <strong>Enter</strong> để gửi; dùng{" "}
              <strong>Shift + Enter</strong> để xuống dòng.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-950">
          <Users className="size-4" /> Quản lý nhóm và thông báo chung
        </h3>
        <p className="mt-1 text-sm leading-5 text-violet-950">
          Mở menu <strong>⋮</strong> trong một nhóm để quản lý thành viên hoặc
          chỉnh sửa nhóm. Biểu tượng loa tạo/mở <strong>Thông báo chung</strong>
          {`; `}tại đây chỉ người quản lý được gửi tin. Khi mở một phòng, tin
          chưa đọc của chính phòng đó sẽ được đánh dấu đã đọc.
        </p>
      </section>
    </PageGuide>
  )
}
