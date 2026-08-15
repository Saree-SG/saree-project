import {
  ClipboardCheck,
  GanttChartSquare,
  type LucideIcon,
  Map,
  Sparkles,
} from "lucide-react"
import type { ReleaseNoteItemType } from "@/data/releaseNotes"
import { cn } from "@/lib/utils"

/** Maps `ReleaseNote.icon` (a plain string in the data file) to a component. */
const ICON_MAP: Record<string, LucideIcon> = {
  Map,
  GanttChartSquare,
  ClipboardCheck,
}

export function getReleaseIcon(icon: string): LucideIcon {
  return ICON_MAP[icon] ?? Sparkles
}

/** Rotating hero-banner accents — one brand color, cycled by release index. */
const HERO_THEMES = [
  { from: "var(--brand-900)", to: "var(--chart-4)" },
  { from: "var(--brand-900)", to: "var(--chart-1)" },
  { from: "var(--brand-900)", to: "var(--chart-3)" },
  { from: "var(--brand-900)", to: "var(--chart-5)" },
]

export function getReleaseTheme(index: number) {
  return HERO_THEMES[index % HERO_THEMES.length]
}

const ITEM_TYPE_META: Record<
  ReleaseNoteItemType,
  { label: string; className: string }
> = {
  new: {
    label: "Mới",
    className:
      "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/25 dark:text-blue-300",
  },
  improved: {
    label: "Cải tiến",
    className:
      "bg-brand-gold-light/15 text-brand-gold ring-1 ring-brand-gold-light/30 dark:text-brand-gold-light",
  },
  fixed: {
    label: "Sửa lỗi",
    className:
      "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300",
  },
}

export function ItemTypeBadge({
  type,
  className,
}: {
  type: ReleaseNoteItemType
  className?: string
}) {
  const meta = ITEM_TYPE_META[type]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}

/**
 * Icon-based hero banner for a release — stands in for a real screenshot.
 * Rounded gradient panel (brand navy → rotating accent) with a large glyph
 * in a translucent disc, so each release reads as a distinct visual card
 * instead of a wall of bullet text.
 */
export function ReleaseHero({
  icon,
  index,
  size = "md",
}: {
  icon: string
  index: number
  size?: "sm" | "md"
}) {
  const Icon = getReleaseIcon(icon)
  const theme = getReleaseTheme(index)
  const dims = size === "sm" ? "h-14 w-14" : "h-20 w-20 sm:h-24 sm:w-24"
  const iconSize = size === "sm" ? 22 : 32

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-sm",
        dims,
      )}
      style={{
        backgroundImage: `radial-gradient(120% 140% at 15% 10%, rgb(255 255 255 / 0.18), transparent 55%), linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 130%)`,
      }}
      aria-hidden
    >
      <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
      <Icon
        size={iconSize}
        strokeWidth={1.75}
        className="relative text-white drop-shadow-sm"
      />
    </div>
  )
}
