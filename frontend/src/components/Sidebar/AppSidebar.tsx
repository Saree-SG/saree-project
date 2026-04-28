import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { buildLayoutNavItems } from "@/config/layoutNav"
import useAuth from "@/hooks/useAuth"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import { canAccessContract, canAccessDashboard, canAccessInventory, canAccessProcurement, canAccessProject, canAccessQuotation, canAccessSupplier, canManageCompany } from "@/utils/accountAccess"
import { Main } from "./Main"
import { User } from "./User"

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  const permissionsQuery = useMyPermissions()
  const permissions = permissionsQuery.data ?? []

  const showManagement =
    Boolean(currentUser?.is_superuser) || canAccessDashboard(permissions)

  const showCompanyManagement =
    Boolean(currentUser?.is_superuser) || canManageCompany(permissions)

  const showQuotations =
    Boolean(currentUser?.is_superuser) || canAccessQuotation(permissions)

  const showProjects =
    Boolean(currentUser?.is_superuser) || canAccessProject(permissions)

  const showSuppliers =
    Boolean(currentUser?.is_superuser) || canAccessSupplier(permissions)

  const showContracts =
    Boolean(currentUser?.is_superuser) || canAccessContract(permissions)

  const showProcurement =
    Boolean(currentUser?.is_superuser) || canAccessProcurement(permissions)

  const showInventory =
    Boolean(currentUser?.is_superuser) || canAccessInventory(permissions)

  const items = buildLayoutNavItems(
    Boolean(currentUser?.is_superuser),
    showManagement,
    showCompanyManagement,
    showProjects,
    showQuotations,
    showSuppliers,
    showContracts,
    showProcurement,
    showInventory,
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        <Main items={items} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
