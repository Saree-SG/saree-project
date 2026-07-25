import { useMutation, useQueryClient } from "@tanstack/react-query"

import { UsersService } from "@/client"
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
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🎉 Có gì mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {RELEASE_NOTES.map((note) => (
            <div key={note.version} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  {note.title}
                </h3>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {note.date}
                </span>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {note.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
