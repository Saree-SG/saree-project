/**
 * Release notes shown in the "Có gì mới" popup and the full /releases page.
 * Add a new entry at the TOP of this array on every user-facing release —
 * `version` must be unique and is what gets stored as the user's
 * `last_seen_release_version` once they open the popup, so it must change
 * for the unread badge to reappear.
 *
 * `version` is ALSO the version shown in the app header (vite.config.ts reads
 * the newest entry here). This file is the single source of truth: package.json
 * is not used for the displayed version, because keeping two places in sync by
 * hand is what left the header stuck at v1.0.0.
 *
 * `icon` must be a key exported from lucide-react (checked against the
 * ICON_MAP in ReleaseIcon.tsx) — pick one that represents the release's main
 * theme. `items[].type` drives the badge shown next to each line:
 *   "new"      Mới        — a feature that didn't exist before
 *   "improved" Cải tiến   — an existing feature got better
 *   "fixed"    Sửa lỗi    — a bug fix
 *
 * Use semver:
 *   patch (1.0.0 → 1.0.1)  sửa lỗi, không đổi cách dùng
 *   minor (1.0.1 → 1.1.0)  thêm tính năng, không phá cái cũ
 *   major (1.1.0 → 2.0.0)  refactor lớn / thay đổi phá vỡ cách dùng cũ
 *
 * Quy trình phát hành đầy đủ: docs/release-process.md
 */
export type ReleaseNoteItemType = "new" | "improved" | "fixed"

export type ReleaseNoteItem = {
  text: string
  type: ReleaseNoteItemType
}

export type ReleaseNote = {
  version: string
  date: string // dd/MM/yyyy, for display only
  title: string
  summary: string
  icon: string
  items: ReleaseNoteItem[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.2.0",
    date: "26/07/2026",
    title: "Bản đồ mới, trang phê duyệt chung & quản lý kỹ năng",
    summary:
      "Gom mọi phê duyệt về một chỗ, bản đồ dễ nhìn hơn, thêm luồng duyệt kỹ năng nhân viên.",
    icon: "Map",
    items: [
      {
        type: "new",
        text: "Trang /approvals mới: xem và xử lý tất cả phê duyệt ở một chỗ — nghỉ phép, báo giá, hợp đồng, kỹ năng.",
      },
      {
        type: "new",
        text: "Trang /skill-requests mới: nhân viên theo dõi đơn kỹ năng của mình, quản lý duyệt inline có lý do từ chối.",
      },
      {
        type: "improved",
        text: "Bản đồ tổng quan: icon mới dễ đọc (công trình / khách hàng / nhân sự), tự gom cụm khi nhiều điểm chồng nhau, bật/tắt từng lớp riêng biệt.",
      },
      {
        type: "improved",
        text: "Widget 'Chờ phê duyệt' trong /tasks dùng dữ liệu thật, thiết kế lại rõ ràng hơn với icon và divider từng loại.",
      },
      {
        type: "improved",
        text: "Báo giá và hợp đồng trong trang phê duyệt: nhấn vào mở đúng trang chi tiết.",
      },
      {
        type: "improved",
        text: "Quyền SKILL_APPROVE tự động gán cho giám đốc và quản lý — không cần cấu hình thủ công.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "26/07/2026",
    title: "Biểu đồ Gantt mới",
    summary:
      "Gantt làm lại từ đầu: mở lên là thấy ngay hôm nay, dùng mượt trên điện thoại.",
    icon: "GanttChartSquare",
    items: [
      {
        type: "new",
        text: 'Thêm tab "Tổng quan dự án": mỗi dòng là một dự án kèm % tiến độ, bấm vào để mở chi tiết.',
      },
      {
        type: "new",
        text: "Có mũi tên nối các công việc phụ thuộc nhau; bấm vào công việc để mở trang chi tiết.",
      },
      {
        type: "improved",
        text: "Mở biểu đồ Gantt là tự nhảy tới hôm nay, vạch vàng đánh dấu ngày hiện tại, kéo ngang luôn thấy mình đang ở ngày nào.",
      },
      {
        type: "improved",
        text: "Dùng tốt trên điện thoại — vừa kéo ngang biểu đồ vừa cuộn dọc trang được.",
      },
      {
        type: "improved",
        text: "Công việc trễ hạn và sắp đến hạn hiện rõ bằng màu, kèm bảng chú thích màu ngay dưới biểu đồ.",
      },
      {
        type: "improved",
        text: "Lọc theo trạng thái, người phụ trách, hoặc chỉ xem việc trên đường găng (critical path).",
      },
      {
        type: "fixed",
        text: "Xuất ảnh PNG giờ ra trọn biểu đồ, không còn cắt mất phần ngoài màn hình.",
      },
      {
        type: "improved",
        text: "Giám đốc và quản lý cấp 1–2 xem được toàn bộ dự án của công ty trong phần Tổng quan.",
      },
    ],
  },
  {
    version: "2026.07.25",
    date: "25/07/2026",
    title: "Cập nhật báo cáo tiến độ & quản lý dự án",
    summary:
      "Nộp báo cáo tiến độ bằng file văn phòng, tự giao việc, dọn dẹp dự án cũ dễ hơn.",
    icon: "ClipboardCheck",
    items: [
      {
        type: "new",
        text: "Cập nhật tiến độ giờ đây nhận thêm file Word, Excel, PowerPoint, PDF — không chỉ ảnh hiện trường.",
      },
      {
        type: "new",
        text: "Có thể tự giao việc cho chính mình khi tạo hạng mục/công việc mới.",
      },
      {
        type: "improved",
        text: "Chủ dự án, admin và quản lý (cấp 1–2) có thể xóa dự án hoặc hạng mục không còn cần thiết.",
      },
    ],
  },
]

export const LATEST_RELEASE_VERSION = RELEASE_NOTES[0]?.version ?? ""
