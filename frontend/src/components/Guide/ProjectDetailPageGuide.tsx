import {
  BookTemplate,
  ExternalLink,
  GitBranch,
  ListTodo,
  Users,
} from "lucide-react"
import { useState } from "react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

const VIEW_UI: Record<
  "list" | "table" | "tree" | "gantt",
  { label: string; desc: string }
> = {
  list: {
    label: "Danh sách",
    desc: "Từng công việc dạng thẻ, kèm tiến độ, người phụ trách và hạn — phù hợp để đọc nhanh trên điện thoại.",
  },
  table: {
    label: "Bảng",
    desc: "Toàn bộ công việc dạng bảng để so sánh nhiều cột cùng lúc (trạng thái, hạn, người phụ trách...).",
  },
  tree: {
    label: "Cây",
    desc: "Công việc cha/con lồng nhau theo cấu trúc hạng mục. Nhấn ⋯ trên một hạng mục để Lưu làm mẫu hoặc thêm việc con.",
  },
  gantt: {
    label: "Gantt",
    desc: "Biểu đồ thời gian, thể hiện các mốc và phụ thuộc (task nào phải xong trước task nào) trên một trục ngày.",
  },
}

export function ProjectDetailPageGuide() {
  const [selectedView, setSelectedView] =
    useState<keyof typeof VIEW_UI>("list")

  return (
    <PageGuide
      title="Chi tiết dự án"
      description="4 chế độ xem công việc, nhân sự dự án, mẫu công việc và phụ thuộc giữa các task."
      triggerTestId="project-detail-page-guide-trigger"
      panelTestId="project-detail-page-guide"
      badges={<GuideMeta audience="Quản lý / Điều phối" detail="4 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Theo dõi tiến độ dự án qua 4 cách xem khác nhau, quản lý nhân sự,
          dựng cây công việc có phụ thuộc và tái sử dụng cấu trúc công việc
          bằng mẫu.
        </p>
      </section>

      <section aria-labelledby="project-guide-views">
        <h3
          id="project-guide-views"
          className="text-base font-bold text-slate-900"
        >
          4 chế độ xem công việc <Marker>1</Marker>
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Chọn một chế độ để xem mô tả tương ứng.
        </p>
        <div className="mt-3 flex gap-1.5 rounded-lg border bg-slate-50 p-1 text-xs font-semibold">
          {(Object.keys(VIEW_UI) as (keyof typeof VIEW_UI)[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setSelectedView(v)}
              className={[
                "flex-1 rounded-md px-2 py-1.5 transition-colors",
                selectedView === v
                  ? "bg-white text-slate-800 shadow"
                  : "text-slate-500",
              ].join(" ")}
            >
              {VIEW_UI[v].label}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-5 text-slate-700 shadow-sm">
          {VIEW_UI[selectedView].desc}
        </div>
      </section>

      <section aria-labelledby="project-guide-team">
        <h3
          id="project-guide-team"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Users className="size-4" /> Nhân sự dự án <Marker>2</Marker>
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-slate-50 p-2.5">
            <p className="truncate text-xs font-bold text-slate-800">
              Nguyễn Văn A
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              Kỹ thuật · 3 công việc
            </p>
            <span className="mt-1 inline-block rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">
              Sẵn sàng
            </span>
          </div>
          <div className="rounded-lg border bg-slate-50 p-2.5">
            <p className="truncate text-xs font-bold text-slate-800">
              Trần Thị B
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              Sản xuất · 6 công việc
            </p>
            <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-600">
              Quá tải
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm leading-5 text-slate-600">
          Thẻ nhân sự hiển thị số công việc đang thực hiện và cảnh báo{" "}
          <strong>Quá tải</strong> để điều phối lại việc. Khi chuyển dự án
          sang <strong>Đang triển khai</strong>, hệ thống yêu cầu xác nhận
          danh sách thành viên tham gia trước khi kích hoạt.
        </p>
      </section>

      <section aria-labelledby="project-guide-tree">
        <h3
          id="project-guide-tree"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <GitBranch className="size-4" /> Cây công việc & phụ thuộc{" "}
          <Marker>3</Marker>
        </h3>
        <p className="mt-2 text-sm leading-5 text-slate-700">
          Khi tạo công việc, mục <strong>"Task phụ thuộc trước (tuỳ chọn)"</strong>{" "}
          cho chọn 1 task khác phải hoàn thành trước — hệ thống sẽ cảnh báo
          nếu ngày bắt đầu chưa hợp lý so với task đó. Xem quan hệ này trực
          quan ở chế độ <strong>Gantt</strong> hoặc <strong>Cây</strong>.
        </p>
      </section>

      <section aria-labelledby="project-guide-template">
        <h3
          id="project-guide-template"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <BookTemplate className="size-4" /> Mẫu công việc <Marker>4</Marker>
        </h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>a</Marker>
            <span>
              Ở chế độ <strong>Cây</strong>, nhấn ⋯ trên một hạng mục có công
              việc con →<strong> Lưu làm mẫu</strong> để lưu toàn bộ cấu trúc
              con (kèm số ngày thực hiện) thành mẫu dùng lại.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>b</Marker>
            <span>
              Khi tạo công việc mới, chọn <strong>Chọn từ mẫu</strong> để tự
              động tạo hàng loạt công việc con theo mẫu đã lưu — tiết kiệm thời
              gian dựng lại cấu trúc quen thuộc (ví dụ: quy trình lắp đặt IQF).
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>c</Marker>
            <span>
              Nút <strong>Mẫu</strong> ở góc khu vực Công việc mở danh sách
              toàn bộ mẫu của công ty để xem, áp dụng hoặc chỉnh sửa.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="text-sm font-bold text-amber-900">Lưu ý quan trọng</h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Chỉ chuyển dự án sang <strong>Đang triển khai</strong> khi nhân sự đã
          được thêm đầy đủ; công việc tự động tạo khi hợp đồng chuyển sản xuất
          sẽ được gán theo vai trò (chức vụ) của thành viên trong công ty.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <ListTodo className="size-4 text-emerald-600" /> Việc tiếp theo
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Mở một công việc để xem hướng dẫn cập nhật tiến độ, bằng chứng và
          gia hạn.
        </p>
        <a
          href="/help"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
        >
          Xem hướng dẫn đầy đủ <ExternalLink className="size-3.5" />
        </a>
      </section>

      <p className="text-xs text-slate-400">
        Đã xác minh giao diện: đang chờ kiểm thử nghiệp vụ (team, 4 view, cây
        công việc, mẫu và dependency).
      </p>
    </PageGuide>
  )
}
