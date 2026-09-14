import { BarChart2, ExternalLink } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function KpiPageGuide() {
  return (
    <PageGuide
      title="KPI đội nhóm"
      description="Xem năng suất trung bình và của từng người dựa trên tiến độ công việc thật."
      triggerTestId="kpi-page-guide-trigger"
      panelTestId="kpi-page-guide"
      badges={<GuideMeta audience="Quản lý" detail="1 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          So sánh nhanh mức hoàn thành công việc trung bình của cả đội và của
          từng thành viên, để nhận diện ai đang cần hỗ trợ.
        </p>
      </section>

      <section aria-labelledby="kpi-guide-map">
        <h3
          id="kpi-guide-map"
          className="text-base font-bold text-slate-900"
        >
          Nhìn nhanh màn hình
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="rounded-lg border bg-white p-2.5 text-center">
            <p className="text-[10px] text-slate-400">
              Hoàn thành trung bình <Marker>1</Marker>
            </p>
            <p className="text-xl font-extrabold text-blue-700">78%</p>
          </div>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border bg-white p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-800">
                  Nguyễn Văn A <Marker>2</Marker>
                </p>
                <span className="text-xs font-bold text-blue-700">85%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-full w-[85%] rounded-full bg-blue-500" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-900">Cách đọc số liệu</h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              <strong>Hoàn thành trung bình</strong> là % tiến độ trung bình
              của mọi thành viên, tính từ báo cáo tiến độ thật (không phải số
              ước lượng).
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Mỗi hàng là % hoàn thành riêng của 1 người — người có thanh
              ngắn cần được kiểm tra xem có đang gặp khó khăn hay bị chặn.
            </span>
          </li>
        </ol>
      </section>

      <a
        href="/help"
        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
      >
        <BarChart2 className="size-3.5" /> Xem hướng dẫn đầy đủ{" "}
        <ExternalLink className="size-3.5" />
      </a>

      <p className="text-xs text-slate-400">
        Đã xác minh giao diện: đang chờ kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
