import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig, type Plugin } from "vite"

// ─── Version identity (computed once per build) ─────────────────────────────
// `version` is the human-readable semver from package.json (bump it per
// release). `build` is the git commit short hash — it changes on every deploy
// automatically, so update detection still works even if semver isn't bumped.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
) as { version: string }

function resolveBuild(): string {
  // CI / Docker injects the hash because the build context has no .git dir.
  const injected = process.env.APP_BUILD || process.env.VITE_APP_BUILD
  if (injected) return injected.trim()
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim()
  } catch {
    // Last resort: a timestamp so each build is still distinguishable and
    // update detection keeps working (just without a readable commit hash).
    return `b${Date.now()}`
  }
}

const APP_VERSION = pkg.version
const APP_BUILD = resolveBuild()
const APP_VERSION_LABEL = `v${APP_VERSION} (${APP_BUILD})`

// Emits /version.json into the build output. The running app polls it to learn
// when a newer build has been deployed. Not hashed → always fetched fresh.
function versionJsonPlugin(): Plugin {
  return {
    name: "emit-version-json",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: APP_VERSION, build: APP_BUILD }),
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD__: JSON.stringify(APP_BUILD),
    __APP_VERSION_LABEL__: JSON.stringify(APP_VERSION_LABEL),
  },
  server: {
    // Entries starting with "." match as suffix (any *.ngrok-free.app tunnel).
    allowedHosts: [".ngrok-free.app", ".ngrok.io", "localhost", "127.0.0.1","workably-pianic-wanita.ngrok-free.dev"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    versionJsonPlugin(),
  ],
})
