import {
  Building2,
  ClipboardCheck,
  Contact,
  ExternalLink,
  Gauge,
  LayoutGrid,
  MapPin,
  ShieldCheck,
  Trophy,
  Users,
  Workflow,
} from "lucide-react"
import { useState } from "react"

import {
  GuideMeta,
  GuideMarker as Marker,
  PageGuide,
} from "@/components/Guide/PageGuide"

const TAB_UI: Record<
  string,
  { label: string; icon: React.ReactNode; audience: string; desc: string }
> = {
  overview: {
    label: "Tổng quan",
    icon: <LayoutGrid className="size-4" />,
    audience: "Quản lý công ty",
    desc: "6 chỉ số nhanh: Nhân sự, Vai trò, Phòng ban, Dự án, Tổng công việc, Đã hoàn thành, % Hoàn thành, Trễ hạn — quét sức khỏe tổ chức trong vài giây.",
  },
  org: {
    label: "Phòng ban & Nhân sự",
    icon: <Users className="size-4" />,
    audience: "Quản lý công ty",
    desc: "Tạo/sửa vai trò (tên hiển thị, cấp bậc, mô tả) kèm chọn danh sách quyền; tạo phòng ban; bảng thành viên công ty để đổi vai trò/phòng ban từng người.",
  },
  customers: {
    label: "Khách hàng",
    icon: <Contact className="size-4" />,
    audience: "Quản lý công ty",
    desc: "Danh sách công ty khách hàng (đối tác) gắn với báo giá/dự án — khác với \"Công ty\" (tenant) đang xem ở trang này.",
  },
  own: {
    label: "Công ty của tôi",
    icon: <MapPin className="size-4" />,
    audience: "Quản lý công ty",
    desc: "Đổi tên công ty, và đặt toạ độ trụ sở + bán kính cho phép chấm công theo công ty (khác cấu hình chấm công theo từng dự án).",
  },
  productivity: {
    label: "Năng suất tháng",
    icon: <Gauge className="size-4" />,
    audience: "Quản lý / Giám đốc",
    desc: "Giờ công + tỷ lệ hoàn thành công việc theo từng người trong 1 tháng chọn được — dùng làm cơ sở thi đua, khen thưởng.",
  },
  year: {
    label: "Năng suất năm",
    icon: <Trophy className="size-4" />,
    audience: "Quản lý / Giám đốc",
    desc: "Bảng xếp hạng năng suất cả năm, tổng hợp từ dữ liệu hàng tháng.",
  },
  attendance: {
    label: "Chấm công",
    icon: <ClipboardCheck className="size-4" />,
    audience: "Quản lý team chấm công",
    desc: "Xem chấm công nhân viên theo khoảng ngày: giờ vào/ra, vị trí check-in, cảnh báo ngoài vùng cho phép.",
  },
  approval: {
    label: "Phê duyệt",
    icon: <Workflow className="size-4" />,
    audience: "Giám đốc",
    desc: "Cấu hình ai duyệt đơn nghỉ phép: theo vai trò hoặc theo người cụ thể, nhiều bước tuần tự (bước nhỏ hơn duyệt trước). Để trống = mặc định gửi Giám đốc.",
  },
}

const TAB_ORDER = [
  "overview",
  "org",
  "customers",
  "own",
  "productivity",
  "year",
  "attendance",
  "approval",
]

export function CompanyPageGuide() {
  const [selectedTab, setSelectedTab] = useState<string>("overview")
  const tab = TAB_UI[selectedTab]

  return (
    <PageGuide
      title="Chi tiết công ty"
      description="8 khu vực: tổng quan, vai trò/quyền, phòng ban, thành viên, khách hàng, năng suất, chấm công và cấu hình duyệt."
      triggerTestId="company-page-guide-trigger"
      panelTestId="company-page-guide"
      badges={<GuideMeta audience="Giám đốc / Quản lý công ty" detail="4 phút" />}
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Bạn sẽ làm được gì?</p>
        <p className="mt-1 leading-5">
          Trang này gộp toàn bộ việc quản trị 1 công ty vào 8 tab — không cần
          nhảy qua nhiều trang riêng lẻ. Mỗi tab chỉ hiện khi bạn có quyền
          tương ứng.
        </p>
      </section>

      <section aria-labelledby="company-guide-tabs">
        <h3
          id="company-guide-tabs"
          className="text-base font-bold text-slate-900"
        >
          Chọn 1 tab để xem mô tả <Marker>1</Marker>
        </h3>
        <div className="mt-3 flex flex-wrap gap-1.5 rounded-lg border bg-slate-50 p-1.5 text-xs font-semibold">
          {TAB_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedTab(key)}
              className={[
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors",
                selectedTab === key
                  ? "bg-white text-slate-800 shadow"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {TAB_UI[key].icon}
              {TAB_UI[key].label}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border-2 border-indigo-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-white">
            {tab.icon}
            <div>
              <p className="text-sm font-bold">{tab.label}</p>
              <p className="text-[10px] text-indigo-100">
                Dành cho: {tab.audience}
              </p>
            </div>
          </div>
          <div className="p-3 text-sm leading-5 text-slate-700">
            {tab.desc}
          </div>
        </div>
      </section>

      <section aria-labelledby="company-guide-roles">
        <h3
          id="company-guide-roles"
          className="flex items-center gap-2 text-base font-bold text-slate-900"
        >
          <ShieldCheck className="size-4" /> Tạo vai trò &amp; gán quyền{" "}
          <Marker>2</Marker>
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Thao tác nằm trong tab <strong>Phòng ban &amp; Nhân sự</strong>.
        </p>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>a</Marker>
            <span>
              Đặt <strong>tên hiển thị</strong> (vd: "Trưởng Phòng Kinh
              Doanh") và <strong>cấp bậc</strong> — cấp thấp hơn thường có
              quyền cao hơn (1 = Giám đốc/quản lý cấp cao).
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>b</Marker>
            <span>
              Tick chọn từ <strong>danh mục quyền</strong> (ví dụ:
              QUOTATION_APPROVE_FINAL, TASK_UPDATE...) — chỉ những quyền này
              mới được vai trò đó sử dụng.
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-5 text-slate-700">
            <Marker>c</Marker>
            <span>
              Ở bảng thành viên, đổi <strong>vai trò</strong> hoặc{" "}
              <strong>phòng ban</strong> của một người bất kỳ lúc nào; người
              không phải vai trò chính (is_primary) có thể bị gỡ khỏi công
              ty.
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <Users className="size-4" /> Lưu ý quan trọng
        </h3>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Đổi quyền của một vai trò ảnh hưởng <strong>ngay lập tức</strong> đến
          mọi người đang giữ vai trò đó — cân nhắc kỹ trước khi bớt quyền của
          vai trò đang được nhiều người dùng. Toạ độ chấm công ở tab{" "}
          <strong>Công ty của tôi</strong> áp dụng cho cả công ty; nếu một dự
          án có công trường riêng, cấu hình vị trí ở dự án đó sẽ ưu tiên hơn.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Workflow className="size-4 text-emerald-600" /> Liên quan
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Yêu cầu kỹ năng của nhân viên được duyệt riêng ở trang{" "}
          <strong>Nhân viên</strong>; số liệu năng suất ở đây dùng chung nguồn
          dữ liệu với trang <strong>KPI đội nhóm</strong>.
        </p>
        <a
          href="/help"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
        >
          Xem hướng dẫn đầy đủ <ExternalLink className="size-3.5" />
        </a>
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Building2 className="size-3.5" /> Đã xác minh giao diện: đang chờ
        kiểm thử nghiệp vụ.
      </p>
    </PageGuide>
  )
}
