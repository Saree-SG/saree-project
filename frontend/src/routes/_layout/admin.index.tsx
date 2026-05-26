import { createFileRoute, redirect } from "@tanstack/react-router"

import { UsersService } from "@/client"

export const Route = createFileRoute("/_layout/admin/")({
  beforeLoad: async () => {
    try {
      const me = await UsersService.readUserMe()
      if (!me.is_superuser) {
        throw redirect({ to: "/admin/organization" })
      }
    } catch (e) {
      // re-throw redirects; ignore other errors and fall through to overview
      if (e && typeof e === "object" && "to" in e) throw e
    }
    throw redirect({ to: "/admin/overview" })
  },
})
