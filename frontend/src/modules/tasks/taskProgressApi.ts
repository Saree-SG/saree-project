import axios from "axios"

import type { TaskProgressReportPublic } from "@/client"
import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

/**
 * Progress report with the review fields the backend now returns. The generated
 * client type predates the merge of proof → progress report, so we widen it here
 * until the client is regenerated.
 */
export type ProgressReportWithReview = TaskProgressReportPublic & {
  review_status: "pending" | "approved" | "rejected"
  reviewer_id?: string | null
  reviewed_at?: string | null
  review_note?: string | null
}

function authHeaders() {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** List progress reports for a task, including review status. */
export async function listProgressReportsWithReview(
  taskId: string,
): Promise<ProgressReportWithReview[]> {
  const r = await axios.get<ProgressReportWithReview[]>(
    `${OpenAPI.BASE}/api/v1/tasks/${taskId}/progress-reports`,
    { headers: authHeaders() },
  )
  return r.data
}

/** Approve or reject a progress report (its on-site photo is the evidence). */
export async function reviewProgressReport(params: {
  taskId: string
  reportId: string
  reviewStatus: "approved" | "rejected"
  reviewNote?: string
}): Promise<ProgressReportWithReview> {
  const r = await axios.patch<ProgressReportWithReview>(
    `${OpenAPI.BASE}/api/v1/tasks/${params.taskId}/progress-reports/${params.reportId}`,
    null,
    {
      headers: authHeaders(),
      params: {
        review_status: params.reviewStatus,
        review_note: params.reviewNote,
      },
    },
  )
  return r.data
}

/**
 * Upload photo and create progress report in a single atomic request.
 * Replaces the old 2-step flow (upload-photo → addProgressReport) to prevent orphaned photos.
 */
export async function submitProgressReport(params: {
  taskId: string
  file: File
  progressPercent: number
  note?: string
  gpsLat?: number
  gpsLng?: number
  gpsAccuracyM?: number
  checkinSkipReason?: string
}): Promise<TaskProgressReportPublic> {
  const form = new FormData()
  form.append("file", params.file)
  form.append("progress_percent", String(params.progressPercent))
  if (params.note) form.append("note", params.note)
  if (params.gpsLat != null) form.append("gps_lat", String(params.gpsLat))
  if (params.gpsLng != null) form.append("gps_lng", String(params.gpsLng))
  if (params.gpsAccuracyM != null)
    form.append("gps_accuracy_m", String(params.gpsAccuracyM))
  if (params.checkinSkipReason)
    form.append("checkin_skip_reason", params.checkinSkipReason)

  const token = getAccessToken()
  const r = await axios.post<TaskProgressReportPublic>(
    `${OpenAPI.BASE}/api/v1/tasks/${params.taskId}/progress-reports`,
    form,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "multipart/form-data",
      },
    },
  )
  return r.data
}
