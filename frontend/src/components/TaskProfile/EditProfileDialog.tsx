import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, ChevronRight, Plus, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import { Textarea } from "@/components/ui/textarea"
import useCustomToast from "@/hooks/useCustomToast"
import {
  addProfileItem,
  deleteProfile,
  deleteProfileItem,
  updateProfile,
  updateProfileItem,
  type TaskProfile,
  type TaskProfileItem,
} from "@/modules/taskProfile/taskProfileApi"
import { handleError } from "@/utils"

type Props = {
  open: boolean
  onClose: () => void
  profile: TaskProfile | null
}

type ItemDraft = {
  id: string
  name: string
  duration_days: number
}

/** Build hierarchical render order based on parent_item_id. */
function buildTree(items: TaskProfileItem[]) {
  const byParent = new Map<string | null, TaskProfileItem[]>()
  for (const it of items) {
    const key = it.parent_item_id ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(it)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name))
  }
  const out: TaskProfileItem[] = []
  const walk = (parent: string | null) => {
    for (const it of byParent.get(parent) ?? []) {
      out.push(it)
      walk(it.id)
    }
  }
  walk(null)
  return out
}

export default function EditProfileDialog({ open, onClose, profile }: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({})
  const [addingUnder, setAddingUnder] = useState<string | null>(null) // null = root
  const [newName, setNewName] = useState("")
  const [newDuration, setNewDuration] = useState(1)

  useEffect(() => {
    if (!profile) return
    setName(profile.name)
    setDescription(profile.description ?? "")
    const map: Record<string, ItemDraft> = {}
    for (const it of profile.items) {
      map[it.id] = {
        id: it.id,
        name: it.name,
        duration_days: it.duration_days,
      }
    }
    setDrafts(map)
    setAddingUnder(null)
    setNewName("")
    setNewDuration(1)
  }, [profile])

  const orderedItems = useMemo(
    () => (profile ? buildTree(profile.items) : []),
    [profile],
  )

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["task-profiles"] }),
      profile
        ? qc.invalidateQueries({ queryKey: ["task-profile", profile.id] })
        : Promise.resolve(),
    ])
  }

  const saveHeaderMutation = useMutation({
    mutationFn: () =>
      updateProfile(profile!.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã lưu thông tin mẫu")
      await invalidate()
    },
    onError: handleError.bind(showErrorToast),
  })

  const saveItemMutation = useMutation({
    mutationFn: (itemId: string) => {
      const d = drafts[itemId]
      return updateProfileItem(itemId, {
        name: d.name.trim(),
        duration_days: d.duration_days,
      })
    },
    onSuccess: async () => {
      showSuccessToast("Đã lưu hạng mục")
      await invalidate()
    },
    onError: handleError.bind(showErrorToast),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteProfileItem(itemId),
    onSuccess: async () => {
      showSuccessToast("Đã xoá hạng mục")
      await invalidate()
    },
    onError: handleError.bind(showErrorToast),
  })

  const addItemMutation = useMutation({
    mutationFn: () =>
      addProfileItem(profile!.id, {
        name: newName.trim(),
        duration_days: newDuration,
        parent_item_id: addingUnder === "__ROOT__" ? null : addingUnder,
      }),
    onSuccess: async () => {
      showSuccessToast("Đã thêm hạng mục")
      setNewName("")
      setNewDuration(1)
      setAddingUnder(null)
      await invalidate()
    },
    onError: handleError.bind(showErrorToast),
  })

  const deleteProfileMutation = useMutation({
    mutationFn: () => deleteProfile(profile!.id),
    onSuccess: async () => {
      showSuccessToast("Đã xoá mẫu")
      await invalidate()
      onClose()
    },
    onError: handleError.bind(showErrorToast),
  })

  if (!profile) return null

  const isItemDirty = (it: TaskProfileItem) => {
    const d = drafts[it.id]
    if (!d) return false
    return (
      d.name.trim() !== it.name.trim() ||
      d.duration_days !== it.duration_days
    )
  }

  const updateDraft = (id: string, patch: Partial<ItemDraft>) => {
    setDrafts((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa mẫu công việc</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Header info */}
          <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1">
              <Label>Tên mẫu</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Mô tả</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <LoadingButton
                size="sm"
                loading={saveHeaderMutation.isPending}
                disabled={
                  !name.trim() ||
                  (name.trim() === profile.name &&
                    (description.trim() || "") === (profile.description ?? ""))
                }
                onClick={() => saveHeaderMutation.mutate()}
              >
                Lưu thông tin
              </LoadingButton>
            </div>
          </div>

          {/* Items list */}
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
              <p className="text-sm font-semibold">
                Hạng mục ({orderedItems.length})
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddingUnder("__ROOT__")}
              >
                <Plus className="mr-1 h-4 w-4" /> Thêm hạng mục gốc
              </Button>
            </div>

            <div className="divide-y">
              {orderedItems.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Chưa có hạng mục nào.
                </p>
              ) : (
                orderedItems.map((it) => {
                  const draft = drafts[it.id]
                  if (!draft) return null
                  const dirty = isItemDirty(it)
                  return (
                    <div
                      key={it.id}
                      className="flex items-center gap-2 px-3 py-2"
                      style={{ paddingLeft: `${12 + it.level * 20}px` }}
                    >
                      {it.level > 0 ? (
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : null}
                      <Input
                        className="h-8 flex-1"
                        value={draft.name}
                        onChange={(e) =>
                          updateDraft(it.id, { name: e.target.value })
                        }
                      />
                      <Input
                        className="h-8 w-20"
                        type="number"
                        min={1}
                        value={draft.duration_days}
                        onChange={(e) =>
                          updateDraft(it.id, {
                            duration_days: Math.max(1, Number(e.target.value)),
                          })
                        }
                      />
                      <span className="text-xs text-muted-foreground">ngày</span>
                      {it.level < 4 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Thêm con"
                          onClick={() => setAddingUnder(it.id)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!dirty || saveItemMutation.isPending}
                        onClick={() => saveItemMutation.mutate(it.id)}
                      >
                        <Check
                          className={`h-3 w-3 ${
                            dirty ? "text-emerald-600" : "text-muted-foreground"
                          }`}
                        />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `Xoá "${it.name}" và mọi mục con?`,
                            )
                          ) {
                            deleteItemMutation.mutate(it.id)
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )
                })
              )}
            </div>

            {/* Add new item form */}
            {addingUnder !== null ? (
              <div className="border-t bg-blue-50/50 px-3 py-2">
                <div className="mb-1 text-xs text-muted-foreground">
                  {addingUnder === "__ROOT__"
                    ? "Thêm hạng mục gốc mới"
                    : `Thêm hạng mục con dưới "${
                        profile.items.find((i) => i.id === addingUnder)?.name ?? ""
                      }"`}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 flex-1"
                    placeholder="Tên hạng mục..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                  <Input
                    className="h-8 w-20"
                    type="number"
                    min={1}
                    value={newDuration}
                    onChange={(e) =>
                      setNewDuration(Math.max(1, Number(e.target.value)))
                    }
                  />
                  <span className="text-xs text-muted-foreground">ngày</span>
                  <LoadingButton
                    size="sm"
                    loading={addItemMutation.isPending}
                    disabled={!newName.trim()}
                    onClick={() =>
                      addItemMutation.mutate(undefined, {
                        onSuccess: () => {
                          // keep addingUnder for chain-adds at same level
                        },
                      })
                    }
                  >
                    Thêm
                  </LoadingButton>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddingUnder(null)
                      setNewName("")
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t pt-3">
          <Button
            variant="destructive"
            onClick={() => {
              if (
                confirm(`Xoá mẫu "${profile.name}"? Hành động không thể hoàn tác.`)
              ) {
                deleteProfileMutation.mutate()
              }
            }}
            disabled={deleteProfileMutation.isPending}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Xoá mẫu
          </Button>
          <Button variant="outline" onClick={onClose} className="ml-auto">
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
