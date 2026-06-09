import { useEffect, useRef, useState } from "react"

import { APP_BUILD } from "@/utils/appVersion"

const POLL_INTERVAL = 60_000

/**
 * Reads the `build` id of the version currently deployed on the server.
 * Returns null on any failure (network error, 404 in dev, bad JSON) so callers
 * never falsely prompt an update.
 */
async function fetchRemoteBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { build?: string }
    return data.build ?? null
  } catch {
    return null
  }
}

/**
 * Clears caches and reloads so the browser picks up the freshly deployed
 * assets. Intentionally does NOT unregister the service worker — that would
 * drop the user's web-push subscription. `registration.update()` nudges the SW
 * to fetch the new `sw.js` while keeping the subscription intact.
 */
export async function applyUpdate(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.update()))
    }
  } finally {
    window.location.reload()
  }
}

/**
 * Polls `/version.json` and flips `updateAvailable` once the deployed build
 * differs from the one this tab is running. Also checks when the tab regains
 * focus/visibility so a backgrounded tab notices a deploy promptly.
 */
export function useVersionCheck(): { updateAvailable: boolean } {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const stopped = useRef(false)

  useEffect(() => {
    if (updateAvailable) return
    stopped.current = false

    async function check() {
      if (stopped.current) return
      const remote = await fetchRemoteBuild()
      if (!stopped.current && remote && remote !== APP_BUILD) {
        setUpdateAvailable(true)
      }
    }

    const interval = window.setInterval(check, POLL_INTERVAL)
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    void check()

    return () => {
      stopped.current = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [updateAvailable])

  return { updateAvailable }
}
