import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Props = {
  label: string
  value: number | string
  hint?: string
  icon?: LucideIcon
  accent?: "blue" | "green" | "amber" | "violet" | "rose"
}

const accentClasses: Record<NonNullable<Props["accent"]>, string> = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600",
  rose: "bg-rose-100 text-rose-600",
}

export default function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "blue",
}: Props) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        {Icon ? (
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-lg",
              accentClasses[accent],
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          {hint ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
