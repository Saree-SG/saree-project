import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * StatCard — thẻ chỉ số lớn theo phong cách POC "QL Thi Công".
 * Số to + nhãn nhỏ + màu semantic mềm. Dùng cho Tổng quan / KPI.
 */

export type StatTone = "neutral" | "info" | "success" | "warning" | "danger"

const TONE: Record<StatTone, { bg: string; label: string; value: string }> = {
  neutral: { bg: "bg-slate-50 ring-slate-200", label: "text-slate-500", value: "text-slate-900" },
  info: { bg: "bg-blue-50 ring-blue-200", label: "text-blue-600", value: "text-blue-700" },
  success: { bg: "bg-green-50 ring-green-200", label: "text-green-700", value: "text-green-700" },
  warning: { bg: "bg-amber-50 ring-amber-200", label: "text-amber-700", value: "text-amber-700" },
  danger: { bg: "bg-red-50 ring-red-200", label: "text-red-700", value: "text-red-700" },
}

export function StatCard({
  label,
  value,
  suffix,
  tone = "neutral",
  icon: Icon,
  className,
}: {
  label: string
  value: string | number
  suffix?: string
  tone?: StatTone
  icon?: LucideIcon
  className?: string
}) {
  const t = TONE[tone]
  return (
    <div className={cn("rounded-xl p-4 ring-1", t.bg, className)}>
      <div className={cn("flex items-center gap-1.5 text-xs font-medium", t.label)}>
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold leading-tight", t.value)}>
        {value}
        {suffix ? <span className="ml-0.5 text-base font-semibold">{suffix}</span> : null}
      </div>
    </div>
  )
}
