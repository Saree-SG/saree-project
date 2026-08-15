import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Zap,
} from "lucide-react"

import {
  type DelayWarning,
  fetchDelayWarnings,
} from "@/modules/project/delayApi"

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY = {
  red: {
    bg: "bg-red-50 border-red-200",
    icon: "text-red-500",
    badge: "bg-red-100 text-red-700 border-red-200",
    label: "Nghiêm trọng",
    IconComponent: Zap,
  },
  orange: {
    bg: "bg-orange-50 border-orange-200",
    icon: "text-orange-500",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    label: "Cảnh báo",
    IconComponent: AlertTriangle,
  },
  yellow: {
    bg: "bg-yellow-50 border-yellow-200",
    icon: "text-yellow-500",
    badge: "bg-yellow-100 text-yellow-700 border-yellow-200",
    label: "Chú ý",
    IconComponent: Clock,
  },
}

const LAYER_LABEL: Record<number, string> = {
  1: "Đường găng",
  2: "Thời gian đệm",
  3: "Tốc độ tiến độ",
  4: "Phụ thuộc",
}

// ---------------------------------------------------------------------------
// Single warning card
// ---------------------------------------------------------------------------

function WarningCard({
  warning,
  onTaskClick,
}: {
  warning: DelayWarning
  onTaskClick: (taskId: string) => void
}) {
  const cfg = SEVERITY[warning.severity] ?? SEVERITY.yellow
  const { IconComponent } = cfg

  return (
    <div
      className={`rounded-lg border p-4 ${cfg.bg} transition-shadow hover:shadow-md`}
    >
      <div className="flex items-start gap-3">
        <IconComponent className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.icon}`} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{warning.title}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}
            >
              {cfg.label}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              Mức độ {warning.layer} · {LAYER_LABEL[warning.layer]}
            </span>
            {warning.estimated_delay_days != null && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                Trễ ~{warning.estimated_delay_days} ngày
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">{warning.detail}</p>
          {warning.task_id && (
            <button
              type="button"
              onClick={() => onTaskClick(warning.task_id!)}
              className="mt-2 text-xs font-medium text-blue-600 hover:underline"
            >
              Xem công việc →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DelayWarningsProps {
  projectId: string
}

export function DelayWarnings({ projectId }: DelayWarningsProps) {
  const navigate = useNavigate()

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["delay-warnings", projectId],
    queryFn: () => fetchDelayWarnings(projectId),
    refetchInterval: 5 * 60 * 1000, // re-analyze every 5 min
    staleTime: 2 * 60 * 1000,
  })

  function handleTaskClick(taskId: string) {
    navigate({ to: "/tasks/$taskId", params: { taskId } })
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Đang phân tích rủi ro trễ tiến độ...
      </div>
    )
  }

  if (isError) {
    return (
      <p className="text-sm text-red-500">
        Không thể tải phân tích rủi ro. Vui lòng thử lại.
      </p>
    )
  }

  const warnings = data?.warnings ?? []

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-gray-700">
            Phân tích rủi ro trễ tiến độ
          </h3>
          {warnings.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
              {warnings.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
          />
          Làm mới
        </button>
      </div>

      {/* Warning list or empty state */}
      {warnings.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <p className="text-sm text-green-700">
            Không phát hiện rủi ro trễ tiến độ. Dự án đang diễn ra đúng kế
            hoạch.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {warnings.map((w, idx) => (
            <WarningCard
              key={`${w.layer}-${w.task_id ?? idx}`}
              warning={w}
              onTaskClick={handleTaskClick}
            />
          ))}
        </div>
      )}

      {/* Timestamp */}
      {data?.analyzed_at && (
        <p className="text-right text-xs text-gray-400">
          Phân tích lúc:{" "}
          {new Date(data.analyzed_at).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </p>
      )}
    </section>
  )
}
