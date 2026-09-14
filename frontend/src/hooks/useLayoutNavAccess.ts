import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"

import { RolesService } from "@/client"
import type { LayoutNavAccess } from "@/config/layoutNav"
import { findRoleViewPreset, type RoleViewKey } from "@/config/roleViewPresets"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import {
  canAccessContract,
  canAccessDashboard,
  canAccessProject,
  canAccessQuotation,
  canManageCompany,
  isCompanyDirector,
  isManagementUser,
} from "@/utils/accountAccess"

const FAKE_ROLE_STORAGE_KEY = "saree:fake-role-view"

/**
 * Superuser-only "xem thử vai trò" state, kept in sessionStorage so it
 * resets on a fresh tab and never leaks into real permission checks —
 * it only overrides nav-visibility flags for UI testing.
 */
function useFakeRoleView(canFake: boolean) {
  const [fakeRole, setFakeRoleState] = useState<RoleViewKey | null>(() => {
    if (typeof window === "undefined") return null
    return (
      (window.sessionStorage.getItem(FAKE_ROLE_STORAGE_KEY) as RoleViewKey) ||
      null
    )
  })

  useEffect(() => {
    if (!canFake && fakeRole) {
      setFakeRoleState(null)
      window.sessionStorage.removeItem(FAKE_ROLE_STORAGE_KEY)
    }
  }, [canFake, fakeRole])

  const setFakeRole = useCallback((role: RoleViewKey | null) => {
    setFakeRoleState(role)
    if (role) {
      window.sessionStorage.setItem(FAKE_ROLE_STORAGE_KEY, role)
    } else {
      window.sessionStorage.removeItem(FAKE_ROLE_STORAGE_KEY)
    }
  }, [])

  return { fakeRole: canFake ? fakeRole : null, setFakeRole }
}

/**
 * Single source of truth for sidebar / mobile-nav visibility, combining real
 * permission checks with an optional superuser-only "fake view" preview.
 */
export function useLayoutNavAccess() {
  const { user: currentUser } = useAuth()

  const profileQuery = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser) && isLoggedIn(),
  })
  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []

  const isSuperuser = Boolean(currentUser?.is_superuser)
  const { fakeRole, setFakeRole } = useFakeRoleView(isSuperuser)
  const fakePreset = findRoleViewPreset(fakeRole)

  const realAccess: LayoutNavAccess = {
    isSuperuser,
    showManagement:
      isSuperuser ||
      isManagementUser(profileQuery.data) ||
      canAccessDashboard(permissions),
    showCompanyManagement:
      isSuperuser ||
      isCompanyDirector(profileQuery.data) ||
      canManageCompany(permissions),
    canAccessProjects: isSuperuser || canAccessProject(permissions),
    canAccessQuotations: isSuperuser || canAccessQuotation(permissions),
    canAccessContracts: isSuperuser || canAccessContract(permissions),
  }

  const access: LayoutNavAccess = fakePreset ?? realAccess

  return {
    access,
    isFaking: Boolean(fakePreset),
    fakeRole,
    setFakeRole,
    canFake: isSuperuser,
  }
}
