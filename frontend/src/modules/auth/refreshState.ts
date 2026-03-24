let refreshing = false
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) {
    listener()
  }
}

export const setRefreshing = (value: boolean) => {
  refreshing = value
  emit()
}

export const getRefreshing = () => refreshing

export const subscribeRefreshing = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
