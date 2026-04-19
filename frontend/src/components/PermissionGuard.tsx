import type { ReactNode } from "react"

import { useCan } from "@/hooks/useMyPermissions"

type PermissionGuardProps = {
  permission: string
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Render children only when user holds required permission code.
 */
export function PermissionGuard({
  permission,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const can = useCan(permission)
  return can ? children : fallback
}
