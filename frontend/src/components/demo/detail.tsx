import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Drill-down dùng chung cho bộ demo: bấm bất kỳ đâu → mở POPUP chi tiết.
 * Popup căn giữa, header màu mềm + avatar chữ cái, thân cuộn. Chỉ preview UI (mock).
 */

type Accent = "blue" | "green" | "amber" | "red" | "slate"
type DetailPayload = {
  title: string
  subtitle?: string
  body: ReactNode
  accent?: Accent
}

const ACCENT: Record<Accent, { band: string; avatar: string }> = {
  blue: { band: "from-blue-50 to-white", avatar: "bg-blue-100 text-blue-700" },
  green: {
    band: "from-green-50 to-white",
    avatar: "bg-green-100 text-green-700",
  },
  amber: {
    band: "from-amber-50 to-white",
    avatar: "bg-amber-100 text-amber-700",
  },
  red: { band: "from-red-50 to-white", avatar: "bg-red-100 text-red-700" },
  slate: {
    band: "from-slate-100 to-white",
    avatar: "bg-slate-200 text-slate-700",
  },
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const last = parts[parts.length - 1] ?? ""
  const first = parts.length > 1 ? parts[parts.length - 2] : ""
  return (
    (first.charAt(0) + last.charAt(0)).toUpperCase() ||
    name.charAt(0).toUpperCase()
  )
}

const DetailCtx = createContext<(p: DetailPayload) => void>(() => {})

export function useDetail() {
  return useContext(DetailCtx)
}

export function DetailProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<DetailPayload | null>(null)

  const show = useCallback((p: DetailPayload) => {
    setPayload(p)
    setOpen(true)
  }, [])

  const accent = ACCENT[payload?.accent ?? "blue"]

  return (
    <DetailCtx.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md">
          {/* Header màu mềm + avatar */}
          <DialogHeader
            className={cn("gap-0 bg-gradient-to-b px-5 pb-4 pt-5", accent.band)}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  accent.avatar,
                )}
              >
                {payload ? initials(payload.title) : ""}
              </span>
              <div className="min-w-0 text-left">
                <DialogTitle className="truncate text-base">
                  {payload?.title}
                </DialogTitle>
                {payload?.subtitle ? (
                  <DialogDescription className="truncate text-xs">
                    {payload.subtitle}
                  </DialogDescription>
                ) : null}
              </div>
            </div>
          </DialogHeader>
          {/* Thân cuộn */}
          <div className="max-h-[65vh] overflow-y-auto px-5 pb-6 pt-1">
            {payload?.body}
          </div>
        </DialogContent>
      </Dialog>
    </DetailCtx.Provider>
  )
}

/** Hàng nhãn–giá trị dùng trong panel chi tiết. */
export function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="shrink-0 text-slate-500">{k}</span>
      <span className="text-right font-medium text-slate-800">{v}</span>
    </div>
  )
}
