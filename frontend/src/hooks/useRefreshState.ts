import { useSyncExternalStore } from "react"
import { getRefreshing, subscribeRefreshing } from "@/modules/auth/refreshState"

const useRefreshState = () => {
  return useSyncExternalStore(subscribeRefreshing, getRefreshing, getRefreshing)
}

export default useRefreshState
