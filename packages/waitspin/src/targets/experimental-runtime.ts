import type { ExperimentalCliTargetName } from "./experimental-cli.js";

const FETCH_INTERVAL_MS = 15_000;

export function experimentalRuntimeSource(
  target: ExperimentalCliTargetName,
): string {
  return String.raw`#!/usr/bin/env node
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const FETCH_INTERVAL_MS = ${FETCH_INTERVAL_MS};
const FETCH_TIMEOUT_MS = 2500;
const MAX_ACTIVE_AGE_MS = 60000;
const LOCK_RETRY_MS = 40;
const LOCK_TIMEOUT_MS = 2000;
const LOCK_STALE_MS = 10000;
const MIN_VISIBLE_MS = 5000;
const PRODUCTION_API_ORIGIN = "https://api.waitspin.com";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return fallback; }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + "." + process.pid + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await rename(tmp, filePath);
  await chmod(filePath, 0o600);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withLock(cachePath, callback) {
  const lockPath = cachePath + ".lock";
  const startedAt = Date.now();
  await mkdir(path.dirname(cachePath), { recursive: true });
  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    let acquired = false;
    try {
      await mkdir(lockPath);
      acquired = true;
    } catch {
      try {
        const current = await stat(lockPath);
        if (Date.now() - current.mtimeMs > LOCK_STALE_MS) await rm(lockPath, { recursive: true, force: true });
      } catch {}
      await sleep(LOCK_RETRY_MS);
      continue;
    }
    if (acquired) {
      try { return await callback(); } finally { await rm(lockPath, { recursive: true, force: true }); }
    }
  }
  return "";
}

function cleanLine(value) {
  return String(value || "")
    .replace(/(?:\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)|\u001B[P^_][\s\S]*?\u001B\\|\u001B[@-Z\\-_]|\u009B[0-?]*[ -/]*[@-~])/g, " ")
    .replace(/[\r\n\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function waitspinFetch(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

function parseServe(payload) {
  const line = cleanLine(payload?.creative?.line);
  if (!line || typeof payload?.serve_id !== "string" || typeof payload?.serve_receipt !== "string") return null;
  const expiresAt = Date.parse(payload.expires_at || "");
  return {
    serveId: payload.serve_id,
    serveReceipt: payload.serve_receipt,
    line,
    fetchedAt: Date.now(),
    shownAt: 0,
    expiresAtMs: Number.isFinite(expiresAt) ? expiresAt : Date.now() + MAX_ACTIVE_AGE_MS,
    minVisibleMs: Math.max(MIN_VISIBLE_MS, Number(payload.min_visible_ms || MIN_VISIBLE_MS)),
    impressionRecorded: false,
  };
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function allowedBaseUrl(state) {
  try {
    const parsed = new URL(state?.base_url || "");
    if (parsed.protocol === "https:" && parsed.origin === PRODUCTION_API_ORIGIN) {
      return parsed.origin;
    }
    if (
      state?.allow_dev_api_base === true &&
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isLoopbackHostname(parsed.hostname)
    ) {
      return parsed.origin;
    }
  } catch {}
  return null;
}

function expired(serve) {
  const ageStart = Number(serve.shownAt || serve.fetchedAt || Date.now());
  return Date.now() >= (serve.expiresAtMs || 0) || Date.now() - ageStart > MAX_ACTIVE_AGE_MS;
}

async function heartbeatAlive(heartbeatPath) {
  if (!heartbeatPath) return false;
  try {
    const current = await stat(heartbeatPath);
    if (Date.now() - current.mtimeMs > 2500) return false;
    const pid = Number(String(await readFile(heartbeatPath, "utf8") || "").trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  } catch {
    return false;
  }
}

async function scheduleImpressionTick(statePath, cachePath, heartbeatPath, cache) {
  const serve = cache.activeServe;
  if (!statePath || !serve || serve.impressionRecorded || !serve.shownAt) return false;
  if (!heartbeatPath) return false;
  if (serve.shownHeartbeatPath !== heartbeatPath) return false;
  if (cache.impressionTickServeId === serve.serveId) return false;
  cache.impressionTickServeId = serve.serveId;
  cache.impressionTickScheduledAt = Date.now();
  cache.impressionTickHeartbeatPath = heartbeatPath;
  try {
    await writeJson(cachePath, cache);
    const child = spawn(process.execPath, [
      process.argv[1],
      "--state",
      statePath,
      "--impression-tick",
      "--serve-id",
      serve.serveId,
      "--heartbeat",
      heartbeatPath,
    ], {
      detached: true,
      env: {
        HOME: process.env.HOME || "",
        PATH: process.env.PATH || "",
        TMPDIR: process.env.TMPDIR || "",
        USERPROFILE: process.env.USERPROFILE || "",
      },
      stdio: "ignore",
    });
    child.unref();
  } catch {
    delete cache.impressionTickServeId;
    delete cache.impressionTickScheduledAt;
    delete cache.impressionTickHeartbeatPath;
    await writeJson(cachePath, cache);
  }
  return true;
}

async function fetchNext(state, cache) {
  const baseUrl = allowedBaseUrl(state);
  if (!baseUrl) return;
  const response = await waitspinFetch(baseUrl + "/v1/serve/next", {
    method: "POST",
    headers: { Authorization: "Bearer " + state.api_key, "Content-Type": "application/json" },
    body: JSON.stringify({ install_id: state.install_id, slot_id: ${JSON.stringify(target)} }),
  });
  cache.lastFetchAt = Date.now();
  if (response.status === 204) { cache.activeServe = null; return; }
  if (!response.ok) return;
  const parsed = parseServe(await response.json());
  if (parsed) cache.activeServe = parsed;
}

async function recordImpression(state, cache) {
  const baseUrl = allowedBaseUrl(state);
  if (!baseUrl) return;
  const serve = cache.activeServe;
  if (!serve || serve.impressionRecorded || !serve.shownAt) return;
  const visibleMs = Date.now() - serve.shownAt;
  if (visibleMs < serve.minVisibleMs) return;
  const response = await waitspinFetch(baseUrl + "/v1/events/impression", {
    method: "POST",
    headers: { Authorization: "Bearer " + state.api_key, "Content-Type": "application/json" },
    body: JSON.stringify({
      serve_id: serve.serveId,
      serve_receipt: serve.serveReceipt,
      install_id: state.install_id,
      visible_ms: Math.max(visibleMs, serve.minVisibleMs),
    }),
  });
  if (response.ok) serve.impressionRecorded = true;
  else if ([400, 404, 409, 410].includes(response.status)) cache.activeServe = null;
}

async function clearInactiveOwnedServe(cache, heartbeatPath) {
  const ownerHeartbeatPath =
    cache.impressionTickHeartbeatPath ||
    cache.activeServe?.shownHeartbeatPath ||
    "";
  if (!cache.activeServe || !ownerHeartbeatPath || ownerHeartbeatPath === heartbeatPath) return;
  if (!(await heartbeatAlive(ownerHeartbeatPath))) cache.activeServe = null;
}

async function recordForegroundImpression(state, cache, heartbeatPath) {
  if (!cache.activeServe) return;
  if (!heartbeatPath || cache.impressionTickHeartbeatPath !== heartbeatPath) return;
  if (!(await heartbeatAlive(heartbeatPath))) {
    cache.activeServe = null;
    return;
  }
  await recordImpression(state, cache);
}

async function recordDelayedImpression() {
  const statePath = argValue("--state");
  const expectedServeId = argValue("--serve-id");
  const heartbeatPath = argValue("--heartbeat");
  if (!statePath || !expectedServeId) return "";
  const state = await readJson(statePath, null);
  if (!state?.install_id || !state?.api_key || !state?.base_url || !state?.cache_path) return "";
  if (!allowedBaseUrl(state)) return "";
  const firstCache = await readJson(state.cache_path, {});
  if (firstCache.uninstalling === true) return "";
  const serve = firstCache.activeServe;
  if (!serve || serve.serveId !== expectedServeId || serve.impressionRecorded || !serve.shownAt) return "";
  if (serve.shownHeartbeatPath !== heartbeatPath) return "";
  const dueAt = serve.shownAt + Math.max(MIN_VISIBLE_MS, serve.minVisibleMs || MIN_VISIBLE_MS) + 250;
  if (Date.now() < dueAt) await sleep(dueAt - Date.now());
  return withLock(state.cache_path, async () => {
    const cache = await readJson(state.cache_path, {});
    if (cache.uninstalling === true) return "";
    if (cache.activeServe?.serveId === expectedServeId) {
      if (cache.activeServe.shownHeartbeatPath !== heartbeatPath) return "";
      if (await heartbeatAlive(heartbeatPath || cache.impressionTickHeartbeatPath)) {
        await recordImpression(state, cache);
      } else {
        cache.activeServe = null;
      }
      await writeJson(state.cache_path, cache);
    }
    return "";
  });
}

async function markShown() {
  const statePath = argValue("--state");
  const expectedServeId = argValue("--serve-id");
  if (!statePath || !expectedServeId) return "";
  const state = await readJson(statePath, null);
  if (!state?.install_id || !state?.api_key || !state?.base_url || !state?.cache_path) return "";
  if (!allowedBaseUrl(state)) return "";
  const cachePath = state.cache_path;
  const heartbeatPath = process.env.WAITSPIN_HEARTBEAT_PATH || "";
  if (!heartbeatPath) return "";
  return withLock(cachePath, async () => {
    const cache = await readJson(cachePath, {});
    if (cache.uninstalling === true) return "";
    const serve = cache.activeServe;
    if (!serve || serve.serveId !== expectedServeId || serve.impressionRecorded) return "";
    if (expired(serve)) {
      cache.activeServe = null;
      await writeJson(cachePath, cache);
      return "";
    }
    if (
      serve.shownAt &&
      serve.shownHeartbeatPath &&
      serve.shownHeartbeatPath !== heartbeatPath &&
      (await heartbeatAlive(serve.shownHeartbeatPath))
    ) {
      return "";
    }
    if (!serve.shownAt || serve.shownHeartbeatPath !== heartbeatPath) {
      serve.shownAt = Date.now();
      serve.shownHeartbeatPath = heartbeatPath;
      delete cache.impressionTickServeId;
      delete cache.impressionTickScheduledAt;
      delete cache.impressionTickHeartbeatPath;
    }
    const tickScheduled = await scheduleImpressionTick(
      statePath,
      cachePath,
      heartbeatPath,
      cache,
    );
    if (!tickScheduled) await writeJson(cachePath, cache);
    return "";
  });
}

async function render() {
  const statePath = argValue("--state");
  if (!statePath) return "";
  const state = await readJson(statePath, null);
  if (!state?.install_id || !state?.api_key || !state?.base_url) return "";
  if (!allowedBaseUrl(state)) return "";
  const cachePath = state.cache_path;
  if (!cachePath) return "";
  const heartbeatPath = process.env.WAITSPIN_HEARTBEAT_PATH || "";
  return withLock(cachePath, async () => {
    const cache = await readJson(cachePath, {});
    if (cache.activeServe && expired(cache.activeServe)) cache.activeServe = null;
    await clearInactiveOwnedServe(cache, heartbeatPath);
    await recordForegroundImpression(state, cache, heartbeatPath);
    const shouldFetch = !cache.activeServe
      ? Date.now() - (cache.lastFetchAt || 0) >= FETCH_INTERVAL_MS
      : cache.activeServe.impressionRecorded && Date.now() - (cache.lastFetchAt || 0) >= FETCH_INTERVAL_MS;
    if (shouldFetch) await fetchNext(state, cache);
    const tickScheduled = await scheduleImpressionTick(statePath, cachePath, heartbeatPath, cache);
    if (!tickScheduled) await writeJson(cachePath, cache);
    return cache.activeServe?.line || "";
  });
}

const task = process.argv.includes("--impression-tick")
  ? recordDelayedImpression()
  : process.argv.includes("--mark-shown")
    ? markShown()
    : render();
task.then((line) => {
  if (line) process.stdout.write(line + "\n");
}).catch(() => {});
`;
}
