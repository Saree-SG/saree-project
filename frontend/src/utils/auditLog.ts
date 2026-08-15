import type { AuditLogPublic } from "@/client"

export type AuditLogWithActor = AuditLogPublic & { actor_name?: string | null }

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function auditActionIcon(action: string, newValue?: unknown): string {
  switch (action) {
    case "task.created":
      return "➕"
    case "task.updated":
      return "✏️"
    case "task.status_changed":
      return "🔄"
    case "task.deleted":
      return "🗑️"
    case "task.proof_uploaded":
      return "📷"
    case "task.proof_reviewed": {
      if (newValue === "approved") return "✅"
      if (newValue === "rejected") return "❌"
      return "📷"
    }
    case "task.delay_request_approved":
      return "⏳"
    case "task.delay_request_reviewed": {
      if (isPlainObject(newValue)) {
        const ap = newValue.approval_status
        if (ap === "APPROVED") return "✅"
        if (ap === "REJECTED") return "❌"
      }
      return "⏳"
    }
    case "task.deadline_cascaded_to_parent":
      return "↔️"
    default:
      return "📝"
  }
}

export function auditActionLabel(action: string, newValue?: unknown): string {
  switch (action) {
    case "task.created":
      return "đã tạo công việc"
    case "task.updated":
      return "đã cập nhật thông tin"
    case "task.status_changed":
      return "đã đổi trạng thái"
    case "task.deleted":
      return "đã xoá công việc"
    case "task.proof_uploaded":
      return "đã nộp bằng chứng"
    case "task.proof_reviewed":
      if (newValue === "approved") return "bằng chứng đã được duyệt"
      if (newValue === "rejected") return "bằng chứng bị từ chối"
      return "đã xem xét bằng chứng"
    case "task.delay_request_approved":
      return "đã phê duyệt gia hạn"
    case "task.delay_request_reviewed":
      if (isPlainObject(newValue)) {
        const ap = newValue.approval_status
        if (ap === "APPROVED") return "đã duyệt gia hạn"
        if (ap === "REJECTED") return "đã từ chối gia hạn"
      }
      return "đã xem xét yêu cầu gia hạn"
    case "task.deadline_cascaded_to_parent":
      return "đã cập nhật deadline lên công việc cha"
    default:
      return action
  }
}

export function formatAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null

  if (typeof value === "string") {
    switch (value) {
      case "todo":
        return "Chờ xử lý"
      case "in_progress":
        return "Đang làm"
      case "done":
        return "Hoàn thành"
      case "approved":
      case "APPROVED":
        return "Đã duyệt"
      case "rejected":
      case "REJECTED":
        return "Bị từ chối"
      case "pending":
      case "PENDING":
        return "Chờ duyệt"
      default:
        return value
    }
  }

  if (typeof value === "number" || typeof value === "boolean")
    return String(value)

  if (isPlainObject(value)) {
    const status = value.status
    if (typeof status === "string") return formatAuditValue(status)

    const approvalStatus = value.approval_status
    if (typeof approvalStatus === "string")
      return formatAuditValue(approvalStatus)

    const endTime = value.end_time
    if (typeof endTime === "string") {
      const dt = new Date(endTime)
      return Number.isNaN(dt.getTime()) ? endTime : dt.toLocaleString("vi-VN")
    }
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function formatAuditChange(entry: AuditLogWithActor): string | null {
  if (entry.old_value === null || entry.old_value === undefined) return null
  if (entry.new_value === null || entry.new_value === undefined) return null

  if (
    entry.action === "task.updated" &&
    isPlainObject(entry.old_value) &&
    isPlainObject(entry.new_value)
  ) {
    const oldObj = entry.old_value
    const newObj = entry.new_value
    // shallow comparison — JSON.stringify only as fallback for nested objects
    const changedKeys = Object.keys(newObj).filter((key) => {
      const o = oldObj[key]
      const n = newObj[key]
      if (o === n) return false
      if (typeof o !== "object" && typeof n !== "object") return true
      return JSON.stringify(o) !== JSON.stringify(n)
    })
    if (changedKeys.length === 0) return null
    const preview = changedKeys.slice(0, 3).join(", ")
    const more = changedKeys.length > 3 ? "..." : ""
    return `Các trường thay đổi: ${preview}${more}`
  }

  const oldStr = formatAuditValue(entry.old_value)
  const newStr = formatAuditValue(entry.new_value)
  if (!oldStr || !newStr) return null
  return `${oldStr} → ${newStr}`
}
