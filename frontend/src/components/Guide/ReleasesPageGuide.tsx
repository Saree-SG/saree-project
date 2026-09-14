import { ExternalLink, Sparkles } from "lucide-react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

export function ReleasesPageGuide() {
  return (
    <PageGuide
      title="Nhật ký phát hành"
      description="Mọi tính năng mới, cải tiến và sửa lỗi — theo từng phiên bản Saree ERP."
      triggerTestId="releases-page-guide-trigger"
      panelTestId="releases-page-guide"
      badges={<GuideMeta audience="Mọi nhân viên" detail="30 giây" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Xem hệ thống vừa thay đổi gì — hữu ích khi thấy giao diện khác lạ và
          muốn biết đó là tính năng mới hay lỗi.
        </p>
      </section>

      <section aria-labelledby="releases-guide-map">
        <h3
          id="releases-guide-map"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <Sparkles className="size-4" /> Cách đọc <Marker>1</Marker>
        </h3>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>1</Marker>
            <span>
              Danh sách xếp theo <strong>phiên bản mới nhất trước</strong>,
              mỗi mục có ngày phát hành và tóm tắt.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>2</Marker>
            <span>
              Mỗi dòng thay đổi có <strong>nhãn màu</strong> cho biết loại:
              tính năng mới, cải tiến, hay sửa lỗi.
            </span>
          </li>
        </ol>
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
