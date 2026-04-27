import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

import type {
  SupplierCreate,
  SupplierPublic,
  SuppliersPublic,
  SupplierUpdate,
} from "./supplierTypes"

const BASE = () => `${OpenAPI.BASE}/api/v1`

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() ?? ""}` }
}

export async function listSuppliers(params?: {
  search?: string
  specialty?: string
  skip?: number
  limit?: number
}): Promise<SuppliersPublic> {
  const query = new URLSearchParams()
  if (params?.search) query.set("search", params.search)
  if (params?.specialty) query.set("specialty", params.specialty)
  if (params?.skip !== undefined) query.set("skip", String(params.skip))
  if (params?.limit !== undefined) query.set("limit", String(params.limit))
  const res = await axios.get<SuppliersPublic>(
    `${BASE()}/suppliers/?${query.toString()}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function getSupplier(supplierId: string): Promise<SupplierPublic> {
  const res = await axios.get<SupplierPublic>(
    `${BASE()}/suppliers/${supplierId}`,
    { headers: authHeaders() },
  )
  return res.data
}

export async function createSupplier(body: SupplierCreate): Promise<SupplierPublic> {
  const res = await axios.post<SupplierPublic>(
    `${BASE()}/suppliers/`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function updateSupplier(
  supplierId: string,
  body: SupplierUpdate,
): Promise<SupplierPublic> {
  const res = await axios.patch<SupplierPublic>(
    `${BASE()}/suppliers/${supplierId}`,
    body,
    { headers: authHeaders() },
  )
  return res.data
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  await axios.delete(`${BASE()}/suppliers/${supplierId}`, {
    headers: authHeaders(),
  })
}
