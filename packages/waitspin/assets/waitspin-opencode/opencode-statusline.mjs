#!/usr/bin/env node

// WaitSpin OpenCode Statusline Runtime
// Installed by: waitspin opencode install
//
// Called periodically by the OpenCode TUI plugin. Fetches the next sponsored
// message from the WaitSpin API, manages serve caching, and records
// impressions after the minimum visible interval.
//
// Usage: node opencode-statusline.mjs --state STATE_PATH

import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// ─── Constants ──────────────────────────────────────────────

const FETCH_INTERVAL_MS = 15_000
const FETCH_TIMEOUT_MS = 2_500
const MAX_ACTIVE_AGE_MS = 60_000
const LOCK_RETRY_MS = 40
const LOCK_TIMEOUT_MS = 2_000
const LOCK_STALE_MS = 10_000
const DEFAULT_MIN_VISIBLE_MS = 5_000
const CACHE_KEY = "opencode"
const MANAGED_STATE_PATH = path.join(
  os.homedir(),
  ".waitspin",
  "opencode-install.json",
)

// ─── Helpers ────────────────────────────────────────────────

function argValue(name) {
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue
    const value = process.argv[index + 1]
    return value && !value.startsWith("--") ? value : undefined
  }
  return undefined
}

function managedStatePath(value) {
  if (!value) return null
  const resolved = path.resolve(value)
  return resolved === path.resolve(MANAGED_STATE_PATH) ? resolved : null
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch {
    return fallback
  }
}

function readInstallState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const apiKey = typeof value.api_key === "string" ? value.api_key.trim() : ""
  const installId =
    typeof value.install_id === "string" ? value.install_id.trim() : ""
  const baseUrl =
    typeof value.base_url === "string" ? value.base_url.trim() : ""
  const cachePath =
    typeof value.cache_path === "string" ? value.cache_path.trim() : ""
  if (!apiKey || !installId || !baseUrl || !cachePath) return null
  return {
    ...value,
    api_key: apiKey,
    install_id: installId,
    base_url: baseUrl,
    cache_path: cachePath,
  }
}

async function writeJson(filePath, value) {
  const tmp = filePath + "." + process.pid + ".tmp"
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  })
  await rename(tmp, filePath)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function acquireCacheLock(cachePath) {
  const lockPath = cachePath + ".lock"
  const startedAt = Date.now()

  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      await mkdir(lockPath)
      return async () => {
        await rm(lockPath, { recursive: true, force: true })
      }
    } catch {
      try {
        const lockStat = await stat(lockPath)
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await rm(lockPath, { recursive: true, force: true })
          continue
        }
      } catch {
        // Another process may have released the lock between mkdir/stat
      }
      await sleep(LOCK_RETRY_MS)
    }
  }

  throw new Error("Timed out waiting for WaitSpin OpenCode cache lock.")
}

async function withCacheLock(cachePath, callback) {
  const release = await acquireCacheLock(cachePath)
  try {
    return await callback()
  } finally {
    await release()
  }
}

function cleanLine(value) {
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

function parseServe(payload) {
  if (!payload || typeof payload !== "object") return null
  const creative = payload.creative
  if (!creative || typeof creative !== "object") return null
  const line = cleanLine(creative.line)
  if (!line) return null
  if (
    typeof payload.serve_id !== "string" ||
    typeof payload.serve_receipt !== "string"
  ) {
    return null
  }
  return {
    serveId: payload.serve_id,
    serveReceipt: payload.serve_receipt,
    line,
    shownAt: Date.now(),
    minVisibleMs:
      typeof payload.min_visible_ms === "number" && payload.min_visible_ms >= DEFAULT_MIN_VISIBLE_MS
        ? payload.min_visible_ms
        : DEFAULT_MIN_VISIBLE_MS,
    impressionRecorded: false,
  }
}

// ─── WaitSpin API Calls ─────────────────────────────────────

async function waitspinFetch(url, init) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchNextServe(state, session) {
  const response = await waitspinFetch(state.base_url + "/v1/serve/next", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + state.api_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ install_id: state.install_id }),
  })
  session.lastFetchAt = Date.now()
  if (response.status === 204) {
    session.activeServe = null
    return
  }
  if (!response.ok) return
  const parsed = parseServe(await response.json())
  if (parsed) session.activeServe = parsed
}

async function recordImpression(state, session) {
  const serve = session.activeServe
  if (!serve || serve.impressionRecorded) return
  const visibleMs = Date.now() - serve.shownAt
  if (visibleMs < serve.minVisibleMs) return
  const response = await waitspinFetch(state.base_url + "/v1/events/impression", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + state.api_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serve_id: serve.serveId,
      serve_receipt: serve.serveReceipt,
      install_id: state.install_id,
      visible_ms: Math.max(visibleMs, serve.minVisibleMs),
    }),
  })
  if (response.ok) serve.impressionRecorded = true
}

function pruneSessions(cache) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const [key, value] of Object.entries(cache.sessions || {})) {
    if ((value.lastSeenAt || 0) < cutoff) delete cache.sessions[key]
  }
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const statePath = managedStatePath(argValue("--state"))
  if (!statePath) return

  const state = readInstallState(await readJson(statePath, null))
  if (!state) return

  let sponsorLine = ""

  try {
    sponsorLine = await withCacheLock(state.cache_path, async () => {
      const cache = await readJson(state.cache_path, { sessions: {} })
      if (!cache.sessions || typeof cache.sessions !== "object") cache.sessions = {}

      // OpenCode uses a single session key
      const session = cache.sessions[CACHE_KEY] || {}
      session.lastSeenAt = Date.now()
      cache.sessions[CACHE_KEY] = session

      // Expire stale active serve
      if (
        session.activeServe &&
        Date.now() - session.activeServe.shownAt > MAX_ACTIVE_AGE_MS
      ) {
        session.activeServe = null
      }

      await recordImpression(state, session)

      const shouldFetchNext = !session.activeServe
        ? Date.now() - (session.lastFetchAt || 0) >= FETCH_INTERVAL_MS
        : session.activeServe.impressionRecorded &&
          Date.now() - (session.lastFetchAt || 0) >= FETCH_INTERVAL_MS

      if (shouldFetchNext) {
        await fetchNextServe(state, session)
      }

      pruneSessions(cache)
      await writeJson(state.cache_path, cache)
      return session
    })
  } catch {
    // Statusline rendering must never interrupt the host
  }

  const line = sponsorLine?.activeServe?.line || ""
  if (line) process.stdout.write(line)
}

main().catch(() => {})
