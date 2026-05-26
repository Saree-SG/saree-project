import { Link } from "@tanstack/react-router"
import { Users } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type NodeKind = "company" | "department" | "role" | "member"

type Props = {
  kind: NodeKind
  title: string
  subtitle?: string
  badge?: string
  level?: number
  memberCount?: number
  memberId?: string
  email?: string | null
}

function levelTone(level?: number): string {
  switch (level) {
    case 1:
      return "border-rose-300 bg-rose-50 text-rose-900"
    case 2:
      return "border-amber-300 bg-amber-50 text-amber-900"
    case 3:
      return "border-blue-300 bg-blue-50 text-blue-900"
    case 4:
    case 5:
      return "border-slate-300 bg-slate-50 text-slate-900"
    default:
      return "border-border bg-card"
  }
}

function initials(name: string, email?: string | null): string {
  const src = (name || email || "?").trim()
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?"
}

export default function OrgNode({
  kind,
  title,
  subtitle,
  badge,
  level,
  memberCount,
  memberId,
  email,
}: Props) {
  if (kind === "company") {
    return (
      <div className="inline-flex flex-col items-center gap-1 rounded-lg border-2 border-primary/40 bg-primary/5 px-5 py-3 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Công ty
        </p>
        <p className="text-base font-bold">{title}</p>
        {memberCount !== undefined ? (
          <Badge variant="outline" className="mt-1 gap-1 text-xs">
            <Users className="h-3 w-3" />
            {memberCount} thành viên
          </Badge>
        ) : null}
      </div>
    )
  }

  if (kind === "department") {
    return (
      <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wider text-violet-600">
          Phòng ban
        </p>
        <p className="text-sm font-semibold text-violet-900">{title}</p>
        {memberCount !== undefined ? (
          <span className="text-xs text-violet-700">{memberCount} người</span>
        ) : null}
      </div>
    )
  }

  if (kind === "role") {
    return (
      <div
        className={cn(
          "inline-flex flex-col items-center gap-1 rounded-lg border-2 px-4 py-2 text-center shadow-sm",
          levelTone(level),
        )}
      >
        <p className="text-xs uppercase tracking-wider opacity-70">
          Vai trò · L{level}
        </p>
        <p className="text-sm font-semibold">{title}</p>
        {memberCount !== undefined ? (
          <span className="text-xs opacity-75">{memberCount} người</span>
        ) : null}
      </div>
    )
  }

  // member
  const body = (
    <div className="inline-flex w-44 items-center gap-2 rounded-md border bg-white px-2 py-2 text-left shadow-sm hover:border-primary hover:shadow">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs">
          {initials(title, email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{title}</p>
        {subtitle ? (
          <p className="truncate text-[10px] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        {badge ? (
          <Badge variant="outline" className="mt-0.5 px-1 py-0 text-[9px]">
            {badge}
          </Badge>
        ) : null}
      </div>
    </div>
  )

  return memberId ? (
    <Link to="/admin/users/$userId" params={{ userId: memberId }}>
      {body}
    </Link>
  ) : (
    body
  )
}
