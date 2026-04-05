import type { AccountProfilePublic } from "@/client"

/** Role names that can use management dashboards and project overview routes. */
const MANAGEMENT_ROLE_NAMES = new Set(["director", "department_head"])

/**
 * Returns the membership used for navigation (primary if set, otherwise first).
 */
export function selectPrimaryMembership(
  profile: AccountProfilePublic | undefined,
) {
  if (!profile?.memberships?.length) {
    return undefined
  }
  return profile.memberships.find((row) => row.is_primary) ?? profile.memberships[0]
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
