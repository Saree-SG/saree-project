import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowLeft, MoreVertical, Plus, SendHorizontal } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { useChatSocket } from "@/hooks/useChatSocket"
import useCustomToast from "@/hooks/useCustomToast"
import {
  addRoomMember,
  type ChatMember,
  type ChatMessage,
  type ChatRoom,
  createChatRoom,
  deleteChatRoom,
  getUserByEmail,
  listMyChatRooms,
  listRoomMembers,
  listRoomMessages,
  removeRoomMember,
  updateChatRoom,
  uploadRoomAttachment,
} from "@/modules/chat/chatApi"
import { handleError } from "@/utils"

const searchSchema = z.object({
  room: z.string().optional(),
})

export const Route = createFileRoute("/_layout/chat")({
  validateSearch: searchSchema,
  component: ChatPage,
})

function roomInitials(name: string | null | undefined) {
  if (!name) return "CH"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (
    parts
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase() || "")
      .join("") || "CH"
  )
}

function formatMessageTime(iso: string | null | undefined) {
  if (!iso) return ""
  const dateValue = new Date(iso)
  if (Number.isNaN(dateValue.getTime())) return ""
  return dateValue.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ChatPage() {
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const { user: currentUser } = useAuth()

  const { room } = Route.useSearch()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    room ?? null,
  )
  const [roomQuery, setRoomQuery] = useState("")
  const [draft, setDraft] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [membersOpen, setMembersOpen] = useState(false)
  const [roomEditOpen, setRoomEditOpen] = useState(false)
  const [roomNameInput, setRoomNameInput] = useState("")
  const [roomColorInput, setRoomColorInput] = useState("#2563eb")

  const messageListRef = useRef<HTMLDivElement | null>(null)
  const autoScrolledRoomIdRef = useRef<string | null>(null)
  const socket = useChatSocket(selectedRoomId)

  const roomsQuery = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: listMyChatRooms,
  })

  const selectedRoomExists = Boolean(
    selectedRoomId &&
      (roomsQuery.data ?? []).some((roomValue) => roomValue.id === selectedRoomId),
  )

  const messagesQuery = useQuery({
    enabled: Boolean(selectedRoomId && roomsQuery.isSuccess && selectedRoomExists),
    queryKey: ["chat", "messages", selectedRoomId],
    queryFn: () => listRoomMessages({ roomId: selectedRoomId! }),
  })

  const membersQuery = useQuery({
    enabled: Boolean(
      selectedRoomId && roomsQuery.isSuccess && selectedRoomExists,
    ),
    queryKey: ["chat", "members", selectedRoomId],
    queryFn: () => listRoomMembers(selectedRoomId!),
  })

  const createRoomMutation = useMutation({
    mutationFn: async () =>
      createChatRoom({
        room_type: "group",
        name: "New room",
        member_user_ids: [],
      }),
    onSuccess: async (room) => {
      showSuccessToast("Room created")
      await queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] })
      setSelectedRoomId(room.id)
    },
    onError: handleError.bind(showErrorToast),
  })

  const updateRoomMutation = useMutation({
    mutationFn: async (params: {
      roomId: string
      name: string | null
      room_color: string | null
    }) => updateChatRoom(params),
    onSuccess: async (room) => {
      showSuccessToast("Room updated")
      setRoomEditOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] })
      if (selectedRoomId) {
        await queryClient.invalidateQueries({
          queryKey: ["chat", "messages", selectedRoomId],
        })
      }
      setSelectedRoomId(room.id)
    },
    onError: handleError.bind(showErrorToast),
  })

  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: string) => deleteChatRoom(roomId),
    onSuccess: async () => {
      showSuccessToast("Room deleted")
      setSelectedRoomId(null)
      setMembersOpen(false)
      setRoomEditOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) =>
      uploadRoomAttachment({ roomId: selectedRoomId!, file }),
    onSuccess: async () => {
      showSuccessToast("Uploaded")
      await queryClient.invalidateQueries({
        queryKey: ["chat", "messages", selectedRoomId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const userValue = await getUserByEmail(email)
      const member = await addRoomMember({
        roomId: selectedRoomId!,
        userId: userValue.id,
        role: "member",
      })
      return { user: userValue, member }
    },
    onSuccess: async () => {
      showSuccessToast("Invited")
      setInviteEmail("")
      await queryClient.invalidateQueries({
        queryKey: ["chat", "members", selectedRoomId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) =>
      removeRoomMember({ roomId: selectedRoomId!, userId }),
    onSuccess: async () => {
      showSuccessToast("Removed")
      await queryClient.invalidateQueries({
        queryKey: ["chat", "members", selectedRoomId],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const selectedRoom: ChatRoom | undefined =
    (roomsQuery.data ?? []).find((room) => room.id === selectedRoomId) ??
    undefined

  useEffect(() => {
    setSelectedRoomId(room ?? null)
  }, [room])

  useEffect(() => {
    setRoomNameInput(selectedRoom?.name ?? "")
    setRoomColorInput(selectedRoom?.room_color ?? "#2563eb")
  }, [selectedRoom?.name, selectedRoom?.room_color])

  const filteredRooms = useMemo(() => {
    const queryValue = roomQuery.trim().toLowerCase()
    if (!queryValue) return roomsQuery.data ?? []
    return (roomsQuery.data ?? []).filter((room) => {
      const roomName = (room.name || "").toLowerCase()
      const roomType = (room.room_type || "").toLowerCase()
      return roomName.includes(queryValue) || roomType.includes(queryValue)
    })
  }, [roomQuery, roomsQuery.data])

  const memberCount = (membersQuery.data ?? []).filter(
    (member) => !member.left_at,
  ).length

  const memberNameById = useMemo(() => {
    const memberMap = new Map<string, string>()
    for (const member of membersQuery.data ?? []) {
      memberMap.set(
        member.user_id,
        (member.full_name || member.email || member.user_id).trim(),
      )
    }
    if (currentUser?.id) {
      memberMap.set(
        currentUser.id,
        currentUser.full_name || currentUser.email || "You",
      )
    }
    return memberMap
  }, [
    currentUser?.email,
    currentUser?.full_name,
    currentUser?.id,
    membersQuery.data,
  ])

  const liveMessages = useMemo(() => {
    const baseMessages = (messagesQuery.data ?? []).slice().reverse()
    const incomingMessages = socket.events
      .filter((eventValue) => eventValue.type === "message.new")
      .map((eventValue) => (eventValue as any).message as ChatMessage)
      .filter(
        (messageValue) =>
          !baseMessages.some((base) => base.id === messageValue.id),
      )
    return [...baseMessages, ...incomingMessages]
  }, [messagesQuery.data, socket.events])

  useEffect(() => {
    if (!selectedRoomId) {
      autoScrolledRoomIdRef.current = null
      return
    }

    const messageListElement = messageListRef.current
    if (!messageListElement) return
    if (autoScrolledRoomIdRef.current === selectedRoomId) return
    if (liveMessages.length === 0) return

    messageListElement.scrollTop = messageListElement.scrollHeight
    autoScrolledRoomIdRef.current = selectedRoomId
  }, [selectedRoomId, liveMessages.length])

  useEffect(() => {
    const messageListElement = messageListRef.current
    if (!messageListElement) return
    const distanceFromBottom =
      messageListElement.scrollHeight -
      messageListElement.scrollTop -
      messageListElement.clientHeight
    const shouldStickBottom = distanceFromBottom < 180
    if (shouldStickBottom) {
      messageListElement.scrollTop = messageListElement.scrollHeight
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-white md:static md:h-full md:rounded-2xl md:border">
      <section className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={[
            "w-full border-r bg-slate-50/40 md:flex md:w-80 md:flex-col",
            selectedRoomId ? "hidden md:flex" : "flex flex-col",
          ].join(" ")}
        >
          <div className="border-b px-3 py-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="hidden h-8 w-8 rounded-full p-0 text-slate-600 hover:bg-white md:inline-flex" />
                <h2 className="text-sm font-semibold">Conversations</h2>
              </div>
              <button
                type="button"
                className="rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-white disabled:opacity-60"
                disabled={createRoomMutation.isPending}
                onClick={() => createRoomMutation.mutate()}
              >
                New
              </button>
            </div>
            <input
              value={roomQuery}
              onChange={(eventValue) => setRoomQuery(eventValue.target.value)}
              placeholder="Search chats..."
              className="h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filteredRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={[
                  "mb-1 flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
                  room.id === selectedRoomId
                    ? "border border-primary/20 bg-white shadow-sm"
                    : "hover:bg-white/80",
                ].join(" ")}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                  {roomInitials(room.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {room.name || "Untitled chat"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {room.room_type}
                  </p>
                </div>
              </button>
            ))}

            {!roomsQuery.isLoading && filteredRooms.length === 0 ? (
              <p className="px-2 py-5 text-xs text-slate-500">
                No rooms found.
              </p>
            ) : null}
          </div>
        </aside>

        <div
          className={[
            "min-w-0 flex-1",
            selectedRoomId ? "block" : "hidden md:block",
          ].join(" ")}
        >
          <div className="grid h-full grid-rows-[4rem_minmax(0,1fr)_auto]">
            <div className="flex items-center justify-between border-b bg-white px-2 md:px-4">
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  title="Back"
                  className="rounded-full p-2 hover:bg-slate-100 md:hidden"
                  onClick={() => setSelectedRoomId(null)}
                >
                  <ArrowLeft className="h-5 w-5 text-slate-600" />
                </button>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">
                    {selectedRoom?.name || "Select a conversation"}
                  </h2>
                  <p className="truncate text-[11px] text-slate-500">
                    {selectedRoomId
                      ? `${memberCount} members · ${socket.status}`
                      : "No room selected"}
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Room options"
                    disabled={!selectedRoomId}
                    className="rounded-full p-2 hover:bg-slate-100 disabled:opacity-60"
                  >
                    <MoreVertical className="h-5 w-5 text-slate-600" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      if (!selectedRoom) return
                      setRoomNameInput(selectedRoom.name ?? "")
                      setRoomColorInput(selectedRoom.room_color ?? "#2563eb")
                      setRoomEditOpen(true)
                    }}
                  >
                    Edit room
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMembersOpen(true)}>
                    Manage members
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      if (!selectedRoomId || deleteRoomMutation.isPending)
                        return
                      const confirmed = window.confirm(
                        "Delete this room permanently?",
                      )
                      if (!confirmed) return
                      deleteRoomMutation.mutate(selectedRoomId)
                    }}
                  >
                    Delete room
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog open={roomEditOpen} onOpenChange={setRoomEditOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit Room</DialogTitle>
                    <DialogDescription>
                      Update room name and color.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={(eventValue) => {
                      eventValue.preventDefault()
                      if (!selectedRoomId) return
                      const nextName = roomNameInput.trim() || null
                      const nextColor = roomColorInput.trim() || null
                      updateRoomMutation.mutate({
                        roomId: selectedRoomId,
                        name: nextName,
                        room_color: nextColor,
                      })
                    }}
                  >
                    <div className="space-y-1">
                      <label
                        htmlFor="chat-room-name-input"
                        className="text-sm font-medium"
                      >
                        Room name
                      </label>
                      <input
                        id="chat-room-name-input"
                        value={roomNameInput}
                        onChange={(eventValue) =>
                          setRoomNameInput(eventValue.target.value)
                        }
                        placeholder="Room name"
                        className="h-10 w-full rounded-lg border px-3 text-sm outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="chat-room-color-input"
                        className="text-sm font-medium"
                      >
                        Room color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="chat-room-color-picker"
                          type="color"
                          title="Pick room color"
                          value={roomColorInput}
                          onChange={(eventValue) =>
                            setRoomColorInput(eventValue.target.value)
                          }
                          className="h-10 w-12 rounded border p-1"
                        />
                        <input
                          id="chat-room-color-input"
                          value={roomColorInput}
                          onChange={(eventValue) =>
                            setRoomColorInput(eventValue.target.value)
                          }
                          placeholder="#2563eb"
                          className="h-10 flex-1 rounded-lg border px-3 text-sm outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={updateRoomMutation.isPending}
                      className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Save changes
                    </button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
                <DialogContent className="max-w-xl p-0">
                  <div className="border-b p-4">
                    <DialogHeader>
                      <DialogTitle>Group Settings</DialogTitle>
                      <DialogDescription>
                        Invite and manage members in this room.
                      </DialogDescription>
                    </DialogHeader>
                  </div>

                  <form
                    className="flex gap-2 border-b p-4"
                    onSubmit={(eventValue) => {
                      eventValue.preventDefault()
                      if (!selectedRoomId) return
                      const emailValue = inviteEmail.trim()
                      if (!emailValue) return
                      inviteMutation.mutate(emailValue)
                    }}
                  >
                    <input
                      value={inviteEmail}
                      onChange={(eventValue) =>
                        setInviteEmail(eventValue.target.value)
                      }
                      placeholder="Invite by email..."
                      className="h-10 flex-1 rounded-lg border px-3 text-sm outline-none"
                    />
                    <button
                      type="submit"
                      disabled={inviteMutation.isPending}
                      className="h-10 rounded-lg border px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                    >
                      Invite
                    </button>
                  </form>

                  <div className="max-h-[55vh] overflow-y-auto p-4">
                    {membersQuery.isLoading ? (
                      <p className="text-sm text-slate-500">Loading...</p>
                    ) : (
                      <div className="space-y-2">
                        {(membersQuery.data ?? []).map((member: ChatMember) => (
                          <div
                            key={`${member.room_id}:${member.user_id}`}
                            className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {member.full_name ||
                                  member.email ||
                                  member.user_id}
                              </p>
                              <p className="text-xs text-slate-500">
                                {member.email} · {member.role}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={removeMemberMutation.isPending}
                              onClick={() =>
                                removeMemberMutation.mutate(member.user_id)
                              }
                              className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div
              ref={messageListRef}
              className="min-h-0 overflow-y-auto px-2 py-3 md:px-4 md:py-5"
            >
              {!selectedRoomId ? (
                <p className="text-sm text-slate-500">
                  Select a room to start chatting.
                </p>
              ) : (
                <div className="space-y-3">
                  {liveMessages.map((messageValue) => {
                    const isCurrentUser =
                      messageValue.sender_id === currentUser?.id
                    return (
                      <div
                        key={messageValue.id}
                        className={
                          isCurrentUser
                            ? "flex justify-end"
                            : "flex justify-start"
                        }
                      >
                        <div
                          className={[
                            "max-w-[calc(100%-0.5rem)] rounded-2xl px-3 py-2 shadow-sm md:max-w-[74%]",
                            isCurrentUser
                              ? "rounded-br-md bg-primary text-primary-foreground"
                              : "rounded-bl-md border bg-white text-slate-900",
                          ].join(" ")}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="truncate text-[11px] font-semibold opacity-90">
                              {isCurrentUser
                                ? "You"
                                : memberNameById.get(messageValue.sender_id) ||
                                  messageValue.sender_id}
                            </span>
                            <span className="text-[10px] opacity-80">
                              {formatMessageTime(messageValue.created_at)}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {messageValue.content ??
                              (messageValue.message_type === "file"
                                ? "(file)"
                                : "")}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <form
              className="border-t bg-white px-2 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-3"
              onSubmit={(eventValue) => {
                eventValue.preventDefault()
                if (!selectedRoomId) return
                const textValue = draft.trim()
                if (!textValue) return
                try {
                  socket.sendMessage(textValue)
                  setDraft("")
                } catch (errorValue) {
                  showErrorToast(String(errorValue))
                }
              }}
            >
              <div className="flex items-center gap-1.5 rounded-2xl border bg-slate-50 p-1.5">
                <label
                  aria-label="Attach file"
                  className={[
                    "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-200",
                    selectedRoomId ? "" : "pointer-events-none opacity-60",
                  ].join(" ")}
                >
                  <Plus className="h-5 w-5" />
                  <input
                    type="file"
                    className="hidden"
                    onChange={(eventValue) => {
                      const fileValue = eventValue.target.files?.[0]
                      if (!fileValue || !selectedRoomId) return
                      uploadMutation.mutate(fileValue)
                      eventValue.target.value = ""
                    }}
                  />
                </label>

                <input
                  value={draft}
                  disabled={!selectedRoomId}
                  onChange={(eventValue) => setDraft(eventValue.target.value)}
                  placeholder={
                    selectedRoomId ? "Type a message..." : "Select a room first"
                  }
                  className="h-10 flex-1 rounded-full bg-transparent px-2 text-sm outline-none disabled:opacity-60"
                />

                <button
                  type="submit"
                  title="Send message"
                  disabled={!selectedRoomId}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white disabled:opacity-60"
                >
                  <SendHorizontal className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}
