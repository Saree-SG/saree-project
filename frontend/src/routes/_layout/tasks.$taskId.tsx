import { Link, createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  ProjectsService,
  TasksService,
  UsersService,
  type TaskCommentPublic,
  type TaskProgressReportPublic,
  type TaskProofPublic,
  type TaskPublic,
} from "@/client"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

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

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()

  const [commentDraft, setCommentDraft] = useState("")
  const [proofNote, setProofNote] = useState("")
  const [proofUrl, setProofUrl] = useState("")
  const [progressPhotoUrl, setProgressPhotoUrl] = useState("")
  const [progressPercentInput, setProgressPercentInput] = useState("")
  const [progressNoteInput, setProgressNoteInput] = useState("")

  const taskQuery = useQuery({
    queryKey: ["task-detail", "task", taskId],
    queryFn: () => TasksService.getTask({ taskId }) as Promise<TaskPublic>,
  })

  const usersQuery = useQuery({
    queryKey: ["task-detail", "users"],
    queryFn: () => UsersService.readUsers({ limit: 500 }),
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
    queryFn: () => TasksService.listProgressReports({ taskId }) as Promise<TaskProgressReportPublic[]>,
  })

  const commentsQuery = useQuery({
    queryKey: ["task-detail", "comments", taskId],
    queryFn: () => TasksService.listComments({ taskId }) as Promise<TaskCommentPublic[]>,
  })

  const proofsQuery = useQuery({
    queryKey: ["task-detail", "proofs", taskId],
    queryFn: () => TasksService.listProofs({ taskId }) as Promise<TaskProofPublic[]>,
  })

  const userNameById = useMemo(() => {
    const data = new Map<string, string>()
    for (const user of usersQuery.data?.data ?? []) {
      data.set(user.id, user.full_name || user.email)
    }
    return data
  }, [usersQuery.data?.data])

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
      await queryClient.invalidateQueries({ queryKey: ["task-detail", "task", taskId] })
      await queryClient.invalidateQueries({ queryKey: ["task-detail", "project-tasks"] })
      await queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const addProgressReportMutation = useMutation({
    mutationFn: (pct: number) =>
      TasksService.addProgressReport({
        taskId,
        requestBody: {
          photo_url: progressPhotoUrl.trim(),
          progress_percent: pct,
          note: progressNoteInput.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      showSuccessToast("Đã gửi báo cáo tiến độ")
      setProgressPhotoUrl("")
      setProgressPercentInput("")
      setProgressNoteInput("")
      await queryClient.invalidateQueries({ queryKey: ["task-detail", "task", taskId] })
      await queryClient.invalidateQueries({ queryKey: ["task-detail", "progress-reports", taskId] })
      await queryClient.invalidateQueries({ queryKey: ["task-detail", "project-tasks"] })
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
      await queryClient.invalidateQueries({ queryKey: ["task-detail", "comments", taskId] })
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
      await queryClient.invalidateQueries({ queryKey: ["task-detail", "proofs", taskId] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const task = taskQuery.data

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-24 pt-3 sm:px-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active Project</p>
            <h2 className="text-lg font-bold">{projectQuery.data?.name ?? "Project"}</h2>
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
            <p className="text-sm text-muted-foreground">Due {task ? new Date(task.end_time).toLocaleString() : "-"}</p>
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
              task?.status === "todo" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => updateStatusMutation.mutate("todo")}
          >
            Pending
          </button>
          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-3 text-[10px] font-bold",
              task?.status === "in_progress" ? "bg-primary text-white" : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => updateStatusMutation.mutate("in_progress")}
          >
            Working
          </button>
          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-3 text-[10px] font-bold",
              task?.status === "done" ? "bg-green-600 text-white" : "bg-slate-100 text-slate-600",
            ].join(" ")}
            onClick={() => updateStatusMutation.mutate("done")}
          >
            Complete
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Description</h4>
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
          Thợ chụp ảnh hiện trường, gửi % hoàn thành trong lần báo cáo. Tổng các lần đạt 100% thì task tự chuyển sang Done.
        </p>
        <progress
          max={100}
          value={Math.min(100, task?.reported_progress_total ?? 0)}
          className="h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
        />
        <div className="rounded-lg border bg-white p-3">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor="progress-photo-url" className="text-[11px] font-semibold text-muted-foreground">
                Link ảnh (URL sau khi chụp / upload)
              </label>
              <input
                id="progress-photo-url"
                value={progressPhotoUrl}
                onChange={(eventValue) => setProgressPhotoUrl(eventValue.target.value)}
                placeholder="https://..."
                disabled={task?.status === "done"}
                className="h-9 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-60"
              />
            </div>
            <div className="w-full space-y-1 sm:w-24">
              <label htmlFor="progress-pct" className="text-[11px] font-semibold text-muted-foreground">
                % (1–100)
              </label>
              <input
                id="progress-pct"
                inputMode="numeric"
                value={progressPercentInput}
                onChange={(eventValue) => setProgressPercentInput(eventValue.target.value)}
                placeholder="30"
                disabled={task?.status === "done"}
                className="h-9 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-60"
              />
            </div>
          </div>
          <div className="mb-3 space-y-1">
            <label htmlFor="progress-note" className="text-[11px] font-semibold text-muted-foreground">
              Ghi chú (tuỳ chọn)
            </label>
            <input
              id="progress-note"
              value={progressNoteInput}
              onChange={(eventValue) => setProgressNoteInput(eventValue.target.value)}
              placeholder="Mô tả ngắn..."
              disabled={task?.status === "done"}
              className="h-9 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            title="Gửi báo cáo tiến độ"
            className="h-9 w-full rounded-md bg-primary text-sm font-bold text-white disabled:opacity-60 sm:w-auto sm:px-6"
            disabled={task?.status === "done" || addProgressReportMutation.isPending}
            onClick={() => {
              const pct = parseProgressPercent(progressPercentInput.trim())
              if (!progressPhotoUrl.trim()) {
                showErrorToast("Cần link ảnh")
                return
              }
              if (pct === null) {
                showErrorToast("Nhập % từ 1 đến 100")
                return
              }
              addProgressReportMutation.mutate(pct)
            }}
          >
            Gửi báo cáo
          </button>
        </div>
        <div className="space-y-3">
          {(progressReportsQuery.data ?? []).map((row) => (
            <div key={row.id} className="flex gap-3 rounded-lg border bg-slate-50 p-3">
              <a
                href={row.photo_url}
                target="_blank"
                rel="noreferrer"
                title="Xem ảnh báo cáo"
                className="shrink-0"
              >
                <img
                  src={row.photo_url}
                  alt="Ảnh báo cáo tiến độ"
                  className="h-20 w-20 rounded-md border object-cover"
                />
              </a>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold text-primary">+{row.progress_percent}%</p>
                <p className="text-[11px] text-muted-foreground">
                  {row.reporter_name ?? userNameById.get(row.reporter_id) ?? row.reporter_id}
                  {" · "}
                  {new Date(row.created_at).toLocaleString()}
                </p>
                {row.note ? <p className="mt-1 text-[13px]">{row.note}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Result & Evidence</h4>
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
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Discussion</h4>
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <div className="space-y-2">
            {(commentsQuery.data ?? []).map((comment) => (
              <div key={comment.id} className="max-w-[90%] rounded-2xl border bg-slate-50 p-3 text-sm">
                <p className="mb-1 text-[10px] font-bold text-muted-foreground">
                  {comment.author_name ?? userNameById.get(comment.author_id) ?? comment.author_id}
                </p>
                <p>{comment.content}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={commentDraft}
              onChange={(eventValue) => setCommentDraft(eventValue.target.value)}
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
    </div>
  )
}
