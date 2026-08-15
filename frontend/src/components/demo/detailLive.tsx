import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import {
  DashboardService,
  IncidentsService,
  TasksService,
  UsersService,
} from "@/client"
import {
  fetchMySkillRequests,
  fetchSkills,
  fetchUserSkills,
  saveUserSkills,
  submitSkillRequest,
} from "@/modules/skills/skillApi"

import { Row } from "./detail"

/**
 * Body chi tiết đọc DỮ LIỆU THẬT theo id (drill-down khi bật "Dữ liệu thật").
 * Dùng endpoint đã có sẵn — không đụng DB.
 */

function Loading() {
  return (
    <p className="py-6 text-center text-sm text-slate-400">
      Đang tải chi tiết...
    </p>
  )
}
function Sec({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="pt-3">
      <p className="mb-1 text-xs font-semibold text-slate-600">{title}</p>
      {children}
    </div>
  )
}
function fmt(d?: string) {
  return d
    ? new Date(d).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      })
    : "—"
}

// ── Nhân viên → công việc + kỹ năng thật ────────────────────────────────────
type UTask = {
  id?: string
  name?: string
  status?: string
  computed_status?: string
  end_time?: string
  project_name?: string
}

const LEVELS = [1, 2, 3, 4, 5]
const LEVEL_LABEL: Record<number, string> = {
  1: "Cơ bản",
  2: "Trung bình",
  3: "Khá",
  4: "Giỏi",
  5: "Chuyên gia",
}

type StaffMeta = {
  name?: string
  group?: string
  load?: number
  status?: string
}

const LOAD_BADGE: Record<string, string> = {
  free: "bg-emerald-100 text-emerald-700",
  stable: "bg-blue-100 text-blue-700",
  overloaded: "bg-red-100 text-red-700",
}
const LOAD_LABEL_MAP: Record<string, string> = {
  free: "Đang rảnh",
  stable: "Đang làm",
  overloaded: "Quá tải",
}
const TASK_STATUS_CLS: Record<string, string> = {
  todo: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
}
const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "Chờ làm",
  in_progress: "Đang làm",
  done: "Hoàn thành",
  overdue: "Trễ",
}

export function StaffDetailLive({
  userId,
  meta,
}: {
  userId: string
  meta?: StaffMeta
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editSkills, setEditSkills] = useState(false)
  const [draft, setDraft] = useState<{ skill_id: string; level: number }[]>([])
  // Thông tin người đang đăng nhập
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => UsersService.readUserMe(),
    staleTime: 60_000,
  })
  const currentUserId = me.data?.id
  const isSelf = currentUserId === userId
  // Manager/giám đốc: có thể sửa thẳng (role level ≤ 2 hoặc superuser)
  const canDirectEdit = me.data?.is_superuser || false // sẽ refine khi có role info

  const tasks = useQuery({
    queryKey: ["detail", "userTasks", userId],
    queryFn: () =>
      DashboardService.userTasks({ userId }) as unknown as Promise<UTask[]>,
  })
  const userSkills = useQuery({
    queryKey: ["userSkills", userId],
    queryFn: () => fetchUserSkills(userId),
  })
  const allSkills = useQuery({ queryKey: ["skills"], queryFn: fetchSkills })
  const myRequests = useQuery({
    queryKey: ["mySkillRequests"],
    queryFn: fetchMySkillRequests,
    enabled: isSelf,
  })

  // Manager sửa thẳng
  const saveMut = useMutation({
    mutationFn: () => saveUserSkills(userId, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userSkills", userId] })
      setEditSkills(false)
    },
    onError: () => {},
  })

  // Nhân viên gửi request
  const submitMut = useMutation({
    mutationFn: () => submitSkillRequest(draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mySkillRequests"] })
      setEditSkills(false)
    },
    onError: () => {},
  })

  function startEdit() {
    setDraft(
      (userSkills.data ?? []).map((s) => ({
        skill_id: s.skill_id,
        level: s.level,
      })),
    )
    setEditSkills(true)
  }
  function toggleSkill(skillId: string) {
    setDraft((prev) =>
      prev.some((s) => s.skill_id === skillId)
        ? prev.filter((s) => s.skill_id !== skillId)
        : [...prev, { skill_id: skillId, level: 1 }],
    )
  }
  function setLevel(skillId: string, level: number) {
    setDraft((prev) =>
      prev.map((s) => (s.skill_id === skillId ? { ...s, level } : s)),
    )
  }

  if (tasks.isLoading || userSkills.isLoading) return <Loading />

  const taskList = tasks.data ?? []
  const initials = (meta?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(-2)
    .join("")
    .toUpperCase()
  const byCategory = (allSkills.data ?? []).reduce<
    Record<string, typeof allSkills.data>
  >((acc, s) => {
    if (!s) return acc
    ;(acc[s.category] = acc[s.category] ?? []).push(s)
    return acc
  }, {})

  // Yêu cầu đang chờ duyệt (nếu xem chính mình)
  const pendingRequest = isSelf
    ? (myRequests.data ?? []).find((r) => r.status === "pending")
    : undefined

  void canDirectEdit

  return (
    <div className="space-y-4">
      {/* ── Header nhân viên ── */}
      {meta?.name && (
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-blue-50 to-slate-50 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-800">
              {meta.name}
            </p>
            {meta.group && (
              <p className="text-xs text-slate-500">{meta.group}</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {meta.status && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${LOAD_BADGE[meta.status] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {LOAD_LABEL_MAP[meta.status] ?? meta.status}
                </span>
              )}
              {meta.load != null && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  Tải {meta.load}%
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {taskList.length} công việc
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Banner yêu cầu đang chờ duyệt ── */}
      {pendingRequest && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-800">
            ⏳ Đang chờ quản lý duyệt kỹ năng
          </p>
          <p className="text-[11px] text-amber-600">
            Gửi lúc{" "}
            {new Date(pendingRequest.created_at).toLocaleDateString("vi-VN")} ·{" "}
            {pendingRequest.requested_skills.length} kỹ năng đề xuất
          </p>
        </div>
      )}

      {/* ── Kỹ năng ── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600">
            Kỹ năng ({userSkills.data?.length ?? 0})
          </p>
          {!editSkills && !pendingRequest && (
            <button
              onClick={startEdit}
              className="text-[11px] font-medium text-blue-600 hover:underline"
            >
              {isSelf ? "Đề xuất thay đổi" : "Chỉnh sửa"}
            </button>
          )}
        </div>

        {!editSkills ? (
          <div className="flex flex-wrap gap-1.5">
            {(userSkills.data ?? []).length === 0 && (
              <p className="text-xs text-slate-400">Chưa có kỹ năng nào.</p>
            )}
            {(userSkills.data ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1"
              >
                <span className="text-xs font-medium text-blue-800">
                  {s.skill_name}
                </span>
                <div className="flex gap-0.5">
                  {LEVELS.map((l) => (
                    <span
                      key={l}
                      className={`h-1.5 w-1.5 rounded-full ${l <= s.level ? "bg-blue-500" : "bg-blue-200"}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
            {Object.entries(byCategory).map(([cat, skills]) => (
              <div key={cat}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {cat}
                </p>
                <div className="space-y-1">
                  {(skills ?? []).map((sk) => {
                    const selected = draft.find((d) => d.skill_id === sk.id)
                    return (
                      <label
                        key={sk.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 hover:border-blue-200"
                      >
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleSkill(sk.id)}
                          className="accent-blue-600"
                        />
                        <span className="flex-1 text-xs text-slate-700">
                          {sk.name}
                        </span>
                        {selected && (
                          <select
                            value={selected.level}
                            onChange={(e) =>
                              setLevel(sk.id, Number(e.target.value))
                            }
                            className="rounded-md border px-1.5 py-0.5 text-xs"
                          >
                            {LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {l} — {LEVEL_LABEL[l]}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            {(saveMut.isError || submitMut.isError) && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                Không thể lưu kỹ năng. Vui lòng thử lại.
              </p>
            )}
            {submitMut.isSuccess && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                ✓ Đã gửi yêu cầu. Quản lý sẽ duyệt sớm.
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => (isSelf ? submitMut.mutate() : saveMut.mutate())}
                disabled={saveMut.isPending || submitMut.isPending}
              >
                {saveMut.isPending || submitMut.isPending
                  ? "Đang gửi..."
                  : isSelf
                    ? "Gửi đề xuất"
                    : "Lưu kỹ năng"}
              </button>
              <button
                className="rounded-lg border bg-white px-4 py-2 text-xs text-slate-500 hover:bg-slate-50"
                onClick={() => setEditSkills(false)}
              >
                Huỷ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Công việc ── */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-600">
          Công việc ({taskList.length})
        </p>
        <div className="space-y-1.5">
          {taskList.length ? (
            taskList.map((t, i) => {
              const st = t.computed_status ?? t.status ?? ""
              const stCls = TASK_STATUS_CLS[st] ?? "bg-slate-100 text-slate-600"
              const stLabel = TASK_STATUS_LABEL[st] ?? st
              return (
                <button
                  key={i}
                  disabled={!t.id}
                  onClick={() =>
                    t.id &&
                    navigate({ to: "/tasks/$taskId", params: { taskId: t.id } })
                  }
                  className="flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-default"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-800">
                      {t.name ?? "—"}
                    </p>
                    {t.end_time && (
                      <p className="text-[10px] text-slate-400">
                        Hạn {fmt(t.end_time)}
                      </p>
                    )}
                  </div>
                  {stLabel && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stCls}`}
                    >
                      {stLabel}
                    </span>
                  )}
                  {t.id && <span className="shrink-0 text-slate-300">›</span>}
                </button>
              )
            })
          ) : (
            <p className="rounded-xl border bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
              Chưa có công việc.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Công trình → task thật của nó ───────────────────────────────────────────
type PTask = {
  id?: string
  name?: string
  status?: string
  computed_status?: string
  end_time?: string
  assignee_name?: string
  reported_progress_total?: number
}
export function SiteDetailLive({
  projectId,
  address,
}: {
  projectId: string
  address?: string
}) {
  const q = useQuery({
    queryKey: ["detail", "projectTasks", projectId],
    queryFn: () =>
      TasksService.listProjectTasks({ projectId }) as unknown as Promise<
        PTask[]
      >,
  })
  const tasks = q.data ?? []
  return (
    <div className="pt-2">
      {address ? <Row k="Địa chỉ" v={address} /> : null}
      <Row k="Số công việc" v={q.isLoading ? "…" : tasks.length} />
      <Sec title="Công việc tại công trình">
        {q.isLoading ? (
          <Loading />
        ) : (
          <div className="space-y-1">
            {tasks.length ? (
              tasks.map((t, i) => (
                <div
                  key={t.id ?? i}
                  className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-slate-700">
                      {t.name ?? "—"}
                    </span>
                    <span className="shrink-0 text-blue-600">
                      {Math.round(t.reported_progress_total ?? 0)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {t.computed_status ?? t.status ?? ""}
                    {t.assignee_name ? ` · ${t.assignee_name}` : ""}
                    {t.end_time ? ` · Hạn ${fmt(t.end_time)}` : ""}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Chưa có công việc.</p>
            )}
          </div>
        )}
      </Sec>
    </div>
  )
}

// ── Công việc → lịch sử tiến độ thật ────────────────────────────────────────
type Report = {
  progress_percent?: number
  note?: string
  created_at?: string
  reporter_name?: string
}
export function TaskDetailLive({
  taskId,
  meta,
}: {
  taskId: string
  meta?: {
    site?: string
    skill?: string
    deadline?: string
    assignees?: string[]
  }
}) {
  const q = useQuery({
    queryKey: ["detail", "progressReports", taskId],
    queryFn: () =>
      TasksService.listProgressReports({ taskId }) as unknown as Promise<
        Report[]
      >,
  })
  const reports = q.data ?? []
  return (
    <div className="pt-2">
      {meta?.site ? <Row k="Công trình" v={meta.site} /> : null}
      {meta?.skill ? <Row k="Loại việc" v={meta.skill} /> : null}
      {meta?.deadline ? <Row k="Hạn" v={meta.deadline} /> : null}
      {meta?.assignees?.length ? (
        <Row k="Nhân sự" v={meta.assignees.join(", ")} />
      ) : null}
      <Sec title="Lịch sử tiến độ">
        {q.isLoading ? (
          <Loading />
        ) : (
          <div className="space-y-1">
            {reports.length ? (
              reports.map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">
                      {r.note ||
                        `Cập nhật ${Math.round(r.progress_percent ?? 0)}%`}
                    </span>
                    <span className="shrink-0 text-slate-400">
                      {fmt(r.created_at)}
                    </span>
                  </div>
                  {r.reporter_name ? (
                    <p className="text-[11px] text-slate-400">
                      bởi {r.reporter_name}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Chưa có báo cáo tiến độ.</p>
            )}
          </div>
        )}
      </Sec>
    </div>
  )
}

// ── Sự cố → chi tiết thật ───────────────────────────────────────────────────
type Inc = {
  title?: string
  description?: string
  category?: string
  severity?: string
  status?: string
  root_cause?: string
  solution?: string
}
export function IncidentDetailLive({ incidentId }: { incidentId: string }) {
  const q = useQuery({
    queryKey: ["detail", "incident", incidentId],
    queryFn: () =>
      IncidentsService.getIncident({ incidentId }) as unknown as Promise<Inc>,
  })
  if (q.isLoading) return <Loading />
  const i = q.data ?? {}
  return (
    <div className="pt-2">
      <Row k="Tiêu đề" v={i.title ?? "—"} />
      <Row k="Mô tả" v={i.description ?? "—"} />
      <Row k="Hạng mục" v={i.category ?? "—"} />
      <Row k="Mức độ" v={i.severity ?? "—"} />
      <Row k="Trạng thái" v={i.status ?? "—"} />
      {i.root_cause ? <Row k="Nguyên nhân" v={i.root_cause} /> : null}
      {i.solution ? <Row k="Giải pháp" v={i.solution} /> : null}
    </div>
  )
}
