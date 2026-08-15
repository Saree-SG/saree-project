import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { UsersService } from "@/client"
import {
  ItemTypeBadge,
  ReleaseHero,
} from "@/components/Common/releaseNotes/ReleaseVisuals"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LATEST_RELEASE_VERSION, RELEASE_NOTES } from "@/data/releaseNotes"
import useAuth from "@/hooks/useAuth"

type ReleaseNotesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Popup only teases the newest release — the full history lives at /releases.
const PREVIEW_COUNT = 1
const PREVIEW_ITEMS = 4

/**
 * "Có gì mới" popup. Opening it marks the latest release version as seen for
 * the current user (per-account, via `last_seen_release_version`) so the
 * unread badge on the bell clears — the notes themselves stay listed, just
 * no longer highlighted.
 */
export function ReleaseNotesDialog({
  open,
  onOpenChange,
}: ReleaseNotesDialogProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const markSeenMutation = useMutation({
    mutationFn: () =>
      UsersService.markReleaseNotesSeen({
        requestBody: { version: LATEST_RELEASE_VERSION },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })

  const preview = RELEASE_NOTES.slice(0, PREVIEW_COUNT)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (
          nextOpen &&
          user &&
          user.last_seen_release_version !== LATEST_RELEASE_VERSION &&
          !markSeenMutation.isPending
        ) {
          markSeenMutation.mutate()
        }
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-base">🎉 Có gì mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-5 pb-5">
          {preview.map((note, index) => (
            <div key={note.version} className="space-y-3">
              <div className="flex items-start gap-3">
                <ReleaseHero icon={note.icon} index={index} size="sm" />
                <div className="min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-brand-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
                      v{note.version}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {note.date}
                    </span>
                  </div>
                  <h3 className="mt-1 text-sm font-bold text-foreground">
                    {note.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {note.summary}
                  </p>
                </div>
              </div>

              <ul className="space-y-2 pl-1">
                {note.items.slice(0, PREVIEW_ITEMS).map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start gap-2">
                    <ItemTypeBadge type={item.type} className="mt-0.5" />
                    <span className="text-sm leading-relaxed text-foreground/90">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
              {note.items.length > PREVIEW_ITEMS ? (
                <p className="pl-1 text-xs text-muted-foreground">
                  + {note.items.length - PREVIEW_ITEMS} thay đổi khác…
                </p>
              ) : null}
            </div>
          ))}

          <Button asChild className="w-full">
            <Link to="/releases" onClick={() => onOpenChange(false)}>
              Xem toàn bộ nhật ký phát hành
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
