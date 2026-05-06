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
}): Promise<TaskProgressReportPublic> {
  const form = new FormData()
  form.append("file", params.file)
  form.append("progress_percent", String(params.progressPercent))
  if (params.note) form.append("note", params.note)

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
