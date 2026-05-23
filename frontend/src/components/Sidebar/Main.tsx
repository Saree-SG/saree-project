import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isLayoutNavItemActive, type LayoutNavItem } from "@/config/layoutNav"
import { fetchChatUnreadCount } from "@/modules/chat/chatApi"

interface MainProps {
  items: LayoutNavItem[]
}

export function Main({ items }: MainProps) {
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
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = isLayoutNavItemActive(item, currentPath)
            const unreadCount = item.path === "/chat" ? (chatUnread?.count ?? 0) : 0

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  asChild
                >
                  <RouterLink to={item.path} onClick={handleMenuClick}>
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
    </SidebarGroup>
  )
}
