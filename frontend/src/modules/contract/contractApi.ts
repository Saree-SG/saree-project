import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

import type {
  ContractAttachmentPublic,
  ContractCreate,
  ContractPublic,
  ContractsPublic,
  ContractUpdate,
  ContractWithDetailsPublic,
} from "./contractTypes"

const BASE = () => `${OpenAPI.BASE}/api/v1`

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() ?? ""}` }
}

export async function listContracts(params?: {
  status?: string
  skip?: number
  limit?: number
}): Promise<ContractsPublic> {
  const query = new URLSearchParams()
  if (params?.status) query.set("status", params.status)
  if (params?.skip !== undefined) query.set("skip", String(params.skip))
  if (params?.limit !== undefined) query.set("limit", String(params.limit))
  const res = await axios.get<ContractsPublic>(
    `${BASE()}/contracts/?${query.toString()}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function getContract(
  contractId: string,
): Promise<ContractWithDetailsPublic> {
  const res = await axios.get<ContractWithDetailsPublic>(
    `${BASE()}/contracts/${contractId}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function createContract(
  body: ContractCreate,
): Promise<ContractPublic> {
  const res = await axios.post<ContractPublic>(`${BASE()}/contracts/`, body, {
    headers: authHeaders(),
  })
  return res.data
}

export async function updateContract(
  contractId: string,
  body: ContractUpdate,
): Promise<ContractPublic> {
  const res = await axios.patch<ContractPublic>(
    `${BASE()}/contracts/${contractId}`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function deleteContract(contractId: string): Promise<void> {
  await axios.delete(`${BASE()}/contracts/${contractId}`, {
    headers: authHeaders(),
  })
}

// Transitions
export async function submitContract(
  contractId: string,
  note?: string,
): Promise<ContractPublic> {
  const res = await axios.post<ContractPublic>(
    `${BASE()}/contracts/${contractId}/submit`,
    { note: note ?? null },
    { headers: authHeaders() },
  )
  return res.data
}

export async function approveContract(
  contractId: string,
  note?: string,
): Promise<ContractPublic> {
  const res = await axios.post<ContractPublic>(
    `${BASE()}/contracts/${contractId}/approve`,
    { note: note ?? null },
    { headers: authHeaders() },
  )
  return res.data
}

export async function rejectContract(
  contractId: string,
  note?: string,
): Promise<ContractPublic> {
  const res = await axios.post<ContractPublic>(
    `${BASE()}/contracts/${contractId}/reject`,
    { note: note ?? null },
    { headers: authHeaders() },
  )
  return res.data
}

export async function signContract(
  contractId: string,
  signingDate: string,
  note?: string,
): Promise<ContractPublic> {
  const res = await axios.post<ContractPublic>(
    `${BASE()}/contracts/${contractId}/sign`,
    { signing_date: signingDate, note: note ?? null },
    { headers: authHeaders() },
  )
  return res.data
}

export async function confirmAdvance(
  contractId: string,
  advanceAmount: number,
  advancePaidAt: string,
  note?: string,
): Promise<ContractPublic> {
  const res = await axios.post<ContractPublic>(
    `${BASE()}/contracts/${contractId}/confirm-advance`,
    {
      advance_amount: advanceAmount,
      advance_paid_at: advancePaidAt,
      note: note ?? null,
    },
    { headers: authHeaders() },
  )
  return res.data
}

export async function startProduction(
  contractId: string,
  note?: string,
): Promise<ContractPublic> {
  const res = await axios.post<ContractPublic>(
    `${BASE()}/contracts/${contractId}/start-production`,
    { note: note ?? null },
    { headers: authHeaders() },
  )
  return res.data
}

export async function completeContract(
  contractId: string,
  note?: string,
): Promise<ContractPublic> {
  const res = await axios.post<ContractPublic>(
    `${BASE()}/contracts/${contractId}/complete`,
    { note: note ?? null },
    { headers: authHeaders() },
  )
  return res.data
}

// Attachments
export async function uploadContractAttachment(
  contractId: string,
  file: File,
  fileType: string,
  description?: string,
  phase?: string,
): Promise<ContractAttachmentPublic> {
  const form = new FormData()
  form.append("file", file)
  const query = new URLSearchParams({ file_type: fileType })
  if (description) query.set("description", description)
  if (phase) query.set("phase", phase)
  const res = await axios.post<ContractAttachmentPublic>(
    `${BASE()}/contracts/${contractId}/attachments/upload?${query.toString()}`,
    form,
    { headers: { ...authHeaders(), "Content-Type": "multipart/form-data" } },
  )
  return res.data
}

export async function deleteContractAttachment(
  contractId: string,
  attId: string,
): Promise<void> {
  await axios.delete(`${BASE()}/contracts/${contractId}/attachments/${attId}`, {
    headers: authHeaders(),
  })
}
