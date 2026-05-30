import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"

export const Route = createFileRoute("/_layout/help")({
  component: HelpPage,
  head: () => ({
    meta: [{ title: "Hướng dẫn sử dụng - Saree" }],
  }),
})

interface TocItem {
  id: string
  text: string
  level: number
}

function HelpPage() {
  const [html, setHtml] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/help/user-manual.html")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((text) => {
        if (cancelled) return
        const withIds = addHeadingIds(text)
        setHtml(withIds)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toc = useMemo(() => extractToc(html), [html])

  const displayHtml = useMemo(() => {
    if (!query.trim()) return html
    return highlight(html, query.trim())
  }, [html, query])

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Đang tải hướng dẫn...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-destructive">
        Không tải được hướng dẫn: {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="md:sticky md:top-20 md:h-[calc(100vh-6rem)] md:w-72 md:shrink-0 md:overflow-auto">
        <div className="mb-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm trong hướng dẫn..."
              className="pl-8"
            />
          </div>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`block rounded px-2 py-1 hover:bg-muted ${
                item.level === 1
                  ? "font-semibold"
                  : item.level === 2
                    ? "pl-4 text-muted-foreground"
                    : "pl-6 text-xs text-muted-foreground"
              }`}
            >
              {item.text}
            </a>
          ))}
        </nav>
      </aside>

      <article
        className="manual-content min-w-0 flex-1"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted static asset
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
    </div>
  )
}

function slugify(text: string, idx: number): string {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${base || "section"}-${idx}`
}

function addHeadingIds(html: string): string {
  let idx = 0
  return html.replace(
    /<(h[1-4])>([\s\S]*?)<\/\1>/g,
    (_match, tag: string, inner: string) => {
      idx += 1
      const text = inner.replace(/<[^>]+>/g, "")
      const id = slugify(text, idx)
      return `<${tag} id="${id}">${inner}</${tag}>`
    },
  )
}

function extractToc(html: string): TocItem[] {
  const items: TocItem[] = []
  const re = /<(h[1-3]) id="([^"]+)">([\s\S]*?)<\/\1>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    items.push({
      level: Number(m[1].slice(1)),
      id: m[2],
      text: m[3].replace(/<[^>]+>/g, "").trim(),
    })
  }
  return items
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function highlight(html: string, q: string): string {
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi")
  return html.replace(
    /(>)([^<]+)(<)/g,
    (_m, a: string, text: string, b: string) =>
      `${a}${text.replace(re, '<mark class="bg-yellow-200 dark:bg-yellow-700">$1</mark>')}${b}`,
  )
}
