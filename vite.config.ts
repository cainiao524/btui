import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

function splitVendorChunk(id: string) {
  const normalizedId = id.replaceAll("\\", "/")

  if (normalizedId.includes("/react/") || normalizedId.includes("/react-dom/") || normalizedId.includes("/react-router") || normalizedId.includes("/radix-ui/") || normalizedId.includes("/@radix-ui/") || normalizedId.includes("/@floating-ui/") || normalizedId.includes("/react-remove-scroll/") || normalizedId.includes("/sonner/")) {
    return "framework-vendor"
  }
  if (normalizedId.includes("/@dnd-kit/") || normalizedId.includes("/@tanstack/")) {
    return "interaction-vendor"
  }
}

const BACKENDS = ["qbittorrent", "transmission"] as const

function resolveBackend(value: string | undefined) {
  const backend = value || "qbittorrent"
  if (!(BACKENDS as readonly string[]).includes(backend)) {
    throw new Error(`Unknown BACKEND "${backend}", expected one of: ${BACKENDS.join(", ")}`)
  }
  return backend
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const isDemo = env.VITE_APP_DEMO === "true"
  const backend = resolveBackend(process.env.BACKEND ?? env.BACKEND)
  const backendDir = path.resolve(__dirname, "./backends", backend)

  return {
    base: "./",
    plugins: [react(), tailwindcss()],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      include: ["src/**/*.test.{ts,tsx}", `backends/${backend}/**/*.test.{ts,tsx}`],
    },
    resolve: {
      alias: [
        // If it's a demo build, replace rpc-client with mock version (specific first)
        ...(isDemo ? [
          { find: /^@backend\/rpc-client$/, replacement: path.join(backendDir, "rpc-client-mock.ts") },
        ] : []),
        { find: /^@backend\//, replacement: `${backendDir.replaceAll("\\", "/")}/` },
        { find: "@", replacement: path.resolve(__dirname, "./src") },
      ],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: splitVendorChunk,
        },
      },
    },
    server: {
      proxy: {
        "/api": {
          target: env.VITE_QBITTORRENT_PROXY_TARGET || "http://127.0.0.1:8080",
          changeOrigin: true,
        },
        "/transmission": {
          target: env.VITE_TRANSMISSION_PROXY_TARGET || "http://127.0.0.1:9091",
          changeOrigin: true,
        },
      },
    },
  }
})
