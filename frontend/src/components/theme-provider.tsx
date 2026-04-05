import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

export type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  resolvedTheme: "dark" | "light"
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const lockedTheme: Theme = "light"
  const [, setThemeState] = useState<Theme>(
    () =>
      lockedTheme ||
      (localStorage.getItem(storageKey) as Theme) ||
      defaultTheme,
  )

  const updateTheme = useCallback(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")
    root.classList.add(lockedTheme)
  }, [])

  useEffect(() => {
    updateTheme()
  }, [updateTheme])

  const value = {
    theme: lockedTheme,
    resolvedTheme: "light" as const,
    setTheme: (_theme: Theme) => {
      localStorage.setItem(storageKey, lockedTheme)
      setThemeState(lockedTheme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
