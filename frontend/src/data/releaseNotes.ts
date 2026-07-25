/**
 * Release notes shown in the "Có gì mới" popup. Add a new entry at the TOP of
 * this array on every user-facing release — `version` must be unique and is
 * what gets stored as the user's `last_seen_release_version` once they open
 * the popup, so it must change for the unread badge to reappear.
 */
export type ReleaseNote = {
  version: string
  date: string // dd/MM/yyyy, for display only
  title: string
  items: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "2026.07.25",
    date: "25/07/2026",
    title: "Cập nhật báo cáo tiến độ & quản lý dự án",
    items: [
      "Cập nhật tiến độ giờ đây nhận thêm file Word, Excel, PowerPoint, PDF — không chỉ ảnh hiện trường.",
      "Có thể tự giao việc cho chính mình khi tạo hạng mục/công việc mới.",
      "Chủ dự án, admin và quản lý (cấp 1–2) có thể xóa dự án hoặc hạng mục không còn cần thiết.",
    ],
  },
]

export const LATEST_RELEASE_VERSION = RELEASE_NOTES[0]?.version ?? ""
