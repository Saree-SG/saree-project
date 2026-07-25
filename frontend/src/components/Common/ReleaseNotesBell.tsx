import { Megaphone } from "lucide-react"
import { useState } from "react"

import { ReleaseNotesDialog } from "@/components/Common/ReleaseNotesDialog"
import { LATEST_RELEASE_VERSION } from "@/data/releaseNotes"
import useAuth from "@/hooks/useAuth"

/**
 * Header icon that opens the "Có gì mới" release-notes popup. Shows a red dot
 * while the current user hasn't seen the latest release version yet.
 */
export function ReleaseNotesBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const isUnread = Boolean(
    user && user.last_seen_release_version !== LATEST_RELEASE_VERSION,
  )

  return (
    <>
      <button
        type="button"
        title="Có gì mới"
        aria-label="Có gì mới"
        className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Megaphone className="size-5" />
        {isUnread ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" />
        ) : null}
      </button>
      <ReleaseNotesDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
