import { useCallback, useEffect, useState } from "react"
import {
  getVapidKey,
  subscribePush,
  unsubscribePush,
} from "@/modules/notifications/notificationApi"

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from(
    [...rawData].map((c) => c.charCodeAt(0)),
  ) as Uint8Array<ArrayBuffer>
}

function subToPayload(sub: PushSubscription) {
  const keys = sub.toJSON().keys as { p256dh: string; auth: string }
  return { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth }
}

type PushState = {
  isSupported: boolean
  permission: NotificationPermission
  isSubscribed: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

export function usePushNotifications(): PushState {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window

  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : "denied",
  )
  const [isSubscribed, setIsSubscribed] = useState(false)

  // Register SW + check existing subscription on mount
  useEffect(() => {
    if (!isSupported) return
    navigator.serviceWorker.register("/sw.js").then(() =>
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub)
        }),
      ),
    )
  }, [isSupported])

  const subscribe = useCallback(async () => {
    if (!isSupported) return

    // Register service worker if not yet
    await navigator.serviceWorker.register("/sw.js")
    const reg = await navigator.serviceWorker.ready

    const vapidKey = await getVapidKey()
    if (!vapidKey) {
      console.warn("VAPID public key not configured on server")
      return
    }

    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== "granted") return

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    await subscribePush(subToPayload(sub))
    setIsSubscribed(true)
  }, [isSupported])

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await unsubscribePush(subToPayload(sub))
    await sub.unsubscribe()
    setIsSubscribed(false)
  }, [isSupported])

  return { isSupported, permission, isSubscribed, subscribe, unsubscribe }
}
