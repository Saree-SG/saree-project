import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type StatTone = "neutral" | "info" | "success" | "warning" | "danger"

const TONE: Record<StatTone, { icon: string; bg: string; val: string }> = {
  neutral: { icon: "text-slate-500",  bg: "bg-slate-100",  val: "text-slate-800" },
  info:    { icon: "text-blue-600",   bg: "bg-blue-50",    val: "text-blue-700"  },
  success: { icon: "text-emerald-600",bg: "bg-emerald-50", val: "text-emerald-700"},
  warning: { icon: "text-amber-600",  bg: "bg-amber-50",   val: "text-amber-700" },
  danger:  { icon: "text-red-600",    bg: "bg-red-50",     val: "text-red-700"   },
}

export function StatCard({
  label, value, suffix, tone = "neutral", icon: Icon, className,
}: {
  label: string; value: string | number; suffix?: string
  tone?: StatTone; icon?: LucideIcon; className?: string
}) {
  const t = TONE[tone]
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm", className)}>
      {Icon && (
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t.bg)}>
          <Icon className={cn("h-4.5 w-4.5", t.icon)} strokeWidth={2} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-400">{label}</p>
        <p className={cn("text-xl font-bold leading-tight", t.val)}>
          {value}
          {suffix && <span className="ml-0.5 text-sm font-semibold">{suffix}</span>}
        </p>
      </div>
    </div>
  )
}
