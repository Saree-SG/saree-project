import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type StatTone = "neutral" | "info" | "success" | "warning" | "danger"

const TONE: Record<
  StatTone,
  { icon: string; bg: string; val: string; ring: string }
> = {
  neutral: {
    icon: "text-slate-500",
    bg: "bg-slate-100",
    val: "text-slate-800",
    ring: "hover:ring-slate-200",
  },
  info: {
    icon: "text-blue-600",
    bg: "bg-blue-50",
    val: "text-blue-700",
    ring: "hover:ring-blue-200",
  },
  success: {
    icon: "text-emerald-600",
    bg: "bg-emerald-50",
    val: "text-emerald-700",
    ring: "hover:ring-emerald-200",
  },
  warning: {
    icon: "text-amber-600",
    bg: "bg-amber-50",
    val: "text-amber-700",
    ring: "hover:ring-amber-200",
  },
  danger: {
    icon: "text-red-600",
    bg: "bg-red-50",
    val: "text-red-700",
    ring: "hover:ring-red-200",
  },
}

export function StatCard({
  label,
  value,
  suffix,
  tone = "neutral",
  icon: Icon,
  onClick,
  className,
}: {
  label: string
  value: string | number
  suffix?: string
  tone?: StatTone
  icon?: LucideIcon
  onClick?: () => void
  className?: string
}) {
  const t = TONE[tone]
  const content = (
    <>
      <div className="flex items-center justify-between">
        {Icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              t.bg,
            )}
          >
            <Icon className={cn("h-5 w-5", t.icon)} strokeWidth={2} />
          </div>
        )}
        {onClick && (
          <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-400">
            →
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className={cn("text-[28px] font-extrabold leading-none", t.val)}>
          {value}
          {suffix && (
            <span className="ml-0.5 text-base font-bold">{suffix}</span>
          )}
        </p>
        <p className="mt-1.5 truncate text-[13px] font-medium text-slate-500">
          {label}
        </p>
      </div>
    </>
  )

  const shared = cn(
    "group flex w-full flex-col rounded-2xl border border-slate-100 bg-white px-4 py-4 text-left shadow-sm transition",
    className,
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(shared, "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:ring-1", t.ring)}
      >
        {content}
      </button>
    )
  }

  return <div className={shared}>{content}</div>
}
