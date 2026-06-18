// WaitSpin OpenCode TUI Plugin
// Installed by: waitspin opencode install
// Slot: app_bottom
//
// Displays a WaitSpin sponsored message in the OpenCode TUI app_bottom slot.
// Polls the WaitSpin API every 15s and records impressions after 5s visible.

import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { createSignal, Show } from "solid-js"

const POLL_INTERVAL_MS = 15_000
const MIN_VISIBLE_MS = 5_000
const FETCH_TIMEOUT_MS = 5_000

const INSTALL_CONFIG = {
  statePath: "__WAITSPIN_STATE_PATH__",
}

interface WaitSpinConfig {
  baseUrl: string
  apiKey: string
  installId: string
}

interface ActiveServe {
  serveId: string
  line: string
  destinationUrl: string
  serveReceipt: string
  shownAt: number
  minVisibleMs: number
}

const plugin: TuiPlugin = async (api: TuiPluginApi) => {
  const [sponsorLine, setSponsorLine] = createSignal("")
  const [destinationUrl, setDestinationUrl] = createSignal("")

  let activeServe: ActiveServe | null = null
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let impressionTimer: ReturnType<typeof setTimeout> | undefined
  let isPolling = false
  let cachedConfig: WaitSpinConfig | null | undefined

  function kvGet(key: string): string {
    try {
      return api.kv.get<string>(key) || ""
    } catch {
      return ""
    }
  }

  async function readStateConfig(): Promise<WaitSpinConfig | null> {
    if (cachedConfig !== undefined) return cachedConfig
    try {
      const raw = await readFile(INSTALL_CONFIG.statePath, "utf8")
      const state = JSON.parse(raw) as Record<string, unknown>
      const baseUrl = typeof state.base_url === "string" ? state.base_url.trim() : ""
      const apiKey = typeof state.api_key === "string" ? state.api_key.trim() : ""
      const installId = typeof state.install_id === "string" ? state.install_id.trim() : ""
      cachedConfig = baseUrl && apiKey && installId
        ? { baseUrl, apiKey, installId }
        : null
    } catch {
      cachedConfig = null
    }
    return cachedConfig
  }

  async function resolveConfig(): Promise<WaitSpinConfig | null> {
    const apiKey = kvGet("waitspin_api_key")
    const installId = kvGet("waitspin_install_id")
    const baseUrl = kvGet("waitspin_base_url") || "https://api.waitspin.com"
    if (apiKey && installId) return { baseUrl, apiKey, installId }
    return readStateConfig()
  }

  function isSafeUrl(url: string): boolean {
    try {
      const rawHost = rawHostname(url)
      if (/^(?:\d+|0x[0-9a-f]+|0[0-7]+)$/i.test(rawHost)) return false
      const parsed = new URL(url)
      if (parsed.protocol !== "https:") return false
      if (parsed.username || parsed.password) return false
      const host = parsed.hostname.toLowerCase()
      if (["localhost", "::1", "0.0.0.0"].includes(host)) return false
      if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) return false
      if (host.startsWith("::ffff:")) return false
      if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false
      return true
    } catch {
      return false
    }
  }

  function rawHostname(url: string): string {
    const withoutProtocol = url.trim().replace(/^[a-z][a-z\d+.-]*:\/\//i, "")
    const authority = withoutProtocol.split(/[/?#]/, 1)[0] || ""
    const hostPort = authority.includes("@") ? authority.slice(authority.lastIndexOf("@") + 1) : authority
    if (hostPort.startsWith("[")) {
      return hostPort.slice(1, hostPort.indexOf("]")).toLowerCase()
    }
    return hostPort.split(":")[0].toLowerCase()
  }

  function openExternalUrl(url: string): void {
    if (!isSafeUrl(url)) return
    const platform = typeof process === "object" ? process.platform : ""
    const command =
      platform === "darwin" ? "open" : platform === "linux" ? "xdg-open" : ""
    if (!command) return
    try {
      const child = execFile(command, [url], { timeout: 2000 }, () => {})
      child.unref()
    } catch {
      // Opening destinations is best-effort; display must never fail.
    }
  }

  function cleanLine(value: unknown): string {
    return String(value || "")
      .replace(
        /(?:\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)|\u001B[P^_][\s\S]*?\u001B\\|\u001B[@-Z\\-_]|\u009B[0-?]*[ -/]*[@-~])/g,
        " ",
      )
      .replace(/[\r\n\u0000-\u001F\u007F-\u009F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
  }

  function parseServePayload(payload: unknown): ActiveServe | null {
    if (!payload || typeof payload !== "object") return null
    const r = payload as Record<string, unknown>
    const serveId = typeof r.serve_id === "string" ? r.serve_id.trim() : ""
    if (serveId.length < 8) return null
    const serveReceipt = typeof r.serve_receipt === "string" ? r.serve_receipt.trim() : ""
    if (serveReceipt.length < 32) return null
    const creative = r.creative
    if (!creative || typeof creative !== "object") return null
    const c = creative as Record<string, unknown>
    const line = cleanLine(c.line)
    if (!line) return null
    const destinationUrl = typeof c.destination_url === "string" ? c.destination_url.trim() : ""
    if (!destinationUrl || !isSafeUrl(destinationUrl)) return null
    const minVisibleMs = typeof r.min_visible_ms === "number" && r.min_visible_ms >= MIN_VISIBLE_MS
      ? r.min_visible_ms
      : MIN_VISIBLE_MS
    return { serveId, line, destinationUrl, serveReceipt, shownAt: Date.now(), minVisibleMs }
  }

  async function fetchNextServe(): Promise<void> {
    if (isPolling) return
    const cfg = await resolveConfig()
    if (!cfg) return
    isPolling = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(`${cfg.baseUrl}/v1/serve/next`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ install_id: cfg.installId }),
        signal: controller.signal,
      })

      if (response.status === 204) { clearAd(); return }
      if (!response.ok) return

      const parsed = parseServePayload(await response.json())
      if (!parsed) return

      activeServe = parsed
      setSponsorLine(parsed.line)
      setDestinationUrl(parsed.destinationUrl)

      if (impressionTimer) clearTimeout(impressionTimer)
      impressionTimer = setTimeout(() => {
        impressionTimer = undefined
        if (!activeServe || activeServe.serveId !== parsed.serveId) return
        recordImpression(parsed.serveId, parsed.serveReceipt, Math.max(Date.now() - parsed.shownAt, parsed.minVisibleMs))
      }, parsed.minVisibleMs)
    } catch {
      // Network errors are non-fatal.
    } finally {
      clearTimeout(timeout)
      isPolling = false
    }
  }

  async function recordImpression(serveId: string, serveReceipt: string, visibleMs: number): Promise<void> {
    const cfg = await resolveConfig()
    if (!cfg) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      await fetch(`${cfg.baseUrl}/v1/events/impression`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ serve_id: serveId, serve_receipt: serveReceipt, install_id: cfg.installId, visible_ms: visibleMs }),
        signal: controller.signal,
      })
    } catch {
      // Impression failures are non-fatal.
    } finally {
      clearTimeout(timeout)
    }
  }

  function clearAd(): void {
    if (impressionTimer) { clearTimeout(impressionTimer); impressionTimer = undefined }
    activeServe = null
    setSponsorLine("")
    setDestinationUrl("")
  }

  function startPolling(): void {
    if (pollTimer) return
    void fetchNextServe()
    pollTimer = setInterval(() => { void fetchNextServe() }, POLL_INTERVAL_MS)
  }

  function stopPolling(): void {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined }
    if (impressionTimer) { clearTimeout(impressionTimer); impressionTimer = undefined }
    activeServe = null
    setSponsorLine("")
    setDestinationUrl("")
  }

  startPolling()
  api.lifecycle.onDispose(stopPolling)

  api.slots.register({
    slots: {
      app_bottom() {
        const [hovered, setHovered] = createSignal(false)

        return (
          <Show when={sponsorLine()}>
            <box
              flexShrink={0}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={hovered() ? api.theme.current.backgroundElement : api.theme.current.backgroundPanel}
              onMouseOver={() => setHovered(true)}
              onMouseOut={() => setHovered(false)}
              onMouseUp={() => {
                const url = destinationUrl()
                if (url) {
                  openExternalUrl(url)
                }
              }}
            >
              <text fg={hovered() ? api.theme.current.text : api.theme.current.textMuted}>
                ⧉ {sponsorLine()}
              </text>
            </box>
          </Show>
        )
      },
    },
  })
}

export default plugin
