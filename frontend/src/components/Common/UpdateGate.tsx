import { RefreshCw } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { applyUpdate, useVersionCheck } from "@/hooks/useVersionCheck"

/**
 * Full-screen blocking gate shown when a newer build has been deployed. It is
 * intentionally non-dismissible: stale cached assets against an updated backend
 * are a common source of hard-to-reproduce errors, so the user must reload
 * before continuing.
 */
export function UpdateGate() {
  const { updateAvailable } = useVersionCheck()
  const [busy, setBusy] = useState(false)

  if (!updateAvailable) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <RefreshCw className="size-5" />
          <h2 className="text-base font-semibold">Đã có phiên bản mới</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Ứng dụng vừa được cập nhật. Vui lòng tải lại để dùng phiên bản mới
          nhất và tránh lỗi do dữ liệu cũ trên thiết bị.
        </p>
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void applyUpdate()
          }}
        >
          {busy ? "Đang cập nhật..." : "Cập nhật ngay"}
        </Button>
      </div>
    </div>
  )
}
