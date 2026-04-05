import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

/**
 * Uploads a progress-report image file; returns the photo_url to send with addProgressReport.
 */
export async function uploadTaskProgressPhoto(params: {
  taskId: string
  file: File
}): Promise<{ photo_url: string }> {
  const form = new FormData()
  form.append("file", params.file)
  const token = getAccessToken()
  const r = await axios.post<{ photo_url: string }>(
    `${OpenAPI.BASE}/api/v1/tasks/${params.taskId}/progress-reports/upload-photo`,
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
