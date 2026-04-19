import { AxiosError } from "axios"
import type { ApiError } from "./client"

function extractErrorMessage(err: ApiError): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { detail?: unknown } | undefined
    const detail = data?.detail
    if (typeof detail === "string") {
      return detail
    }
    if (detail && typeof detail === "object" && "message" in detail) {
      return String((detail as { message: string }).message)
    }
    if (
      Array.isArray(detail) &&
      detail.length > 0 &&
      typeof detail[0]?.msg === "string"
    ) {
      return detail[0].msg
    }
    return err.message
  }

  const errDetail = (err.body as { detail?: unknown })?.detail
  if (typeof errDetail === "string") {
    return errDetail
  }
  if (errDetail && typeof errDetail === "object" && "message" in errDetail) {
    return String((errDetail as { message: string }).message)
  }
  if (Array.isArray(errDetail) && errDetail.length > 0) {
    return (errDetail[0] as { msg?: string }).msg || "Something went wrong."
  }
  return (errDetail as string) || "Something went wrong."
}

export const handleError = function (
  this: (msg: string) => void,
  err: ApiError,
) {
  const errorMessage = extractErrorMessage(err)
  this(errorMessage)
}

export const getInitials = (name: string): string => {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
}
