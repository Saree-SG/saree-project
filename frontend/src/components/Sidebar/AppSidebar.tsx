import { FlaskConical, X } from "lucide-react"

import { Logo } from "@/components/Common/Logo"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { buildLayoutNavGroups } from "@/config/layoutNav"
import { ROLE_VIEW_PRESETS, type RoleViewKey } from "@/config/roleViewPresets"
import useAuth from "@/hooks/useAuth"
import { useLayoutNavAccess } from "@/hooks/useLayoutNavAccess"
import { Main } from "./Main"
import { User } from "./User"

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const { access, isFaking, fakeRole, setFakeRole, canFake } =
    useLayoutNavAccess()

  const groups = buildLayoutNavGroups(access)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="items-center px-4 py-6 group-data-[collapsible=icon]:px-0">
        <Logo variant="responsive" />
      </SidebarHeader>
      {canFake && (
        <div className="px-3 group-data-[collapsible=icon]:hidden">
          <div
            className={
              isFaking
                ? "flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-400/10 px-2 py-1.5"
                : "flex items-center gap-2 rounded-md border border-sidebar-border px-2 py-1.5"
            }
          >
            <FlaskConical className="size-3.5 shrink-0 text-muted-foreground" />
            <Select
              value={fakeRole ?? "__none__"}
              onValueChange={(value) =>
                setFakeRole(
                  value === "__none__" ? null : (value as RoleViewKey),
                )
              }
            >
              <SelectTrigger
                size="sm"
                className="h-7 border-none bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
              >
                <SelectValue placeholder="Xem thử vai trò..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Vai trò thật của tôi</SelectItem>
                {ROLE_VIEW_PRESETS.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isFaking && (
              <button
                type="button"
                onClick={() => setFakeRole(null)}
                title="Thoát chế độ xem thử"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      <SidebarContent>
        <Main groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
