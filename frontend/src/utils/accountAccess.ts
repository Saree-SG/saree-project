import type { AccountProfilePublic } from "@/client"

/** Role names that can use management dashboards and project overview routes. */
const MANAGEMENT_ROLE_NAMES = new Set([
  "director",
  "department_head",
  "sales",
  "engineer",
  "materials",
  "planner",
  "workshop_lead",
  "site_supply",
])

/**
 * Returns the membership used for navigation (primary if set, otherwise first).
 */
export function selectPrimaryMembership(
  profile: AccountProfilePublic | undefined,
) {
  if (!profile?.memberships?.length) {
    return undefined
  }
  return (
    profile.memberships.find((row) => row.is_primary) ?? profile.memberships[0]
  )
}

/**
 * True when the user’s primary (or first) company role is a management role
 * (Giám đốc / Trưởng phòng).
 */
export function isManagementUser(profile: AccountProfilePublic | undefined) {
  const membership = selectPrimaryMembership(profile)
  if (!membership) {
    return false
  }
  return MANAGEMENT_ROLE_NAMES.has(membership.role_name)
}

/**
 * True when the user is a company director (Giám đốc).
 * Used to gate company management UI (not superuser-only).
 */
export function isCompanyDirector(profile: AccountProfilePublic | undefined) {
  const membership = selectPrimaryMembership(profile)
  if (!membership) {
    return false
  }
  return membership.role_name === "director"
}

/**
 * Check if permission code exists in user effective permission set.
 */
export function hasPermission(
  permissions: Set<string> | string[] | undefined,
  code: string,
) {
  if (!permissions) {
    return false
  }
  const effective = permissions instanceof Set ? permissions : new Set(permissions)
  return effective.has(code)
}

/**
 * Dashboard access by permission, not role name.
 */
export function canAccessDashboard(permissions: Set<string> | string[] | undefined) {
  return (
    hasPermission(permissions, "REPORT_VIEW_ALL") ||
    hasPermission(permissions, "REPORT_VIEW_TEAM")
  )
}

/**
 * Company management access by permission.
 */
export function canManageCompany(permissions: Set<string> | string[] | undefined) {
  return hasPermission(permissions, "USER_MANAGE")
}

/**
 * Project creation permission gate.
 */
export function canCreateProject(permissions: Set<string> | string[] | undefined) {
  return hasPermission(permissions, "PROJECT_CREATE")
}

/**
 * Project module access gate.
 */
export function canAccessProject(permissions: Set<string> | string[] | undefined) {
  return (
    hasPermission(permissions, "PROJECT_VIEW") ||
    hasPermission(permissions, "PROJECT_VIEW_ALL")
  )
}

/**
 * Quotation module access gate — any of the two view permissions suffices.
 */
export function canAccessQuotation(permissions: Set<string> | string[] | undefined) {
  return (
    hasPermission(permissions, "QUOTATION_VIEW") ||
    hasPermission(permissions, "QUOTATION_VIEW_ALL")
  )
}

/**
 * Contract module access gate.
 */
export function canAccessContract(permissions: Set<string> | string[] | undefined) {
  return (
    hasPermission(permissions, "CONTRACT_VIEW") ||
    hasPermission(permissions, "CONTRACT_VIEW_ALL")
  )
}

/**
 * Material Request module access gate.
 */
export function canAccessMaterialRequest(permissions: Set<string> | string[] | undefined) {
  return hasPermission(permissions, "MATERIAL_REQUEST_VIEW")
}
