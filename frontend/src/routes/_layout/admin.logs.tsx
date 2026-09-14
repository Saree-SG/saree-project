import { createFileRoute } from "@tanstack/react-router"
import { ExternalLink, ScrollText } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

/**
 * Nhật ký hệ thống — nhúng Dozzle chạy cùng origin tại /_logs/.
 *
 * Vì sao iframe chứ không phải trang gốc: Dozzle đã có sẵn stream realtime,
 * search, download, lọc theo level. Trang gốc trong ERP (Track B của
 * docs/plan-log-monitoring.md) chỉ cần khi admin của KHÁCH được xem log —
 * lúc đó bắt buộc phải lọc theo company_id, việc Dozzle không làm được.
 *
 * Cảnh báo: /_logs/ được Cloudflare Tunnel trỏ thẳng vào container Dozzle,
 * KHÔNG đi qua FastAPI. Phân quyền của ERP không áp dụng ở đó — Dozzle tự
 * xác thực bằng users.yml của nó. Việc ẩn mục này với người không phải
 * superuser chỉ là dọn giao diện, không phải rào bảo mật.
 */

const LOGS_PATH = "/_logs/"

export const Route = createFileRoute("/_layout/admin/logs")({
  component: AdminLogs,
})

function AdminLogs() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ScrollText className="size-6" />
            Nhật ký hệ thống
          </h1>
          <p className="text-muted-foreground">
            Log realtime của toàn bộ dịch vụ. Dùng ⌘F để tìm, menu ⋮ để tải về.
          </p>
        </div>

        <Button variant="outline" size="sm" asChild>
          <a href={LOGS_PATH} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            Mở tab mới
          </a>
        </Button>
      </div>

      <div className="relative min-h-[70vh] overflow-hidden rounded-lg border bg-card">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Đang tải nhật ký…</p>
          </div>
        )}
        <iframe
          src={LOGS_PATH}
          title="Nhật ký hệ thống"
          onLoad={() => setLoaded(true)}
          className="h-[70vh] w-full border-0"
          // Cho phép script + form (đăng nhập Dozzle) nhưng chặn popup và
          // điều hướng trang cha. same-origin cần thiết để Dozzle đọc cookie
          // phiên của chính nó.
          sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Nhật ký chỉ giữ lại phần Docker còn lưu (50&nbsp;MB × 5 mỗi dịch vụ).
        Cần tra cứu xa hơn hoặc cảnh báo tự động thì xem{" "}
        <code className="text-[11px]">docs/plan-log-monitoring.md</code>.
      </p>
    </div>
  )
}
