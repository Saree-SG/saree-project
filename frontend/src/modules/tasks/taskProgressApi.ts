import axios from "axios"

import type { TaskProgressReportPublic } from "@/client"
import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

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
