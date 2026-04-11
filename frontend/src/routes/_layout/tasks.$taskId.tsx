import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo, useRef, useState } from "react"

import {
  ProjectsService,
  type TaskCommentPublic,
  type TaskProgressReportPublic,
  type TaskProofPublic,
  type TaskPublic,
  TasksService,
} from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import useCustomToast from "@/hooks/useCustomToast"
import { uploadTaskProgressPhoto } from "@/modules/tasks/taskProgressApi"
import { handleError } from "@/utils"
import { resolveBackendMediaUrl } from "@/utils/mediaUrl"

export const Route = createFileRoute("/_layout/tasks/$taskId")({
  component: TaskDetailPage,
})

/**
 * Parses worker input for reported percent; returns null if not an integer from 1 to 100.
 */
function parseProgressPercent(raw: string): number | null {
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n < 1 || n > 100) {
    return null
  }
  return n
}

/**
 * Returns the maximum percent allowed for the next report so the cumulative total does not exceed 100.
 */
function maxNextProgressPercentFromTotal(
  reportedTotal: number | undefined,
): number {
  const capped = Math.min(100, Math.max(0, reportedTotal ?? 0))
  return Math.max(0, 100 - capped)
}

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()

  const [commentDraft, setCommentDraft] = useState("")
  const [proofNote, setProofNote] = useState("")
  const [proofUrl, setProofUrl] = useState("")
  const progressPhotoInputRef = useRef<HTMLInputElement>(null)
  const [progressPhotoFile, setProgressPhotoFile] = useState<File | null>(null)
  const [progressPhotoPreview, setProgressPhotoPreview] = useState<
    string | null
  >(null)
  const [progressPercentInput, setProgressPercentInput] = useState("")
  const [progressNoteInput, setProgressNoteInput] = useState("")
  const [progressImageLightboxUrl, setProgressImageLightboxUrl] = useState<
    string | null
  >(null)

  const taskQuery = useQuery({
    queryKey: ["task-detail", "task", taskId],
    queryFn: () => TasksService.getTask({ taskId }) as Promise<TaskPublic>,
  })

  const siblingTasksQuery = useQuery({
    enabled: Boolean(taskQuery.data?.project_id),
    queryKey: ["task-detail", "project-tasks", taskQuery.data?.project_id],
    queryFn: () =>
      TasksService.listProjectTasks({
        projectId: taskQuery.data!.project_id,
        limit: 50,
      }),
  })

  const projectQuery = useQuery({
    enabled: Boolean(taskQuery.data?.project_id),
    queryKey: ["task-detail", "project", taskQuery.data?.project_id],
    queryFn: () =>
      ProjectsService.getProject({
        projectId: taskQuery.data!.project_id,
      }),
  })

  const progressReportsQuery = useQuery({
    queryKey: ["task-detail", "progress-reports", taskId],
    queryFn: () =>
      TasksService.listProgressReports({ taskId }) as Promise<
        TaskProgressReportPublic[]
      >,
  })

  const commentsQuery = useQuery({
    queryKey: ["task-detail", "comments", taskId],
    queryFn: () =>
      TasksService.listComments({ taskId }) as Promise<TaskCommentPublic[]>,
  })

  const proofsQuery = useQuery({
    queryKey: ["task-detail", "proofs", taskId],
    queryFn: () =>
      TasksService.listProofs({ taskId }) as Promise<TaskProofPublic[]>,
  })

  const activeTasks = useMemo(() => {
    return (siblingTasksQuery.data?.data ?? [])
      .filter((task) => task.status !== "done")
      .slice(0, 8)
  }, [siblingTasksQuery.data?.data])

  const updateStatusMutation = useMutation({
    mutationFn: (status: "todo" | "in_progress" | "done") =>
      TasksService.updateTaskStatus({ taskId, requestBody: { status } }),
    onSuccess: async () => {
      showSuccessToast("Task status updated")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "project-tasks"],
      })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const clearProgressPhotoPick = () => {
    setProgressPhotoFile(null)
    setProgressPhotoPreview((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous)
      }
      return null
    })
    if (progressPhotoInputRef.current) {
      progressPhotoInputRef.current.value = ""
    }
  }

  const addProgressReportMutation = useMutation({
    mutationFn: async (payload: { pct: number; file: File }) => {
      const { photo_url } = await uploadTaskProgressPhoto({
        taskId,
        file: payload.file,
      })
      return TasksService.addProgressReport({
        taskId,
        requestBody: {
          photo_url,
          progress_percent: payload.pct,
          note: progressNoteInput.trim() || undefined,
        },
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã gửi báo cáo tiến độ")
      clearProgressPhotoPick()
      setProgressPercentInput("")
      setProgressNoteInput("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "task", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "progress-reports", taskId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "project-tasks"],
      })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const addCommentMutation = useMutation({
    mutationFn: () =>
      TasksService.addComment({
        taskId,
        requestBody: { content: commentDraft, comment_type: "general" },
      }),
    onSuccess: async () => {
      showSuccessToast("Comment sent")
      setCommentDraft("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "comments", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const addProofMutation = useMutation({
    mutationFn: () =>
      TasksService.uploadProof({
        taskId,
        requestBody: {
          file_url: proofUrl,
          note: proofNote || undefined,
          file_type: "image",
        },
      }),
    onSuccess: async () => {
      showSuccessToast("Evidence uploaded")
      setProofUrl("")
      setProofNote("")
      await queryClient.invalidateQueries({
        queryKey: ["task-detail", "proofs", taskId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const task = taskQuery.data

  const maxRemainingProgress = useMemo(
    () => maxNextProgressPercentFromTotal(task?.reported_progress_total),
    [task?.reported_progress_total],
  )

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-24 pt-3 sm:px-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Active Project
            </p>
            <h2 className="text-lg font-bold">
              {projectQuery.data?.name ?? "Project"}
            </h2>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Task Detail
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {activeTasks.map((item) => (
            <Link
              key={item.id}
              to="/tasks/$taskId"
              params={{ taskId: item.id }}
              title={item.name}
              className={[
                "shrink-0 rounded-lg px-4 py-1.5 text-xs font-medium",
                item.id === taskId
                  ? "bg-primary text-white"
                  : "border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200",
              ].join(" ")}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-bold">{task?.name ?? "Task"}</h3>
            <p className="text-sm text-muted-foreground">
              Due {task ? new Date(task.end_time).toLocaleString() : "-"}
            </p>
          </div>
          <span className="rounded bg-primary/10 px-2 py-1 text-[10px] font-black uppercase text-primary">
            {task?.status ?? "todo"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-3 text-[10px] font-bold",
              task?.status === "todo"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => updateStatusMutation.mutate("todo")}
          >
            Pending
          </button>
          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-3 text-[10px] font-bold",
              task?.status === "in_progress"
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => updateStatusMutation.mutate("in_progress")}
          >
            Working
          </button>
          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-3 text-[10px] font-bold",
              task?.status === "done"
                ? "bg-green-600 text-white"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => updateStatusMutation.mutate("done")}
          >
            Complete
          </button>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Người thực hiện & giao việc
        </h4>
        <p className="text-sm">
          <span className="font-semibold text-primary">Thực hiện:</span>{" "}
          {task?.assignee_name?.trim() || task?.assignee_id || "—"}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold">Giao bởi:</span>{" "}
          {task?.assignor_name?.trim() || task?.assignor_id || "—"}
        </p>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Description
        </h4>
        <div className="rounded-lg bg-slate-100 p-4 text-sm leading-relaxed">
          {task?.description || "No description."}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Báo cáo tiến độ (ảnh + %)
          </h4>
          <p className="text-sm font-bold text-primary">
            Tổng: {task?.reported_progress_total ?? 0}%
            {task?.status === "done" ? " · Hoàn thành" : ""}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Đính kèm ảnh chụp từ máy (hoặc máy ảnh điện thoại), nhập % hoàn thành
          cho lần báo cáo. Tổng các lần đạt 100% thì task tự chuyển sang Done.
        </p>
        <progress
          max={100}
          value={Math.min(100, task?.reported_progress_total ?? 0)}
          className="h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
        />
        <div className="rounded-lg border bg-white p-3">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <label
                htmlFor="progress-photo-file"
                className="text-[11px] font-semibold text-muted-foreground"
              >
                Ảnh hiện trường
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="progress-photo-file"
                  ref={progressPhotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  title="Chọn hoặc chụp ảnh báo cáo"
                  aria-label="Chọn hoặc chụp ảnh báo cáo tiến độ"
                  className="sr-only"
                  disabled={task?.status === "done"}
                  onChange={(eventValue) => {
                    const file = eventValue.target.files?.[0]
                    if (!file) {
                      return
                    }
                    if (!file.type.startsWith("image/")) {
                      showErrorToast("Chỉ chọn file ảnh")
                      return
                    }
                    setProgressPhotoFile(file)
                    setProgressPhotoPreview((previous) => {
                      if (previous) {
                        URL.revokeObjectURL(previous)
                      }
                      return URL.createObjectURL(file)
                    })
                  }}
                />
                <button
                  type="button"
                  title="Chọn hoặc chụp ảnh"
                  disabled={task?.status === "done"}
                  className="h-9 rounded-md border bg-slate-50 px-3 text-xs font-bold text-slate-700 disabled:opacity-60"
                  onClick={() => progressPhotoInputRef.current?.click()}
                >
                  Chọn / chụp ảnh
                </button>
                {progressPhotoFile ? (
                  <button
                    type="button"
                    title="Bỏ ảnh"
                    className="h-9 rounded-md border px-3 text-xs font-semibold text-muted-foreground"
                    onClick={clearProgressPhotoPick}
                  >
                    Bỏ ảnh
                  </button>
                ) : null}
              </div>
              {progressPhotoPreview ? (
                <button
                  type="button"
                  title="Phóng to ảnh"
                  className="mt-1 block max-w-full cursor-zoom-in rounded-md border-0 bg-transparent p-0 text-left"
                  onClick={() =>
                    setProgressImageLightboxUrl(progressPhotoPreview)
                  }
                >
                  <img
                    src={progressPhotoPreview}
                    alt="Xem trước ảnh báo cáo"
                    className="h-24 max-w-full rounded-md border object-cover"
                  />
                </button>
              ) : null}
            </div>
            <div className="w-full space-y-1 sm:w-24">
              <label
                htmlFor="progress-pct"
                className="text-[11px] font-semibold text-muted-foreground"
              >
                % tiến độ (1–100)
              </label>
              <input
                id="progress-pct"
                inputMode="numeric"
                value={progressPercentInput}
                onChange={(eventValue) =>
                  setProgressPercentInput(eventValue.target.value)
                }
                placeholder="30"
                disabled={task?.status === "done"}
                className="h-9 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-60"
              />
            </div>
          </div>
          <div className="mb-3 space-y-1">
            <label
              htmlFor="progress-note"
              className="text-[11px] font-semibold text-muted-foreground"
            >
              Ghi chú (tuỳ chọn)
            </label>
            <input
              id="progress-note"
              value={progressNoteInput}
              onChange={(eventValue) =>
                setProgressNoteInput(eventValue.target.value)
              }
              placeholder="Mô tả ngắn..."
              disabled={task?.status === "done"}
              className="h-9 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            title="Gửi báo cáo tiến độ"
            className="h-9 w-full rounded-md bg-primary text-sm font-bold text-white disabled:opacity-60 sm:w-auto sm:px-6"
            disabled={
              task?.status === "done" || addProgressReportMutation.isPending
            }
            onClick={() => {
              const pct = parseProgressPercent(progressPercentInput.trim())
              if (!progressPhotoFile) {
                showErrorToast("Chọn ảnh từ máy")
                return
              }
              if (pct === null) {
                showErrorToast("Nhập % từ 1 đến 100")
                return
              }
              if (pct > maxRemainingProgress) {
                showErrorToast(
                  `Tối đa ${maxRemainingProgress}% cho lần này (tổng không vượt quá 100%).`,
                )
                return
              }
              addProgressReportMutation.mutate({ pct, file: progressPhotoFile })
            }}
          >
            Gửi báo cáo
          </button>
        </div>
        <div className="space-y-3">
          {(progressReportsQuery.data ?? []).map((row) => (
            <div
              key={row.id}
              className="flex gap-3 rounded-lg border bg-slate-50 p-3"
            >
              <button
                type="button"
                title="Xem ảnh báo cáo"
                className="shrink-0 cursor-zoom-in rounded-md border-0 bg-transparent p-0"
                onClick={() =>
                  setProgressImageLightboxUrl(
                    resolveBackendMediaUrl(row.photo_url),
                  )
                }
              >
                <img
                  src={resolveBackendMediaUrl(row.photo_url)}
                  alt="Ảnh báo cáo tiến độ"
                  className="h-20 w-20 rounded-md border object-cover"
                />
              </button>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold text-primary">
                  +{row.progress_percent}%
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {row.reporter_name ?? row.reporter_id}
                  {" · "}
                  {new Date(row.created_at).toLocaleString()}
                </p>
                {row.note ? (
                  <p className="mt-1 text-[13px]">{row.note}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Result & Evidence
        </h4>
        <div className="space-y-2 rounded-lg border bg-white p-4">
          <textarea
            value={proofNote}
            onChange={(eventValue) => setProofNote(eventValue.target.value)}
            placeholder="Type your findings here..."
            className="min-h-[90px] w-full rounded-md border p-3 text-sm outline-none"
          />
          <div className="flex gap-2">
            <input
              value={proofUrl}
              onChange={(eventValue) => setProofUrl(eventValue.target.value)}
              placeholder="Proof image URL..."
              className="h-10 flex-1 rounded-md border px-3 text-sm outline-none"
            />
            <button
              type="button"
              className="h-10 rounded-md border px-3 text-xs font-bold"
              onClick={() => {
                if (!proofUrl.trim()) return
                addProofMutation.mutate()
              }}
            >
              Add Photo
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(proofsQuery.data ?? []).map((proof) => (
              <a
                key={proof.id}
                href={proof.file_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border bg-slate-50 px-3 py-2 text-[11px] text-primary"
              >
                Evidence
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Discussion
        </h4>
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <div className="space-y-2">
            {(commentsQuery.data ?? []).map((comment) => (
              <div
                key={comment.id}
                className="max-w-[90%] rounded-2xl border bg-slate-50 p-3 text-sm"
              >
                <p className="mb-1 text-[10px] font-bold text-muted-foreground">
                  {comment.author_name ?? comment.author_id}
                </p>
                <p>{comment.content}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={commentDraft}
              onChange={(eventValue) =>
                setCommentDraft(eventValue.target.value)
              }
              placeholder="Send a message..."
              className="h-10 flex-1 rounded-full border px-4 text-sm outline-none"
            />
            <button
              type="button"
              className="h-10 w-10 rounded-full bg-primary text-white"
              onClick={() => {
                if (!commentDraft.trim()) return
                addCommentMutation.mutate()
              }}
            >
              →
            </button>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="w-full rounded-xl bg-primary py-4 text-base font-bold text-white"
        onClick={() => showSuccessToast("Task changes synced")}
      >
        Save & Update Task
      </button>

      <Dialog
        open={Boolean(progressImageLightboxUrl)}
        onOpenChange={(open) => {
          if (!open) {
            setProgressImageLightboxUrl(null)
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[min(95vw,56rem)] overflow-y-auto sm:max-w-3xl"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Ảnh báo cáo tiến độ</DialogTitle>
          </DialogHeader>
          {progressImageLightboxUrl ? (
            <img
              src={progressImageLightboxUrl}
              alt="Ảnh báo cáo tiến độ phóng to"
              className="mx-auto max-h-[70vh] w-full object-contain"
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProgressImageLightboxUrl(null)}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
