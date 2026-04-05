import { useQuery } from "@tanstack/react-query"

import { RolesService } from "@/client"
import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { buildLayoutNavItems } from "@/config/layoutNav"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { isManagementUser } from "@/utils/accountAccess"
import { Main } from "./Main"
import { User } from "./User"

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  const profileQuery = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser) && isLoggedIn(),
  })

  const showManagement =
    Boolean(currentUser?.is_superuser) || isManagementUser(profileQuery.data)

  const items = buildLayoutNavItems(Boolean(currentUser?.is_superuser), showManagement)

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
