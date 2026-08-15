/**
 * Shared timeline component for displaying workflow stage/status transitions.
 * Used by both Quotation history and Contract history tabs.
 *
 * Entries with the same `subject` are grouped into one visual block.
 * Within a group, submit → response pairs are numbered as "Bản N",
 * so repeat cycles (submit → reject → resubmit) are easy to follow.
 */
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  Hourglass,
  Paperclip,
  Send,
  Trophy,
  XCircle,
} from "lucide-react"

import { FileTypeIcon } from "@/components/ui/FileTypeIcon"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseTransitionNote(note: string): {
  title: string
  body: string
} {
  if (note.startsWith("# ")) {
    const lines = note.split("\n")
    const title = lines[0].slice(2).trim()
    const body = lines.slice(1).join("\n").replace(/^\n+/, "")
    return { title, body }
  }
  return { title: "", body: note }
}

export function renderLightMarkdown(note: string): string {
  const lines = note.split("\n")
  const html: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      continue
    }
    if (line.startsWith("- ") || line.startsWith("• ")) {
      if (!inList) {
        html.push('<ul class="list-disc pl-4 space-y-0.5">')
        inList = true
      }
      html.push(`<li>${line.slice(2)}</li>`)
    } else if (line.startsWith("**") && line.endsWith("**")) {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      html.push(`<p class="font-semibold">${line.slice(2, -2)}</p>`)
    } else {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      html.push(`<p>${line}</p>`)
    }
  }
  if (inList) html.push("</ul>")
  return html.join("")
}

// ---------------------------------------------------------------------------
// Status types & visuals
// ---------------------------------------------------------------------------

export type ActionStatusType =
  | "pending"
  | "approved"
  | "rejected"
  | "sent"
  | "won"
  | "lost"
  | "created"

export interface ActionConfig {
  /** Tên tài liệu/đối tượng: "Hồ sơ thiết kế", "Báo giá", ... */
  subject: string
  /** Trạng thái kết quả: "Đã được duyệt", "Cần chỉnh sửa", ... */
  status: string
  /** Loại kết quả để chọn màu + icon */
  statusType: ActionStatusType
  /** Khóa gom nhóm vòng lặp phê duyệt (nếu cần gom nhiều subject thành 1 luồng). */
  groupKey?: string
}

type IconCfg = {
  IconComponent: typeof Hourglass
  iconClass: string
  wrapClass: string
}

const STATUS_ICON: Record<ActionStatusType, IconCfg> = {
  pending: {
    IconComponent: Hourglass,
    iconClass: "text-amber-600",
    wrapClass: "border-amber-200 bg-amber-50",
  },
  approved: {
    IconComponent: CheckCircle2,
    iconClass: "text-green-600",
    wrapClass: "border-green-200 bg-green-50",
  },
  rejected: {
    IconComponent: XCircle,
    iconClass: "text-red-600",
    wrapClass: "border-red-200   bg-red-50",
  },
  sent: {
    IconComponent: Send,
    iconClass: "text-amber-600",
    wrapClass: "border-amber-200 bg-amber-50",
  },
  won: {
    IconComponent: Trophy,
    iconClass: "text-green-600",
    wrapClass: "border-green-200 bg-green-50",
  },
  lost: {
    IconComponent: Ban,
    iconClass: "text-slate-500",
    wrapClass: "border-slate-200 bg-slate-50",
  },
  created: {
    IconComponent: FilePlus2,
    iconClass: "text-slate-400",
    wrapClass: "border-slate-200 bg-slate-50",
  },
}

const STATUS_BADGE: Record<ActionStatusType, string> = {
  pending: "bg-amber-50  text-amber-700  border-amber-200",
  approved: "bg-green-50  text-green-700  border-green-200",
  rejected: "bg-red-50    text-red-700    border-red-200",
  sent: "bg-amber-50  text-amber-700  border-amber-200",
  won: "bg-green-50  text-green-700  border-green-200",
  lost: "bg-slate-100 text-slate-600  border-slate-200",
  created: "bg-slate-100 text-slate-500  border-slate-200",
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TransitionEntry {
  id: string
  from_key?: string | null
  to_key?: string | null
  from_label?: string | null
  to_label: string
  action: string
  groupKey?: string
  groupSubject?: string
  /** Key used to match attachments (defaults to to_key / to_label). */
  attachmentKey?: string
  actor_name?: string | null
  created_at: string
  note?: string | null
}

export interface TransitionAttachment {
  id: string
  stage_key: string
  file_name: string
  file_url: string
  file_type?: string | null
  uploaded_at?: string
}

// ---------------------------------------------------------------------------
// Grouping logic
// ---------------------------------------------------------------------------

interface ResolvedEntry {
  entry: TransitionEntry
  cfg: ActionConfig
  groupKey: string
  groupSubject: string
  attachmentKey: string
}

interface VersionPair {
  versionNumber: number
  submit: ResolvedEntry
  response?: ResolvedEntry
}

interface EntryGroup {
  groupKey: string
  subject: string
  finalStatusType: ActionStatusType
  finalStatus: string
  versions: VersionPair[]
  standalone: ResolvedEntry[]
}

const SUBMIT_TYPES = new Set<ActionStatusType>(["pending", "created"])
const RESPONSE_TYPES = new Set<ActionStatusType>(["approved", "rejected"])

function buildGroups(
  entries: TransitionEntry[],
  cfg: Record<string, ActionConfig>,
): EntryGroup[] {
  // Process oldest-first for correct version numbering
  const chronological = [...entries].reverse()

  const rawGroups: ResolvedEntry[][] = []
  let current: ResolvedEntry[] = []
  let currentGroupKey: string | null = null

  for (const entry of chronological) {
    const fallbackCfg = {
      subject: entry.to_label,
      status: entry.action,
      statusType: "created" as ActionStatusType,
    }
    const resolvedCfg = cfg[entry.action] ?? fallbackCfg
    const resolved: ResolvedEntry = {
      entry,
      cfg: resolvedCfg,
      groupKey: entry.groupKey ?? resolvedCfg.groupKey ?? resolvedCfg.subject,
      groupSubject: entry.groupSubject ?? resolvedCfg.subject,
      attachmentKey: entry.attachmentKey ?? entry.to_key ?? entry.to_label,
    }
    if (resolved.groupKey !== currentGroupKey) {
      if (current.length) rawGroups.push(current)
      current = [resolved]
      currentGroupKey = resolved.groupKey
    } else {
      current.push(resolved)
    }
  }
  if (current.length) rawGroups.push(current)

  const groups: EntryGroup[] = rawGroups.map((raw) => {
    const last = raw[raw.length - 1]
    const versions: VersionPair[] = []
    const standalone: ResolvedEntry[] = []
    let versionCount = 0
    let lastOpenVersionIndex = -1

    for (const cur of raw) {
      if (SUBMIT_TYPES.has(cur.cfg.statusType)) {
        versionCount++
        versions.push({ versionNumber: versionCount, submit: cur })
        lastOpenVersionIndex = versions.length - 1
        continue
      }

      if (RESPONSE_TYPES.has(cur.cfg.statusType)) {
        if (
          lastOpenVersionIndex >= 0 &&
          !versions[lastOpenVersionIndex].response
        ) {
          versions[lastOpenVersionIndex].response = cur
        } else {
          standalone.push(cur)
        }
        continue
      }

      standalone.push(cur)
    }

    return {
      groupKey: raw[0].groupKey,
      subject: raw[0].groupSubject,
      finalStatusType: last.cfg.statusType,
      finalStatus: last.cfg.status,
      versions,
      standalone,
    }
  })

  // Newest group first
  return groups.reverse()
}

// ---------------------------------------------------------------------------
// Entry card
// ---------------------------------------------------------------------------

function EntryCard({
  resolved,
  attachments,
  onViewAttachment,
  compact = false,
}: {
  resolved: ResolvedEntry
  attachments: TransitionAttachment[]
  onViewAttachment?: (att: TransitionAttachment) => void
  compact?: boolean
}) {
  const { entry, cfg } = resolved
  const iconDef = STATUS_ICON[cfg.statusType]
  const badgeClass = STATUS_BADGE[cfg.statusType]
  const { title, body } = parseTransitionNote(entry.note ?? "")
  const stepAtts = attachments

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* Header row */}
      {!compact ? (
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{cfg.subject}</span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
            >
              {cfg.status}
            </span>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {new Date(entry.created_at).toLocaleString("vi-VN")}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <iconDef.IconComponent
              className={`w-3.5 h-3.5 shrink-0 ${iconDef.iconClass}`}
            />
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
            >
              {cfg.status}
            </span>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(entry.created_at).toLocaleString("vi-VN")}
          </span>
        </div>
      )}

      {/* Stage arrow */}
      {(entry.from_label || entry.to_label) && (
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {entry.from_label && (
            <>
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {entry.from_label}
              </span>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </>
          )}
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">
            {entry.to_label}
          </span>
        </div>
      )}

      {/* Actor */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase shrink-0">
          {(entry.actor_name ?? "?").charAt(0)}
        </span>
        {entry.actor_name ?? "Hệ thống"}
      </div>

      {/* Note */}
      {(title || body) && (
        <div className="rounded-md border bg-muted/30 p-2.5 space-y-1">
          {title && (
            <p className="text-sm font-semibold leading-snug">{title}</p>
          )}
          {body && (
            <div
              className="text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: renderLightMarkdown(body) }}
            />
          )}
        </div>
      )}

      {/* Attachments */}
      {stepAtts.length > 0 && (
        <div className="rounded-md border bg-muted/20 p-2.5 space-y-1">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Paperclip className="w-3 h-3" />
            Tài liệu đính kèm ({stepAtts.length})
          </p>
          <ul className="space-y-1.5 mt-1">
            {stepAtts.map((att) => (
              <li key={att.id} className="flex items-center gap-2">
                <FileTypeIcon
                  fileName={att.file_name}
                  className="w-4 h-4 shrink-0"
                />
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline truncate text-left"
                  onClick={() => onViewAttachment?.(att)}
                >
                  {att.file_name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface StageTransitionTimelineProps {
  entries: TransitionEntry[]
  attachments?: TransitionAttachment[]
  actionConfig: Record<string, ActionConfig>
  onViewAttachment?: (att: TransitionAttachment) => void
}

export function StageTransitionTimeline({
  entries,
  attachments = [],
  actionConfig,
  onViewAttachment,
}: StageTransitionTimelineProps) {
  if (!entries.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có lịch sử chuyển bước.
      </p>
    )
  }

  const groups = buildGroups(entries, actionConfig)

  return (
    <div className="relative">
      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />
      <ul className="space-y-5">
        {groups.map((group, gi) => {
          const iconDef = STATUS_ICON[group.finalStatusType]
          const badgeClass = STATUS_BADGE[group.finalStatusType]
          const totalVersions = group.versions.length
          const isMulti = totalVersions > 1
          const versionsNewestFirst = [...group.versions].reverse()
          const versionsChronological = group.versions

          const attachmentBucketsByVersion = (() => {
            const buckets: Record<number, TransitionAttachment[]> = {}
            for (const ver of versionsChronological) {
              buckets[ver.versionNumber] = []
            }
            if (!versionsChronological.length) return buckets

            const submitTimes = versionsChronological.map((v) => ({
              versionNumber: v.versionNumber,
              ms: new Date(v.submit.entry.created_at).getTime(),
              attachmentKey: v.submit.attachmentKey,
            }))

            for (const att of attachments) {
              const withUploadedAt = Boolean(att.uploaded_at)
              if (!withUploadedAt) {
                // If we can't determine upload time, keep the old behavior (show on all versions of same key).
                for (const s of submitTimes) {
                  if (att.stage_key === s.attachmentKey) {
                    buckets[s.versionNumber].push(att)
                  }
                }
                continue
              }

              const uploadedMs = new Date(att.uploaded_at as string).getTime()
              // Attach to the first submit at-or-after upload time (so pre-submit uploads stick to that submit).
              const candidate = submitTimes.find(
                (s) => s.attachmentKey === att.stage_key && s.ms >= uploadedMs,
              )
              if (candidate) {
                buckets[candidate.versionNumber].push(att)
                continue
              }
              // If uploaded after the last submit of this key, attach to the last version of that key.
              const last = [...submitTimes]
                .reverse()
                .find((s) => s.attachmentKey === att.stage_key)
              if (last) {
                buckets[last.versionNumber].push(att)
              }
            }

            return buckets
          })()

          function getAttachmentsForVersion(
            versionNumber: number,
          ): TransitionAttachment[] {
            return attachmentBucketsByVersion[versionNumber] ?? []
          }

          return (
            <li key={`${group.groupKey}-${gi}`} className="relative flex gap-3">
              {/* Status icon dot */}
              <div
                className={`relative z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${iconDef.wrapClass}`}
              >
                <iconDef.IconComponent
                  className={`h-3.5 w-3.5 ${iconDef.iconClass}`}
                />
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                {/* Group header — only for multi-version groups */}
                {isMulti && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {group.subject}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
                    >
                      {group.finalStatus}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground font-medium">
                      {totalVersions} lần nộp
                    </span>
                  </div>
                )}

                {/* Versions (newest first) */}
                {versionsNewestFirst.map((ver) => {
                  const isLatest = ver.versionNumber === totalVersions
                  const versionAttachments = getAttachmentsForVersion(
                    ver.versionNumber,
                  )
                  return (
                    <div key={ver.versionNumber} className="space-y-1.5">
                      {isMulti && (
                        <p
                          className={`text-xs font-semibold ${isLatest ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          Bản {ver.versionNumber}
                          {isLatest ? " · mới nhất" : ""}
                        </p>
                      )}

                      {/* Response (approve/reject) — show first for newest-first reading */}
                      {ver.response && (
                        <div className="flex items-start gap-2">
                          <div className="mt-2 flex w-4 shrink-0 justify-center text-xs text-muted-foreground">
                            ↳
                          </div>
                          <div className="min-w-0 flex-1">
                            <EntryCard
                              resolved={ver.response}
                              attachments={[]}
                              onViewAttachment={onViewAttachment}
                              compact={isMulti}
                            />
                          </div>
                        </div>
                      )}

                      {/* Submit card */}
                      <EntryCard
                        resolved={ver.submit}
                        attachments={versionAttachments}
                        onViewAttachment={onViewAttachment}
                        compact={isMulti}
                      />
                    </div>
                  )
                })}

                {/* Standalone entries (sent / won / lost / created) */}
                {group.standalone.map((resolved) => (
                  <EntryCard
                    key={resolved.entry.id}
                    resolved={resolved}
                    attachments={attachments.filter(
                      (a) => a.stage_key === resolved.attachmentKey,
                    )}
                    onViewAttachment={onViewAttachment}
                    compact={false}
                  />
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
