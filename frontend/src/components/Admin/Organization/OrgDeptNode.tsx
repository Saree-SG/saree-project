import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { Link } from "@tanstack/react-router"
import { ChevronRight, Users } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  OrgTreeDepartmentGroup,
  OrgTreeMember,
} from "@/modules/org/orgTreeApi"

/** Border/background tone by the department's top (lowest) role level. */
function levelTone(level?: number): string {
  switch (level) {
    case 1:
      return "border-rose-300 bg-rose-50 text-rose-900"
    case 2:
      return "border-amber-300 bg-amber-50 text-amber-900"
    case 3:
      return "border-blue-300 bg-blue-50 text-blue-900"
    default:
      return "border-slate-300 bg-slate-50 text-slate-900"
  }
}

function initials(name: string, email?: string | null): string {
  const src = (name || email || "?").trim()
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?"
}

/** One person row — a link to their detail page only when the viewer is L2+. */
function MemberRow({
  m,
  canOpenDetail,
}: {
  m: OrgTreeMember
  canOpenDetail: boolean
}) {
  const inner = (
    <>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="text-[10px]">
          {initials(m.full_name || "", m.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-xs font-medium">
          {m.full_name || m.email}
          {m.is_current_user ? (
            <span className="ml-1 text-[10px] text-primary">(Bạn)</span>
          ) : null}
        </p>
        {m.full_name ? (
          <p className="truncate text-[10px] text-muted-foreground">
            {m.email}
          </p>
        ) : null}
      </div>
      {canOpenDetail ? (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      ) : null}
    </>
  )

  if (!canOpenDetail) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
        {inner}
      </div>
    )
  }

  return (
    <Link
      to="/dashboard/personnel/$userId"
      params={{ userId: m.user_id }}
      search={{ name: m.full_name || m.email }}
      className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-accent"
    >
      {inner}
    </Link>
  )
}

/**
 * A single department node: shows the department name, its role(s) and a member
 * count. The actual accounts are revealed in a rich hover card (clickable
 * through to each user's profile) so the tree itself stays a clean hierarchy.
 *
 * Uses the Radix tooltip primitive directly (no dark arrow / no dark bg) so the
 * hover card can render as a light, interactive popover.
 */
export default function OrgDeptNode({
  dept,
  canOpenDetail = false,
}: {
  dept: OrgTreeDepartmentGroup
  /** Only managers (L2+) may open a person's detail page. */
  canOpenDetail?: boolean
}) {
  const memberCount = dept.roles.reduce((acc, r) => acc + r.members.length, 0)
  const topLevel = dept.roles.length
    ? Math.min(...dept.roles.map((r) => r.role_level))
    : undefined

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <div
          className={cn(
            "inline-flex w-52 cursor-default flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 text-center shadow-sm transition-shadow hover:shadow-md",
            levelTone(topLevel),
          )}
        >
          <p className="text-sm font-semibold leading-tight">
            {dept.department_name}
          </p>
          {dept.roles.map((r) => (
            <p key={r.role_id} className="text-xs leading-tight opacity-80">
              {r.role_display_name}
            </p>
          ))}
          <Badge
            variant="outline"
            className="mt-1 gap-1 bg-white/60 text-[10px]"
          >
            <Users className="h-3 w-3" />
            {memberCount} người
          </Badge>
        </div>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-72 origin-(--radix-tooltip-content-transform-origin) overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="border-b px-3 py-2">
            <p className="text-sm font-semibold">{dept.department_name}</p>
            <p className="text-xs text-muted-foreground">
              {memberCount} thành viên
            </p>
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto p-3">
            {dept.roles.map((r) => (
              <div key={r.role_id}>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  {r.role_display_name}
                </p>
                {r.members.length ? (
                  <ul className="space-y-1">
                    {r.members.map((m) => (
                      <li key={m.user_id}>
                        <MemberRow m={m} canOpenDetail={canOpenDetail} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 text-xs text-muted-foreground">
                    Chưa có người
                  </p>
                )}
              </div>
            ))}
          </div>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
