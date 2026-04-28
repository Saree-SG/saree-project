import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { readMyPermissions } from "@/modules/rbac/rbacApi"
import { isLoggedIn } from "./useAuth"

export function useMyPermissions() {
  return useQuery({
    queryKey: ["roles", "my-permissions"],
    queryFn: readMyPermissions,
    enabled: isLoggedIn(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCan(permissionCode: string): boolean {
  const permissionsQuery = useMyPermissions()
  const permissions = useMemo(
    () => new Set(permissionsQuery.data ?? []),
    [permissionsQuery.data],
  )
  return permissions.has(permissionCode)
}
