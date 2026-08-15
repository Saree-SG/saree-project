import { createFileRoute, Link } from "@tanstack/react-router"
import { Sparkles } from "lucide-react"

import {
  ItemTypeBadge,
  ReleaseHero,
} from "@/components/Common/releaseNotes/ReleaseVisuals"
import { RELEASE_NOTES } from "@/data/releaseNotes"
import { APP_VERSION_SHORT } from "@/utils/appVersion"

export const Route = createFileRoute("/_layout/releases")({
  component: ReleasesPage,
  head: () => ({
    meta: [{ title: "Có gì mới - Saree" }],
  }),
})

function ReleasesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-10 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold-light/15 px-3 py-1 text-xs font-semibold text-brand-gold ring-1 ring-brand-gold-light/25">
          <Sparkles size={13} strokeWidth={2.25} />
          Nhật ký phát hành
        </span>
        <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
          Có gì mới trong Saree ERP
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mọi tính năng mới, cải tiến và sửa lỗi — theo từng phiên bản. Đang
          dùng {APP_VERSION_SHORT}.
        </p>
      </header>

      <ol className="relative space-y-10 sm:pl-2">
        {/* Timeline spine */}
        <span
          aria-hidden
          className="absolute top-2 bottom-2 left-[27px] hidden w-px bg-border sm:block"
        />

        {RELEASE_NOTES.map((note, index) => (
          <li key={note.version} className="relative sm:pl-[68px]">
            <span className="absolute top-0 left-0 hidden sm:block">
              <ReleaseHero icon={note.icon} index={index} size="sm" />
            </span>

            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex items-start gap-4 border-b p-4 sm:hidden">
                <ReleaseHero icon={note.icon} index={index} size="sm" />
                <ReleaseHeading note={note} />
              </div>
              <div className="hidden p-5 pb-4 sm:block">
                <ReleaseHeading note={note} />
              </div>

              <ul className="space-y-3 px-5 pb-5">
                {note.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start gap-2.5">
                    <ItemTypeBadge type={item.type} className="mt-0.5" />
                    <span className="text-sm leading-relaxed text-foreground/90">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 text-center">
        <Link
          to="/"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Về trang tổng quan
        </Link>
      </div>
    </div>
  )
}

function ReleaseHeading({ note }: { note: (typeof RELEASE_NOTES)[number] }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-brand-900 px-2 py-0.5 text-xs font-bold tracking-wide text-white">
          v{note.version}
        </span>
        <span className="text-xs text-muted-foreground">{note.date}</span>
      </div>
      <h2 className="mt-1.5 text-base font-bold text-foreground sm:text-lg">
        {note.title}
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{note.summary}</p>
    </div>
  )
}
