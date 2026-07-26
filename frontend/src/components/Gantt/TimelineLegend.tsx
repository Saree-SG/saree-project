import {
  BLOCKED_COLOR,
  CRITICAL_PATH_COLOR,
  PROJECT_STATUS_COLOR,
  TASK_STATUS_COLOR,
  WARNING_COLOR,
} from "./timelineColors"

const TASK_ENTRIES: { color: string; label: string }[] = [
  // Warnings first — they override status on a bar, so they matter most.
  { color: WARNING_COLOR.overdue_critical, label: "Trễ hạn (nghiêm trọng)" },
  { color: WARNING_COLOR.overdue_local, label: "Trễ hạn" },
  { color: WARNING_COLOR.due_soon, label: "Sắp đến hạn" },
  { color: BLOCKED_COLOR, label: "Bị chặn" },
  { color: CRITICAL_PATH_COLOR, label: "Critical path" },
  { color: TASK_STATUS_COLOR.in_progress, label: "Đang làm" },
  { color: TASK_STATUS_COLOR.review, label: "Chờ duyệt" },
  { color: TASK_STATUS_COLOR.done, label: "Hoàn thành" },
  { color: TASK_STATUS_COLOR.todo, label: "Chưa làm" },
]

const PROJECT_ENTRIES: { color: string; label: string }[] = [
  { color: PROJECT_STATUS_COLOR.active, label: "Đang thực hiện" },
  { color: PROJECT_STATUS_COLOR.planning, label: "Lên kế hoạch" },
  { color: PROJECT_STATUS_COLOR.on_hold, label: "Tạm dừng" },
  { color: PROJECT_STATUS_COLOR.completed, label: "Hoàn thành" },
  { color: PROJECT_STATUS_COLOR.cancelled, label: "Đã huỷ" },
]

type Props = {
  variant: "task" | "project"
  /** Show the "→ phụ thuộc" hint (task view only draws arrows). */
  showDependencyHint?: boolean
}

/** Colour key for the timeline. Without it the 9 bar colours are guesswork. */
export default function TimelineLegend({ variant, showDependencyHint }: Props) {
  const entries = variant === "task" ? TASK_ENTRIES : PROJECT_ENTRIES

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
      {entries.map((e) => (
        <span key={e.label} className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-4 shrink-0 rounded-full"
            style={{ background: e.color }}
          />
          {e.label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-4 shrink-0 rounded-full border"
          style={{
            background: `${TASK_STATUS_COLOR.in_progress}28`,
            borderColor: `${TASK_STATUS_COLOR.in_progress}55`,
          }}
        />
        Phần chưa xong
      </span>
      {showDependencyHint ? (
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="font-bold">
            →
          </span>
          Phụ thuộc
        </span>
      ) : null}
    </div>
  )
}
