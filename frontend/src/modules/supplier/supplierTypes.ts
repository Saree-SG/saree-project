export interface SupplierPublic {
  id: string
  company_id: string
  created_by: string
  supplier_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  specialty: string | null
  notes: string | null
  rating: number | null
  created_at: string
  updated_at: string
}

export interface SuppliersPublic {
  data: SupplierPublic[]
  count: number
}

export interface SupplierCreate {
  supplier_name: string
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  specialty?: string | null
  notes?: string | null
  rating?: number | null
}

export type SupplierUpdate = Partial<SupplierCreate>
