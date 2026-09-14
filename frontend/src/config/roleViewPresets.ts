import type { LayoutNavAccess } from "@/config/layoutNav"

export type RoleViewKey =
  | "worker"
  | "installer"
  | "workshop_lead"
  | "site_supply"
  | "department_head"
  | "sales"
  | "engineer"
  | "materials"
  | "planner"
  | "director"
  | "admin"

export type RoleViewPreset = LayoutNavAccess & {
  key: RoleViewKey
  label: string
}

/**
 * Approximate nav-visibility flags per system role, used only to preview the
 * sidebar/mobile nav as another role — never sent to the backend and never
 * used to gate real permission checks. Only offered to superusers.
 */
export const ROLE_VIEW_PRESETS: RoleViewPreset[] = [
  {
    key: "worker",
    label: "Tổ viên / Thực hiện",
    isSuperuser: false,
    showManagement: false,
    showCompanyManagement: false,
    canAccessProjects: false,
    canAccessQuotations: false,
    canAccessContracts: false,
  },
  {
    key: "installer",
    label: "Lắp đặt công trình",
    isSuperuser: false,
    showManagement: false,
    showCompanyManagement: false,
    canAccessProjects: true,
    canAccessQuotations: false,
    canAccessContracts: false,
  },
  {
    key: "workshop_lead",
    label: "Tổ trưởng",
    isSuperuser: false,
    showManagement: true,
    showCompanyManagement: false,
    canAccessProjects: true,
    canAccessQuotations: false,
    canAccessContracts: false,
  },
  {
    key: "site_supply",
    label: "Cung ứng vật tư công trình",
    isSuperuser: false,
    showManagement: true,
    showCompanyManagement: false,
    canAccessProjects: true,
    canAccessQuotations: false,
    canAccessContracts: false,
  },
  {
    key: "planner",
    label: "Trưởng phòng Kế hoạch",
    isSuperuser: false,
    showManagement: true,
    showCompanyManagement: false,
    canAccessProjects: true,
    canAccessQuotations: false,
    canAccessContracts: false,
  },
  {
    key: "engineer",
    label: "Trưởng phòng Kỹ thuật",
    isSuperuser: false,
    showManagement: true,
    showCompanyManagement: false,
    canAccessProjects: true,
    canAccessQuotations: false,
    canAccessContracts: true,
  },
  {
    key: "materials",
    label: "Trưởng phòng Vật tư",
    isSuperuser: false,
    showManagement: true,
    showCompanyManagement: false,
    canAccessProjects: true,
    canAccessQuotations: false,
    canAccessContracts: false,
  },
  {
    key: "sales",
    label: "Trưởng phòng Kinh doanh",
    isSuperuser: false,
    showManagement: true,
    showCompanyManagement: false,
    canAccessProjects: true,
    canAccessQuotations: true,
    canAccessContracts: true,
  },
  {
    key: "department_head",
    label: "Trưởng phòng",
    isSuperuser: false,
    showManagement: true,
    showCompanyManagement: false,
    canAccessProjects: true,
    canAccessQuotations: true,
    canAccessContracts: true,
  },
  {
    key: "director",
    label: "Giám đốc",
    isSuperuser: false,
    showManagement: true,
    showCompanyManagement: true,
    canAccessProjects: true,
    canAccessQuotations: true,
    canAccessContracts: true,
  },
  {
    key: "admin",
    label: "System Admin",
    isSuperuser: true,
    showManagement: true,
    showCompanyManagement: true,
    canAccessProjects: true,
    canAccessQuotations: true,
    canAccessContracts: true,
  },
]

export function findRoleViewPreset(
  key: RoleViewKey | null | undefined,
): RoleViewPreset | undefined {
  if (!key) return undefined
  return ROLE_VIEW_PRESETS.find((preset) => preset.key === key)
}
