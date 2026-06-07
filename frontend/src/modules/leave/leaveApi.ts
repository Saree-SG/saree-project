/**
 * Leave (xin nghỉ phép) API helpers + display metadata.
 *
 * Thin wrappers over the generated LeaveService so components stay declarative,
 * plus the Vietnamese label/badge maps shared by every leave UI.
 */

import type { LeaveApproverConfigItem, LeaveRequestCreate } from "@/client"
import { LeaveService } from "@/client"

export type LeaveType = "annual" | "sick" | "unpaid"
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled"
export type LeaveHalfDay = "am" | "pm"

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Phép năm",
  sick: "Nghỉ ốm",
  unpaid: "Không lương",
}

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
}

/** Tailwind classes for a status badge. */
export const LEAVE_STATUS_BADGE: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  cancelled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
}

export const LEAVE_HALF_DAY_LABELS: Record<LeaveHalfDay, string> = {
  am: "Buổi sáng",
  pm: "Buổi chiều",
}

export function createLeaveRequest(body: LeaveRequestCreate) {
  return LeaveService.createLeaveRequest({ requestBody: body })
}

export function listMyLeaveRequests(params?: {
  status?: string
  dateFrom?: string
  dateTo?: string
}) {
  return LeaveService.myLeaveRequests({
    status: params?.status ?? null,
    dateFrom: params?.dateFrom ?? null,
    dateTo: params?.dateTo ?? null,
  })
}

export function cancelLeaveRequest(requestId: string) {
  return LeaveService.cancelLeaveRequest({ requestId })
}

export function listPendingLeaveRequests() {
  return LeaveService.pendingLeaveRequests()
}

export function approveLeaveRequest(requestId: string, note?: string) {
  return LeaveService.approveLeaveRequest({
    requestId,
    requestBody: { note: note ?? null },
  })
}

export function rejectLeaveRequest(requestId: string, note: string) {
  return LeaveService.rejectLeaveRequest({
    requestId,
    requestBody: { note },
  })
}

export function listCompanyLeaveRequests(companyId: string, status?: string) {
  return LeaveService.companyLeaveRequests({
    companyId,
    status: status ?? null,
  })
}

export function getLeaveApproverConfig(companyId: string) {
  return LeaveService.getLeaveApproverConfig({ companyId })
}

export function setLeaveApproverConfig(
  companyId: string,
  items: LeaveApproverConfigItem[],
) {
  return LeaveService.setLeaveApproverConfig({
    companyId,
    requestBody: { items },
  })
}
