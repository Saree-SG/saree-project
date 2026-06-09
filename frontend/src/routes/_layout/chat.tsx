import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Download,
  FileText,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Plus,
  Search,
  SendHorizontal,
  Users,
  X,
} from "lucide-react"
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
import { useSidebar } from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { useChatSocket } from "@/hooks/useChatSocket"
import useCustomToast from "@/hooks/useCustomToast"
import {
  addRoomMember,
  type ChatAttachment,
  type ChatMember,
  type ChatMessage,
  type ChatRoom,
  createChatRoom,
  deleteChatRoom,
  getUserByEmail,
  listMyChatRooms,
  listRoomMembers,
  listRoomMessages,
  markRoomAsRead,
  removeRoomMember,
  sendRoomMessage,
  updateChatRoom,
  uploadRoomAttachment,
} from "@/modules/chat/chatApi"
import { handleError } from "@/utils"
import { resolveBackendMediaUrl } from "@/utils/mediaUrl"

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
      .map((v) => v[0]?.toUpperCase() || "")
      .join("") || "CH"
  )
}

function formatMessageTime(iso: string | null | undefined) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function formatDateSeparator(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Hôm nay"
  if (d.toDateString() === yesterday.toDateString()) return "Hôm qua"
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function isSameDay(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageAttachment(att: ChatAttachment): boolean {
  if (att.mime_type?.startsWith("image/")) return true
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(att.filename || "")
}

function AttachmentView({
  att,
  isMe,
}: {
  att: ChatAttachment
  isMe: boolean
}) {
  const url = att.public_url ? resolveBackendMediaUrl(att.public_url) : ""
  if (!url) {
    return (
      <p className="text-sm italic opacity-70">📎 {att.filename}</p>
    )
  }

  if (isImageAttachment(att)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg"
        title={att.filename}
      >
        <img
          src={url}
          alt={att.filename}
          loading="lazy"
          className="max-h-60 w-auto max-w-full rounded-lg object-cover"
        />
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={att.filename}
      className={[
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
        isMe
          ? "bg-primary-foreground/15 hover:bg-primary-foreground/25"
          : "bg-muted hover:bg-muted/70",
      ].join(" ")}
      title={`Tải về ${att.filename}`}
    >
      <FileText className="h-7 w-7 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{att.filename}</span>
        {att.size_bytes != null && (
          <span className="block text-[11px] opacity-70">
            {formatFileSize(att.size_bytes)}
          </span>
        )}
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-70" />
    </a>
  )
}

function ChatPage() {
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const { user: currentUser } = useAuth()
  const { setOpen, isMobile } = useSidebar()
  const navigate = useNavigate()

  const { room } = Route.useSearch()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(room ?? null)
  const [roomQuery, setRoomQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [membersOpen, setMembersOpen] = useState(false)
  const [roomEditOpen, setRoomEditOpen] = useState(false)
  const [roomNameInput, setRoomNameInput] = useState("")
  const [roomColorInput, setRoomColorInput] = useState("#2563eb")

  const messageListRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const prevRoomIdRef = useRef<string | null>(null)

  const socket = useChatSocket(selectedRoomId, () => {
    void queryClient.invalidateQueries({ queryKey: ["chat", "messages", selectedRoomId] })
  })

  // Collapse app sidebar when entering chat
  useEffect(() => {
    if (!isMobile) setOpen(false)
  }, [isMobile, setOpen])

  const roomsQuery = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: listMyChatRooms,
  })

  const selectedRoomExists = Boolean(
    selectedRoomId && (roomsQuery.data ?? []).some((r) => r.id === selectedRoomId),
  )

  const messagesQuery = useQuery({
    enabled: Boolean(selectedRoomId && roomsQuery.isSuccess && selectedRoomExists),
    queryKey: ["chat", "messages", selectedRoomId],
    queryFn: () => listRoomMessages({ roomId: selectedRoomId! }),
  })

  const membersQuery = useQuery({
    enabled: Boolean(selectedRoomId && roomsQuery.isSuccess && selectedRoomExists),
    queryKey: ["chat", "members", selectedRoomId],
    queryFn: () => listRoomMembers(selectedRoomId!),
  })

  const createRoomMutation = useMutation({
    mutationFn: async () =>
      createChatRoom({ room_type: "group", name: "Nhóm mới", member_user_ids: [] }),
    onSuccess: async (r) => {
      showSuccessToast("Đã tạo nhóm chat")
      await queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] })
      setSelectedRoomId(r.id)
    },
    onError: handleError.bind(showErrorToast),
  })

  const updateRoomMutation = useMutation({
    mutationFn: async (params: { roomId: string; name: string | null; room_color: string | null }) =>
      updateChatRoom(params),
    onSuccess: async (r) => {
      showSuccessToast("Đã cập nhật nhóm")
      setRoomEditOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] })
      setSelectedRoomId(r.id)
    },
    onError: handleError.bind(showErrorToast),
  })

  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: string) => deleteChatRoom(roomId),
    onSuccess: async () => {
      showSuccessToast("Đã xoá nhóm")
      void navigate({ to: "/chat", search: {} })
      setMembersOpen(false)
      setRoomEditOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => uploadRoomAttachment({ roomId: selectedRoomId!, file }),
    onSuccess: async () => {
      showSuccessToast("Đã tải lên")
      await queryClient.invalidateQueries({ queryKey: ["chat", "messages", selectedRoomId] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const u = await getUserByEmail(email)
      return addRoomMember({ roomId: selectedRoomId!, userId: u.id, role: "member" })
    },
    onSuccess: async () => {
      showSuccessToast("Đã mời thành viên")
      setInviteEmail("")
      await queryClient.invalidateQueries({ queryKey: ["chat", "members", selectedRoomId] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => removeRoomMember({ roomId: selectedRoomId!, userId }),
    onSuccess: async () => {
      showSuccessToast("Đã xoá thành viên")
      await queryClient.invalidateQueries({ queryKey: ["chat", "members", selectedRoomId] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const selectedRoom: ChatRoom | undefined =
    (roomsQuery.data ?? []).find((r) => r.id === selectedRoomId) ?? undefined

  useEffect(() => {
    setSelectedRoomId(room ?? null)
  }, [room])

  // Mark as read when room is selected
  useEffect(() => {
    if (!selectedRoomId) return
    void markRoomAsRead(selectedRoomId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "unread-count"] })
    })
  }, [selectedRoomId, queryClient])

  useEffect(() => {
    setRoomNameInput(selectedRoom?.name ?? "")
    setRoomColorInput(selectedRoom?.room_color ?? "#2563eb")
  }, [selectedRoom?.name, selectedRoom?.room_color])

  const filteredRooms = useMemo(() => {
    const q = roomQuery.trim().toLowerCase()
    if (!q) return roomsQuery.data ?? []
    return (roomsQuery.data ?? []).filter((r) =>
      (r.name || "").toLowerCase().includes(q) || (r.room_type || "").toLowerCase().includes(q),
    )
  }, [roomQuery, roomsQuery.data])

  const memberCount = (membersQuery.data ?? []).filter((m) => !m.left_at).length

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of membersQuery.data ?? []) {
      map.set(m.user_id, (m.full_name || m.email || m.user_id).trim())
    }
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.full_name || currentUser.email || "Bạn")
    }
    return map
  }, [currentUser?.email, currentUser?.full_name, currentUser?.id, membersQuery.data])

  const liveMessages = useMemo(() => {
    const base = (messagesQuery.data ?? []).slice().reverse()
    const incoming = socket.events
      .filter((e) => e.type === "message.new")
      .map((e) => (e as { type: string; message: ChatMessage }).message)
      .filter((m) => !base.some((b) => b.id === m.id))
    return [...base, ...incoming]
  }, [messagesQuery.data, socket.events])

  // Mark as read when new messages arrive in current room
  const incomingCount = socket.events.filter((e) => e.type === "message.new").length
  useEffect(() => {
    if (!selectedRoomId || incomingCount === 0) return
    void markRoomAsRead(selectedRoomId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "unread-count"] })
    })
  }, [incomingCount, selectedRoomId, queryClient])

  // Scroll to bottom when room changes or initial messages load
  useEffect(() => {
    const el = messageListRef.current
    if (!el || !selectedRoomId) return
    if (prevRoomIdRef.current !== selectedRoomId) {
      prevRoomIdRef.current = selectedRoomId
      requestAnimationFrame(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTop = messageListRef.current.scrollHeight
        }
      })
    }
  }, [selectedRoomId, messagesQuery.data])

  // Auto-scroll on new message if near bottom
  useEffect(() => {
    if (incomingCount === 0) return
    const el = messageListRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 200) {
      requestAnimationFrame(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTop = messageListRef.current.scrollHeight
        }
      })
    }
    // Update room list preview with latest message
    void queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] })
  }, [incomingCount, queryClient])

  const handleSelectRoom = (roomId: string) => {
    void navigate({ to: "/chat", search: { room: roomId } })
    setSearchOpen(false)
    setRoomQuery("")
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleBack = () => {
    void navigate({ to: "/chat", search: {} })
  }

  const handleSend = () => {
    if (!selectedRoomId) return
    const text = draft.trim()
    if (!text) return
    const sent = socket.sendMessage(text)
    if (sent === false) {
      setDraft("")
      sendRoomMessage({ roomId: selectedRoomId, content: text })
        .then(() => queryClient.invalidateQueries({ queryKey: ["chat", "messages", selectedRoomId] }))
        .catch(() => {
          showErrorToast("Gửi tin nhắn thất bại")
          setDraft(text)
        })
    } else {
      setDraft("")
    }
  }

  const roomColor = (r: ChatRoom) => r.room_color || "#2563eb"

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background">
      {/* ── Room list sidebar ─────────────────────────────────────────── */}
      <aside
        className={[
          "flex flex-col border-r bg-muted/30",
          "w-full md:w-72 lg:w-80 shrink-0",
          selectedRoomId ? "hidden md:flex" : "flex",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
          <h1 className="text-base font-semibold">Chat</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Tìm kiếm"
              onClick={() => setSearchOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Tạo nhóm mới"
              disabled={createRoomMutation.isPending}
              onClick={() => createRoomMutation.mutate()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="border-b bg-background px-3 py-2">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={roomQuery}
                onChange={(e) => setRoomQuery(e.target.value)}
                placeholder="Tìm nhóm chat..."
                className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {roomQuery && (
                <button type="button" onClick={() => setRoomQuery("")}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Room list */}
        <div className="flex-1 overflow-y-auto py-1">
          {roomsQuery.isLoading ? (
            <div className="flex flex-col gap-1 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {roomQuery ? "Không tìm thấy nhóm" : "Chưa có nhóm chat nào"}
              </p>
              {!roomQuery && (
                <button
                  type="button"
                  onClick={() => createRoomMutation.mutate()}
                  className="mt-1 text-xs font-medium text-primary hover:underline"
                >
                  Tạo nhóm mới
                </button>
              )}
            </div>
          ) : (
            filteredRooms.map((r) => {
              const isActive = r.id === selectedRoomId
              const color = roomColor(r)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRoom(r.id)}
                  className={[
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted/60",
                  ].join(" ")}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {roomInitials(r.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {r.name || "Untitled"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.last_message_content || (r.room_type === "direct" ? "Trực tiếp" : "Nhóm")}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* ── Message area ──────────────────────────────────────────────── */}
      <div
        className={[
          "flex min-w-0 flex-1 flex-col",
          selectedRoomId ? "flex" : "hidden md:flex",
        ].join(" ")}
      >
        {!selectedRoomId ? (
          /* Empty state — desktop only */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">Chọn một cuộc trò chuyện</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Chọn nhóm chat từ danh sách bên trái
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background px-3">
              <div className="flex min-w-0 items-center gap-2">
                {/* Back button — mobile only */}
                <button
                  type="button"
                  aria-label="Quay lại"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:hidden"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                {selectedRoom && (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: roomColor(selectedRoom) }}
                  >
                    {roomInitials(selectedRoom.name)}
                  </div>
                )}

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {selectedRoom?.name || "Chat"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {memberCount > 0 ? `${memberCount} thành viên` : ""}
                    {socket.status !== "open" && (
                      <span className="text-amber-500"> · Đang kết nối...</span>
                    )}
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Tùy chọn"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setMembersOpen(true)}>
                    <Users className="mr-2 h-4 w-4" />
                    Quản lý thành viên
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (!selectedRoom) return
                      setRoomNameInput(selectedRoom.name ?? "")
                      setRoomColorInput(selectedRoom.room_color ?? "#2563eb")
                      setRoomEditOpen(true)
                    }}
                  >
                    Chỉnh sửa nhóm
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      if (!selectedRoomId || deleteRoomMutation.isPending) return
                      if (!window.confirm("Xoá nhóm chat này vĩnh viễn?")) return
                      deleteRoomMutation.mutate(selectedRoomId)
                    }}
                  >
                    Xoá nhóm
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Messages */}
            <div
              ref={messageListRef}
              className="flex-1 overflow-y-auto px-3 py-4 md:px-5"
            >
              <div className="flex flex-col gap-1">
                {liveMessages.map((msg, idx) => {
                  const isMe = msg.sender_id === currentUser?.id
                  const prevMsg = liveMessages[idx - 1]
                  const nextMsg = liveMessages[idx + 1]
                  const showDate = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at)
                  const isSameSenderAsPrev =
                    !showDate && prevMsg?.sender_id === msg.sender_id
                  const isSameSenderAsNext =
                    nextMsg?.sender_id === msg.sender_id &&
                    isSameDay(msg.created_at, nextMsg?.created_at)
                  const showName = !isMe && !isSameSenderAsPrev
                  const senderName = memberNameById.get(msg.sender_id) || msg.sender_id

                  return (
                    <div key={msg.id}>
                      {/* Date separator */}
                      {showDate && (
                        <div className="my-3 flex items-center gap-3">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {formatDateSeparator(msg.created_at)}
                          </span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}

                      {/* Message row */}
                      <div
                        className={[
                          "flex",
                          isMe ? "justify-end" : "justify-start",
                          isSameSenderAsPrev ? "mt-0.5" : "mt-2",
                        ].join(" ")}
                      >
                        {/* Avatar placeholder for spacing on left side */}
                        {!isMe && (
                          <div className="mr-2 flex w-7 shrink-0 items-end">
                            {!isSameSenderAsNext ? (
                              <div
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                style={{
                                  backgroundColor: selectedRoom
                                    ? roomColor(selectedRoom)
                                    : "#2563eb",
                                }}
                              >
                                {senderName.slice(0, 1).toUpperCase()}
                              </div>
                            ) : null}
                          </div>
                        )}

                        <div
                          className={[
                            "flex flex-col",
                            isMe ? "items-end" : "items-start",
                          ].join(" ")}
                        >
                          {showName && (
                            <span className="mb-0.5 ml-1 text-[11px] font-medium text-muted-foreground">
                              {senderName}
                            </span>
                          )}
                          <div
                            className={[
                              "max-w-[min(72vw,26rem)] rounded-2xl px-3.5 py-2",
                              isMe
                                ? "rounded-br-sm bg-primary text-primary-foreground"
                                : "rounded-bl-sm border bg-background text-foreground",
                            ].join(" ")}
                          >
                            {msg.attachments && msg.attachments.length > 0 ? (
                              <div className="flex flex-col gap-1.5">
                                {msg.content && (
                                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                    {msg.content}
                                  </p>
                                )}
                                {msg.attachments.map((att) => (
                                  <AttachmentView
                                    key={att.id}
                                    att={att}
                                    isMe={isMe}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                {msg.content ??
                                  (msg.message_type === "file"
                                    ? "📎 Tệp đính kèm"
                                    : "")}
                              </p>
                            )}
                          </div>
                          {!isSameSenderAsNext && (
                            <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                              {formatMessageTime(msg.created_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {liveMessages.length === 0 && !messagesQuery.isLoading && (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t bg-background px-3 py-2.5">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                className="flex items-end gap-2 rounded-2xl border bg-muted/30 px-2 py-1.5"
              >
                <label
                  aria-label="Đính kèm tệp"
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <Paperclip className="h-4 w-4" />
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      uploadMutation.mutate(f)
                      e.target.value = ""
                    }}
                  />
                </label>

                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    e.target.style.height = "auto"
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Nhập tin nhắn... (Enter để gửi)"
                  rows={1}
                  className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                />

                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Gửi"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  <SendHorizontal className="h-4 w-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────── */}
      <Dialog open={roomEditOpen} onOpenChange={setRoomEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa nhóm</DialogTitle>
            <DialogDescription>Cập nhật tên và màu nhóm chat.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!selectedRoomId) return
              updateRoomMutation.mutate({
                roomId: selectedRoomId,
                name: roomNameInput.trim() || null,
                room_color: roomColorInput.trim() || null,
              })
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="room-name" className="text-sm font-medium">
                Tên nhóm
              </label>
              <input
                id="room-name"
                value={roomNameInput}
                onChange={(e) => setRoomNameInput(e.target.value)}
                placeholder="Tên nhóm chat"
                className="h-10 w-full rounded-lg border bg-muted/30 px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Màu nhóm</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  title="Chọn màu"
                  value={roomColorInput}
                  onChange={(e) => setRoomColorInput(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded border p-1"
                />
                <input
                  value={roomColorInput}
                  onChange={(e) => setRoomColorInput(e.target.value)}
                  placeholder="#2563eb"
                  className="h-10 flex-1 rounded-lg border bg-muted/30 px-3 text-sm outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={updateRoomMutation.isPending}
              className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {updateRoomMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-lg p-0">
          <div className="border-b p-4">
            <DialogHeader>
              <DialogTitle>Thành viên nhóm</DialogTitle>
              <DialogDescription>Quản lý thành viên trong nhóm chat này.</DialogDescription>
            </DialogHeader>
          </div>
          <form
            className="flex gap-2 border-b px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault()
              const email = inviteEmail.trim()
              if (!email || !selectedRoomId) return
              inviteMutation.mutate(email)
            }}
          >
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Mời thành viên qua email..."
              className="h-9 flex-1 rounded-lg border bg-muted/30 px-3 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Mời
            </button>
          </form>
          <div className="max-h-[50vh] overflow-y-auto p-4">
            {membersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải...</p>
            ) : (
              <div className="space-y-2">
                {(membersQuery.data ?? []).map((m: ChatMember) => (
                  <div
                    key={`${m.room_id}:${m.user_id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {(m.full_name || m.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {m.full_name || m.email || m.user_id}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={removeMemberMutation.isPending}
                      onClick={() => removeMemberMutation.mutate(m.user_id)}
                      className="shrink-0 rounded-md border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                    >
                      Xoá
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
