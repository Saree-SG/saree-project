import { useQuery } from "@tanstack/react-query"

import { readMyPermissions } from "@/modules/rbac/rbacApi"
import { isLoggedIn } from "./useAuth"

/**
 * Cache current user's effective RBAC permission codes.
 */
export function useMyPermissions() {
  return useQuery({
    queryKey: ["roles", "my-permissions"],
    queryFn: readMyPermissions,
    enabled: isLoggedIn(),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Return whether current user has a permission code.
 */
export function useCan(permissionCode: string): boolean {
  const permissionsQuery = useMyPermissions()
  const permissions = new Set(permissionsQuery.data ?? [])
  return permissions.has(permissionCode)
}
