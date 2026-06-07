import {
  CustomerCompaniesService,
  type CustomerCompanyCreate,
  type CustomerCompanyPublic,
  type CustomerCompanyUpdate,
} from "@/client"

export type CustomerCompanyType = "customer" | "own"

export type {
  CustomerCompanyCreate,
  CustomerCompanyPublic,
  CustomerCompanyUpdate,
}

export const customerCompanyKeys = {
  all: ["customer-companies"] as const,
  list: (type?: string, q?: string) =>
    ["customer-companies", { type: type ?? null, q: q ?? null }] as const,
}

export async function listCustomerCompanies(params?: {
  type?: string
  q?: string
  includeInactive?: boolean
}): Promise<CustomerCompanyPublic[]> {
  const res = await CustomerCompaniesService.listCustomerCompanies({
    type: params?.type ?? null,
    q: params?.q ?? null,
    includeInactive: params?.includeInactive ?? true,
  })
  return res.data
}

export function createCustomerCompany(
  body: CustomerCompanyCreate,
): Promise<CustomerCompanyPublic> {
  return CustomerCompaniesService.createCustomerCompany({ requestBody: body })
}

export function updateCustomerCompany(
  customerId: string,
  body: CustomerCompanyUpdate,
): Promise<CustomerCompanyPublic> {
  return CustomerCompaniesService.updateCustomerCompany({
    customerId,
    requestBody: body,
  })
}

export function deleteCustomerCompany(customerId: string): Promise<void> {
  return CustomerCompaniesService.deleteCustomerCompany({ customerId })
}
