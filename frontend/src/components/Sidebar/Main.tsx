import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import { ChevronDown } from "lucide-react"
import { useState } from "react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isLayoutNavItemActive, type LayoutNavGroup } from "@/config/layoutNav"
import { cn } from "@/lib/utils"
import { fetchChatUnreadCount } from "@/modules/chat/chatApi"

interface MainProps {
  groups: LayoutNavGroup[]
}

export function Main({ groups }: MainProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const router = useRouterState()
  const currentPath = router.location.pathname

  const { data: chatUnread } = useQuery({
    queryKey: ["chat", "unread-count"],
    queryFn: fetchChatUnreadCount,
    refetchInterval: 30_000,
  })

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <>
      {groups.map((group) => (
        <NavGroup
          key={group.key}
          group={group}
          currentPath={currentPath}
          chatUnreadCount={chatUnread?.count ?? 0}
          onItemClick={handleMenuClick}
        />
      ))}
    </>
  )
}

interface NavGroupProps {
  group: LayoutNavGroup
  currentPath: string
  chatUnreadCount: number
  onItemClick: () => void
}

function NavGroup({
  group,
  currentPath,
  chatUnreadCount,
  onItemClick,
}: NavGroupProps) {
  // Single-group layouts (e.g. worker view) skip the collapsible label — no
  // point letting someone hide the only section they have.
  const collapsible = group.key !== "personal"
  const [open, setOpen] = useState(true)

  return (
    <SidebarGroup>
      {collapsible ? (
        <SidebarGroupLabel asChild>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="cursor-pointer justify-between"
          >
            <span>{group.label}</span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                !open && "-rotate-90",
              )}
            />
          </button>
        </SidebarGroupLabel>
      ) : null}
      {open || !collapsible ? (
        <SidebarGroupContent>
          <SidebarMenu>
            {group.items.map((item) => {
              const isActive = isLayoutNavItemActive(item, currentPath)
              const unreadCount = item.path === "/chat" ? chatUnreadCount : 0

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive}
                    asChild
                  >
                    <RouterLink to={item.path} onClick={onItemClick}>
                      {/* Icon with badge overlay — visible in both collapsed and expanded mode */}
                      <span className="relative shrink-0">
                        <item.icon className="size-4" />
                        {unreadCount > 0 && (
                          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white ring-1 ring-background">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </span>
                      <span>{item.title}</span>
                    </RouterLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  )
}
