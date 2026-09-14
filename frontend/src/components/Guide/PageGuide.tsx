import { CircleHelp, Clock3 } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

type PageGuideProps = {
  title: string
  description: string
  badges?: ReactNode
  children: ReactNode
  triggerTestId?: string
  panelTestId?: string
  /** Selector inside the panel to reveal immediately after the guide opens. */
  initialFocusSelector?: string
}

/** Numbered callout with contrast on every guide background, including blue CTAs. */
export function GuideMarker({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-300 text-[11px] font-extrabold text-slate-950 shadow-sm ring-2 ring-white/80">
      {children}
    </span>
  )
}

/** Compact metadata that remains a single row in the narrow mobile sheet. */
export function GuideMeta({
  audience,
  detail,
}: {
  audience: string
  detail?: string
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
      <span className="truncate">{audience}</span>
      {detail ? (
        <>
          <span className="text-blue-400">·</span>
          <Clock3 className="size-3 shrink-0" />
          <span className="shrink-0">{detail}</span>
        </>
      ) : null}
    </span>
  )
}

/** Shared shell for every contextual, mobile-safe page guide. */
export function PageGuide({
  title,
  description,
  badges,
  children,
  triggerTestId,
  panelTestId,
  initialFocusSelector,
}: PageGuideProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || !initialFocusSelector || !panelTestId) return
    const timeoutId = window.setTimeout(() => {
      const target = document.querySelector(
        `[data-testid="${panelTestId}"] ${initialFocusSelector}`,
      )
      target?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 150)
    return () => window.clearTimeout(timeoutId)
  }, [initialFocusSelector, open, panelTestId])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="fixed right-4 bottom-20 z-30 sm:right-6 sm:bottom-6">
        <SheetTrigger asChild>
          <Button
            size="lg"
            className="h-12 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 ring-1 ring-white/70 transition hover:-translate-y-0.5 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl hover:shadow-blue-600/30 active:translate-y-0"
            aria-label={`Mở hướng dẫn ${title.toLowerCase()}`}
            data-testid={triggerTestId}
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-white/20">
              <CircleHelp className="size-4" />
            </span>
            Hướng dẫn
          </Button>
        </SheetTrigger>
      </div>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl"
        data-testid={panelTestId}
      >
        <SheetHeader className="border-b bg-slate-50 pr-12">
          {badges ? (
            <div className="mb-2 flex items-center gap-2">{badges}</div>
          ) : null}
          <SheetTitle className="text-left text-xl">{title}</SheetTitle>
          <SheetDescription className="text-left">
            {description}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-6 p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-8">
            {children}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
