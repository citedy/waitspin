#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import {
  experimentalAllInstallTargets,
  experimentalInstallTarget,
  isExperimentalCliTargetName,
  runExperimentalCliTargetInstall,
  runExperimentalCliTargetStatus,
  runExperimentalCliTargetUninstall,
  type ExperimentalAllInstallTarget,
  type ExperimentalCliDeps,
  type ExperimentalCliTargetName,
} from "./targets/experimental-cli.js";
import {
  formatBidCheckoutResult,
  formatBidsListResult,
  formatCampaignCreateResult,
  formatInitResult,
  formatInstallAllResult,
  formatMarketResult,
  formatStatusAllResult,
  formatTargetInstallResult,
  formatTargetStatusResult,
  formatTargetUninstallResult,
  formatWalletConnectResult,
} from "./cli-format.js";
import {
  formatWalletLedger,
  formatWalletPayout,
  formatWalletStatus,
} from "./wallet-format.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const DEFAULT_BASE_URL =
  process.env.WAITSPIN_BASE_URL?.trim() || "https://api.waitspin.com";
const PRODUCTION_API_ORIGIN = "https://api.waitspin.com";
const REQUEST_TIMEOUT_MS = 30_000;
const DEV_API_BASE_OPT_IN_ENV = "WAITSPIN_ALLOW_DEV_API_BASE";
const DEV_EXTENSION_ASSETS_OPT_IN_ENV =
  "WAITSPIN_ALLOW_DEV_EXTENSION_ASSETS";
const WAITSPIN_API_KEY_REDACTION_PATTERN = /\bwts_[A-Za-z0-9_-]+\b/g;
const NPM_TOKEN_REDACTION_PATTERN = /\bnpm_[A-Za-z0-9_-]+\b/g;
const WTS_PUBLISHER_CONNECT_COUNTRY_CODES = new Set([
  "US",
  "PT",
  "AU",
  "AT",
  "BE",
  "BG",
  "CA",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GI",
  "GR",
  "HK",
  "HU",
  "IE",
  "IT",
  "JP",
  "LV",
  "LI",
  "LT",
  "LU",
  "MT",
  "MX",
  "NL",
  "NZ",
  "NO",
  "PL",
  "RO",
  "SG",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "TH",
  "AE",
  "GB",
]);
const CLAUDE_CODE_BIN_ENV = "WAITSPIN_CLAUDE_CODE_BIN";
const CLAUDE_CODE_MIN_VERSION = "2.1.97";
const CLAUDE_CODE_PUBLISHER_TARGET = "claude-code";
const CLAUDE_CODE_REFRESH_INTERVAL_SECONDS = 5;
const MIMOCODE_BIN_ENV = "WAITSPIN_MIMOCODE_BIN";
const MIMOCODE_DEFAULT_BIN = "mimo";
const OPENCODE_PUBLISHER_TARGET = "opencode";
const OPENCODE_BIN_ENV = "WAITSPIN_OPENCODE_BIN";
const OPENCODE_DEFAULT_BIN = "opencode";
const COPILOT_PUBLISHER_TARGET = "copilot";
const COPILOT_BIN_ENV = "WAITSPIN_COPILOT_BIN";
const COPILOT_HOME_ENV = "COPILOT_HOME";
const COPILOT_DEFAULT_BIN = "copilot";
const ANTIGRAVITY_PUBLISHER_TARGET = "antigravity";
const ANTIGRAVITY_BIN_ENV = "WAITSPIN_ANTIGRAVITY_BIN";
const ANTIGRAVITY_DEFAULT_BIN = "agy";
const QODER_PUBLISHER_TARGET = "qoder";
const QODER_BIN_ENV = "WAITSPIN_QODER_BIN";
const QODER_DEFAULT_BIN = "qodercli";
const QODER_HOOK_TIMEOUT_SECONDS = 15;
const QODER_HOOK_STATUS_MESSAGE = "WaitSpin sponsor check";
const QODER_HOOK_EVENTS = ["UserPromptSubmit", "Stop"] as const;
const QODER_ACCEPTANCE_HINT =
  "Run a real Qoder TUI prompt and keep the sponsored system message visible for at least 5 seconds. WaitSpin schedules a delayed visibility check after display; Stop or next-prompt hooks refresh the same managed state.";

const WAITSPIN_EDITOR_EXTENSION_ID = "waitspin.waitspin-vscode";
const EDITOR_PUBLISHER_TARGET = "status-bar-fallback";

const extensionTargets = {
  vscode: {
    label: "VS Code",
    mode: "bundled" as const,
    publisherTarget: EDITOR_PUBLISHER_TARGET,
  },
  cursor: {
    label: "Cursor",
    mode: "editor-cli" as const,
    publisherTarget: EDITOR_PUBLISHER_TARGET,
    registryLabel: "VS Code Marketplace",
    registryUrl:
      "https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode",
    binaryEnv: "WAITSPIN_CURSOR_EDITOR_BIN",
    defaultBinary: "cursor",
    windowsDefaultBinaries: ["cursor"],
    windowsRelativeBinaries: [["Programs", "cursor", "Cursor.exe"]],
    productMarker: "cursor",
    executableBasenames: ["cursor", "cursor-editor"],
    macosAppBinary: "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    macosUserAppBinary: path.join(
      os.homedir(),
      "Applications",
      "Cursor.app",
      "Contents",
      "Resources",
      "app",
      "bin",
      "cursor",
    ),
  },
  devin: {
    label: "Devin Desktop",
    mode: "editor-cli" as const,
    publisherTarget: EDITOR_PUBLISHER_TARGET,
    registryLabel: "Open VSX",
    registryUrl:
      "https://open-vsx.org/extension/waitspin/waitspin-vscode",
    binaryEnv: "WAITSPIN_DEVIN_DESKTOP_BIN",
    defaultBinary: "devin-desktop",
    windowsDefaultBinaries: ["devin", "devin-desktop"],
    windowsRelativeBinaries: [["devin", "bin", "devin.exe"]],
    productMarker: "devin",
    executableBasenames: ["devin", "devin-desktop"],
    macosAppBinary:
      "/Applications/Devin.app/Contents/Resources/app/bin/devin-desktop",
    macosUserAppBinary: path.join(
      os.homedir(),
      "Applications",
      "Devin.app",
      "Contents",
      "Resources",
      "app",
      "bin",
      "devin-desktop",
    ),
  },
} as const;

type ExtensionTarget = keyof typeof extensionTargets;
type EditorCliExtensionTarget = Exclude<ExtensionTarget, "vscode">;

export function usageText(): string {
  return (
    [
      "Usage:",
      "  waitspin init --email you@example.com [--code CODE] [--key-profile control|publisher-extension] [--base-url URL]",
      "  waitspin bid create --line TEXT --url https://example.com --price-per-block CENTS --blocks N [--json] [--demo] [--base-url URL] [--api-key KEY]",
      "  waitspin bids list [--json] [--base-url URL] [--api-key KEY]",
      "  waitspin bid checkout <campaign-id> [--json] [--demo] [--base-url URL] [--api-key KEY]",
      "  waitspin market [--json] [--demo] [--base-url URL]",
      "  waitspin wallet status [--json] [--base-url URL] [--api-key KEY]",
      "  waitspin wallet connect [--country US] [--json] [--base-url URL] [--api-key KEY]",
      "  waitspin wallet ledger [--limit N] [--json] [--base-url URL] [--api-key KEY]",
      "  waitspin wallet payout --dry-run [--json] [--base-url URL] [--api-key KEY]",
      "  waitspin wallet payout --confirm-test-transfer [--json] [--base-url URL] [--api-key KEY]",
      "  waitspin extension install [--target vscode|cursor|devin] [--json] [--base-url URL] [--api-key KEY] [--dry-run]",
      "  waitspin extension status [--target vscode|cursor|devin] [--json]",
      "  waitspin extension uninstall [--target vscode|cursor|devin] [--json] [--dry-run]",
      "  waitspin install --all [--json] [--api-key KEY] [--compose-existing] [--dry-run]",
      "  waitspin status --all [--json] [--demo]",
      "  waitspin claude-code install [--json] [--api-key KEY] [--compose-existing] [--dry-run]",
      "  waitspin claude-code status [--json]",
      "  waitspin claude-code uninstall [--json] [--dry-run]",
      "  waitspin mimocode install [--json] [--api-key KEY] [--dry-run]",
      "  waitspin mimocode status [--json]",
      "  waitspin mimocode uninstall [--json] [--dry-run]",
      "  waitspin opencode install [--json] [--api-key KEY] [--dry-run]",
      "  waitspin opencode status [--json]",
      "  waitspin opencode uninstall [--json] [--dry-run]",
      "  waitspin grok install [--json] [--api-key KEY] [--dry-run]",
      "  waitspin grok status [--json]",
      "  waitspin grok uninstall [--json] [--dry-run]",
      "  waitspin antigravity install [--json] [--api-key KEY] [--compose-existing] [--dry-run]",
      "  waitspin antigravity status [--json]",
      "  waitspin antigravity uninstall [--json] [--dry-run]",
      "  waitspin copilot install [--json] [--api-key KEY] [--compose-existing] [--dry-run]",
      "  waitspin copilot status [--json]",
      "  waitspin copilot uninstall [--json] [--dry-run]",
      "  waitspin qoder install [--json] [--api-key KEY] [--dry-run]",
      "  waitspin qoder status [--json]",
      "  waitspin qoder uninstall [--json] [--dry-run]",
      "",
      "Defaults:",
      "  API base: https://api.waitspin.com",
      "  API key: WAITSPIN_API_KEY env var",
      "  Public user targets: status-bar-fallback, claude-code, mimocode, opencode, grok, antigravity, copilot, qoder",
    ].join("\n") + "\n"
  );
}

function usage(exitCode = 1): never {
  const output = usageText();
  if (exitCode === 0) {
    process.stdout.write(output);
  } else {
    process.stderr.write(output);
  }
  process.exit(exitCode);
}

function parseArgs(argv: string[]) {
  if (argv.length === 0) {
    usage();
  }

  const [command, ...rest] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    usage(0);
  }

  const flags = new Map<string, string[]>();
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) continue;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === "help") {
      usage(0);
    }
    if (
      key === "dry-run" ||
      key === "demo" ||
      key === "allow-debug-auto-verify" ||
      key === "allow-dev-api-base" ||
      key === "allow-dev-extension-assets" ||
      key === "confirm-test-transfer" ||
      key === "compose-existing" ||
      key === "include-experimental" ||
      key === "json" ||
      key === "all"
    ) {
      flags.set(key, ["true"]);
      continue;
    }
    const next = rest[index + 1];
    if (next === undefined) {
      throw new Error(`Missing value for --${key}`);
    }
    const existing = flags.get(key) || [];
    existing.push(next);
    flags.set(key, existing);
    index += 1;
  }

  return { command, flags, positionals };
}

function requireFlag(flags: Map<string, string[]>, name: string): string {
  const value = flags.get(name)?.[0]?.trim();
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function optionalFlag(
  flags: Map<string, string[]>,
  name: string,
): string | undefined {
  const value = flags.get(name)?.[0]?.trim();
  return value || undefined;
}

function booleanFlag(flags: Map<string, string[]>, name: string): boolean {
  return flags.get(name)?.[0] === "true";
}

function resolveBaseUrl(flags: Map<string, string[]>) {
  return optionalFlag(flags, "base-url") || DEFAULT_BASE_URL;
}

function allowDevApiBase(flags: Map<string, string[]>): boolean {
  return (
    booleanFlag(flags, "allow-dev-api-base") ||
    process.env[DEV_API_BASE_OPT_IN_ENV] === "1"
  );
}

function allowDevExtensionAssets(flags: Map<string, string[]>): boolean {
  return (
    booleanFlag(flags, "allow-dev-extension-assets") ||
    process.env[DEV_EXTENSION_ASSETS_OPT_IN_ENV] === "1"
  );
}

function isLoopbackApiHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function normalizeOriginUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "Invalid WaitSpin API base URL. Use an http(s) origin without credentials, path, query, or fragment.",
    );
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "" && parsed.pathname !== "/")
  ) {
    throw new Error(
      "Invalid WaitSpin API base URL. Use an http(s) origin without credentials, path, query, or fragment.",
    );
  }

  return parsed;
}

function resolveCredentialedBaseUrl(flags: Map<string, string[]>): string {
  const parsed = normalizeOriginUrl(resolveBaseUrl(flags));
  if (parsed.protocol === "https:" && parsed.origin === PRODUCTION_API_ORIGIN) {
    return parsed.origin;
  }

  if (
    allowDevApiBase(flags) &&
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    isLoopbackApiHostname(parsed.hostname)
  ) {
    return parsed.origin;
  }

  throw new Error(
    `Refusing to send WaitSpin credentials to a non-production API origin. Use ${PRODUCTION_API_ORIGIN} or set ${DEV_API_BASE_OPT_IN_ENV}=1 / --allow-dev-api-base with a loopback http(s) origin for local development.`,
  );
}

function resolveApiKey(flags: Map<string, string[]>) {
  return optionalFlag(flags, "api-key") || process.env.WAITSPIN_API_KEY?.trim();
}

function resolveKeyIntendedUse(flags: Map<string, string[]>): string | null {
  const explicitProfile = optionalFlag(flags, "key-profile");
  if (!explicitProfile) {
    return null;
  }
  if (explicitProfile === "publisher-extension") {
    return "key_profile:publisher_extension";
  }
  if (explicitProfile === "control") {
    return "key_profile:control";
  }
  throw new Error("--key-profile must be control or publisher-extension");
}

function requireApiKey(flags: Map<string, string[]>) {
  const apiKey = resolveApiKey(flags);
  if (!apiKey) {
    throw new Error(
      [
        "Missing API key. Set WAITSPIN_API_KEY or pass --api-key.",
        "Next command:",
        "  export WAITSPIN_API_KEY='PASTE_KEY_HERE'",
      ].join("\n"),
    );
  }
  return apiKey;
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

class WaitSpinCliHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function redactCliSecretText(value: string): string {
  return value
    .replace(WAITSPIN_API_KEY_REDACTION_PATTERN, "[REDACTED_WAITSPIN_KEY]")
    .replace(NPM_TOKEN_REDACTION_PATTERN, "[REDACTED_NPM_TOKEN]");
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: T | null }> {
  const response = await fetch(input, { ...init, signal: timeoutSignal() });
  const text = await response.text();
  if (response.status === 204 || !text) {
    return { status: response.status, body: null };
  }

  let payload: JsonValue;
  try {
    payload = JSON.parse(text) as JsonValue;
  } catch {
    if (!response.ok) {
      throw new WaitSpinCliHttpError(
        response.status,
        `HTTP ${response.status}: upstream returned a non-JSON error response`,
      );
    }
    throw new Error("Invalid JSON response from WaitSpin API");
  }

  if (!response.ok) {
    const safePayload = redactCliSecretText(
      JSON.stringify(payload).slice(0, 500),
    );
    throw new WaitSpinCliHttpError(
      response.status,
      `HTTP ${response.status}: ${safePayload}`,
    );
  }

  return { status: response.status, body: payload as T };
}

let jsonPrinter: (value: unknown) => void = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

function printJson(value: unknown) {
  jsonPrinter(value);
}

function sanitizeTerminalText(value: string): string {
  return value
    .replace(/\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

function printText(value: string) {
  const safe = sanitizeTerminalText(value);
  process.stdout.write(safe.endsWith("\n") ? safe : `${safe}\n`);
}

function printCliOutput(
  flags: Map<string, string[]>,
  json: unknown,
  text: string,
) {
  if (booleanFlag(flags, "json")) {
    printJson(json);
    return;
  }
  printText(text);
}

const DEMO_MODE = "demo";
const DEMO_CAMPAIGN_ID = "demo_campaign_001";
const DEMO_BLOCK_PURCHASE_ID = "demo_block_purchase_001";
const DEMO_INSTALL_ID = "demo_install_001";
const DEMO_PUBLISHER_ID = "demo_publisher_001";

function demoMode(flags: Map<string, string[]>): boolean {
  return booleanFlag(flags, "demo");
}

function demoMarketPayload() {
  return {
    ok: true,
    mode: DEMO_MODE,
    campaigns: [
      {
        campaign_id: DEMO_CAMPAIGN_ID,
        ad_line: "Agent quickstart demo",
        brand_name: "WaitSpin Demo",
        bid_cpm_micros: 5_000_000,
        impressions_served: 1200,
        units_remaining: 999_000,
      },
    ],
  };
}

function demoCampaignPayload(input: {
  adLine: string;
  destinationUrl: string;
  pricePerBlockCents: number;
  blocks: number;
}) {
  return {
    ok: true,
    mode: DEMO_MODE,
    campaign_id: DEMO_CAMPAIGN_ID,
    block_purchase_id: DEMO_BLOCK_PURCHASE_ID,
    status: "draft",
    ad_line: input.adLine,
    destination_url: input.destinationUrl,
    price_per_block_cents: input.pricePerBlockCents,
    blocks: input.blocks,
    next_command: `waitspin bid checkout ${DEMO_CAMPAIGN_ID} --demo`,
  };
}

function demoCheckoutPayload(campaignId: string) {
  if (campaignId !== DEMO_CAMPAIGN_ID) {
    throw new Error(`Demo checkout accepts ${DEMO_CAMPAIGN_ID} only`);
  }
  return {
    ok: true,
    mode: DEMO_MODE,
    campaign_id: DEMO_CAMPAIGN_ID,
    block_purchase_id: DEMO_BLOCK_PURCHASE_ID,
    checkout_url: "demo://waitspin/checkout/demo_campaign_001",
    status: "demo_checkout_ready",
    checkout_disclosure: {
      terms_url: "https://waitspin.com/waitspin/terms",
      privacy_url: "https://waitspin.com/waitspin/privacy",
      refund_policy:
        "Demo mode is a static CLI fixture. No Stripe Checkout, account, campaign, publisher event, payout, or billable impression is created.",
    },
  };
}

function demoStatusAllPayload() {
  const status = {
    target: "agent-quickstart",
    command: "waitspin status --all --demo",
    result: {
      ok: true,
      mode: DEMO_MODE,
      installed: true,
      publisher_registered: true,
      install_id: DEMO_INSTALL_ID,
      publisher_id: DEMO_PUBLISHER_ID,
    },
  };
  return {
    ok: true,
    mode: DEMO_MODE,
    command: "status --all",
    include_experimental: false,
    installed: [status],
    statuses: [status],
    failed_status: [],
  };
}

async function capturePrintedJson<T>(fn: () => Promise<void>): Promise<T> {
  const previousPrinter = jsonPrinter;
  let captured: unknown;
  jsonPrinter = (value) => {
    captured = value;
  };
  try {
    await fn();
  } finally {
    jsonPrinter = previousPrinter;
  }
  return captured as T;
}

function keyProfileFromIntendedUse(
  intendedUse: string | null,
): "control" | "publisher_extension" | null {
  if (intendedUse === "key_profile:publisher_extension") {
    return "publisher_extension";
  }
  if (intendedUse === "key_profile:control") {
    return "control";
  }
  return null;
}

function keyProfileFlagFromIntendedUse(intendedUse: string | null): string {
  const profile = keyProfileFromIntendedUse(intendedUse);
  if (profile === "publisher_extension") {
    return " --key-profile publisher-extension";
  }
  if (profile === "control") {
    return " --key-profile control";
  }
  return "";
}

function waitspinInitVerifyCommand(input: {
  email: string;
  intendedUse: string | null;
}): string {
  return `waitspin init --email ${input.email} --code CODE_FROM_EMAIL${keyProfileFlagFromIntendedUse(input.intendedUse)}`;
}

function nextCommandsForVerifiedKey(input: {
  intendedUse: string | null;
  scopes?: string[];
}): { next: string; next_commands: string[]; human_message: string } {
  const scopes = input.scopes ?? [];
  const publisherKey =
    keyProfileFromIntendedUse(input.intendedUse) === "publisher_extension" ||
    (scopes.includes("publishers:write") &&
      scopes.includes("serve:read") &&
      scopes.includes("events:write") &&
      !scopes.includes("campaigns:write"));

  if (publisherKey) {
    return {
      next: "install_publisher_target",
      next_commands: [
        "export WAITSPIN_API_KEY='PASTE_KEY_HERE'",
        "waitspin install --all --dry-run --compose-existing",
        "waitspin install --all --compose-existing",
        "waitspin status --all",
      ],
      human_message:
        "Use this extension API key only for user install setup, serve polling, and impressions. Rotate it if it appears in logs.",
    };
  }

  return {
    next: "create_campaign_or_inspect_market",
    next_commands: [
      "export WAITSPIN_API_KEY='PASTE_KEY_HERE'",
      "waitspin market",
      'waitspin bid create --line "Your ad" --url https://example.com --price-per-block 500 --blocks 1',
    ],
    human_message:
      "Use this control key for advertiser and wallet commands. Keep it out of shell history and logs.",
  };
}

async function runInit(flags: Map<string, string[]>) {
  const baseUrl = resolveBaseUrl(flags);
  const email = requireFlag(flags, "email");
  const intendedUse = resolveKeyIntendedUse(flags);
  const providedCode =
    optionalFlag(flags, "code") ||
    process.env.WAITSPIN_VERIFICATION_CODE?.trim();

  if (providedCode) {
    const { body } = await requestJson<{
      account_id: string;
      api_key: string;
      trust_level: string;
      scopes: string[];
    }>(`${baseUrl}/v1/keys/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        code: providedCode,
        ...(intendedUse ? { intended_use: intendedUse } : {}),
      }),
    });
    const output = {
      ok: true,
      base_url: baseUrl,
      ...body,
      ...nextCommandsForVerifiedKey({
        intendedUse,
        scopes: body?.scopes,
      }),
    };
    printCliOutput(flags, output, formatInitResult(output));
    return;
  }

  const { body: requestResult } = await requestJson<{
    delivery: "email" | "debug";
    expires_in_seconds?: number;
    verification_debug_code?: string;
  }>(`${baseUrl}/v1/keys/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      ...(intendedUse ? { intended_use: intendedUse } : {}),
    }),
  });

  const code = requestResult?.verification_debug_code;
  const allowDebugAutoVerify =
    booleanFlag(flags, "allow-debug-auto-verify") ||
    process.env.WAITSPIN_ALLOW_DEBUG_CODE_AUTO_VERIFY === "1";

  if (!code || !allowDebugAutoVerify) {
    const output = {
      ok: true,
      next: "enter_email_code",
      delivery: requestResult?.delivery,
      email,
      expires_in_seconds: requestResult?.expires_in_seconds ?? 900,
      next_command: waitspinInitVerifyCommand({ email, intendedUse }),
      human_message:
        "Check your email for the 6-digit WaitSpin code. Paste it as CODE_FROM_EMAIL.",
      ...(code ? { debug_code_available: true } : {}),
    };
    printCliOutput(flags, output, formatInitResult(output));
    return;
  }

  const { body: verifyResult } = await requestJson<{
    account_id: string;
    api_key: string;
    trust_level: string;
    scopes: string[];
  }>(`${baseUrl}/v1/keys/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      code,
      ...(intendedUse ? { intended_use: intendedUse } : {}),
    }),
  });
  const output = {
    ok: true,
    base_url: baseUrl,
    ...verifyResult,
    ...nextCommandsForVerifiedKey({
      intendedUse,
      scopes: verifyResult?.scopes,
    }),
  };
  printCliOutput(flags, output, formatInitResult(output));
}

async function runBidCreate(flags: Map<string, string[]>) {
  const adLine = requireFlag(flags, "line");
  const destinationUrl = requireFlag(flags, "url");
  const pricePerBlockCents = Number(requireFlag(flags, "price-per-block"));
  const blocks = Number(requireFlag(flags, "blocks"));

  if (!Number.isFinite(pricePerBlockCents) || pricePerBlockCents < 100) {
    throw new Error("--price-per-block must be at least 100 cents");
  }
  if (!Number.isFinite(blocks) || blocks < 1) {
    throw new Error("--blocks must be at least 1");
  }

  if (demoMode(flags)) {
    const output = demoCampaignPayload({
      adLine,
      destinationUrl,
      pricePerBlockCents,
      blocks,
    });
    printCliOutput(flags, output, formatCampaignCreateResult(output));
    return;
  }

  const baseUrl = resolveCredentialedBaseUrl(flags);
  const apiKey = requireApiKey(flags);
  const { body } = await requestJson<Record<string, unknown>>(
    `${baseUrl}/v1/campaigns`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        ad_line: adLine,
        destination_url: destinationUrl,
        price_per_block_cents: pricePerBlockCents,
        blocks,
      }),
    },
  );
  const output = { ok: true, ...body };
  printCliOutput(flags, output, formatCampaignCreateResult(output));
}

async function runBidsList(flags: Map<string, string[]>) {
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const apiKey = requireApiKey(flags);
  const { body } = await requestJson<{ campaigns: unknown[] }>(
    `${baseUrl}/v1/campaigns`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  const output = { ok: true, campaigns: body?.campaigns ?? [] };
  printCliOutput(flags, output, formatBidsListResult(output));
}

async function runBidCheckout(
  flags: Map<string, string[]>,
  positionals: string[],
) {
  const campaignId = positionals[0]?.trim();
  if (!campaignId) {
    throw new Error("Usage: waitspin bid checkout CAMPAIGN_ID");
  }
  if (demoMode(flags)) {
    const output = demoCheckoutPayload(campaignId);
    printCliOutput(flags, output, formatBidCheckoutResult(output));
    return;
  }
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const apiKey = requireApiKey(flags);
  const { body } = await requestJson<Record<string, unknown>>(
    `${baseUrl}/v1/blocks/checkout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ campaign_id: campaignId }),
    },
  );
  const output = {
    ok: true,
    ...body,
    checkout_disclosure: {
      terms_url: "https://waitspin.com/waitspin/terms",
      privacy_url: "https://waitspin.com/waitspin/privacy",
      refund_policy:
        "Unused prepaid block handling is support-reviewed. No automated account-credit balance, redemption flow, or self-serve cash refund request flow is shipped.",
    },
  };
  printCliOutput(flags, output, formatBidCheckoutResult(output));
}

async function runMarket(flags: Map<string, string[]>) {
  if (demoMode(flags)) {
    const output = demoMarketPayload();
    printCliOutput(flags, output, formatMarketResult(output));
    return;
  }
  const baseUrl = resolveBaseUrl(flags);
  const { body } = await requestJson<Record<string, unknown>>(
    `${baseUrl}/v1/market`,
    { method: "GET" },
  );
  const output = { ok: true, ...body };
  printCliOutput(flags, output, formatMarketResult(output));
}

async function runWalletStatus(flags: Map<string, string[]>) {
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const apiKey = requireApiKey(flags);
  const { body } = await requestJson<Record<string, unknown>>(
    `${baseUrl}/v1/wallet/status`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  const output = { ok: true, ...body };
  printCliOutput(flags, output, formatWalletStatus(output));
}

async function runWalletConnect(flags: Map<string, string[]>) {
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const apiKey = requireApiKey(flags);
  const country = optionalCountryFlag(flags, "country");
  const requestBody = country ? JSON.stringify({ country }) : undefined;
  const { body } = await requestJson<Record<string, unknown>>(
    `${baseUrl}/v1/wallet/connect`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(requestBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(requestBody ? { body: requestBody } : {}),
    },
  );
  const output = { ok: true, ...body };
  printCliOutput(flags, output, formatWalletConnectResult(output));
}

function optionalCountryFlag(
  flags: Map<string, string[]>,
  name: string,
): string | undefined {
  const value = optionalFlag(flags, name)?.toUpperCase();
  if (!value) return undefined;
  if (!/^[A-Z]{2}$/.test(value)) {
    throw new Error(`--${name} must be a two-letter country code like US`);
  }
  if (!WTS_PUBLISHER_CONNECT_COUNTRY_CODES.has(value)) {
    throw new Error(`--${name} ${value} is not a supported payout country`);
  }
  return value;
}

async function runWalletLedger(flags: Map<string, string[]>) {
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const apiKey = requireApiKey(flags);
  const limit = optionalFlag(flags, "limit");
  const url = new URL(`${baseUrl}/v1/wallet/ledger`);
  if (limit) {
    url.searchParams.set("limit", limit);
  }
  const { body } = await requestJson<Record<string, unknown>>(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const output = { ok: true, ...body };
  printCliOutput(flags, output, formatWalletLedger(output));
}

async function runWalletPayout(flags: Map<string, string[]>) {
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const apiKey = requireApiKey(flags);
  const dryRun = booleanFlag(flags, "dry-run");
  const confirmTestTransfer = booleanFlag(flags, "confirm-test-transfer");

  if (!dryRun && !confirmTestTransfer) {
    throw new Error(
      "Use --dry-run first, then --confirm-test-transfer for a guarded test payout",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (!dryRun) {
    headers["Idempotency-Key"] = randomUUID();
  }

  const { body } = await requestJson<Record<string, unknown>>(
    `${baseUrl}/v1/wallet/payouts`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        dry_run: dryRun,
        confirm_test_transfer: confirmTestTransfer,
      }),
    },
  );
  const output = { ok: true, ...body };
  printCliOutput(flags, output, formatWalletPayout(output));
}

export function generateInstallId(): string {
  return `wins_${randomUUID().replace(/-/g, "")}`;
}

export function publisherTargetForExtension(target: ExtensionTarget): string {
  return extensionTargets[target].publisherTarget;
}

function isEditorCliExtensionTarget(
  target: ExtensionTarget,
): target is EditorCliExtensionTarget {
  return extensionTargets[target].mode === "editor-cli";
}

type ResolvedEditorCli = {
  binary: string;
  executable: string;
  argumentPrefix: string[];
  version: string;
};

type EditorExtensionStatus = {
  installed: boolean;
  version: string | null;
};

const EDITOR_PROCESS_ENV_KEYS = [
  "APPDATA",
  "COLORTERM",
  "COMSPEC",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOCALAPPDATA",
  "LOGNAME",
  "NODE_EXTRA_CA_CERTS",
  "NO_PROXY",
  "PATH",
  "PATHEXT",
  "SHELL",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
  "USERPROFILE",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
] as const;

function editorProxyEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function editorProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of EDITOR_PROCESS_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY"] as const) {
    const value = editorProxyEnvValue(process.env[key]);
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function editorExecOptions(timeout: number) {
  return { encoding: "utf8" as const, timeout, env: editorProcessEnv() };
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
}

function editorCliCandidates(target: EditorCliExtensionTarget): string[] {
  const descriptor = extensionTargets[target];
  const localAppData = process.env.LOCALAPPDATA?.trim();
  const windowsCandidates =
    process.platform === "win32"
      ? [
          ...descriptor.windowsDefaultBinaries,
          ...(localAppData
            ? descriptor.windowsRelativeBinaries.map((segments) =>
                path.win32.join(localAppData, ...segments),
              )
            : []),
        ]
      : [];
  return uniqueNonEmpty([
    process.env[descriptor.binaryEnv],
    ...(process.platform === "win32"
      ? windowsCandidates
      : [descriptor.defaultBinary]),
    ...(process.platform === "darwin"
      ? [descriptor.macosAppBinary, descriptor.macosUserAppBinary]
      : []),
  ]);
}

type EditorCommand = Pick<
  ResolvedEditorCli,
  "binary" | "executable" | "argumentPrefix"
>;

function isWindowsEditorCommandScript(binary: string): boolean {
  return process.platform === "win32" && /\.(?:cmd|bat)$/i.test(binary);
}

function assertSafeWindowsEditorCommandScript(binary: string): void {
  if (/["\r\n\u0000%&|<>^!]/.test(binary)) {
    throw new Error("Refusing unsafe Windows editor command shim path.");
  }
}

async function resolveWindowsEditorCommand(binary: string): Promise<string> {
  if (process.platform !== "win32") return binary;
  if (
    path.win32.isAbsolute(binary) ||
    binary.includes("\\") ||
    binary.includes("/") ||
    path.win32.extname(binary)
  ) {
    return binary;
  }

  const result = await execFileText(
    "where.exe",
    [binary],
    editorExecOptions(5_000),
  ).catch(() => null);
  if (!result) return binary;

  return (
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) =>
          path.win32.isAbsolute(line) &&
          /\.(?:exe|com|cmd|bat)$/i.test(path.win32.extname(line)),
      ) || binary
  );
}

async function editorCommandForBinary(binary: string): Promise<EditorCommand> {
  const resolvedBinary = await resolveWindowsEditorCommand(binary);
  if (!isWindowsEditorCommandScript(resolvedBinary)) {
    return {
      binary: resolvedBinary,
      executable: resolvedBinary,
      argumentPrefix: [],
    };
  }

  assertSafeWindowsEditorCommandScript(resolvedBinary);
  return {
    binary: resolvedBinary,
    executable: process.env.ComSpec || "cmd.exe",
    argumentPrefix: [
      "/d",
      "/v:off",
      "/s",
      "/c",
      "call",
      resolvedBinary,
    ],
  };
}

function execEditorCommand(
  editor: EditorCommand,
  args: string[],
  timeout: number,
): Promise<{ stdout: string; stderr: string }> {
  return execFileText(
    editor.executable,
    [...editor.argumentPrefix, ...args],
    editorExecOptions(timeout),
  );
}

function editorCliMatchesProduct(
  target: EditorCliExtensionTarget,
  binary: string,
  version: string,
  help: string,
): boolean {
  const descriptor = extensionTargets[target];
  const identityText = `${version}\n${help}`.toLowerCase();
  if (identityText.includes(descriptor.productMarker)) return true;

  const knownOtherProduct = ["cursor", "devin", "visual studio code"].some(
    (marker) =>
      marker !== descriptor.productMarker && identityText.includes(marker),
  );
  if (knownOtherProduct) return false;

  const basename = path.basename(binary).toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
  return (descriptor.executableBasenames as readonly string[]).includes(basename);
}

async function resolveEditorCli(
  target: EditorCliExtensionTarget,
): Promise<ResolvedEditorCli> {
  const descriptor = extensionTargets[target];
  let lastError: unknown;
  for (const binary of editorCliCandidates(target)) {
    try {
      const editor = await editorCommandForBinary(binary);
      const result = await execEditorCommand(editor, ["--version"], 5_000);
      const helpResult = await execEditorCommand(editor, ["--help"], 5_000);
      const help = `${helpResult.stdout}\n${helpResult.stderr}`;
      if (
        ![
          "--install-extension",
          "--list-extensions",
          "--uninstall-extension",
        ].every((option) => help.includes(option))
      ) {
        lastError = new Error(
          `${binary} does not expose editor extension management.`,
        );
        continue;
      }
      const version = `${result.stdout || result.stderr || descriptor.label}`.trim();
      if (!editorCliMatchesProduct(target, editor.binary, version, help)) {
        lastError = new Error(
          `${editor.binary} does not identify as ${descriptor.label}.`,
        );
        continue;
      }
      return {
        ...editor,
        version,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `${descriptor.label} was not detected. Install ${descriptor.label}, add ${process.platform === "win32" ? descriptor.windowsDefaultBinaries[0] : descriptor.defaultBinary} to PATH, or set ${descriptor.binaryEnv} to the editor executable path.`,
    { cause: lastError },
  );
}

function parseEditorExtensionStatus(output: string): EditorExtensionStatus {
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^waitspin\.waitspin-vscode(?:@([^\s]+))?$/i.exec(line);
    if (match) {
      return { installed: true, version: match[1] || null };
    }
  }
  return { installed: false, version: null };
}

async function readEditorExtensionStatus(
  editor: ResolvedEditorCli,
): Promise<EditorExtensionStatus> {
  const result = await execEditorCommand(
    editor,
    ["--list-extensions", "--show-versions"],
    10_000,
  );
  return parseEditorExtensionStatus(`${result.stdout}\n${result.stderr}`);
}

function editorActivationCommand(target: EditorCliExtensionTarget): string {
  return `WaitSpin: Connect and earn inside ${extensionTargets[target].label}`;
}

async function runEditorExtensionInstall(
  target: EditorCliExtensionTarget,
  flags: Map<string, string[]>,
) {
  const descriptor = extensionTargets[target];
  const editor = await resolveEditorCli(target);
  const before = await readEditorExtensionStatus(editor);
  const summary = {
    ok: true,
    target,
    mode: EDITOR_PUBLISHER_TARGET,
    detected: true,
    editor: descriptor.label,
    editor_version: editor.version,
    editor_binary: editor.binary,
    extension: WAITSPIN_EDITOR_EXTENSION_ID,
    version: before.version,
    installed: before.installed,
    registry: descriptor.registryLabel,
    registry_url: descriptor.registryUrl,
    publisher_target: descriptor.publisherTarget,
    publisher_registration_managed_by: "editor-extension",
    activation_required: true,
    next: { command: editorActivationCommand(target) },
    next_command: editorActivationCommand(target),
  };

  if (booleanFlag(flags, "dry-run")) {
    const dryRunPayload = {
      ...summary,
      dry_run: true,
      planned_argv: [
        editor.binary,
        "--install-extension",
        WAITSPIN_EDITOR_EXTENSION_ID,
        "--force",
      ],
    };
    printCliOutput(
      flags,
      dryRunPayload,
      formatTargetInstallResult(dryRunPayload),
    );
    return;
  }

  await execEditorCommand(
    editor,
    ["--install-extension", WAITSPIN_EDITOR_EXTENSION_ID, "--force"],
    30_000,
  );
  const after = await readEditorExtensionStatus(editor);
  if (!after.installed) {
    throw new Error(
      `${descriptor.label} did not report ${WAITSPIN_EDITOR_EXTENSION_ID} after installation.`,
    );
  }
  const output = {
    ...summary,
    installed: true,
    version: after.version,
  };
  printCliOutput(flags, output, formatTargetInstallResult(output));
}

async function runEditorExtensionStatus(
  target: EditorCliExtensionTarget,
  flags: Map<string, string[]>,
) {
  const descriptor = extensionTargets[target];
  let editor: ResolvedEditorCli;
  try {
    editor = await resolveEditorCli(target);
  } catch (error) {
    const output = {
      ok: true,
      target,
      mode: EDITOR_PUBLISHER_TARGET,
      detected: false,
      installed: false,
      version: null,
      publisher_target: descriptor.publisherTarget,
      publisher_registration_managed_by: "editor-extension",
      activation_required: false,
      detection_error: redactCliSecretText(
        error instanceof Error ? error.message : String(error),
      ),
      next: {
        command: `waitspin extension install --target ${target}`,
      },
      next_command: `waitspin extension install --target ${target}`,
    };
    printCliOutput(flags, output, formatTargetStatusResult(output));
    return;
  }

  const status = await readEditorExtensionStatus(editor);
  const output = {
    ok: true,
    target,
    mode: EDITOR_PUBLISHER_TARGET,
    detected: true,
    editor: descriptor.label,
    editor_version: editor.version,
    editor_binary: editor.binary,
    extension: WAITSPIN_EDITOR_EXTENSION_ID,
    version: status.version,
    installed: status.installed,
    publisher_target: descriptor.publisherTarget,
    publisher_registration_managed_by: "editor-extension",
    activation_required: status.installed,
    next: status.installed
      ? { command: editorActivationCommand(target) }
      : {
          command: `waitspin extension install --target ${target}`,
        },
    next_command: status.installed
      ? editorActivationCommand(target)
      : `waitspin extension install --target ${target}`,
  };
  printCliOutput(flags, output, formatTargetStatusResult(output));
}

async function runEditorExtensionUninstall(
  target: EditorCliExtensionTarget,
  flags: Map<string, string[]>,
) {
  const descriptor = extensionTargets[target];
  let editor: ResolvedEditorCli;
  try {
    editor = await resolveEditorCli(target);
  } catch (error) {
    const output = {
      ok: true,
      target,
      detected: false,
      installed: false,
      uninstalled: false,
      dry_run: booleanFlag(flags, "dry-run"),
      publisher_target: descriptor.publisherTarget,
      detection_error: redactCliSecretText(
        error instanceof Error ? error.message : String(error),
      ),
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  const before = await readEditorExtensionStatus(editor);
  const summary = {
    ok: true,
    target,
    detected: true,
    installed: before.installed,
    version: before.version,
    extension: WAITSPIN_EDITOR_EXTENSION_ID,
    publisher_target: descriptor.publisherTarget,
  };
  if (booleanFlag(flags, "dry-run")) {
    const output = {
      ...summary,
      dry_run: true,
      planned_argv: before.installed
        ? [
            editor.binary,
            "--uninstall-extension",
            WAITSPIN_EDITOR_EXTENSION_ID,
          ]
        : null,
      would_remove_extension: before.installed
        ? WAITSPIN_EDITOR_EXTENSION_ID
        : null,
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }
  if (!before.installed) {
    const output = { ...summary, uninstalled: false };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  await execEditorCommand(
    editor,
    ["--uninstall-extension", WAITSPIN_EDITOR_EXTENSION_ID],
    30_000,
  );
  const after = await readEditorExtensionStatus(editor);
  if (after.installed) {
    throw new Error(
      `${descriptor.label} still reports ${WAITSPIN_EDITOR_EXTENSION_ID} after uninstall.`,
    );
  }
  const output = {
    ...summary,
    installed: false,
    uninstalled: true,
    removed_extension: WAITSPIN_EDITOR_EXTENSION_ID,
  };
  printCliOutput(flags, output, formatTargetUninstallResult(output));
}

function extensionInstallDir(_target: ExtensionTarget): string {
  return path.join(os.homedir(), ".vscode", "extensions");
}

function vscodeExtensionInstallDir(manifest: {
  name: string;
  publisher: string;
  version: string;
}) {
  const extensionRoot = path.resolve(extensionInstallDir("vscode"));
  const installName = `${manifest.publisher}.${manifest.name}-${manifest.version}`;
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(installName)) {
    throw new Error("Refusing to install extension with unsafe manifest name.");
  }
  const installPath = path.resolve(extensionRoot, installName);
  if (!installPath.startsWith(`${extensionRoot}${path.sep}`)) {
    throw new Error("Refusing to install extension outside the VS Code root.");
  }
  return installPath;
}

function installStatePath(target: ExtensionTarget): string {
  return path.join(os.homedir(), ".waitspin", `${target}-install.json`);
}

function extensionMarkerPath(target: ExtensionTarget): string {
  return path.join(extensionInstallDir(target), ".waitspin-install.json");
}

function resolveExtensionTarget(flags: Map<string, string[]>): ExtensionTarget {
  const target = optionalFlag(flags, "target") || "vscode";
  if (!Object.prototype.hasOwnProperty.call(extensionTargets, target)) {
    throw new Error(
      `Unsupported extension target: ${target}. Public WaitSpin installs support --target vscode, cursor, or devin.`,
    );
  }
  return target as ExtensionTarget;
}

type InstallState = {
  install_id: string;
  publisher_id?: string;
  publisher_target: string;
  registered_at?: string;
};

type InstallMarker = InstallState & {
  extension?: string;
  version?: string;
  extension_installed?: boolean;
  installed_extension_path?: string | null;
};

async function loadInstallState(
  statePath: string,
): Promise<InstallState | null> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as InstallState;
    if (!parsed.install_id?.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function loadInstallMarker(
  markerPath: string,
): Promise<InstallMarker | null> {
  try {
    return JSON.parse(await readFile(markerPath, "utf8")) as InstallMarker;
  } catch {
    return null;
  }
}

function assertManagedVscodeExtensionPath(input: string): string {
  const extensionRoot = path.resolve(extensionInstallDir("vscode"));
  const resolved = path.resolve(input);
  const name = path.basename(resolved);
  if (
    !resolved.startsWith(`${extensionRoot}${path.sep}`) ||
    !name.startsWith("waitspin.")
  ) {
    throw new Error(
      "Refusing to manage an extension path outside the WaitSpin VS Code install directory.",
    );
  }
  return resolved;
}

async function registerPublisherInstall(input: {
  baseUrl: string;
  apiKey: string;
  installId: string;
  target: string;
}): Promise<{ publisher_id: string; install_id: string; target: string }> {
  let body: { publisher_id: string; install_id: string; target: string } | null =
    null;
  try {
    ({ body } = await requestJson<{
      publisher_id: string;
      install_id: string;
      target: string;
    }>(`${input.baseUrl}/v1/publishers/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        install_id: input.installId,
        target: input.target,
      }),
    }));
  } catch (error) {
    if (
      input.target === CLAUDE_CODE_PUBLISHER_TARGET &&
      error instanceof WaitSpinCliHttpError &&
      error.status === 400 &&
      /status-bar-fallback|Invalid input|Validation error/.test(error.message)
    ) {
      throw new Error(
        [
          'WaitSpin API rejected target "claude-code".',
          "Your local CLI supports Claude Code, but the selected API base does not.",
          "",
          "For production:",
          "  deploy the backend target allowlist, then rerun:",
          "  waitspin claude-code install --compose-existing",
          "",
          "For developer-local acceptance only, use an explicit loopback API with --allow-dev-api-base.",
        ].join("\n"),
      );
    }
    if (
      input.target === OPENCODE_PUBLISHER_TARGET &&
      error instanceof WaitSpinCliHttpError &&
      error.status === 400 &&
      /Invalid input|Validation error/.test(error.message)
    ) {
      throw new Error(
        [
          `WaitSpin API rejected target "${OPENCODE_PUBLISHER_TARGET}".`,
          "Your local CLI supports OpenCode, but the selected API base does not.",
          "",
          "For production:",
          "  deploy the backend target allowlist, then rerun:",
          `  waitspin ${OPENCODE_PUBLISHER_TARGET} install`,
          "",
          "For developer-local acceptance only, use an explicit loopback API with --allow-dev-api-base.",
        ].join("\n"),
      );
    }
    if (
      input.target === COPILOT_PUBLISHER_TARGET &&
      error instanceof WaitSpinCliHttpError &&
      error.status === 400 &&
      /Invalid input|Validation error/.test(error.message)
    ) {
      throw new Error(
        [
          `WaitSpin API rejected target "${COPILOT_PUBLISHER_TARGET}".`,
          "Your local CLI supports this hidden GitHub Copilot CLI target, but the selected API base does not.",
          "",
          "For production:",
          "  deploy the backend target allowlist only after full public acceptance, then rerun:",
          `  waitspin ${COPILOT_PUBLISHER_TARGET} install`,
          "",
          "For developer-local acceptance only, use an explicit loopback API with --allow-dev-api-base.",
        ].join("\n"),
      );
    }
    if (
      input.target === ANTIGRAVITY_PUBLISHER_TARGET &&
      error instanceof WaitSpinCliHttpError &&
      error.status === 400 &&
      /Invalid input|Validation error/.test(error.message)
    ) {
      throw new Error(
        [
          `WaitSpin API rejected target "${ANTIGRAVITY_PUBLISHER_TARGET}".`,
          "Your local CLI supports this hidden Antigravity target, but the selected API base does not.",
          "",
          "For production:",
          "  deploy the backend target allowlist only after full public acceptance, then rerun:",
          `  waitspin ${ANTIGRAVITY_PUBLISHER_TARGET} install`,
          "",
          "For developer-local acceptance only, use an explicit loopback API with --allow-dev-api-base.",
        ].join("\n"),
      );
    }
    if (
      input.target === QODER_PUBLISHER_TARGET &&
      error instanceof WaitSpinCliHttpError &&
      error.status === 400 &&
      /Invalid input|Validation error/.test(error.message)
    ) {
      throw new Error(
        [
          `WaitSpin API rejected target "${QODER_PUBLISHER_TARGET}".`,
          "Your local CLI supports Qoder CLI, but the selected API base does not.",
          "",
          "For production:",
          "  deploy the backend target allowlist after full Qoder public acceptance, then rerun:",
          `  waitspin ${QODER_PUBLISHER_TARGET} install`,
          "",
          "For developer-local acceptance only, use an explicit loopback API with --allow-dev-api-base.",
        ].join("\n"),
      );
    }
    if (
      isExperimentalCliTargetName(input.target) &&
      error instanceof WaitSpinCliHttpError &&
      error.status === 400 &&
      /Invalid input|Validation error/.test(error.message)
    ) {
      throw new Error(
        [
          `WaitSpin API rejected target "${input.target}".`,
          "Your local CLI supports this hidden experimental target, but the selected API base does not.",
          "",
          "For production:",
          "  deploy the backend target allowlist, then rerun the explicit target install.",
          "",
          "For developer-local acceptance only, use an explicit loopback API with --allow-dev-api-base.",
        ].join("\n"),
      );
    }
    throw error;
  }

  if (!body) {
    throw new Error("Publisher registration returned empty body");
  }

  return body;
}

async function resolveExtensionDir(
  flags: Map<string, string[]>,
): Promise<string> {
  const packageRoot = resolveCliPackageRoot();
  const candidates = [
    path.join(packageRoot, "assets", "waitspin-vscode"),
  ];
  if (allowDevExtensionAssets(flags)) {
    candidates.push(path.join(packageRoot, "../../extensions/waitspin-vscode"));
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    try {
      await access(path.join(resolved, "package.json"), fsConstants.F_OK);
      return resolved;
    } catch {
      continue;
    }
  }

  throw new Error(
    `WaitSpin extension package not found. Use a build that ships assets/waitspin-vscode or set ${DEV_EXTENSION_ASSETS_OPT_IN_ENV}=1 / --allow-dev-extension-assets from a trusted checkout.`,
  );
}

function parseVscodeExtensionManifest(value: unknown): {
  name: string;
  publisher: string;
  version: string;
} {
  if (!value || typeof value !== "object") {
    throw new Error("Extension manifest must be a JSON object.");
  }
  const manifest = value as Record<string, unknown>;
  const name = typeof manifest.name === "string" ? manifest.name.trim() : "";
  const publisher =
    typeof manifest.publisher === "string" ? manifest.publisher.trim() : "";
  const version =
    typeof manifest.version === "string" ? manifest.version.trim() : "";

  if (
    name !== "waitspin-vscode" ||
    publisher !== "waitspin" ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
  ) {
    throw new Error(
      "Unexpected WaitSpin VS Code extension manifest. Refusing to construct install path.",
    );
  }

  return { name, publisher, version };
}

function resolveCliPackageRoot(): string {
  if (!process.argv[1]) return process.cwd();
  let entrypoint = process.argv[1];
  try {
    entrypoint = realpathSync(entrypoint);
  } catch {
    // Keep the raw argv path; path.dirname still gives a useful best effort.
  }
  return path.resolve(path.dirname(entrypoint), "..");
}

async function installVscodeExtensionRuntime(input: {
  sourceDir: string;
  manifest: { name: string; publisher: string; version: string };
}): Promise<string> {
  const targetDir = vscodeExtensionInstallDir(input.manifest);
  await validateVscodeExtensionRuntimeSource(input.sourceDir);
  await mkdir(targetDir, { recursive: true });
  await cp(
    path.join(input.sourceDir, "package.json"),
    path.join(targetDir, "package.json"),
    {
      force: true,
    },
  );
  await cp(path.join(input.sourceDir, "out"), path.join(targetDir, "out"), {
    recursive: true,
    force: true,
  });
  await cp(path.join(input.sourceDir, "media"), path.join(targetDir, "media"), {
    recursive: true,
    force: true,
  });
  return targetDir;
}

async function validateVscodeExtensionRuntimeSource(sourceDir: string) {
  for (const [assetPath, label] of [
    [path.join("out", "extension.js"), "compiled extension entrypoint"],
    [path.join("media", "waitspin-icon.png"), "extension marketplace icon"],
    [
      path.join("media", "waitspin-activitybar.svg"),
      "extension Activity Bar icon",
    ],
  ] as const) {
    try {
      await access(path.join(sourceDir, assetPath), fsConstants.F_OK);
    } catch {
      throw new Error(
        `WaitSpin VS Code ${label} missing at ${path.join(sourceDir, assetPath)}.`,
      );
    }
  }
}

export async function runExtensionInstall(flags: Map<string, string[]>) {
  const target = resolveExtensionTarget(flags);
  if (isEditorCliExtensionTarget(target)) {
    await runEditorExtensionInstall(target, flags);
    return;
  }

  const baseUrl = resolveCredentialedBaseUrl(flags);
  const publisherTarget = publisherTargetForExtension(target);
  const extensionDir = await resolveExtensionDir(flags);
  const manifestPath = path.join(extensionDir, "package.json");

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error(`Extension package not found at ${extensionDir}.`);
  }
  const manifest = parseVscodeExtensionManifest(manifestJson);
  await validateVscodeExtensionRuntimeSource(extensionDir);

  const installDir = extensionInstallDir(target);
  const statePath = installStatePath(target);
  const existingState = await loadInstallState(statePath);
  const installId = existingState?.install_id || generateInstallId();

  const summary = {
    ok: true,
    target,
    extension: manifest.name,
    version: manifest.version,
    source: extensionDir,
    install_hint: installDir,
    install_id: installId,
    publisher_target: publisherTarget,
    state_path: statePath,
    note: "CLI fallback for installing the WaitSpin VS Code user extension with Activity Bar wallet and sponsor surfaces.",
    next: {
      marketplace_setup:
        "Preferred public setup: code --install-extension waitspin.waitspin-vscode, then run WaitSpin: Connect and earn inside VS Code.",
      create_publisher_key:
        "waitspin init --email you@example.com --key-profile publisher-extension",
      set_vscode_settings: {
        "waitspin.installId": installId,
      },
      credential_storage:
        "The VS Code extension migrates a one-time waitspin.apiKey user setting into SecretStorage; runtime polling reads SecretStorage only.",
      optional_bootstrap_env: {
        WAITSPIN_INSTALL_ID: installId,
      },
    },
  };

  if (booleanFlag(flags, "dry-run")) {
    const output = { ...summary, dry_run: true, publisher_registered: false };
    printCliOutput(flags, output, formatTargetInstallResult(output));
    return;
  }

  const apiKey = requireApiKey(flags);
  const registration = await registerPublisherInstall({
    baseUrl,
    apiKey,
    installId,
    target: publisherTarget,
  });

  const installState: InstallState = {
    install_id: registration.install_id,
    publisher_id: registration.publisher_id,
    publisher_target: registration.target,
    registered_at: new Date().toISOString(),
  };

  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(
    statePath,
    `${JSON.stringify(installState, null, 2)}\n`,
    "utf8",
  );

  await mkdir(installDir, { recursive: true });
  const markerPath = extensionMarkerPath(target);
  const installedExtensionPath = await installVscodeExtensionRuntime({
    sourceDir: extensionDir,
    manifest,
  });
  await writeFile(
    markerPath,
    `${JSON.stringify(
      {
        ...summary,
        ...installState,
        extension_installed: Boolean(installedExtensionPath),
        installed_extension_path: installedExtensionPath,
        publisher_registered: true,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const output = {
    ...summary,
    ...installState,
    extension_installed: Boolean(installedExtensionPath),
    installed_extension_path: installedExtensionPath,
    publisher_registered: true,
  };
  printCliOutput(flags, output, formatTargetInstallResult(output));
}

async function pathExists(filePath: string): Promise<boolean> {
  return pathAccessible(filePath, fsConstants.F_OK);
}

async function pathAccessible(filePath: string, mode: number): Promise<boolean> {
  try {
    await access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

function managedInstalledPath(marker: InstallMarker | null): string | null {
  const markerPath = marker?.installed_extension_path?.trim();
  return markerPath ? assertManagedVscodeExtensionPath(markerPath) : null;
}

function managedInstalledPathStatus(marker: InstallMarker | null): {
  path: string | null;
  error: string | null;
} {
  try {
    return { path: managedInstalledPath(marker), error: null };
  } catch {
    return { path: null, error: "invalid_managed_extension_path" };
  }
}

export async function runExtensionStatus(flags: Map<string, string[]>) {
  const target = resolveExtensionTarget(flags);
  if (isEditorCliExtensionTarget(target)) {
    await runEditorExtensionStatus(target, flags);
    return;
  }
  const statePath = installStatePath(target);
  const markerPath = extensionMarkerPath(target);
  const [state, marker] = await Promise.all([
    loadInstallState(statePath),
    loadInstallMarker(markerPath),
  ]);
  const installedPathStatus = managedInstalledPathStatus(marker);
  const installedExtensionPath = installedPathStatus.path;
  const extensionInstalled = installedExtensionPath
    ? await pathExists(path.join(installedExtensionPath, "package.json"))
    : false;

  const output = {
    ok: true,
    target,
    mode: "status-bar-fallback",
    installed: extensionInstalled,
    publisher_registered: Boolean(state?.publisher_id || marker?.publisher_id),
    install_id: state?.install_id || marker?.install_id || null,
    publisher_id: state?.publisher_id || marker?.publisher_id || null,
    publisher_target:
      state?.publisher_target ||
      marker?.publisher_target ||
      publisherTargetForExtension(target),
    extension: marker?.extension || null,
    version: marker?.version || null,
    state_path: statePath,
    marker_path: markerPath,
    installed_extension_path: installedExtensionPath,
    install_marker_error: installedPathStatus.error,
  };
  printCliOutput(flags, output, formatTargetStatusResult(output));
}

export async function runExtensionUninstall(flags: Map<string, string[]>) {
  const target = resolveExtensionTarget(flags);
  if (isEditorCliExtensionTarget(target)) {
    await runEditorExtensionUninstall(target, flags);
    return;
  }
  const statePath = installStatePath(target);
  const markerPath = extensionMarkerPath(target);
  const marker = await loadInstallMarker(markerPath);
  const installedPathStatus = managedInstalledPathStatus(marker);
  const installedExtensionPath = installedPathStatus.path;
  const removePaths = [statePath, markerPath];
  if (installedExtensionPath) {
    removePaths.unshift(installedExtensionPath);
  }

  if (booleanFlag(flags, "dry-run")) {
    const output = {
      ok: true,
      target,
      dry_run: true,
      would_remove: removePaths,
      install_marker_error: installedPathStatus.error,
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  await Promise.all(
    removePaths.map((filePath) =>
      rm(filePath, { force: true, recursive: true }),
    ),
  );
  const output = {
    ok: true,
    target,
    uninstalled: true,
    removed: removePaths,
    install_marker_error: installedPathStatus.error,
  };
  printCliOutput(flags, output, formatTargetUninstallResult(output));
}

type ClaudeCodeSettings = Record<string, JsonValue>;

type ClaudeCodeStatusLine = {
  type: "command";
  command: string;
  padding?: number;
  refreshInterval?: number;
};

type ClaudeCodeSettingsScope = "project" | "local";

type ClaudeCodeScopedStatusLine = {
  scope: ClaudeCodeSettingsScope;
  path: string;
  statusLine: JsonValue | undefined;
};

type ClaudeCodeInstallState = InstallState & {
  target: typeof CLAUDE_CODE_PUBLISHER_TARGET;
  base_url: string;
  api_key: string;
  runtime_path: string;
  cache_path: string;
  settings_path: string;
  managed_status_line: ClaudeCodeStatusLine;
  previous_status_line?: JsonValue;
  composed_existing_status_line?: boolean;
  claude_version?: string;
  installed_at: string;
};

function claudeCodeInstallDir(): string {
  return path.join(os.homedir(), ".waitspin");
}

function claudeCodeStatePath(): string {
  return path.join(claudeCodeInstallDir(), "claude-code-install.json");
}

function claudeCodeRuntimePath(): string {
  return path.join(claudeCodeInstallDir(), "claude-code-statusline.mjs");
}

function claudeCodeCachePath(): string {
  return path.join(claudeCodeInstallDir(), "claude-code-statusline-cache.json");
}

function claudeCodeSettingsPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function claudeCodeProjectSettingsCandidates(
  startDir = process.cwd(),
): Array<{ scope: ClaudeCodeSettingsScope; path: string }> {
  const candidates: Array<{ scope: ClaudeCodeSettingsScope; path: string }> =
    [];
  const homeDir = path.resolve(os.homedir());
  let currentDir = path.resolve(startDir);

  while (currentDir !== homeDir) {
    candidates.push({
      scope: "local",
      path: path.join(currentDir, ".claude", "settings.local.json"),
    });
    candidates.push({
      scope: "project",
      path: path.join(currentDir, ".claude", "settings.json"),
    });

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return candidates;
}

function claudeCodeBinary(): string {
  return process.env[CLAUDE_CODE_BIN_ENV]?.trim() || "claude";
}

function execFileText(
  file: string,
  args: string[],
  options: { encoding: "utf8"; timeout: number; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
      });
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function windowsPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function powerShellQuote(value: string): string {
  return `'${windowsPath(value).replace(/'/g, "''")}'`;
}

function powerShellCommandArgument(value: string): string {
  return `"${value.replace(/[`"$]/g, "`$&")}"`;
}

function claudeCodeStatusLineCommand(input: {
  runtimePath: string;
  statePath: string;
}): string {
  if (process.platform === "win32") {
    const command = [
      "&",
      powerShellQuote(process.execPath),
      powerShellQuote(input.runtimePath),
      "--state",
      powerShellQuote(input.statePath),
    ].join(" ");
    return [
      "powershell",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      powerShellCommandArgument(command),
    ].join(" ");
  }

  return `${shellQuote(process.execPath)} ${shellQuote(input.runtimePath)} --state ${shellQuote(input.statePath)}`;
}

function managedClaudeCodeStatusLine(input: {
  runtimePath: string;
  statePath: string;
}): ClaudeCodeStatusLine {
  return {
    type: "command",
    command: claudeCodeStatusLineCommand(input),
    padding: 2,
    refreshInterval: CLAUDE_CODE_REFRESH_INTERVAL_SECONDS,
  };
}

function parseVersionParts(value: string): [number, number, number] | null {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionAtLeast(value: string, minimum: string): boolean {
  const current = parseVersionParts(value);
  const target = parseVersionParts(minimum);
  if (!current || !target) return false;
  for (let index = 0; index < target.length; index += 1) {
    if (current[index] > target[index]) return true;
    if (current[index] < target[index]) return false;
  }
  return true;
}

async function readClaudeCodeVersion(): Promise<string> {
  try {
    const result = await execFileText(claudeCodeBinary(), ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return `${result.stdout || result.stderr || ""}`.trim();
  } catch (error) {
    throw new Error(
      `Unable to run Claude Code. Install Claude Code or set ${CLAUDE_CODE_BIN_ENV} to its executable path before installing WaitSpin Claude Code support.`,
      { cause: error },
    );
  }
}

async function assertSupportedClaudeCodeVersion(): Promise<string> {
  const version = await readClaudeCodeVersion();
  if (!isVersionAtLeast(version, CLAUDE_CODE_MIN_VERSION)) {
    throw new Error(
      `Unsupported Claude Code version: ${version || "unknown"}. WaitSpin Claude Code statusline support requires Claude Code ${CLAUDE_CODE_MIN_VERSION} or newer.`,
    );
  }
  return version;
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function parseJsonObject(
  filePath: string,
  raw: string,
  options: { jsonc?: boolean } = {},
): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = options.jsonc
    ? parseJsonc(raw, errors, {
        allowTrailingComma: true,
        disallowComments: false,
      })
    : (JSON.parse(raw) as unknown);

  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(
      `${filePath} contains invalid JSONC: ${printParseErrorCode(first.error)} at offset ${first.offset}.`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

async function readJsonObjectFile(
  filePath: string,
  options: { jsonc?: boolean } = {},
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    if (!raw.trim()) return {};
    return parseJsonObject(filePath, raw, options);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

async function writeJsonObjectFile(
  filePath: string,
  value: unknown,
  mode?: number,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode,
  });
  if (mode) {
    await chmod(filePath, mode);
  }
}

async function loadClaudeCodeSettings(): Promise<ClaudeCodeSettings> {
  const parsed = await readJsonObjectFile(claudeCodeSettingsPath());
  return (parsed ?? {}) as ClaudeCodeSettings;
}

async function findClaudeCodeScopedStatusLine(): Promise<ClaudeCodeScopedStatusLine | null> {
  for (const candidate of claudeCodeProjectSettingsCandidates()) {
    const parsed = await readJsonObjectFile(candidate.path);
    if (
      parsed &&
      Object.prototype.hasOwnProperty.call(parsed, "statusLine")
    ) {
      return {
        scope: candidate.scope,
        path: candidate.path,
        statusLine: parsed.statusLine as JsonValue | undefined,
      };
    }
  }
  return null;
}

async function loadClaudeCodeInstallState(): Promise<ClaudeCodeInstallState | null> {
  const parsed = await readJsonObjectFile(claudeCodeStatePath());
  if (!parsed?.install_id || parsed.target !== CLAUDE_CODE_PUBLISHER_TARGET) {
    return null;
  }
  return parsed as ClaudeCodeInstallState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireStringField(
  value: Record<string, unknown>,
  field: string,
  statePath: string,
): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || !fieldValue.trim()) {
    throw new Error(`${statePath} is missing required string field ${field}.`);
  }
  return fieldValue;
}

function requireRecordField(
  value: Record<string, unknown>,
  field: string,
  statePath: string,
): Record<string, unknown> {
  const fieldValue = value[field];
  if (!isRecord(fieldValue)) {
    throw new Error(`${statePath} is missing required object field ${field}.`);
  }
  return fieldValue;
}

function pathIsInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function managedHeartbeatPaths(
  cachePath: string,
  assertSafeManagedPath: (filePath: string) => string,
): Promise<string[]> {
  const safeCachePath = assertSafeManagedPath(cachePath);
  const directory = path.dirname(safeCachePath);
  const prefix = `${path.basename(safeCachePath)}.`;
  const suffix = ".heartbeat";
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith(suffix))
    .map((entry) => assertSafeManagedPath(path.join(directory, entry)));
}

async function writeSecretFile(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(filePath, 0o600);
}

function isCommandStatusLine(value: unknown): value is ClaudeCodeStatusLine {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "command" &&
    typeof (value as { command?: unknown }).command === "string" &&
    (value as { command: string }).command.trim().length > 0
  );
}

function statusLineEquals(left: unknown, right: unknown): boolean {
  if (isCommandStatusLine(left) && isCommandStatusLine(right)) {
    return (
      left.type === right.type &&
      left.command === right.command &&
      left.padding === right.padding &&
      left.refreshInterval === right.refreshInterval
    );
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function managedCommandStatusLineStillOwnsSurface(
  left: unknown,
  right: unknown,
): boolean {
  if (
    !isRecord(left) ||
    !isRecord(right) ||
    typeof left.command !== "string" ||
    typeof right.command !== "string" ||
    left.command !== right.command
  ) {
    return false;
  }
  if (right.type !== undefined && left.type !== right.type) return false;
  if (right.enabled !== undefined && left.enabled === false) return false;
  return (
    left.enabled !== false &&
    right.enabled !== false
  );
}

function claudeCodeScopedStatusLineBlocker(
  scopedStatusLine: ClaudeCodeScopedStatusLine | null,
  managedStatusLine: ClaudeCodeStatusLine,
): string | null {
  if (!scopedStatusLine) return null;
  if (statusLineEquals(scopedStatusLine.statusLine, managedStatusLine)) {
    return null;
  }
  return `Claude Code ${scopedStatusLine.scope} settings at ${scopedStatusLine.path} define a higher-priority statusLine. User-level WaitSpin install would not be used in this project. Remove or compose that statusLine first, then retry.`;
}

function resolveClaudeCodeSettingsUpdate(input: {
  settings: ClaudeCodeSettings;
  managedStatusLine: ClaudeCodeStatusLine;
  existingState: ClaudeCodeInstallState | null;
  composeExisting: boolean;
}): {
  nextSettings: ClaudeCodeSettings;
  previousStatusLine?: JsonValue;
  composedExistingStatusLine: boolean;
  action: "install" | "refresh-managed" | "compose-existing";
} {
  const current = input.settings.statusLine;
  const isAlreadyManaged =
    statusLineEquals(current, input.managedStatusLine) ||
    (input.existingState?.managed_status_line &&
      statusLineEquals(current, input.existingState.managed_status_line));

  if (!current || isAlreadyManaged) {
    return {
      nextSettings: { ...input.settings, statusLine: input.managedStatusLine },
      previousStatusLine: input.existingState?.previous_status_line,
      composedExistingStatusLine: Boolean(
        input.existingState?.composed_existing_status_line,
      ),
      action: isAlreadyManaged ? "refresh-managed" : "install",
    };
  }

  if (!input.composeExisting) {
    throw new Error(
      "Claude Code already has a statusLine configured. Re-run with --compose-existing to preserve it and append the WaitSpin sponsor line, or remove it first.",
    );
  }

  if (!isCommandStatusLine(current)) {
    throw new Error(
      "Claude Code statusLine exists but is not a command status line; refusing to compose because restore would be ambiguous.",
    );
  }

  if (current.command === input.managedStatusLine.command) {
    return {
      nextSettings: { ...input.settings, statusLine: input.managedStatusLine },
      composedExistingStatusLine: false,
      action: "refresh-managed",
    };
  }

  return {
    nextSettings: { ...input.settings, statusLine: input.managedStatusLine },
    previousStatusLine: current as JsonValue,
    composedExistingStatusLine: true,
    action: "compose-existing",
  };
}

function redactedClaudeCodeState(
  state: ClaudeCodeInstallState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  return {
    target: state.target,
    install_id: state.install_id,
    publisher_id: state.publisher_id,
    publisher_target: state.publisher_target,
    registered_at: state.registered_at,
    base_url: state.base_url,
    runtime_path: state.runtime_path,
    cache_path: state.cache_path,
    settings_path: state.settings_path,
    composed_existing_status_line: Boolean(
      state.composed_existing_status_line,
    ),
    has_previous_status_line: state.previous_status_line !== undefined,
    claude_version: state.claude_version,
    installed_at: state.installed_at,
    api_key_present: Boolean(state.api_key),
  };
}

function claudeCodeStatuslineRuntimeSource(): string {
  return String.raw`#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";

const FETCH_INTERVAL_MS = 15_000;
const FETCH_TIMEOUT_MS = 2_500;
const PREVIOUS_TIMEOUT_MS = 1_000;
const MAX_ACTIVE_AGE_MS = 60_000;
const HEARTBEAT_FRESH_MS = 3_000;
const HEARTBEAT_IMPRESSION_FRESH_MS = 7_000;
const HEARTBEAT_IMPRESSION_WAIT_MS = 2_500;
const LOCK_RETRY_MS = 40;
const LOCK_TIMEOUT_MS = 2_000;
const LOCK_STALE_MS = 10_000;
const SHELL_PROCESS_NAMES = new Set([
  "bash",
  "cmd",
  "dash",
  "fish",
  "ksh",
  "powershell",
  "pwsh",
  "sh",
  "zsh",
]);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function stripJsoncSyntax(raw) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index];
    const next = raw[index + 1];
    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }
    if (current === "/" && next === "/") {
      while (index < raw.length && raw[index] !== "\n" && raw[index] !== "\r") {
        index += 1;
      }
      output += " ";
      if (index < raw.length) output += raw[index];
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      let closed = false;
      while (index < raw.length) {
        if (raw[index] === "*" && raw[index + 1] === "/") {
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) throw new Error("Unterminated JSONC block comment.");
      index += 1;
      output += " ";
      continue;
    }
    output += current;
  }
  return stripTrailingJsonCommas(output);
}

function stripTrailingJsonCommas(raw) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index];
    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }
    if (current === ",") {
      let lookahead = index + 1;
      while (/\s/.test(raw[lookahead] || "")) lookahead += 1;
      let previous = index - 1;
      while (/\s/.test(raw[previous] || "")) previous -= 1;
      const previousToken = raw[previous] || "";
      const hasValueBeforeComma = !["", "[", "{", ",", ":"].includes(previousToken);
      if (
        hasValueBeforeComma &&
        (raw[lookahead] === "}" || raw[lookahead] === "]")
      ) {
        continue;
      }
    }
    output += current;
  }
  return output;
}

async function readJsonc(filePath, fallback) {
  try {
    return JSON.parse(stripJsoncSyntax(await readFile(filePath, "utf8")));
  } catch {
    return fallback;
  }
}

async function readSecret(filePath) {
  if (!filePath) return "";
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch {
    return "";
  }
}

async function writeJson(filePath, value) {
  const tmp = filePath + "." + process.pid + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tmp, filePath);
}

async function writeHeartbeat(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, String(Date.now()) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireCacheLock(cachePath) {
  const lockPath = cachePath + ".lock";
  const startedAt = Date.now();

  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      await mkdir(lockPath);
      return async () => {
        await rm(lockPath, { recursive: true, force: true });
      };
    } catch {
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Another process may have released the lock between mkdir/stat.
      }
      await sleep(LOCK_RETRY_MS);
    }
  }

  throw new Error("Timed out waiting for WaitSpin statusline cache lock.");
}

async function withCacheLock(cachePath, callback) {
  const release = await acquireCacheLock(cachePath);
  try {
    return await callback();
  } finally {
    await release();
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
    .slice(0, 120);
}

function expandExecutablePath(command) {
  const value = String(command || "").trim();
  if (!value) return "";
  const home = process.env.HOME || process.env.USERPROFILE || "";
  let expanded = value;
  if (
    home &&
    (expanded === "~" || expanded.startsWith("~/") || expanded.startsWith("~\\"))
  ) {
    expanded = path.join(home, expanded.slice(2));
  }
  if (home) {
    expanded = expanded
      .replace(/\$\{HOME\}/g, home)
      .replace(/\$HOME(?=\/|\\|$)/g, home);
  }
  const userProfile = process.env.USERPROFILE || "";
  if (userProfile) {
    expanded = expanded.replace(/%USERPROFILE%/gi, userProfile);
  }
  return expanded;
}

function isWindowsCommandScript(commandPath) {
  return process.platform === "win32" && /\.(?:cmd|bat)$/i.test(commandPath);
}

function unsafeWindowsCommandScriptPath(commandPath) {
  return /["\r\n\u0000%]/.test(commandPath);
}

function spawnResolvedCommandPath(commandPath) {
  if (isWindowsCommandScript(commandPath)) {
    if (unsafeWindowsCommandScriptPath(commandPath)) return null;
    const previousCommandEnv = "WAITSPIN_PREVIOUS_STATUSLINE_CMD";
    return spawn(process.env.ComSpec || "cmd.exe", [
      "/d",
      "/v:off",
      "/c",
      'call "%' + previousCommandEnv + '%"',
    ], {
      shell: false,
      stdio: ["pipe", "pipe", "ignore"],
      env: { ...process.env, [previousCommandEnv]: commandPath },
      windowsVerbatimArguments: true,
    });
  }
  return spawn(commandPath, [], {
    shell: false,
    stdio: ["pipe", "pipe", "ignore"],
    env: process.env,
  });
}

async function runPreviousStatusLine(command, input, mode = "shell") {
  if (!command) return "";
  return await new Promise((resolve) => {
    const expandedCommand =
      mode === "exec-path" ? expandExecutablePath(command) : "";
    if (mode === "exec-path" && !expandedCommand) {
      resolve("");
      return;
    }
    const child =
      mode === "exec-path"
        ? spawnResolvedCommandPath(expandedCommand)
        : spawn(command, {
            shell: true,
            stdio: ["pipe", "pipe", "ignore"],
            env: process.env,
          });
    if (!child) {
      resolve("");
      return;
    }
    let stdout = "";
    let settled = false;
    let killTimer = null;
    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve(value);
    }
    const timer = setTimeout(() => {
      child.stdout.destroy();
      child.stdin.destroy();
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 100);
      killTimer.unref?.();
      child.unref?.();
      finish("");
    }, PREVIOUS_TIMEOUT_MS);
    timer.unref?.();
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 4000) stdout = stdout.slice(0, 4000);
    });
    child.on("error", () => {
      finish("");
    });
    child.on("close", () => {
      finish(stdout.trimEnd());
    });
    child.stdin.end(input);
  });
}

async function waitspinFetch(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseServe(payload) {
  if (!payload || typeof payload !== "object") return null;
  const creative = payload.creative;
  if (!creative || typeof creative !== "object") return null;
  const line = cleanLine(creative.line);
  if (!line) return null;
  if (
    typeof payload.serve_id !== "string" ||
    typeof payload.serve_receipt !== "string"
  ) {
    return null;
  }
  const parsedExpiresAt = Date.parse(payload.expires_at || "");
  return {
    serveId: payload.serve_id,
    serveReceipt: payload.serve_receipt,
    line,
    fetchedAt: Date.now(),
    shownAt: 0,
    expiresAtMs: Number.isFinite(parsedExpiresAt)
      ? parsedExpiresAt
      : Date.now() + MAX_ACTIVE_AGE_MS,
    minVisibleMs:
      typeof payload.min_visible_ms === "number" && payload.min_visible_ms >= 5000
        ? payload.min_visible_ms
        : 5000,
    impressionRecorded: false,
  };
}

function serveIsExpired(serve) {
  const ageStart = Number(serve.shownAt || serve.fetchedAt || Date.now());
  return (
    Date.now() >= (serve.expiresAtMs || 0) ||
    Date.now() - ageStart > MAX_ACTIVE_AGE_MS
  );
}

function heartbeatPathFor(cachePath, key) {
  const digest = createHash("sha256").update(String(key)).digest("hex").slice(0, 24);
  return cachePath + "." + digest + ".heartbeat";
}

async function heartbeatAlive(heartbeatPath) {
  if (!heartbeatPath) return false;
  try {
    const current = await stat(heartbeatPath);
    return Date.now() - current.mtimeMs <= HEARTBEAT_FRESH_MS;
  } catch {
    return false;
  }
}

async function heartbeatVisibleAfter(heartbeatPath, shownAt) {
  if (!heartbeatPath || !shownAt) return false;
  try {
    const current = await stat(heartbeatPath);
    return (
      current.mtimeMs > shownAt &&
      Date.now() - current.mtimeMs <= HEARTBEAT_IMPRESSION_FRESH_MS
    );
  } catch {
    return false;
  }
}

async function waitForHeartbeatVisibleAfter(heartbeatPath, shownAt) {
  const deadline = Date.now() + HEARTBEAT_IMPRESSION_WAIT_MS;
  do {
    if (await heartbeatVisibleAfter(heartbeatPath, shownAt)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(250);
  } while (true);
}

function processAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function processInfo(pid) {
  if (!processAlive(pid)) return null;
  if (process.platform === "win32") {
    return await new Promise((resolve) => {
      const numericPid = Math.trunc(Number(pid));
      const command = [
        "$p=Get-CimInstance Win32_Process -Filter 'ProcessId = " + numericPid + "';",
        "if ($p) { Write-Output ([string]$p.ParentProcessId + ' ' + [string]$p.Name) }",
      ].join(" ");
      const child = spawn("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let stdout = "";
      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > 4000) stdout = stdout.slice(0, 4000);
      });
      child.on("error", () => finish(null));
      child.on("close", (code) => {
        if (code !== 0) {
          finish(null);
          return;
        }
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || "";
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!match) {
          finish(null);
          return;
        }
        finish({ ppid: Number(match[1]), command: match[2] });
      });
    });
  }
  return await new Promise((resolve) => {
    const child = spawn("ps", ["-o", "ppid=,comm=", "-p", String(pid)], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 4000) stdout = stdout.slice(0, 4000);
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(null);
        return;
      }
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || "";
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) {
        finish(null);
        return;
      }
      finish({ ppid: Number(match[1]), command: match[2] });
    });
  });
}

function isShellProcess(command) {
  const base = path.basename(String(command || "")).toLowerCase();
  return SHELL_PROCESS_NAMES.has(base);
}

async function detectOwnerPid() {
  const parentPid = Number(process.ppid);
  if (!processAlive(parentPid)) return 0;
  const parent = await processInfo(parentPid);
  if (parent && isShellProcess(parent.command) && processAlive(parent.ppid)) {
    return parent.ppid;
  }
  return parentPid;
}

async function ownerAliveAfterVisible(session) {
  const ownerPid = Number(session.ownerPid || 0);
  return processAlive(ownerPid);
}

function commandStatusLineMatches(current, managed) {
  if (!current || !managed || typeof current !== "object" || typeof managed !== "object") {
    return false;
  }
  if (Array.isArray(current) || Array.isArray(managed)) return false;
  if (typeof current.command !== "string" || typeof managed.command !== "string") {
    return false;
  }
  if (current.command !== managed.command) return false;
  if (managed.type !== undefined && current.type !== managed.type) return false;
  if (managed.padding !== undefined && current.padding !== managed.padding) return false;
  if (managed.enabled !== undefined && current.enabled !== managed.enabled) return false;
  return current.enabled !== false;
}

async function installedSurfaceStillConfigured(state) {
  if (!state?.settings_path || !state?.managed_status_line) return false;
  const settings =
    state.target === "copilot" || state.target === "antigravity"
      ? await readJsonc(state.settings_path, null)
      : await readJson(state.settings_path, null);
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return false;
  }
  if (!commandStatusLineMatches(settings.statusLine, state.managed_status_line)) {
    return false;
  }
  if (state.target === "copilot") {
    return Boolean(settings.footer?.showCustom === true);
  }
  return true;
}

async function markShown(session, heartbeatPath) {
  const serve = session.activeServe;
  if (!serve || serve.impressionRecorded || !heartbeatPath) return false;
  if (
    serve.shownAt &&
    serve.shownHeartbeatPath &&
    serve.shownHeartbeatPath !== heartbeatPath &&
    (await heartbeatAlive(serve.shownHeartbeatPath))
  ) {
    return false;
  }
  if (!serve.shownAt || serve.shownHeartbeatPath !== heartbeatPath) {
    serve.shownAt = Date.now();
    serve.shownHeartbeatPath = heartbeatPath;
    delete session.impressionTickServeId;
    delete session.impressionTickScheduledAt;
    delete session.impressionTickHeartbeatPath;
  }
  return true;
}

async function fetchNextServe(state, session) {
  const response = await waitspinFetch(state.base_url + "/v1/serve/next", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + state.api_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ install_id: state.install_id }),
  });
  session.lastFetchAt = Date.now();
  if (response.status === 204) {
    session.activeServe = null;
    return;
  }
  if (!response.ok) return;
  const parsed = parseServe(await response.json());
  if (parsed) session.activeServe = parsed;
}

async function recordImpression(state, session) {
  const serve = session.activeServe;
  if (!serve || serve.impressionRecorded || !serve.shownAt) return;
  const visibleMs = Date.now() - serve.shownAt;
  if (visibleMs < serve.minVisibleMs) return;
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
  });
  if (response.ok) serve.impressionRecorded = true;
}

async function recordForegroundImpression(state, session, heartbeatPath) {
  const serve = session.activeServe;
  if (!serve || serve.shownHeartbeatPath !== heartbeatPath) return;
  if (!(await heartbeatAlive(heartbeatPath))) return;
  await recordImpression(state, session);
}

async function scheduleImpressionTick(statePath, heartbeatPath, session) {
  const serve = session.activeServe;
  if (!statePath || !serve || serve.impressionRecorded || !serve.shownAt) {
    return false;
  }
  if (!heartbeatPath || serve.shownHeartbeatPath !== heartbeatPath) return false;
  if (
    session.impressionTickServeId === serve.serveId &&
    session.impressionTickHeartbeatPath === heartbeatPath
  ) {
    return false;
  }
  session.impressionTickServeId = serve.serveId;
  session.impressionTickScheduledAt = Date.now();
  session.impressionTickHeartbeatPath = heartbeatPath;
  try {
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
    delete session.impressionTickServeId;
    delete session.impressionTickScheduledAt;
    delete session.impressionTickHeartbeatPath;
    return false;
  }
  return true;
}

async function recordDelayedImpression() {
  const statePath = argValue("--state");
  const expectedServeId = argValue("--serve-id");
  const heartbeatPath = argValue("--heartbeat");
  if (!statePath || !expectedServeId || !heartbeatPath) return;
  const state = await readJson(statePath, null);
  const apiKey = state?.api_key || (await readSecret(state?.api_key_path));
  if (!apiKey || !state?.install_id || !state.base_url || !state.cache_path) {
    return;
  }
  const runtimeState = { ...state, api_key: apiKey };
  const cache = normalizeSessionCache(
    await readJson(state.cache_path, { sessions: {} }),
  );
  const session = findSessionByServe(cache, expectedServeId, heartbeatPath);
  const serve = session?.activeServe;
  if (!serve || serve.impressionRecorded || !serve.shownAt) return;
  const visibleAt = serve.shownAt + Math.max(serve.minVisibleMs || 5000, 5000);
  const dueAt = visibleAt + 250;
  if (Date.now() < dueAt) await sleep(dueAt - Date.now());
  const ownerConfiguredVisible =
    (await ownerAliveAfterVisible(session)) &&
    (await installedSurfaceStillConfigured(state));
  if (
    !(await waitForHeartbeatVisibleAfter(heartbeatPath, visibleAt)) &&
    !ownerConfiguredVisible
  ) {
    return;
  }
  await withCacheLock(state.cache_path, async () => {
    const lockedCache = normalizeSessionCache(
      await readJson(state.cache_path, { sessions: {} }),
    );
    const lockedSession = findSessionByServe(
      lockedCache,
      expectedServeId,
      heartbeatPath,
    );
    if (!lockedSession) return;
    const lockedServe = lockedSession.activeServe;
    const lockedVisibleAt = lockedServe?.shownAt
      ? lockedServe.shownAt + Math.max(lockedServe.minVisibleMs || 5000, 5000)
      : 0;
    if (
      lockedServe &&
      !lockedServe.impressionRecorded &&
      lockedServe.shownAt &&
      lockedServe.shownHeartbeatPath === heartbeatPath &&
      !serveIsExpired(lockedServe) &&
      ((await heartbeatVisibleAfter(heartbeatPath, lockedVisibleAt)) ||
        ((await ownerAliveAfterVisible(lockedSession)) &&
          (await installedSurfaceStillConfigured(state))))
    ) {
      await recordImpression(runtimeState, lockedSession);
    }
    delete lockedSession.impressionTickServeId;
    delete lockedSession.impressionTickScheduledAt;
    delete lockedSession.impressionTickHeartbeatPath;
    await writeJson(state.cache_path, lockedCache);
  });
}

function sessionKey(inputJson) {
  return (
    inputJson.session_id ||
    inputJson.conversation_id ||
    inputJson.transcript_path ||
    inputJson.workspace_current_dir ||
    inputJson.cwd ||
    "claude-code"
  );
}

function safeInputJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const key of ["session_id", "transcript_path", "cwd"]) {
    if (typeof value[key] === "string" && value[key].trim()) {
      output[key] = value[key];
    }
  }
  if (typeof value.conversation_id === "string" && value.conversation_id.trim()) {
    output.conversation_id = value.conversation_id;
  }
  if (
    value.workspace &&
    typeof value.workspace === "object" &&
    !Array.isArray(value.workspace) &&
    typeof value.workspace.current_dir === "string" &&
    value.workspace.current_dir.trim()
  ) {
    output.workspace_current_dir = value.workspace.current_dir;
  }
  return output;
}

function safeSessionKey(inputJson) {
  return createHash("sha256")
    .update(String(sessionKey(inputJson)))
    .digest("hex");
}

function normalizeSessionCache(value) {
  const cache =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (
    !cache.sessions ||
    typeof cache.sessions !== "object" ||
    Array.isArray(cache.sessions)
  ) {
    cache.sessions = {};
  }
  return cache;
}

function findSessionByServe(cache, expectedServeId, heartbeatPath) {
  return Object.values(cache.sessions).find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      candidate.activeServe?.serveId === expectedServeId &&
      candidate.activeServe.shownHeartbeatPath === heartbeatPath,
  );
}

async function pruneSessions(cachePath, cache) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, value] of Object.entries(cache.sessions || {})) {
    if ((value.lastSeenAt || 0) < cutoff) {
      delete cache.sessions[key];
      await rm(heartbeatPathFor(cachePath, key), { force: true }).catch(() => {});
    }
  }
}

async function main() {
  const statePath = argValue("--state");
  if (!statePath) return;
  const stdin = await readStdin();
  let inputJson = {};
  try {
    inputJson = safeInputJson(stdin.trim() ? JSON.parse(stdin) : {});
  } catch {
    inputJson = {};
  }
  const state = await readJson(statePath, null);
  const apiKey = state?.api_key || (await readSecret(state?.api_key_path));
  if (!apiKey || !state?.install_id || !state.base_url || !state.cache_path) {
    return;
  }
  const runtimeState = { ...state, api_key: apiKey };
  const ownerPid = await detectOwnerPid();

  const previous = await runPreviousStatusLine(
    typeof state.previous_status_line?.command === "string"
      ? state.previous_status_line.command
      : "",
    stdin,
    state.previous_status_line_command_mode ||
      (state.target === "copilot" || state.target === "antigravity"
        ? "exec-path"
        : "shell"),
  );
  let renderedSession = null;

  try {
    renderedSession = await withCacheLock(state.cache_path, async () => {
      const cache = normalizeSessionCache(
        await readJson(state.cache_path, { sessions: {} }),
      );
      const key = safeSessionKey(inputJson);
      const existingSession = Object.prototype.hasOwnProperty.call(
        cache.sessions,
        key,
      )
        ? cache.sessions[key]
        : {};
      const session =
        existingSession &&
        typeof existingSession === "object" &&
        !Array.isArray(existingSession)
          ? existingSession
          : {};
      session.lastSeenAt = Date.now();
      cache.sessions[key] = session;
      const heartbeatPath = heartbeatPathFor(state.cache_path, key);
      await writeHeartbeat(heartbeatPath);
      if (ownerPid > 1) session.ownerPid = ownerPid;

      if (session.activeServe && serveIsExpired(session.activeServe)) {
        session.activeServe = null;
      }
      await recordForegroundImpression(runtimeState, session, heartbeatPath);
      const shouldFetchNext = !session.activeServe
        ? Date.now() - (session.lastFetchAt || 0) >= FETCH_INTERVAL_MS
        : session.activeServe.impressionRecorded &&
          Date.now() - (session.lastFetchAt || 0) >= FETCH_INTERVAL_MS;
      if (shouldFetchNext) {
        await fetchNextServe(runtimeState, session);
      }
      if (session.activeServe && !session.activeServe.impressionRecorded) {
        await markShown(session, heartbeatPath);
        await scheduleImpressionTick(statePath, heartbeatPath, session);
      }
      await pruneSessions(state.cache_path, cache);
      await writeJson(state.cache_path, cache);
      return session;
    });
  } catch {
    // Statusline rendering must never interrupt Claude Code.
  }

  const sponsor = renderedSession?.activeServe?.line
    ? "Sponsored: " + renderedSession.activeServe.line
    : "";
  const lines = [previous, sponsor].filter(Boolean);
  if (lines.length > 0) process.stdout.write(lines.join("\n"));
}

const task = process.argv.includes("--impression-tick")
  ? recordDelayedImpression()
  : main();
task.catch(() => {});
`;
}

async function writeClaudeCodeRuntime(runtimePath: string): Promise<void> {
  await mkdir(path.dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, claudeCodeStatuslineRuntimeSource(), {
    encoding: "utf8",
    mode: 0o755,
  });
  await chmod(runtimePath, 0o755);
}

function assertSafeClaudeCodeManagedPath(filePath: string): string {
  const installRoot = path.resolve(claudeCodeInstallDir());
  const resolved = path.resolve(filePath);
  if (
    !resolved.startsWith(`${installRoot}${path.sep}`) ||
    !path.basename(resolved).startsWith("claude-code-")
  ) {
    throw new Error(
      "Refusing to manage a Claude Code WaitSpin file outside ~/.waitspin.",
    );
  }
  return resolved;
}

export async function runClaudeCodeInstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const statePath = claudeCodeStatePath();
  const runtimePath = claudeCodeRuntimePath();
  const cachePath = claudeCodeCachePath();
  const settingsPath = claudeCodeSettingsPath();
  const existingState = await loadClaudeCodeInstallState();
  const installId = existingState?.install_id || generateInstallId();
  const managedStatusLine = managedClaudeCodeStatusLine({
    runtimePath,
    statePath,
  });
  const settings = await loadClaudeCodeSettings();
  const scopedStatusLine = await findClaudeCodeScopedStatusLine();
  const scopedStatusLineBlockedReason = claudeCodeScopedStatusLineBlocker(
    scopedStatusLine,
    managedStatusLine,
  );
  let settingsUpdate: ReturnType<typeof resolveClaudeCodeSettingsUpdate> | null =
    null;
  let settingsBlockedReason: string | null = null;
  try {
    settingsUpdate = resolveClaudeCodeSettingsUpdate({
      settings,
      managedStatusLine,
      existingState,
      composeExisting: booleanFlag(flags, "compose-existing"),
    });
  } catch (error) {
    if (!dryRun) throw error;
    settingsBlockedReason =
      error instanceof Error ? error.message : String(error);
  }
  if (scopedStatusLineBlockedReason && !dryRun) {
    throw new Error(scopedStatusLineBlockedReason);
  }

  const summary = {
    ok: true,
    target: CLAUDE_CODE_PUBLISHER_TARGET,
    mode: "statusline-command",
    install_id: installId,
    publisher_target: CLAUDE_CODE_PUBLISHER_TARGET,
    state_path: statePath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    settings_path: settingsPath,
    settings_action: settingsUpdate?.action ?? "blocked",
    composed_existing_status_line:
      settingsUpdate?.composedExistingStatusLine ?? false,
    note: "Installs WaitSpin through Claude Code's official statusLine.command surface.",
    next: "check_status",
    next_command: "waitspin claude-code status",
  };

  if (dryRun) {
    const blockedReason =
      settingsBlockedReason ?? scopedStatusLineBlockedReason;
    const output = {
      ...summary,
      dry_run: true,
      publisher_registered: false,
      has_existing_status_line: Boolean(settings.statusLine),
      ...(scopedStatusLine
        ? {
            scoped_status_line: {
              scope: scopedStatusLine.scope,
              path: scopedStatusLine.path,
              overrides_user_settings: Boolean(scopedStatusLineBlockedReason),
            },
          }
        : {}),
      ...(blockedReason
        ? {
            would_fail: true,
            settings_blocked_reason: blockedReason,
            next: settingsBlockedReason
              ? "resolve_status_line_conflict"
              : "resolve_project_status_line_override",
            ...(settingsBlockedReason
              ? {
                  next_command:
                    "waitspin claude-code install --compose-existing",
                }
              : {
                  human_message:
                    "Current project/local Claude Code settings override user-level statusLine. Remove or compose that statusLine before installing WaitSpin for this project.",
                }),
          }
        : {}),
    };
    printCliOutput(flags, output, formatTargetInstallResult(output));
    return;
  }

  if (!settingsUpdate) {
    throw new Error("Unable to resolve Claude Code settings update.");
  }
  const claudeVersion = await assertSupportedClaudeCodeVersion();
  const apiKey = requireApiKey(flags);
  const registration = await registerPublisherInstall({
    baseUrl,
    apiKey,
    installId,
    target: CLAUDE_CODE_PUBLISHER_TARGET,
  });
  const installedAt = new Date().toISOString();
  const installState: ClaudeCodeInstallState = {
    target: CLAUDE_CODE_PUBLISHER_TARGET,
    install_id: registration.install_id,
    publisher_id: registration.publisher_id,
    publisher_target: registration.target,
    registered_at: installedAt,
    base_url: baseUrl,
    api_key: apiKey,
    runtime_path: runtimePath,
    cache_path: cachePath,
    settings_path: settingsPath,
    managed_status_line: managedStatusLine,
    previous_status_line: settingsUpdate.previousStatusLine,
    composed_existing_status_line: settingsUpdate.composedExistingStatusLine,
    claude_version: claudeVersion,
    installed_at: installedAt,
  };

  try {
    await writeClaudeCodeRuntime(runtimePath);
    await writeJsonObjectFile(statePath, installState, 0o600);
    await writeJsonObjectFile(settingsPath, settingsUpdate.nextSettings);
  } catch (error) {
    if (existingState) {
      await writeJsonObjectFile(statePath, existingState, 0o600).catch(
        () => {},
      );
    } else {
      await Promise.resolve(
        rm(statePath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(runtimePath, { force: true, recursive: true }),
      ).catch(() => {});
    }
    throw error;
  }

  const output = {
    ...summary,
    ...redactedClaudeCodeState(installState),
    publisher_registered: true,
    claude_version: claudeVersion,
    next: "launch_claude_code",
    next_command: "claude",
    acceptance_hint:
      "Keep the sponsored line visible for at least 5 seconds, then verify an impression.",
  };
  printCliOutput(flags, output, formatTargetInstallResult(output));
}

export async function runClaudeCodeStatus(
  flags: Map<string, string[]> = new Map(),
) {
  const state = await loadClaudeCodeInstallState();
  const settings = await loadClaudeCodeSettings();
  const managedStatusLine = state?.managed_status_line ?? null;
  const currentStatusLine = settings.statusLine;
  const statusLineConfigured = Boolean(
    managedStatusLine && statusLineEquals(currentStatusLine, managedStatusLine),
  );
  const scopedStatusLine = await findClaudeCodeScopedStatusLine();
  const scopedStatusLineOverridden = Boolean(
    managedStatusLine &&
      scopedStatusLine &&
      !statusLineEquals(scopedStatusLine.statusLine, managedStatusLine),
  );
  const effectiveStatusLineConfigured =
    statusLineConfigured && !scopedStatusLineOverridden;
  const runtimeInstalled = state
    ? await pathExists(assertSafeClaudeCodeManagedPath(state.runtime_path))
    : false;

  const installed = Boolean(
    state && runtimeInstalled && effectiveStatusLineConfigured,
  );
  const output = {
    ok: true,
    target: CLAUDE_CODE_PUBLISHER_TARGET,
    mode: "statusline-command",
    installed,
    publisher_registered: Boolean(state?.publisher_id),
    install_id: state?.install_id ?? null,
    publisher_id: state?.publisher_id ?? null,
    publisher_target: state?.publisher_target ?? CLAUDE_CODE_PUBLISHER_TARGET,
    state_path: claudeCodeStatePath(),
    runtime_path: state?.runtime_path ?? claudeCodeRuntimePath(),
    cache_path: state?.cache_path ?? claudeCodeCachePath(),
    settings_path: claudeCodeSettingsPath(),
    runtime_installed: runtimeInstalled,
    status_line_configured: statusLineConfigured,
    effective_status_line_configured: effectiveStatusLineConfigured,
    status_line_overridden: scopedStatusLineOverridden,
    ...(scopedStatusLineOverridden && scopedStatusLine
      ? {
          status_line_override_scope: scopedStatusLine.scope,
          status_line_override_path: scopedStatusLine.path,
        }
      : {}),
    composed_existing_status_line: Boolean(
      state?.composed_existing_status_line,
    ),
    has_previous_status_line: Boolean(state?.previous_status_line),
    claude_version: state?.claude_version ?? null,
    ...(installed
      ? {
          next: "launch_claude_code",
          next_command: "claude",
          acceptance_hint:
            "Keep the sponsored line visible for at least 5 seconds, then verify an impression.",
        }
      : {
          next: "install_claude_code",
          next_command: "waitspin claude-code install --compose-existing",
          human_message: scopedStatusLineOverridden
            ? "Claude Code WaitSpin support is installed in user settings, but a higher-priority project/local statusLine overrides it in this directory."
            : "Claude Code WaitSpin statusline support is not installed for this user.",
        }),
  };
  printCliOutput(flags, output, formatTargetStatusResult(output));
}

export async function runClaudeCodeUninstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const state = await loadClaudeCodeInstallState();
  const settings = await loadClaudeCodeSettings();
  const declaredRemovePaths = state
    ? [
        state.runtime_path,
        state.cache_path,
        claudeCodeStatePath(),
        `${state.cache_path}.*.heartbeat`,
      ]
    : [claudeCodeStatePath()];

  let nextSettings: ClaudeCodeSettings | null = null;
  let settingsAction:
    | "restore-previous"
    | "remove-managed"
    | "skip-user-settings"
    | "not-managed" = "not-managed";
  let settingsWarning: string | null = null;
  if (state?.managed_status_line) {
    if (!statusLineEquals(settings.statusLine, state.managed_status_line)) {
      settingsAction = "skip-user-settings";
      settingsWarning =
        "Claude Code statusLine is no longer the WaitSpin managed command; leaving user settings unchanged while removing WaitSpin-managed files.";
    } else {
      nextSettings = { ...settings };
      if (state.previous_status_line !== undefined) {
        nextSettings.statusLine = state.previous_status_line;
        settingsAction = "restore-previous";
      } else {
        delete nextSettings.statusLine;
        settingsAction = "remove-managed";
      }
    }
  }

  if (dryRun) {
    const output = {
      ok: true,
      target: CLAUDE_CODE_PUBLISHER_TARGET,
      dry_run: true,
      installed: Boolean(state),
      settings_action: settingsAction,
      would_remove: declaredRemovePaths,
      path_validation: state ? "deferred_until_apply" : "not_needed",
      ...(settingsWarning
        ? {
            settings_warning: settingsWarning,
          }
        : {}),
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  const removePaths = state
    ? [
        assertSafeClaudeCodeManagedPath(state.runtime_path),
        assertSafeClaudeCodeManagedPath(state.cache_path),
        claudeCodeStatePath(),
        ...(await managedHeartbeatPaths(
          state.cache_path,
          assertSafeClaudeCodeManagedPath,
        )),
      ]
    : [claudeCodeStatePath()];

  if (nextSettings) {
    await writeJsonObjectFile(claudeCodeSettingsPath(), nextSettings);
  }
  await Promise.all(
    removePaths.map((filePath) =>
      rm(filePath, { force: true, recursive: true }),
    ),
  );
  const output = {
    ok: true,
    target: CLAUDE_CODE_PUBLISHER_TARGET,
    uninstalled: true,
    settings_action: settingsAction,
    removed: removePaths,
    ...(settingsWarning ? { settings_warning: settingsWarning } : {}),
  };
  printCliOutput(flags, output, formatTargetUninstallResult(output));
}

type AntigravitySettings = Record<string, JsonValue>;

type AntigravityStatusLine = {
  type: "command";
  command: string;
  enabled: true;
};

type AntigravityInstallState = InstallState & {
  target: typeof ANTIGRAVITY_PUBLISHER_TARGET;
  base_url: string;
  api_key?: string;
  api_key_path: string;
  command_path?: string;
  runtime_path: string;
  cache_path: string;
  settings_path: string;
  managed_status_line: AntigravityStatusLine;
  previous_status_line?: JsonValue;
  previous_status_line_command_mode?: "exec-path";
  composed_existing_status_line?: boolean;
  antigravity_version?: string;
  installed_at: string;
};

function antigravityInstallDir(): string {
  return path.join(os.homedir(), ".waitspin");
}

function antigravityStatePath(): string {
  return path.join(antigravityInstallDir(), "antigravity-install.json");
}

function antigravityRuntimePath(): string {
  return path.join(antigravityInstallDir(), "antigravity-statusline.mjs");
}

function antigravityCommandPath(): string {
  return path.join(
    antigravityInstallDir(),
    process.platform === "win32"
      ? "antigravity-statusline-command.cmd"
      : "antigravity-statusline-command",
  );
}

function antigravityCachePath(): string {
  return path.join(antigravityInstallDir(), "antigravity-statusline-cache.json");
}

function antigravityApiKeyPath(): string {
  return path.join(antigravityInstallDir(), "antigravity-api-key.secret");
}

function antigravitySettingsPath(): string {
  return path.join(os.homedir(), ".gemini", "antigravity-cli", "settings.json");
}

function antigravityBinary(): string {
  return executableFromEnv(ANTIGRAVITY_BIN_ENV, ANTIGRAVITY_DEFAULT_BIN);
}

async function readAntigravityVersion(): Promise<string> {
  try {
    const result = await execFileText(antigravityBinary(), ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return `${result.stdout || result.stderr || ""}`.trim();
  } catch (error) {
    throw new Error(
      `Unable to run Antigravity CLI. Install Antigravity CLI or set ${ANTIGRAVITY_BIN_ENV} to its executable path before installing WaitSpin Antigravity support.`,
      { cause: error },
    );
  }
}

async function loadAntigravitySettings(): Promise<AntigravitySettings> {
  const parsed = await readJsonObjectFile(antigravitySettingsPath(), {
    jsonc: true,
  });
  return (parsed ?? {}) as AntigravitySettings;
}

async function loadAntigravityInstallState(): Promise<AntigravityInstallState | null> {
  const statePath = antigravityStatePath();
  const parsed = await readJsonObjectFile(statePath);
  if (!parsed?.install_id || parsed.target !== ANTIGRAVITY_PUBLISHER_TARGET) {
    return null;
  }
  for (const field of [
    "install_id",
    "publisher_id",
    "publisher_target",
    "registered_at",
    "base_url",
    "runtime_path",
    "cache_path",
    "settings_path",
    "api_key_path",
    "installed_at",
  ]) {
    requireStringField(parsed, field, statePath);
  }
  requireRecordField(parsed, "managed_status_line", statePath);
  return parsed as AntigravityInstallState;
}

function antigravityStatusLineWrapperSource(input: {
  runtimePath: string;
  statePath: string;
}): string {
  if (process.platform === "win32") {
    const cmdQuote = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;
    return [
      "@echo off",
      `${cmdQuote(process.execPath)} ${cmdQuote(input.runtimePath)} --state ${cmdQuote(input.statePath)}`,
      "",
    ].join("\r\n");
  }

  return [
    "#!/bin/sh",
    `exec ${shellQuote(process.execPath)} ${shellQuote(input.runtimePath)} --state ${shellQuote(input.statePath)}`,
    "",
  ].join("\n");
}

function managedAntigravityStatusLine(input: {
  commandPath: string;
}): AntigravityStatusLine {
  return {
    type: "command",
    command: input.commandPath,
    enabled: true,
  };
}

function isAntigravityCommandStatusLine(value: unknown): value is {
  command: string;
  enabled?: boolean;
} {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { command?: unknown }).command === "string" &&
    (value as { command: string }).command.trim().length > 0 &&
    (value as { enabled?: unknown }).enabled !== false
  );
}

function isEmptyAntigravityStatusLine(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { command?: unknown }).command === "string" &&
    (value as { command: string }).command.trim().length === 0
  );
}

function antigravityStatusLineEquals(left: unknown, right: unknown): boolean {
  if (isAntigravityCommandStatusLine(left) && isAntigravityCommandStatusLine(right)) {
    return (
      left.command === right.command &&
      left.enabled !== false &&
      right.enabled !== false &&
      (left as { type?: unknown }).type === (right as { type?: unknown }).type
    );
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function resolveAntigravitySettingsUpdate(input: {
  settings: AntigravitySettings;
  managedStatusLine: AntigravityStatusLine;
  existingState: AntigravityInstallState | null;
  composeExisting: boolean;
}): {
  nextSettings: AntigravitySettings;
  previousStatusLine?: JsonValue;
  composedExistingStatusLine: boolean;
  action: "install" | "refresh-managed" | "compose-existing";
} {
  const current = isEmptyAntigravityStatusLine(input.settings.statusLine)
    ? undefined
    : input.settings.statusLine;
  const isAlreadyManaged =
    antigravityStatusLineEquals(current, input.managedStatusLine) ||
    (input.existingState?.managed_status_line &&
      antigravityStatusLineEquals(current, input.existingState.managed_status_line));

  if (!current || isAlreadyManaged) {
    return {
      nextSettings: { ...input.settings, statusLine: input.managedStatusLine },
      previousStatusLine: input.existingState?.previous_status_line,
      composedExistingStatusLine: Boolean(
        input.existingState?.composed_existing_status_line,
      ),
      action: isAlreadyManaged ? "refresh-managed" : "install",
    };
  }

  if (!input.composeExisting) {
    throw new Error(
      "Antigravity already has a statusLine configured. Re-run with --compose-existing to preserve it and append the WaitSpin sponsor line, or remove it first.",
    );
  }

  if (!isAntigravityCommandStatusLine(current)) {
    throw new Error(
      "Antigravity statusLine exists but is not a command status line; refusing to compose because restore would be ambiguous.",
    );
  }

  if (current.command === input.managedStatusLine.command) {
    return {
      nextSettings: { ...input.settings, statusLine: input.managedStatusLine },
      composedExistingStatusLine: false,
      action: "refresh-managed",
    };
  }

  return {
    nextSettings: { ...input.settings, statusLine: input.managedStatusLine },
    previousStatusLine: current as JsonValue,
    composedExistingStatusLine: true,
    action: "compose-existing",
  };
}

function redactedAntigravityState(
  state: AntigravityInstallState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  return {
    target: state.target,
    install_id: state.install_id,
    publisher_id: state.publisher_id,
    publisher_target: state.publisher_target,
    registered_at: state.registered_at,
    base_url: state.base_url,
    runtime_path: state.runtime_path,
    cache_path: state.cache_path,
    settings_path: state.settings_path,
    composed_existing_status_line: Boolean(
      state.composed_existing_status_line,
    ),
    has_previous_status_line: state.previous_status_line !== undefined,
    antigravity_version: state.antigravity_version,
    installed_at: state.installed_at,
    api_key_present: Boolean(state.api_key || state.api_key_path),
  };
}

async function writeAntigravityRuntime(input: {
  runtimePath: string;
  commandPath: string;
  statePath: string;
}): Promise<void> {
  const { runtimePath, commandPath, statePath } = input;
  await mkdir(path.dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, claudeCodeStatuslineRuntimeSource(), {
    encoding: "utf8",
    mode: 0o755,
  });
  await chmod(runtimePath, 0o755);
  await writeFile(
    commandPath,
    antigravityStatusLineWrapperSource({ runtimePath, statePath }),
    {
      encoding: "utf8",
      mode: 0o755,
    },
  );
  await chmod(commandPath, 0o755);
}

function assertSafeAntigravityManagedPath(filePath: string): string {
  const installRoot = path.resolve(antigravityInstallDir());
  const resolved = path.resolve(filePath);
  if (
    !resolved.startsWith(`${installRoot}${path.sep}`) ||
    !path.basename(resolved).startsWith("antigravity-")
  ) {
    throw new Error(
      "Refusing to manage an Antigravity WaitSpin file outside ~/.waitspin.",
    );
  }
  return resolved;
}

export async function runAntigravityInstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const statePath = antigravityStatePath();
  const runtimePath = antigravityRuntimePath();
  const commandPath = antigravityCommandPath();
  const cachePath = antigravityCachePath();
  const apiKeyPath = antigravityApiKeyPath();
  const settingsPath = antigravitySettingsPath();
  const existingState = await loadAntigravityInstallState();
  const installId = existingState?.install_id || generateInstallId();
  const managedStatusLine = managedAntigravityStatusLine({
    commandPath,
  });
  const settings = await loadAntigravitySettings();
  let settingsUpdate: ReturnType<typeof resolveAntigravitySettingsUpdate> | null =
    null;
  let settingsBlockedReason: string | null = null;
  try {
    settingsUpdate = resolveAntigravitySettingsUpdate({
      settings,
      managedStatusLine,
      existingState,
      composeExisting: booleanFlag(flags, "compose-existing"),
    });
  } catch (error) {
    if (!dryRun) throw error;
    settingsBlockedReason =
      error instanceof Error ? error.message : String(error);
  }

  const summary = {
    ok: true,
    target: ANTIGRAVITY_PUBLISHER_TARGET,
    mode: "statusline-command",
    install_id: installId,
    publisher_target: ANTIGRAVITY_PUBLISHER_TARGET,
    state_path: statePath,
    command_path: commandPath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    api_key_path: apiKeyPath,
    settings_path: settingsPath,
    settings_action: settingsUpdate?.action ?? "blocked",
    composed_existing_status_line:
      settingsUpdate?.composedExistingStatusLine ?? false,
    note: "Installs WaitSpin through Antigravity CLI's statusLine.command surface.",
    next: "check_status",
    next_command: "waitspin antigravity status",
  };

  if (dryRun) {
    const output = {
      ...summary,
      dry_run: true,
      publisher_registered: false,
      has_existing_status_line: Boolean(settings.statusLine),
      ...(settingsBlockedReason
        ? {
            would_fail: true,
            settings_blocked_reason: settingsBlockedReason,
            next: "resolve_status_line_conflict",
            next_command: "waitspin antigravity install --compose-existing",
          }
        : {}),
    };
    printCliOutput(flags, output, formatTargetInstallResult(output));
    return;
  }

  if (!settingsUpdate) {
    throw new Error("Unable to resolve Antigravity settings update.");
  }
  const antigravityVersion = await readAntigravityVersion();
  const apiKey = requireApiKey(flags);
  const registration = await registerPublisherInstall({
    baseUrl,
    apiKey,
    installId,
    target: ANTIGRAVITY_PUBLISHER_TARGET,
  });
  const installedAt = new Date().toISOString();
  const installState: AntigravityInstallState = {
    target: ANTIGRAVITY_PUBLISHER_TARGET,
    install_id: registration.install_id,
    publisher_id: registration.publisher_id,
    publisher_target: registration.target,
    registered_at: installedAt,
    base_url: baseUrl,
    api_key_path: apiKeyPath,
    command_path: commandPath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    settings_path: settingsPath,
    managed_status_line: managedStatusLine,
    previous_status_line: settingsUpdate.previousStatusLine,
    previous_status_line_command_mode:
      settingsUpdate.previousStatusLine === undefined ? undefined : "exec-path",
    composed_existing_status_line: settingsUpdate.composedExistingStatusLine,
    antigravity_version: antigravityVersion,
    installed_at: installedAt,
  };

  try {
    await writeAntigravityRuntime({ runtimePath, commandPath, statePath });
    await writeSecretFile(apiKeyPath, apiKey);
    await writeJsonObjectFile(statePath, installState, 0o600);
    await writeJsonObjectFile(settingsPath, settingsUpdate.nextSettings);
  } catch (error) {
    if (existingState) {
      await writeJsonObjectFile(statePath, existingState, 0o600).catch(
        () => {},
      );
    } else {
      await Promise.resolve(
        rm(statePath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(runtimePath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(commandPath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(apiKeyPath, { force: true, recursive: true }),
      ).catch(() => {});
    }
    throw error;
  }

  const output = {
    ...summary,
    ...redactedAntigravityState(installState),
    publisher_registered: true,
    antigravity_version: antigravityVersion,
    next: "launch_antigravity",
    next_command: ANTIGRAVITY_DEFAULT_BIN,
    verification_hint:
      "Keep the sponsored line visible for at least 5 seconds, then verify an impression.",
  };
  printCliOutput(flags, output, formatTargetInstallResult(output));
}

export async function runAntigravityStatus(
  flags: Map<string, string[]> = new Map(),
) {
  const state = await loadAntigravityInstallState();
  const settings = await loadAntigravitySettings();
  const managedStatusLine = state?.managed_status_line ?? null;
  const currentStatusLine = settings.statusLine;
  const statusLineConfigured = Boolean(
    managedStatusLine &&
      antigravityStatusLineEquals(currentStatusLine, managedStatusLine),
  );
  const runtimeInstalled = state
    ? await pathAccessible(
        assertSafeAntigravityManagedPath(state.runtime_path),
        fsConstants.R_OK,
      )
    : false;
  const commandInstalled = state?.command_path
    ? await pathAccessible(
        assertSafeAntigravityManagedPath(state.command_path),
        fsConstants.X_OK,
      )
    : false;
  const apiKeyInstalled = state
    ? await pathAccessible(
        assertSafeAntigravityManagedPath(state.api_key_path),
        fsConstants.R_OK,
      )
    : false;
  const installed = Boolean(
    state &&
      runtimeInstalled &&
      commandInstalled &&
      apiKeyInstalled &&
      statusLineConfigured,
  );
  const output = {
    ok: true,
    target: ANTIGRAVITY_PUBLISHER_TARGET,
    mode: "statusline-command",
    installed,
    publisher_registered: Boolean(state?.publisher_id),
    install_id: state?.install_id ?? null,
    publisher_id: state?.publisher_id ?? null,
    publisher_target: state?.publisher_target ?? ANTIGRAVITY_PUBLISHER_TARGET,
    state_path: antigravityStatePath(),
    command_path: state?.command_path ?? antigravityCommandPath(),
    runtime_path: state?.runtime_path ?? antigravityRuntimePath(),
    cache_path: state?.cache_path ?? antigravityCachePath(),
    settings_path: antigravitySettingsPath(),
    api_key_path: state?.api_key_path ?? antigravityApiKeyPath(),
    api_key_installed: apiKeyInstalled,
    command_installed: commandInstalled,
    runtime_installed: runtimeInstalled,
    status_line_configured: statusLineConfigured,
    composed_existing_status_line: Boolean(
      state?.composed_existing_status_line,
    ),
    has_previous_status_line: Boolean(state?.previous_status_line),
    antigravity_version: state?.antigravity_version ?? null,
    ...(installed
      ? {
          next: "launch_antigravity",
          next_command: ANTIGRAVITY_DEFAULT_BIN,
          verification_hint:
            "Keep the sponsored line visible for at least 5 seconds, then verify an impression.",
        }
      : {
          next: "install_antigravity",
          next_command: "waitspin antigravity install",
          human_message:
            "Antigravity WaitSpin statusline support is not installed for this user.",
        }),
  };
  printCliOutput(flags, output, formatTargetStatusResult(output));
}

export async function runAntigravityUninstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const state = await loadAntigravityInstallState();
  const settings = await loadAntigravitySettings();
  const declaredRemovePaths = state
    ? [
        ...(state.command_path ? [state.command_path] : []),
        state.runtime_path,
        state.cache_path,
        state.api_key_path,
        antigravityStatePath(),
        `${state.cache_path}.*.heartbeat`,
      ]
    : [antigravityStatePath()];

  let nextSettings: AntigravitySettings | null = null;
  let settingsAction:
    | "restore-previous"
    | "remove-managed"
    | "skip-user-settings"
    | "not-managed" = "not-managed";
  let settingsWarning: string | null = null;
  if (state?.managed_status_line) {
    if (
      !antigravityStatusLineEquals(settings.statusLine, state.managed_status_line) &&
      !managedCommandStatusLineStillOwnsSurface(
        settings.statusLine,
        state.managed_status_line,
      )
    ) {
      settingsAction = "skip-user-settings";
      settingsWarning =
        "Antigravity statusLine is no longer the WaitSpin managed command; leaving user settings unchanged while removing WaitSpin-managed files.";
    } else {
      nextSettings = { ...settings };
      if (state.previous_status_line !== undefined) {
        nextSettings.statusLine = state.previous_status_line;
        settingsAction = "restore-previous";
      } else {
        delete nextSettings.statusLine;
        settingsAction = "remove-managed";
      }
    }
  }

  if (dryRun) {
    const output = {
      ok: true,
      target: ANTIGRAVITY_PUBLISHER_TARGET,
      dry_run: true,
      installed: Boolean(state),
      settings_action: settingsAction,
      would_remove: declaredRemovePaths,
      path_validation: state ? "deferred_until_apply" : "not_needed",
      ...(settingsWarning
        ? {
            settings_warning: settingsWarning,
          }
        : {}),
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  const removePaths = state
    ? [
        ...(state.command_path
          ? [assertSafeAntigravityManagedPath(state.command_path)]
          : []),
        assertSafeAntigravityManagedPath(state.runtime_path),
        assertSafeAntigravityManagedPath(state.cache_path),
        assertSafeAntigravityManagedPath(state.api_key_path),
        antigravityStatePath(),
        ...(await managedHeartbeatPaths(
          state.cache_path,
          assertSafeAntigravityManagedPath,
        )),
      ]
    : [antigravityStatePath()];

  if (nextSettings) {
    await writeJsonObjectFile(antigravitySettingsPath(), nextSettings);
  }
  await Promise.all(
    removePaths.map((filePath) =>
      rm(filePath, { force: true, recursive: true }),
    ),
  );
  const output = {
    ok: true,
    target: ANTIGRAVITY_PUBLISHER_TARGET,
    uninstalled: true,
    settings_action: settingsAction,
    removed: removePaths,
    ...(settingsWarning ? { settings_warning: settingsWarning } : {}),
  };
  printCliOutput(flags, output, formatTargetUninstallResult(output));
}

type CopilotSettings = Record<string, JsonValue>;

type CopilotStatusLine = ClaudeCodeStatusLine;

type CopilotInstallState = InstallState & {
  target: typeof COPILOT_PUBLISHER_TARGET;
  base_url: string;
  api_key?: string;
  api_key_path: string;
  command_path: string;
  runtime_path: string;
  cache_path: string;
  settings_path: string;
  managed_status_line: CopilotStatusLine;
  previous_status_line?: JsonValue;
  previous_status_line_command_mode?: "exec-path";
  had_previous_footer_show_custom?: boolean;
  previous_footer_show_custom?: JsonValue;
  composed_existing_status_line?: boolean;
  copilot_version?: string;
  installed_at: string;
};

function copilotInstallDir(): string {
  return path.join(os.homedir(), ".waitspin");
}

function copilotStatePath(): string {
  return path.join(copilotInstallDir(), "copilot-install.json");
}

function copilotRuntimePath(): string {
  return path.join(copilotInstallDir(), "copilot-statusline.mjs");
}

function copilotCommandPath(): string {
  return path.join(
    copilotInstallDir(),
    process.platform === "win32"
      ? "copilot-statusline-command.cmd"
      : "copilot-statusline-command",
  );
}

function copilotCachePath(): string {
  return path.join(copilotInstallDir(), "copilot-statusline-cache.json");
}

function copilotApiKeyPath(): string {
  return path.join(copilotInstallDir(), "copilot-api-key.secret");
}

function assertSafeCopilotConfigDir(resolved: string): string {
  const homeDir = path.resolve(os.homedir());
  const tmpDir = path.resolve(os.tmpdir());
  if (!pathIsInside(resolved, homeDir) && !pathIsInside(resolved, tmpDir)) {
    throw new Error(
      `${COPILOT_HOME_ENV} must resolve inside the user's home directory or the system temporary directory for unattended WaitSpin installs.`,
    );
  }
  if (resolved === path.parse(resolved).root) {
    throw new Error(`${COPILOT_HOME_ENV} must not point at a filesystem root.`);
  }
  return resolved;
}

function copilotConfigDir(): string {
  const configuredHome = process.env[COPILOT_HOME_ENV]?.trim();
  return configuredHome
    ? assertSafeCopilotConfigDir(path.resolve(configuredHome))
    : path.join(os.homedir(), ".copilot");
}

function copilotSettingsPath(): string {
  return path.join(copilotConfigDir(), "settings.json");
}

function copilotBinary(): string {
  return executableFromEnv(COPILOT_BIN_ENV, COPILOT_DEFAULT_BIN);
}

async function readCopilotVersion(): Promise<string> {
  try {
    const result = await execFileText(copilotBinary(), ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return `${result.stdout || result.stderr || ""}`.trim();
  } catch (error) {
    throw new Error(
      `Unable to run GitHub Copilot CLI. Install GitHub Copilot CLI or set ${COPILOT_BIN_ENV} to its executable path before installing WaitSpin Copilot support.`,
      { cause: error },
    );
  }
}

async function loadCopilotSettings(
  settingsPath = copilotSettingsPath(),
): Promise<CopilotSettings> {
  const parsed = await readJsonObjectFile(settingsPath, {
    jsonc: true,
  });
  return (parsed ?? {}) as CopilotSettings;
}

async function loadCopilotInstallState(): Promise<CopilotInstallState | null> {
  const statePath = copilotStatePath();
  const parsed = await readJsonObjectFile(statePath);
  if (!parsed?.install_id || parsed.target !== COPILOT_PUBLISHER_TARGET) {
    return null;
  }
  for (const field of [
    "install_id",
    "publisher_id",
    "publisher_target",
    "registered_at",
    "base_url",
    "runtime_path",
    "cache_path",
    "settings_path",
    "command_path",
    "api_key_path",
    "installed_at",
  ]) {
    requireStringField(parsed, field, statePath);
  }
  requireRecordField(parsed, "managed_status_line", statePath);
  return parsed as CopilotInstallState;
}

function copilotStatusLineWrapperSource(input: {
  runtimePath: string;
  statePath: string;
}): string {
  if (process.platform === "win32") {
    const cmdQuote = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;
    return [
      "@echo off",
      `${cmdQuote(process.execPath)} ${cmdQuote(input.runtimePath)} --state ${cmdQuote(input.statePath)}`,
      "",
    ].join("\r\n");
  }

  return [
    "#!/bin/sh",
    `exec ${shellQuote(process.execPath)} ${shellQuote(input.runtimePath)} --state ${shellQuote(input.statePath)}`,
    "",
  ].join("\n");
}

function managedCopilotStatusLine(input: {
  commandPath: string;
}): CopilotStatusLine {
  return {
    type: "command",
    command: input.commandPath,
    padding: 0,
  };
}

function copilotStatusLineEquals(left: unknown, right: unknown): boolean {
  if (isCommandStatusLine(left) && isCommandStatusLine(right)) {
    return (
      left.type === right.type &&
      left.command === right.command &&
      left.padding === right.padding
    );
  }
  return statusLineEquals(left, right);
}

function copilotFooterWithCustomEnabled(settings: CopilotSettings): {
  footer: JsonValue;
  previousFooterShowCustom?: JsonValue;
  hadPreviousFooterShowCustom: boolean;
} {
  const currentFooter = isRecord(settings.footer) ? settings.footer : {};
  const hadPreviousFooterShowCustom = Object.prototype.hasOwnProperty.call(
    currentFooter,
    "showCustom",
  );
  return {
    footer: { ...currentFooter, showCustom: true } as JsonValue,
    previousFooterShowCustom: currentFooter.showCustom as JsonValue | undefined,
    hadPreviousFooterShowCustom,
  };
}

function restoreCopilotFooterShowCustom(
  settings: CopilotSettings,
  state: CopilotInstallState,
): CopilotSettings {
  const currentFooter = isRecord(settings.footer) ? { ...settings.footer } : {};
  if (
    state.had_previous_footer_show_custom &&
    state.previous_footer_show_custom !== undefined
  ) {
    currentFooter.showCustom = state.previous_footer_show_custom;
  } else {
    delete currentFooter.showCustom;
  }
  const nextSettings = { ...settings };
  if (Object.keys(currentFooter).length > 0) {
    nextSettings.footer = currentFooter as JsonValue;
  } else {
    delete nextSettings.footer;
  }
  return nextSettings;
}

function resolveCopilotSettingsUpdate(input: {
  settings: CopilotSettings;
  managedStatusLine: CopilotStatusLine;
  existingState: CopilotInstallState | null;
  composeExisting: boolean;
}): {
  nextSettings: CopilotSettings;
  previousStatusLine?: JsonValue;
  composedExistingStatusLine: boolean;
  previousFooterShowCustom?: JsonValue;
  hadPreviousFooterShowCustom: boolean;
  action: "install" | "refresh-managed" | "compose-existing";
} {
  const current = input.settings.statusLine;
  const footerUpdate = copilotFooterWithCustomEnabled(input.settings);
  const isAlreadyManaged =
    copilotStatusLineEquals(current, input.managedStatusLine) ||
    (input.existingState?.managed_status_line &&
      copilotStatusLineEquals(current, input.existingState.managed_status_line));

  if (!current || isAlreadyManaged) {
    return {
      nextSettings: {
        ...input.settings,
        footer: footerUpdate.footer,
        statusLine: input.managedStatusLine,
      },
      previousStatusLine: input.existingState?.previous_status_line,
      composedExistingStatusLine: Boolean(
        input.existingState?.composed_existing_status_line,
      ),
      previousFooterShowCustom:
        input.existingState?.previous_footer_show_custom ??
        footerUpdate.previousFooterShowCustom,
      hadPreviousFooterShowCustom:
        input.existingState?.had_previous_footer_show_custom ??
        footerUpdate.hadPreviousFooterShowCustom,
      action: isAlreadyManaged ? "refresh-managed" : "install",
    };
  }

  if (!input.composeExisting) {
    throw new Error(
      "GitHub Copilot CLI already has a statusLine configured. Re-run with --compose-existing to preserve it and append the WaitSpin sponsor line, or remove it first.",
    );
  }

  if (!isCommandStatusLine(current)) {
    throw new Error(
      "GitHub Copilot CLI statusLine exists but is not a command status line; refusing to compose because restore would be ambiguous.",
    );
  }

  if (current.command === input.managedStatusLine.command) {
    return {
      nextSettings: {
        ...input.settings,
        footer: footerUpdate.footer,
        statusLine: input.managedStatusLine,
      },
      composedExistingStatusLine: false,
      previousFooterShowCustom:
        input.existingState?.previous_footer_show_custom ??
        footerUpdate.previousFooterShowCustom,
      hadPreviousFooterShowCustom:
        input.existingState?.had_previous_footer_show_custom ??
        footerUpdate.hadPreviousFooterShowCustom,
      action: "refresh-managed",
    };
  }

  return {
    nextSettings: {
      ...input.settings,
      footer: footerUpdate.footer,
      statusLine: input.managedStatusLine,
    },
    previousStatusLine: current as JsonValue,
    composedExistingStatusLine: true,
    previousFooterShowCustom: footerUpdate.previousFooterShowCustom,
    hadPreviousFooterShowCustom: footerUpdate.hadPreviousFooterShowCustom,
    action: "compose-existing",
  };
}

function redactedCopilotState(
  state: CopilotInstallState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  return {
    target: state.target,
    install_id: state.install_id,
    publisher_id: state.publisher_id,
    publisher_target: state.publisher_target,
    registered_at: state.registered_at,
    base_url: state.base_url,
    runtime_path: state.runtime_path,
    cache_path: state.cache_path,
    settings_path: state.settings_path,
    composed_existing_status_line: Boolean(
      state.composed_existing_status_line,
    ),
    has_previous_status_line: state.previous_status_line !== undefined,
    copilot_version: state.copilot_version,
    installed_at: state.installed_at,
    api_key_present: Boolean(state.api_key || state.api_key_path),
  };
}

async function writeCopilotRuntime(input: {
  runtimePath: string;
  commandPath: string;
  statePath: string;
}): Promise<void> {
  const { runtimePath, commandPath, statePath } = input;
  await mkdir(path.dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, claudeCodeStatuslineRuntimeSource(), {
    encoding: "utf8",
    mode: 0o755,
  });
  await chmod(runtimePath, 0o755);
  await writeFile(
    commandPath,
    copilotStatusLineWrapperSource({ runtimePath, statePath }),
    {
      encoding: "utf8",
      mode: 0o755,
    },
  );
  await chmod(commandPath, 0o755);
}

function assertSafeCopilotManagedPath(filePath: string): string {
  const installRoot = path.resolve(copilotInstallDir());
  const resolved = path.resolve(filePath);
  if (
    !resolved.startsWith(`${installRoot}${path.sep}`) ||
    !path.basename(resolved).startsWith("copilot-")
  ) {
    throw new Error(
      "Refusing to manage a GitHub Copilot CLI WaitSpin file outside ~/.waitspin.",
    );
  }
  return resolved;
}

export async function runCopilotInstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const statePath = copilotStatePath();
  const runtimePath = copilotRuntimePath();
  const commandPath = copilotCommandPath();
  const cachePath = copilotCachePath();
  const apiKeyPath = copilotApiKeyPath();
  const currentSettingsPath = copilotSettingsPath();
  const existingState = await loadCopilotInstallState();
  if (
    existingState &&
    path.resolve(existingState.settings_path) !== path.resolve(currentSettingsPath)
  ) {
    throw new Error(
      `Existing GitHub Copilot CLI WaitSpin install uses ${existingState.settings_path}, but the current ${COPILOT_HOME_ENV} resolves to ${currentSettingsPath}. Re-run with the original ${COPILOT_HOME_ENV} or uninstall before installing into another Copilot config home.`,
    );
  }
  const settingsPath = existingState?.settings_path ?? currentSettingsPath;
  const installId = existingState?.install_id || generateInstallId();
  const managedStatusLine = managedCopilotStatusLine({
    commandPath,
  });
  const settings = await loadCopilotSettings(settingsPath);
  let settingsUpdate: ReturnType<typeof resolveCopilotSettingsUpdate> | null =
    null;
  let settingsBlockedReason: string | null = null;
  try {
    settingsUpdate = resolveCopilotSettingsUpdate({
      settings,
      managedStatusLine,
      existingState,
      composeExisting: booleanFlag(flags, "compose-existing"),
    });
  } catch (error) {
    if (!dryRun) throw error;
    settingsBlockedReason =
      error instanceof Error ? error.message : String(error);
  }

  const summary = {
    ok: true,
    target: COPILOT_PUBLISHER_TARGET,
    mode: "statusline-command",
    install_id: installId,
    publisher_target: COPILOT_PUBLISHER_TARGET,
    state_path: statePath,
    command_path: commandPath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    api_key_path: apiKeyPath,
    settings_path: settingsPath,
    settings_action: settingsUpdate?.action ?? "blocked",
    composed_existing_status_line:
      settingsUpdate?.composedExistingStatusLine ?? false,
    note: "Installs WaitSpin through GitHub Copilot CLI's statusLine.command surface.",
    next: "check_status",
    next_command: "waitspin copilot status",
  };

  if (dryRun) {
    const output = {
      ...summary,
      dry_run: true,
      publisher_registered: false,
      has_existing_status_line: Boolean(settings.statusLine),
      ...(settingsBlockedReason
        ? {
            would_fail: true,
            settings_blocked_reason: settingsBlockedReason,
            next: "resolve_status_line_conflict",
            next_command: "waitspin copilot install --compose-existing",
          }
        : {}),
    };
    printCliOutput(flags, output, formatTargetInstallResult(output));
    return;
  }

  if (!settingsUpdate) {
    throw new Error("Unable to resolve GitHub Copilot CLI settings update.");
  }
  const copilotVersion = await readCopilotVersion();
  const apiKey = requireApiKey(flags);
  const registration = await registerPublisherInstall({
    baseUrl,
    apiKey,
    installId,
    target: COPILOT_PUBLISHER_TARGET,
  });
  const installedAt = new Date().toISOString();
  const installState: CopilotInstallState = {
    target: COPILOT_PUBLISHER_TARGET,
    install_id: registration.install_id,
    publisher_id: registration.publisher_id,
    publisher_target: registration.target,
    registered_at: installedAt,
    base_url: baseUrl,
    api_key_path: apiKeyPath,
    command_path: commandPath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    settings_path: settingsPath,
    managed_status_line: managedStatusLine,
    previous_status_line: settingsUpdate.previousStatusLine,
    previous_status_line_command_mode:
      settingsUpdate.previousStatusLine === undefined ? undefined : "exec-path",
    had_previous_footer_show_custom: settingsUpdate.hadPreviousFooterShowCustom,
    previous_footer_show_custom: settingsUpdate.previousFooterShowCustom,
    composed_existing_status_line: settingsUpdate.composedExistingStatusLine,
    copilot_version: copilotVersion,
    installed_at: installedAt,
  };

  try {
    await writeCopilotRuntime({ runtimePath, commandPath, statePath });
    await writeSecretFile(apiKeyPath, apiKey);
    await writeJsonObjectFile(statePath, installState, 0o600);
    await writeJsonObjectFile(settingsPath, settingsUpdate.nextSettings);
  } catch (error) {
    if (existingState) {
      await writeJsonObjectFile(statePath, existingState, 0o600).catch(
        () => {},
      );
    } else {
      await Promise.resolve(
        rm(statePath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(runtimePath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(commandPath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(apiKeyPath, { force: true, recursive: true }),
      ).catch(() => {});
    }
    throw error;
  }

  const output = {
    ...summary,
    ...redactedCopilotState(installState),
    publisher_registered: true,
    copilot_version: copilotVersion,
    next: "launch_copilot",
    next_command: COPILOT_DEFAULT_BIN,
    verification_hint:
      "Keep the sponsored line visible for at least 5 seconds, then verify an impression.",
  };
  printCliOutput(flags, output, formatTargetInstallResult(output));
}

export async function runCopilotStatus(
  flags: Map<string, string[]> = new Map(),
) {
  const state = await loadCopilotInstallState();
  const settingsPath = state?.settings_path ?? copilotSettingsPath();
  const settings = await loadCopilotSettings(settingsPath);
  const managedStatusLine = state?.managed_status_line ?? null;
  const currentStatusLine = settings.statusLine;
  const statusLineConfigured = Boolean(
    managedStatusLine &&
      copilotStatusLineEquals(currentStatusLine, managedStatusLine),
  );
  const runtimeInstalled = state
    ? await pathAccessible(
        assertSafeCopilotManagedPath(state.runtime_path),
        fsConstants.R_OK,
      )
    : false;
  const commandInstalled = state
    ? await pathAccessible(
        assertSafeCopilotManagedPath(state.command_path),
        fsConstants.X_OK,
      )
    : false;
  const apiKeyInstalled = state
    ? await pathAccessible(
        assertSafeCopilotManagedPath(state.api_key_path),
        fsConstants.R_OK,
      )
    : false;
  const footerCustomEnabled = isRecord(settings.footer)
    ? settings.footer.showCustom === true
    : false;
  const installed = Boolean(
    state &&
      runtimeInstalled &&
      commandInstalled &&
      apiKeyInstalled &&
      statusLineConfigured &&
      footerCustomEnabled,
  );
  const output = {
    ok: true,
    target: COPILOT_PUBLISHER_TARGET,
    mode: "statusline-command",
    installed,
    publisher_registered: Boolean(state?.publisher_id),
    install_id: state?.install_id ?? null,
    publisher_id: state?.publisher_id ?? null,
    publisher_target: state?.publisher_target ?? COPILOT_PUBLISHER_TARGET,
    state_path: copilotStatePath(),
    command_path: state?.command_path ?? copilotCommandPath(),
    runtime_path: state?.runtime_path ?? copilotRuntimePath(),
    cache_path: state?.cache_path ?? copilotCachePath(),
    api_key_path: state?.api_key_path ?? copilotApiKeyPath(),
    settings_path: settingsPath,
    api_key_installed: apiKeyInstalled,
    command_installed: commandInstalled,
    runtime_installed: runtimeInstalled,
    status_line_configured: statusLineConfigured,
    footer_custom_enabled: footerCustomEnabled,
    composed_existing_status_line: Boolean(
      state?.composed_existing_status_line,
    ),
    has_previous_status_line: Boolean(state?.previous_status_line),
    copilot_version: state?.copilot_version ?? null,
    ...(installed
      ? {
          next: "launch_copilot",
          next_command: COPILOT_DEFAULT_BIN,
          verification_hint:
            "Keep the sponsored line visible for at least 5 seconds, then verify an impression.",
        }
      : {
          next: "install_copilot",
          next_command: "waitspin copilot install",
          human_message:
            "GitHub Copilot CLI WaitSpin statusline support is not installed for this user.",
        }),
  };
  printCliOutput(flags, output, formatTargetStatusResult(output));
}

export async function runCopilotUninstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const state = await loadCopilotInstallState();
  const settingsPath = state?.settings_path ?? copilotSettingsPath();
  const settings = await loadCopilotSettings(settingsPath);
  const declaredRemovePaths = state
    ? [
        state.command_path,
        state.runtime_path,
        state.cache_path,
        state.api_key_path,
        copilotStatePath(),
        `${state.cache_path}.*.heartbeat`,
      ]
    : [copilotStatePath()];

  let nextSettings: CopilotSettings | null = null;
  let settingsAction:
    | "restore-previous"
    | "remove-managed"
    | "skip-user-settings"
    | "not-managed" = "not-managed";
  let settingsWarning: string | null = null;
  if (state?.managed_status_line) {
    const footerCustomEnabled = isRecord(settings.footer)
      ? settings.footer.showCustom === true
      : false;
    if (
      !copilotStatusLineEquals(settings.statusLine, state.managed_status_line) &&
      !(
        footerCustomEnabled &&
        managedCommandStatusLineStillOwnsSurface(
          settings.statusLine,
          state.managed_status_line,
        )
      )
    ) {
      settingsAction = "skip-user-settings";
      settingsWarning =
        "GitHub Copilot CLI statusLine is no longer the WaitSpin managed command; leaving user settings unchanged while removing WaitSpin-managed files.";
    } else {
      nextSettings = restoreCopilotFooterShowCustom(settings, state);
      if (state.previous_status_line !== undefined) {
        nextSettings.statusLine = state.previous_status_line;
        settingsAction = "restore-previous";
      } else {
        delete nextSettings.statusLine;
        settingsAction = "remove-managed";
      }
    }
  }

  if (dryRun) {
    const output = {
      ok: true,
      target: COPILOT_PUBLISHER_TARGET,
      dry_run: true,
      installed: Boolean(state),
      settings_action: settingsAction,
      would_remove: declaredRemovePaths,
      path_validation: state ? "deferred_until_apply" : "not_needed",
      ...(settingsWarning
        ? {
            settings_warning: settingsWarning,
          }
        : {}),
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  const removePaths = state
    ? [
        assertSafeCopilotManagedPath(state.command_path),
        assertSafeCopilotManagedPath(state.runtime_path),
        assertSafeCopilotManagedPath(state.cache_path),
        assertSafeCopilotManagedPath(state.api_key_path),
        copilotStatePath(),
        ...(await managedHeartbeatPaths(
          state.cache_path,
          assertSafeCopilotManagedPath,
        )),
      ]
    : [copilotStatePath()];

  if (nextSettings) {
    await writeJsonObjectFile(settingsPath, nextSettings);
  }
  await Promise.all(
    removePaths.map((filePath) =>
      rm(filePath, { force: true, recursive: true }),
    ),
  );
  const output = {
    ok: true,
    target: COPILOT_PUBLISHER_TARGET,
    uninstalled: true,
    settings_action: settingsAction,
    removed: removePaths,
    ...(settingsWarning ? { settings_warning: settingsWarning } : {}),
  };
  printCliOutput(flags, output, formatTargetUninstallResult(output));
}

// --- MiMo Code Publisher Support ---

const MIMOCODE_PUBLISHER_TARGET = "mimocode";

type MiMoCodeInstallState = InstallState & {
  target: typeof MIMOCODE_PUBLISHER_TARGET;
  base_url: string;
  api_key: string;
  runtime_path: string;
  cache_path: string;
  state_path: string;
  bashrc_path: string;
  installed_at: string;
};

function miMoCodeInstallDir(): string {
  return path.join(os.homedir(), ".waitspin");
}

function miMoCodeStatePath(): string {
  return path.join(miMoCodeInstallDir(), "mimocode-statusline.json");
}

function miMoCodeCachePath(): string {
  return path.join(miMoCodeInstallDir(), "mimocode-statusline-cache.json");
}

function miMoCodeRuntimePath(): string {
  return path.join(
    os.homedir(),
    ".local",
    "bin",
    "waitspin-mimocode-runtime",
  );
}

function miMoCodeBashrcPath(): string {
  return path.join(os.homedir(), ".bashrc");
}

const MIMOCODE_BASHRC_MARKER = "# WaitSpin MiMo Code statusline hook";
const MIMOCODE_BASHRC_END_MARKER =
  "# End WaitSpin MiMo Code statusline hook";

function miMoCodeStatuslineRuntimeSource(): string {
  return String.raw`#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const FETCH_INTERVAL_MS = 15_000;
const FETCH_TIMEOUT_MS = 2_500;
const MAX_ACTIVE_AGE_MS = 60_000;
const HEARTBEAT_FRESH_MS = 3_000;
const HEARTBEAT_IMPRESSION_FRESH_MS = 7_000;
const HEARTBEAT_IMPRESSION_WAIT_MS = 2_500;
const LOCK_RETRY_MS = 40;
const LOCK_TIMEOUT_MS = 2_000;
const LOCK_STALE_MS = 10_000;

const STATE_DIR = path.join(os.homedir(), ".waitspin");
const STATE_FILE = path.join(STATE_DIR, "mimocode-statusline.json");
const DEFAULT_CACHE_FILE = path.join(STATE_DIR, "mimocode-statusline-cache.json");

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + "." + process.pid + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tmp, filePath);
}

async function writeHeartbeat(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, String(Date.now()) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireCacheLock(cachePath) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const lockPath = cachePath + ".lock";
  const startedAt = Date.now();

  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      await mkdir(lockPath);
      return async () => {
        await rm(lockPath, { recursive: true, force: true });
      };
    } catch {
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Another process may have released the lock between mkdir/stat.
      }
      await sleep(LOCK_RETRY_MS);
    }
  }

  throw new Error("Timed out waiting for WaitSpin MiMo cache lock.");
}

async function withCacheLock(cachePath, callback) {
  const release = await acquireCacheLock(cachePath);
  try {
    return await callback();
  } finally {
    await release();
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
    .slice(0, 120);
}

async function waitspinFetch(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseServe(payload) {
  if (!payload || typeof payload !== "object") return null;
  const creative = payload.creative;
  if (!creative || typeof creative !== "object") return null;
  const line = cleanLine(creative.line);
  if (!line) return null;
  if (
    typeof payload.serve_id !== "string" ||
    typeof payload.serve_receipt !== "string"
  ) {
    return null;
  }
  const parsedExpiresAt = Date.parse(payload.expires_at || "");
  return {
    serveId: payload.serve_id,
    serveReceipt: payload.serve_receipt,
    line,
    fetchedAt: Date.now(),
    shownAt: 0,
    expiresAtMs: Number.isFinite(parsedExpiresAt)
      ? parsedExpiresAt
      : Date.now() + MAX_ACTIVE_AGE_MS,
    minVisibleMs:
      typeof payload.min_visible_ms === "number" && payload.min_visible_ms >= 5000
        ? payload.min_visible_ms
        : 5000,
    impressionRecorded: false,
  };
}

function serveIsExpired(serve) {
  const ageStart = Number(serve.shownAt || serve.fetchedAt || Date.now());
  return (
    Date.now() >= (serve.expiresAtMs || 0) ||
    Date.now() - ageStart > MAX_ACTIVE_AGE_MS
  );
}

function heartbeatPathFor(cachePath) {
  return cachePath + ".heartbeat";
}

async function heartbeatAlive(heartbeatPath) {
  if (!heartbeatPath) return false;
  try {
    const current = await stat(heartbeatPath);
    return Date.now() - current.mtimeMs <= HEARTBEAT_FRESH_MS;
  } catch {
    return false;
  }
}

async function heartbeatVisibleAfter(heartbeatPath, shownAt) {
  if (!heartbeatPath || !shownAt) return false;
  try {
    const current = await stat(heartbeatPath);
    return (
      current.mtimeMs > shownAt &&
      Date.now() - current.mtimeMs <= HEARTBEAT_IMPRESSION_FRESH_MS
    );
  } catch {
    return false;
  }
}

async function waitForHeartbeatVisibleAfter(heartbeatPath, shownAt) {
  const deadline = Date.now() + HEARTBEAT_IMPRESSION_WAIT_MS;
  do {
    if (await heartbeatVisibleAfter(heartbeatPath, shownAt)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(250);
  } while (true);
}

async function markShown(cache, heartbeatPath) {
  const serve = cache.activeServe;
  if (!serve || serve.impressionRecorded || !heartbeatPath) return false;
  if (
    serve.shownAt &&
    serve.shownHeartbeatPath &&
    serve.shownHeartbeatPath !== heartbeatPath &&
    (await heartbeatAlive(serve.shownHeartbeatPath))
  ) {
    return false;
  }
  if (!serve.shownAt || serve.shownHeartbeatPath !== heartbeatPath) {
    serve.shownAt = Date.now();
    serve.shownHeartbeatPath = heartbeatPath;
    delete cache.impressionTickServeId;
    delete cache.impressionTickScheduledAt;
    delete cache.impressionTickHeartbeatPath;
  }
  return true;
}

async function fetchNextServe(state, cache) {
  const response = await waitspinFetch(state.base_url + "/v1/serve/next", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + state.api_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ install_id: state.install_id }),
  });
  cache.lastFetchAt = Date.now();
  if (response.status === 204) {
    cache.activeServe = null;
    return;
  }
  if (!response.ok) return;
  const parsed = parseServe(await response.json());
  if (parsed) cache.activeServe = parsed;
}

async function recordImpression(state, cache) {
  const serve = cache.activeServe;
  if (!serve || serve.impressionRecorded || !serve.shownAt) return;
  const visibleMs = Date.now() - serve.shownAt;
  if (visibleMs < serve.minVisibleMs) return;
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
  });
  if (response.ok) {
    serve.impressionRecorded = true;
  } else if ([400, 404, 409, 410].includes(response.status)) {
    cache.activeServe = null;
  }
}

async function recordForegroundImpression(state, cache, heartbeatPath) {
  const serve = cache.activeServe;
  if (!serve || serve.shownHeartbeatPath !== heartbeatPath) return;
  if (!(await heartbeatAlive(heartbeatPath))) return;
  await recordImpression(state, cache);
}

async function scheduleImpressionTick(statePath, heartbeatPath, cache) {
  const serve = cache.activeServe;
  if (!statePath || !serve || serve.impressionRecorded || !serve.shownAt) {
    return false;
  }
  if (!heartbeatPath || serve.shownHeartbeatPath !== heartbeatPath) return false;
  if (
    cache.impressionTickServeId === serve.serveId &&
    cache.impressionTickHeartbeatPath === heartbeatPath
  ) {
    return false;
  }
  cache.impressionTickServeId = serve.serveId;
  cache.impressionTickScheduledAt = Date.now();
  cache.impressionTickHeartbeatPath = heartbeatPath;
  try {
    const child = spawn(process.execPath, [
      process.argv[1],
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
    return false;
  }
  return true;
}

async function recordDelayedImpression() {
  const expectedServeId = process.argv.includes("--serve-id")
    ? process.argv[process.argv.indexOf("--serve-id") + 1]
    : "";
  const heartbeatPath = process.argv.includes("--heartbeat")
    ? process.argv[process.argv.indexOf("--heartbeat") + 1]
    : "";
  if (!expectedServeId || !heartbeatPath) return;
  const state = await readJson(STATE_FILE, null);
  if (!state?.api_key || !state.install_id || !state.base_url) return;
  const cachePath = state.cache_path || DEFAULT_CACHE_FILE;
  const firstCache = await readJson(cachePath, {});
  const serve = firstCache.activeServe;
  if (
    !serve ||
    serve.serveId !== expectedServeId ||
    serve.impressionRecorded ||
    !serve.shownAt ||
    serve.shownHeartbeatPath !== heartbeatPath
  ) {
    return;
  }
  const visibleAt = serve.shownAt + Math.max(serve.minVisibleMs || 5000, 5000);
  const dueAt = visibleAt + 250;
  if (Date.now() < dueAt) await sleep(dueAt - Date.now());
  if (!(await waitForHeartbeatVisibleAfter(heartbeatPath, visibleAt))) return;
  await withCacheLock(cachePath, async () => {
    const cache = await readJson(cachePath, {});
    const activeVisibleAt = cache.activeServe?.shownAt
      ? cache.activeServe.shownAt +
        Math.max(cache.activeServe.minVisibleMs || 5000, 5000)
      : 0;
    if (
      cache.activeServe?.serveId === expectedServeId &&
      cache.activeServe.shownHeartbeatPath === heartbeatPath &&
      !serveIsExpired(cache.activeServe) &&
      (await heartbeatVisibleAfter(heartbeatPath, activeVisibleAt))
    ) {
      await recordImpression(state, cache);
      delete cache.impressionTickServeId;
      delete cache.impressionTickScheduledAt;
      delete cache.impressionTickHeartbeatPath;
      await writeJson(cachePath, cache);
    }
  });
}

async function renderSponsorLine(state) {
  const cachePath = state.cache_path || DEFAULT_CACHE_FILE;
  const heartbeatPath = heartbeatPathFor(cachePath);
  await writeHeartbeat(heartbeatPath);
  return await withCacheLock(cachePath, async () => {
    const cache = await readJson(cachePath, {});
    if (cache.activeServe && serveIsExpired(cache.activeServe)) {
      cache.activeServe = null;
    }

    await recordForegroundImpression(state, cache, heartbeatPath);

    const shouldFetchNext = !cache.activeServe
      ? Date.now() - (cache.lastFetchAt || 0) >= FETCH_INTERVAL_MS
      : cache.activeServe.impressionRecorded &&
        Date.now() - (cache.lastFetchAt || 0) >= FETCH_INTERVAL_MS;
    if (shouldFetchNext) {
      await fetchNextServe(state, cache);
    }
    if (cache.activeServe && !cache.activeServe.impressionRecorded) {
      await markShown(cache, heartbeatPath);
      await scheduleImpressionTick(STATE_FILE, heartbeatPath, cache);
    }

    await writeJson(cachePath, cache);
    return cache.activeServe?.line || "";
  });
}

async function main() {
  const state = await readJson(STATE_FILE, null);
  if (!state?.api_key || !state.install_id || !state.base_url) return;

  try {
    const line = await renderSponsorLine(state);
    if (line) process.stdout.write(line);
  } catch {
    // Prompt hooks must never interrupt the user's shell.
  }
}

const task = process.argv.includes("--impression-tick")
  ? recordDelayedImpression()
  : main();
task.catch(() => {});
`;
}

function miMoCodeBashHook(): string {
  const D = "$";
  return `${MIMOCODE_BASHRC_MARKER}
__waitspin_statusline() {
  local line
  line=$("$HOME/.local/bin/waitspin-mimocode-runtime" 2>/dev/null)
  if [ -n "$line" ]; then
    printf "\\x1b[38;5;245m──\\x1b[0m \\x1b[38;5;220m%s\\x1b[0m \\x1b[38;5;245m──\\x1b[0m" "$line"
  fi
}

__waitspin_prompt_command() {
  local waitspin_previous_status=$?
  if [ -n "${D}{__WAITSPIN_PREVIOUS_PROMPT_COMMAND:-}" ]; then
    eval "$__WAITSPIN_PREVIOUS_PROMPT_COMMAND"
  fi
  __waitspin_statusline
  return ${D}waitspin_previous_status
}

if [ -z "${D}{__WAITSPIN_PROMPT_INSTALLED:-}" ]; then
  __WAITSPIN_PREVIOUS_PROMPT_COMMAND="${D}{PROMPT_COMMAND:-}"
  PROMPT_COMMAND="__waitspin_prompt_command"
  __WAITSPIN_PROMPT_INSTALLED=1
fi
${MIMOCODE_BASHRC_END_MARKER}`;
}

function readJsonObjectFileSafe(filePath: string): Promise<Record<string, unknown> | null> {
  return readJsonObjectFile(filePath);
}

async function loadMiMoCodeInstallState(): Promise<MiMoCodeInstallState | null> {
  const parsed = await readJsonObjectFileSafe(miMoCodeStatePath());
  if (!parsed?.install_id || parsed.target !== MIMOCODE_PUBLISHER_TARGET) {
    return null;
  }
  return parsed as unknown as MiMoCodeInstallState;
}

function redactedMiMoCodeState(
  state: MiMoCodeInstallState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  return {
    target: state.target,
    install_id: state.install_id,
    publisher_id: state.publisher_id,
    publisher_target: state.publisher_target,
    registered_at: state.registered_at,
    base_url: state.base_url,
    runtime_path: state.runtime_path,
    cache_path: state.cache_path,
    state_path: state.state_path,
    bashrc_path: state.bashrc_path,
    installed_at: state.installed_at,
    api_key_present: Boolean(state.api_key),
  };
}

async function writeMiMoCodeRuntime(runtimePath: string): Promise<void> {
  await mkdir(path.dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, miMoCodeStatuslineRuntimeSource(), {
    encoding: "utf8",
    mode: 0o755,
  });
  await chmod(runtimePath, 0o755);
}

async function writeTextFileAtomic(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.waitspin-${process.pid}.tmp`;
  await writeFile(tmpPath, value, { encoding: "utf8" });
  await rename(tmpPath, filePath);
}

async function addMiMoCodeBashHook(bashrcPath: string): Promise<boolean> {
  try {
    const content = await readFile(bashrcPath, "utf8").catch(() => "");
    if (content.includes(MIMOCODE_BASHRC_MARKER)) {
      return false;
    }
    await writeTextFileAtomic(
      bashrcPath,
      `${content}${content.endsWith("\n") || !content ? "" : "\n"}${miMoCodeBashHook()}\n`,
    );
    return true;
  } catch {
    return false;
  }
}

async function removeMiMoCodeBashHook(bashrcPath: string): Promise<boolean> {
  try {
    const content = await readFile(bashrcPath, "utf8");
    if (!content.includes(MIMOCODE_BASHRC_MARKER)) {
      return false;
    }
    const markerIndex = content.indexOf(MIMOCODE_BASHRC_MARKER);
    const afterMarker = content.slice(markerIndex);
    const markerEnd = afterMarker.indexOf(MIMOCODE_BASHRC_END_MARKER);
    const before = content.slice(0, markerIndex);
    let after: string;
    if (markerEnd >= 0) {
      after = afterMarker.slice(markerEnd + MIMOCODE_BASHRC_END_MARKER.length);
    } else {
      const hookEnd = afterMarker.indexOf("\n}\n");
      if (hookEnd === -1) {
        return false;
      }
      after = afterMarker.slice(hookEnd + 3);
    }
    await writeTextFileAtomic(bashrcPath, before + after);
    return true;
  } catch {
    return false;
  }
}

export async function runMiMoCodeInstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const statePath = miMoCodeStatePath();
  const runtimePath = miMoCodeRuntimePath();
  const cachePath = miMoCodeCachePath();
  const bashrcPath = miMoCodeBashrcPath();
  const existingState = await loadMiMoCodeInstallState();
  const installId = existingState?.install_id || generateInstallId();

  const summary = {
    ok: true,
    target: MIMOCODE_PUBLISHER_TARGET,
    mode: "shell-hook",
    install_id: installId,
    publisher_target: MIMOCODE_PUBLISHER_TARGET,
    state_path: statePath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    bashrc_path: bashrcPath,
    note: "Installs WaitSpin through a bash hook that polls the API for sponsored messages.",
    next: "check_status",
    next_command: "waitspin mimocode status",
  };

  if (dryRun) {
    const hookExists = await readFile(bashrcPath, "utf8")
      .then((c) => c.includes(MIMOCODE_BASHRC_MARKER))
      .catch(() => false);

    const output = {
      ...summary,
      dry_run: true,
      publisher_registered: false,
      bashrc_hook_exists: hookExists,
      would_write: [statePath, runtimePath],
    };
    printCliOutput(flags, output, formatTargetInstallResult(output));
    return;
  }

  const apiKey = requireApiKey(flags);
  const registration = await registerPublisherInstall({
    baseUrl,
    apiKey,
    installId,
    target: MIMOCODE_PUBLISHER_TARGET,
  });

  const installedAt = new Date().toISOString();
  const installState: MiMoCodeInstallState = {
    target: MIMOCODE_PUBLISHER_TARGET,
    install_id: registration.install_id,
    publisher_id: registration.publisher_id,
    publisher_target: registration.target,
    registered_at: installedAt,
    base_url: baseUrl,
    api_key: apiKey,
    runtime_path: runtimePath,
    cache_path: cachePath,
    state_path: statePath,
    bashrc_path: bashrcPath,
    installed_at: installedAt,
  };

  try {
    await writeMiMoCodeRuntime(runtimePath);
    await writeJsonObjectFile(statePath, installState, 0o600);
    await addMiMoCodeBashHook(bashrcPath);
  } catch (error) {
    if (existingState) {
      await writeJsonObjectFile(statePath, existingState, 0o600).catch(
        () => {},
      );
    } else {
      await Promise.resolve(
        rm(statePath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(runtimePath, { force: true, recursive: true }),
      ).catch(() => {});
    }
    throw error;
  }

  const output = {
    ...summary,
    ...redactedMiMoCodeState(installState),
    publisher_registered: true,
    next: "test_runtime",
    next_command: "waitspin-mimocode-runtime",
    acceptance_hint:
      "Run 'source ~/.bashrc' or restart your shell, then keep the sponsored line visible for at least 5 seconds.",
  };
  printCliOutput(flags, output, formatTargetInstallResult(output));
}

export async function runMiMoCodeStatus(
  flags: Map<string, string[]> = new Map(),
) {
  const state = await loadMiMoCodeInstallState();
  const runtimePath = state?.runtime_path ?? miMoCodeRuntimePath();
  const cachePath = state?.cache_path ?? miMoCodeCachePath();
  const bashrcPath = state?.bashrc_path ?? miMoCodeBashrcPath();
  const runtimeInstalled = await pathExists(runtimePath);
  const hookExists = await readFile(bashrcPath, "utf8")
    .then((c) => c.includes(MIMOCODE_BASHRC_MARKER))
    .catch(() => false);

  const installed = Boolean(state && runtimeInstalled);

  const output = {
    ok: true,
    target: MIMOCODE_PUBLISHER_TARGET,
    mode: "shell-hook",
    installed,
    publisher_registered: Boolean(state?.publisher_id),
    install_id: state?.install_id ?? null,
    publisher_id: state?.publisher_id ?? null,
    publisher_target: state?.publisher_target ?? MIMOCODE_PUBLISHER_TARGET,
    state_path: miMoCodeStatePath(),
    runtime_path: runtimePath,
    cache_path: cachePath,
    bashrc_path: bashrcPath,
    runtime_installed: runtimeInstalled,
    bashrc_hook: hookExists,
    installed_at: state?.installed_at ?? null,
    ...(installed
      ? {
          next: "test_runtime",
          next_command: "waitspin-mimocode-runtime",
          acceptance_hint:
            "Run 'source ~/.bashrc' or restart your shell, then keep the sponsored line visible for at least 5 seconds.",
        }
      : {
          next: "install_mimocode",
          next_command: "waitspin mimocode install",
        }),
  };
  printCliOutput(flags, output, formatTargetStatusResult(output));
}

export async function runMiMoCodeUninstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const state = await loadMiMoCodeInstallState();
  const bashrcPath = state?.bashrc_path ?? miMoCodeBashrcPath();
  const runtimePath = state?.runtime_path ?? miMoCodeRuntimePath();
  const cachePath = state?.cache_path ?? miMoCodeCachePath();

  const declaredRemovePaths = [
    runtimePath,
    miMoCodeStatePath(),
    cachePath,
  ];

  if (dryRun) {
    const output = {
      ok: true,
      target: MIMOCODE_PUBLISHER_TARGET,
      dry_run: true,
      installed: Boolean(state),
      would_remove: declaredRemovePaths,
      bashrc_hook: await readFile(bashrcPath, "utf8")
        .then((c) => c.includes(MIMOCODE_BASHRC_MARKER))
        .catch(() => false),
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  const removePaths = [miMoCodeStatePath()];
  const skippedUnsafePaths: string[] = [];
  if (state) {
    try {
      removePaths.unshift(assertSafeMiMoCodeRuntimePath(state.runtime_path));
    } catch {
      skippedUnsafePaths.push(state.runtime_path);
    }
    try {
      removePaths.push(assertSafeMiMoCodeCachePath(cachePath));
    } catch {
      skippedUnsafePaths.push(cachePath);
    }
  } else {
    removePaths.push(assertSafeMiMoCodeCachePath(cachePath));
  }

  await removeMiMoCodeBashHook(bashrcPath);
  await Promise.all(
    removePaths.map((filePath) =>
      rm(filePath, { force: true, recursive: true }),
    ),
  );

  const output = {
    ok: true,
    target: MIMOCODE_PUBLISHER_TARGET,
    uninstalled: true,
    removed: removePaths,
    bashrc_hook_removed: true,
    ...(skippedUnsafePaths.length > 0
      ? { skipped_unsafe_paths: skippedUnsafePaths }
      : {}),
  };
  printCliOutput(flags, output, formatTargetUninstallResult(output));
}

function assertSafeMiMoCodeRuntimePath(filePath: string): string {
  const expected = path.resolve(miMoCodeRuntimePath());
  const resolved = path.resolve(filePath);
  if (resolved !== expected) {
    throw new Error(
      "Refusing to manage a MiMo Code runtime path that is not the WaitSpin-managed executable.",
    );
  }
  return expected;
}

function assertSafeMiMoCodeCachePath(filePath: string): string {
  const expected = path.resolve(miMoCodeCachePath());
  const resolved = path.resolve(filePath);
  if (resolved !== expected) {
    throw new Error(
      "Refusing to manage a MiMo Code cache path that is not the WaitSpin-managed cache.",
    );
  }
  return expected;
}

// --- OpenCode Publisher Support ---

type OpencodeInstallState = InstallState & {
  target: typeof OPENCODE_PUBLISHER_TARGET;
  base_url: string;
  api_key: string;
  runtime_path: string;
  cache_path: string;
  plugin_path: string;
  tui_config_path: string;
  tui_plugin_entry: string;
  installed_at: string;
};

const OPENCODE_TUI_PLUGIN_ENTRY = "./plugins/waitspin-opencode.plugin.tsx";

type OpencodeTuiConfigPlan = {
  configPath: string;
  previousConfig: Record<string, unknown> | null;
  nextConfig: Record<string, unknown>;
  changed: boolean;
};

function opencodeInstallDir(): string {
  return path.join(os.homedir(), ".waitspin");
}

function opencodeConfigDir(): string {
  return path.join(os.homedir(), ".config", "opencode");
}

function opencodeStatePath(): string {
  return path.join(opencodeInstallDir(), "opencode-install.json");
}

function opencodeRuntimePath(): string {
  return path.join(opencodeInstallDir(), "opencode-statusline.mjs");
}

function opencodeCachePath(): string {
  return path.join(opencodeInstallDir(), "opencode-statusline-cache.json");
}

function opencodePluginInstallDir(): string {
  return path.join(opencodeConfigDir(), "plugins");
}

function opencodePluginDestPath(): string {
  return path.join(opencodePluginInstallDir(), "waitspin-opencode.plugin.tsx");
}

function opencodeTuiConfigPath(): string {
  return path.join(opencodeConfigDir(), "tui.json");
}

function opencodePluginAssetName(): string {
  return "waitspin-opencode.plugin.tsx";
}

async function resolveOpencodeAssetsDir(
  flags: Map<string, string[]>,
): Promise<string> {
  const packageRoot = resolveCliPackageRoot();
  const candidates = [
    path.join(packageRoot, "assets", "waitspin-opencode"),
  ];
  if (allowDevExtensionAssets(flags)) {
    candidates.push(
      path.join(
        packageRoot,
        "..",
        "..",
        "extensions",
        "waitspin-opencode",
      ),
    );
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    try {
      await access(
        path.join(resolved, "opencode-statusline.mjs"),
        fsConstants.F_OK,
      );
      await access(path.join(resolved, opencodePluginAssetName()), fsConstants.F_OK);
      return resolved;
    } catch {
      continue;
    }
  }

  throw new Error(
    `WaitSpin OpenCode assets not found. Use a build that ships assets/waitspin-opencode or set ${DEV_EXTENSION_ASSETS_OPT_IN_ENV}=1 / --allow-dev-extension-assets from a trusted checkout.`,
  );
}

function assertSafeOpencodeManagedPath(filePath: string): string {
  const expected = path.resolve(opencodeCachePath());
  const resolved = path.resolve(filePath);
  if (resolved !== expected) {
    throw new Error(
      "Refusing to manage an OpenCode WaitSpin cache path that is not the managed cache.",
    );
  }
  return expected;
}

function assertSafeOpencodePluginPath(filePath: string): string {
  const expected = path.resolve(opencodePluginDestPath());
  const resolved = path.resolve(filePath);
  if (resolved !== expected) {
    throw new Error(
      "Refusing to manage an OpenCode plugin path that is not the WaitSpin-managed plugin.",
    );
  }
  return expected;
}

function assertSafeOpencodeTuiConfigPath(filePath: string): string {
  const expected = path.resolve(opencodeTuiConfigPath());
  const resolved = path.resolve(filePath);
  if (resolved !== expected) {
    throw new Error(
      "Refusing to manage an OpenCode TUI config path that is not the WaitSpin-managed config.",
    );
  }
  return expected;
}

function assertSafeOpencodeManagedRuntimePath(filePath: string): string {
  const expected = path.resolve(opencodeRuntimePath());
  const resolved = path.resolve(filePath);
  if (resolved !== expected) {
    throw new Error(
      "Refusing to manage an OpenCode runtime path that is not the WaitSpin-managed runtime.",
    );
  }
  return expected;
}

function opencodeTuiPluginEntrySpec(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function isWaitSpinOpencodeTuiPluginEntry(
  value: unknown,
  tuiConfigPath = opencodeTuiConfigPath(),
): boolean {
  const spec = opencodeTuiPluginEntrySpec(value);
  if (!spec) return false;
  if (spec === OPENCODE_TUI_PLUGIN_ENTRY) return true;
  if (path.isAbsolute(spec)) {
    return path.resolve(spec) === path.resolve(opencodePluginDestPath());
  }
  if (spec.startsWith(".")) {
    return (
      path.resolve(path.dirname(tuiConfigPath), spec) ===
      path.resolve(opencodePluginDestPath())
    );
  }
  return false;
}

function opencodeConfigWithTuiPluginEntry(input: {
  config: Record<string, unknown>;
  tuiConfigPath: string;
}): Record<string, unknown> {
  const plugin = input.config.plugin;
  if (plugin !== undefined && !Array.isArray(plugin)) {
    throw new Error(
      "OpenCode tui.json plugin field must be an array before WaitSpin can manage it.",
    );
  }
  const entries = Array.isArray(plugin) ? plugin : [];
  if (
    entries.some((entry) =>
      isWaitSpinOpencodeTuiPluginEntry(entry, input.tuiConfigPath),
    )
  ) {
    return input.config;
  }
  return {
    ...input.config,
    plugin: [...entries, OPENCODE_TUI_PLUGIN_ENTRY],
  };
}

async function planOpencodeTuiConfigInstall(
  tuiConfigPath: string,
): Promise<OpencodeTuiConfigPlan> {
  const previousConfig = await readJsonObjectFile(tuiConfigPath);
  const config = previousConfig ?? {};
  const nextConfig = opencodeConfigWithTuiPluginEntry({
    config,
    tuiConfigPath,
  });
  return {
    configPath: tuiConfigPath,
    previousConfig,
    nextConfig,
    changed: JSON.stringify(config) !== JSON.stringify(nextConfig),
  };
}

async function writeOpencodeTuiConfigPlan(
  plan: OpencodeTuiConfigPlan,
): Promise<void> {
  if (!plan.changed) return;
  await writeJsonObjectFile(plan.configPath, plan.nextConfig);
}

async function restoreOpencodeTuiConfigPlan(
  plan: OpencodeTuiConfigPlan,
): Promise<void> {
  if (!plan.changed) return;
  if (plan.previousConfig) {
    await writeJsonObjectFile(plan.configPath, plan.previousConfig).catch(
      () => {},
    );
    return;
  }
  await Promise.resolve(rm(plan.configPath, { force: true })).catch(() => {});
}

async function opencodeTuiPluginConfigured(
  tuiConfigPath: string,
): Promise<boolean> {
  const config = (await readJsonObjectFile(tuiConfigPath)) ?? {};
  const plugin = config.plugin;
  return (
    Array.isArray(plugin) &&
    plugin.some((entry) =>
      isWaitSpinOpencodeTuiPluginEntry(entry, tuiConfigPath),
    )
  );
}

async function removeOpencodeTuiPluginEntry(tuiConfigPath: string): Promise<{
  updated: boolean;
  configured_before: boolean;
  error: string | null;
}> {
  try {
    const config = (await readJsonObjectFile(tuiConfigPath)) ?? {};
    const plugin = config.plugin;
    if (plugin === undefined) {
      return { updated: false, configured_before: false, error: null };
    }
    if (!Array.isArray(plugin)) {
      return {
        updated: false,
        configured_before: false,
        error: "invalid_plugin_field",
      };
    }
    const filtered = plugin.filter(
      (entry) => !isWaitSpinOpencodeTuiPluginEntry(entry, tuiConfigPath),
    );
    if (filtered.length === plugin.length) {
      return { updated: false, configured_before: false, error: null };
    }
    const nextConfig = { ...config };
    if (filtered.length > 0) {
      nextConfig.plugin = filtered;
    } else {
      delete nextConfig.plugin;
    }
    await writeJsonObjectFile(tuiConfigPath, nextConfig);
    return { updated: true, configured_before: true, error: null };
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return { updated: false, configured_before: false, error: null };
    }
    return { updated: false, configured_before: false, error: "read_failed" };
  }
}

async function loadOpencodeInstallState(): Promise<OpencodeInstallState | null> {
  const parsed = await readJsonObjectFile(opencodeStatePath());
  if (!parsed?.install_id || parsed.target !== OPENCODE_PUBLISHER_TARGET) {
    return null;
  }
  return parsed as OpencodeInstallState;
}

function redactedOpencodeState(
  state: OpencodeInstallState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  return {
    target: state.target,
    install_id: state.install_id,
    publisher_id: state.publisher_id,
    publisher_target: state.publisher_target,
    registered_at: state.registered_at,
    base_url: state.base_url,
    runtime_path: state.runtime_path,
    cache_path: state.cache_path,
    plugin_path: state.plugin_path,
    tui_config_path: state.tui_config_path,
    tui_plugin_entry: state.tui_plugin_entry,
    installed_at: state.installed_at,
    api_key_present: Boolean(state.api_key),
  };
}

async function writeOpencodeRuntimeAndPlugin(input: {
  sourceDir: string;
  runtimePath: string;
  pluginDest: string;
  statePath: string;
}): Promise<void> {
  await mkdir(path.dirname(input.runtimePath), { recursive: true });
  await mkdir(path.dirname(input.pluginDest), { recursive: true });
  await cp(
    path.join(input.sourceDir, "opencode-statusline.mjs"),
    input.runtimePath,
    { force: true },
  );
  const pluginTemplate = await readFile(
    path.join(input.sourceDir, opencodePluginAssetName()),
    "utf8",
  );
  const pluginSource = pluginTemplate
    .replaceAll('"__WAITSPIN_STATE_PATH__"', JSON.stringify(input.statePath));
  await writeFile(input.pluginDest, pluginSource, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(input.runtimePath, 0o755);
  await chmod(input.pluginDest, 0o600);
}

export async function runOpencodeInstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const statePath = opencodeStatePath();
  const runtimePath = opencodeRuntimePath();
  const cachePath = opencodeCachePath();
  const pluginDest = opencodePluginDestPath();
  const tuiConfigPath = opencodeTuiConfigPath();
  const existingState = await loadOpencodeInstallState();
  const installId = existingState?.install_id || generateInstallId();

  const summary = {
    ok: true,
    target: OPENCODE_PUBLISHER_TARGET,
    mode: "tui-plugin-slot",
    install_id: installId,
    publisher_target: OPENCODE_PUBLISHER_TARGET,
    state_path: statePath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    plugin_path: pluginDest,
    tui_config_path: tuiConfigPath,
    tui_plugin_entry: OPENCODE_TUI_PLUGIN_ENTRY,
    note: "Installs WaitSpin through the OpenCode TUI plugin slot (app_bottom).",
    next: "check_status",
    next_command: "waitspin opencode status",
  };

  if (dryRun) {
    const output = {
      ...summary,
      dry_run: true,
      publisher_registered: false,
    };
    printCliOutput(flags, output, formatTargetInstallResult(output));
    return;
  }

  const assetsDir = await resolveOpencodeAssetsDir(flags);
  const apiKey = requireApiKey(flags);
  const tuiConfigPlan = await planOpencodeTuiConfigInstall(tuiConfigPath);
  const registration = await registerPublisherInstall({
    baseUrl,
    apiKey,
    installId,
    target: OPENCODE_PUBLISHER_TARGET,
  });

  const installedAt = new Date().toISOString();
  const installState: OpencodeInstallState = {
    target: OPENCODE_PUBLISHER_TARGET,
    install_id: registration.install_id,
    publisher_id: registration.publisher_id,
    publisher_target: registration.target,
    registered_at: installedAt,
    base_url: baseUrl,
    api_key: apiKey,
    runtime_path: runtimePath,
    cache_path: cachePath,
    plugin_path: pluginDest,
    tui_config_path: tuiConfigPath,
    tui_plugin_entry: OPENCODE_TUI_PLUGIN_ENTRY,
    installed_at: installedAt,
  };

  try {
    await writeOpencodeRuntimeAndPlugin({
      sourceDir: assetsDir,
      runtimePath,
      pluginDest,
      statePath,
    });
    await writeOpencodeTuiConfigPlan(tuiConfigPlan);
    await writeJsonObjectFile(statePath, installState, 0o600);
  } catch (error) {
    await restoreOpencodeTuiConfigPlan(tuiConfigPlan);
    if (existingState) {
      await writeJsonObjectFile(statePath, existingState, 0o600).catch(
        () => {},
      );
    } else {
      await Promise.resolve(
        rm(statePath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(runtimePath, { force: true, recursive: true }),
      ).catch(() => {});
      await Promise.resolve(
        rm(pluginDest, { force: true, recursive: true }),
      ).catch(() => {});
    }
    throw error;
  }

  const output = {
    ...summary,
    ...redactedOpencodeState(installState),
    publisher_registered: true,
    next: "restart_opencode",
    next_command: "opencode",
    acceptance_hint:
      "Restart OpenCode to load the TUI plugin. The sponsored line appears in the app_bottom slot.",
  };
  printCliOutput(flags, output, formatTargetInstallResult(output));
}

export async function runOpencodeStatus(
  flags: Map<string, string[]> = new Map(),
) {
  const state = await loadOpencodeInstallState();
  const runtimePath = state?.runtime_path ?? opencodeRuntimePath();
  const cachePath = state?.cache_path ?? opencodeCachePath();
  const pluginDest = state?.plugin_path ?? opencodePluginDestPath();
  const tuiConfigPath = state?.tui_config_path ?? opencodeTuiConfigPath();

  let runtimeInstalled = false;
  let pluginInstalled = false;
  let tuiPluginConfigured = false;
  let tuiConfigError: string | null = null;

  if (state) {
    runtimeInstalled = await pathExists(
      assertSafeOpencodeManagedRuntimePath(state.runtime_path),
    );
    pluginInstalled = await pathExists(
      assertSafeOpencodePluginPath(state.plugin_path),
    );
    try {
      tuiPluginConfigured = await opencodeTuiPluginConfigured(
        assertSafeOpencodeTuiConfigPath(tuiConfigPath),
      );
    } catch {
      tuiConfigError = "invalid_tui_config";
    }
  } else {
    const safeRuntime = assertSafeOpencodeManagedRuntimePath(runtimePath);
    runtimeInstalled = await pathExists(safeRuntime);
    const safePlugin = assertSafeOpencodePluginPath(pluginDest);
    pluginInstalled = await pathExists(safePlugin);
    try {
      tuiPluginConfigured = await opencodeTuiPluginConfigured(
        assertSafeOpencodeTuiConfigPath(tuiConfigPath),
      );
    } catch {
      tuiPluginConfigured = false;
    }
  }

  const installed = Boolean(
    state && runtimeInstalled && pluginInstalled && tuiPluginConfigured,
  );

  const output = {
    ok: true,
    target: OPENCODE_PUBLISHER_TARGET,
    mode: "tui-plugin-slot",
    installed,
    publisher_registered: Boolean(state?.publisher_id),
    install_id: state?.install_id ?? null,
    publisher_id: state?.publisher_id ?? null,
    publisher_target:
      state?.publisher_target ?? OPENCODE_PUBLISHER_TARGET,
    state_path: opencodeStatePath(),
    runtime_path: runtimePath,
    cache_path: cachePath,
    plugin_path: pluginDest,
    tui_config_path: tuiConfigPath,
    tui_plugin_entry: state?.tui_plugin_entry ?? OPENCODE_TUI_PLUGIN_ENTRY,
    runtime_installed: runtimeInstalled,
    plugin_installed: pluginInstalled,
    tui_plugin_configured: tuiPluginConfigured,
    tui_config_error: tuiConfigError,
    installed_at: state?.installed_at ?? null,
    ...(installed
      ? {
          next: "restart_opencode",
          next_command: "opencode",
          acceptance_hint:
            "Restart OpenCode to load the TUI plugin. The sponsored line appears in the app_bottom slot.",
        }
      : {
          next: "install_opencode",
          next_command: "waitspin opencode install",
        }),
  };
  printCliOutput(flags, output, formatTargetStatusResult(output));
}

export async function runOpencodeUninstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const state = await loadOpencodeInstallState();
  const tuiConfigPath = state?.tui_config_path ?? opencodeTuiConfigPath();

  const declaredRemovePaths = state
    ? [
        state.runtime_path,
        state.cache_path,
        opencodeStatePath(),
        state.plugin_path,
      ]
    : [opencodeStatePath()];

  if (dryRun) {
    const output = {
      ok: true,
      target: OPENCODE_PUBLISHER_TARGET,
      dry_run: true,
      installed: Boolean(state),
      would_remove: declaredRemovePaths,
      would_update: [tuiConfigPath],
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  const removePaths: string[] = [];
  const skippedUnsafePaths: string[] = [];
  let tuiConfigUpdate:
    | Awaited<ReturnType<typeof removeOpencodeTuiPluginEntry>>
    | null = null;
  if (state) {
    try {
      removePaths.push(assertSafeOpencodeManagedRuntimePath(state.runtime_path));
    } catch {
      skippedUnsafePaths.push(state.runtime_path);
    }
    try {
      removePaths.push(assertSafeOpencodeManagedPath(state.cache_path));
    } catch {
      skippedUnsafePaths.push(state.cache_path);
    }
    try {
      removePaths.push(assertSafeOpencodePluginPath(state.plugin_path));
    } catch {
      skippedUnsafePaths.push(state.plugin_path);
    }
    try {
      tuiConfigUpdate = await removeOpencodeTuiPluginEntry(
        assertSafeOpencodeTuiConfigPath(tuiConfigPath),
      );
    } catch {
      skippedUnsafePaths.push(tuiConfigPath);
    }
  }
  removePaths.splice(
    state ? Math.min(removePaths.length, 2) : 0,
    0,
    opencodeStatePath(),
  );

  await Promise.all(
    removePaths.map((filePath) =>
      rm(filePath, { force: true, recursive: true }),
    ),
  );

  const output = {
    ok: true,
    target: OPENCODE_PUBLISHER_TARGET,
    uninstalled: true,
    removed: removePaths,
    tui_config_updated: tuiConfigUpdate?.updated ?? false,
    tui_plugin_configured_before:
      tuiConfigUpdate?.configured_before ?? false,
    tui_config_error: tuiConfigUpdate?.error ?? null,
    ...(skippedUnsafePaths.length > 0
      ? { skipped_unsafe_paths: skippedUnsafePaths }
      : {}),
  };
  printCliOutput(flags, output, formatTargetUninstallResult(output));
}

type QoderManagedHook = {
  type: "command";
  command: string;
  timeout: number;
  statusMessage: string;
};

type QoderInstallState = InstallState & {
  target: typeof QODER_PUBLISHER_TARGET;
  base_url: string;
  api_key_path: string;
  runtime_path: string;
  cache_path: string;
  settings_path: string;
  managed_hook: QoderManagedHook;
  qoder_version?: string;
  installed_at: string;
};

function qoderInstallDir(): string {
  return path.join(os.homedir(), ".waitspin");
}

function qoderStatePath(): string {
  return path.join(qoderInstallDir(), "qoder-install.json");
}

function qoderRuntimePath(): string {
  return path.join(qoderInstallDir(), "qoder-hook-runtime.mjs");
}

function qoderCachePath(): string {
  return path.join(qoderInstallDir(), "qoder-hook-cache.json");
}

function qoderApiKeyPath(): string {
  return path.join(qoderInstallDir(), "qoder-api-key.secret");
}

function qoderSettingsPath(): string {
  return path.join(os.homedir(), ".qoder", "settings.json");
}

function qoderHookCommand(input: {
  runtimePath: string;
  statePath: string;
}): string {
  return claudeCodeStatusLineCommand(input);
}

function managedQoderHook(input: {
  runtimePath: string;
  statePath: string;
}): QoderManagedHook {
  return {
    type: "command",
    command: qoderHookCommand(input),
    timeout: QODER_HOOK_TIMEOUT_SECONDS,
    statusMessage: QODER_HOOK_STATUS_MESSAGE,
  };
}

async function loadQoderSettings(): Promise<{
  settings: Record<string, unknown>;
  existed: boolean;
}> {
  const parsed = await readJsonObjectFile(qoderSettingsPath(), { jsonc: true });
  return { settings: parsed ?? {}, existed: parsed !== null };
}

async function loadQoderInstallState(): Promise<QoderInstallState | null> {
  const parsed = await readJsonObjectFile(qoderStatePath());
  if (!parsed?.install_id || parsed.target !== QODER_PUBLISHER_TARGET) {
    return null;
  }
  return parsed as QoderInstallState;
}

function qoderHookContainer(hook: QoderManagedHook): Record<string, unknown> {
  return { hooks: [hook] };
}

function qoderHooksObject(settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = settings.hooks;
  if (hooks === undefined) return {};
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) {
    throw new Error(
      "Qoder settings hooks field must be an object before WaitSpin can manage it.",
    );
  }
  return hooks as Record<string, unknown>;
}

function qoderHookEventEntries(
  hooks: Record<string, unknown>,
  eventName: (typeof QODER_HOOK_EVENTS)[number],
): unknown[] {
  const entries = hooks[eventName];
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    throw new Error(
      `Qoder settings hooks.${eventName} must be an array before WaitSpin can manage it.`,
    );
  }
  return entries;
}

function qoderHookMatches(value: unknown, commands: Set<string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const hook = value as { type?: unknown; command?: unknown };
  return hook.type === "command" && typeof hook.command === "string"
    ? commands.has(hook.command)
    : false;
}

function qoderManagedCommands(input: {
  managedHook: QoderManagedHook;
  existingState?: QoderInstallState | null;
}): Set<string> {
  const commands = new Set<string>([input.managedHook.command]);
  const previous = input.existingState?.managed_hook?.command;
  if (previous) commands.add(previous);
  return commands;
}

function removeQoderManagedHookEntries(
  entries: unknown[],
  commands: Set<string>,
): { entries: unknown[]; removed: number } {
  let removed = 0;
  const nextEntries: unknown[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      nextEntries.push(entry);
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (!Array.isArray(record.hooks)) {
      nextEntries.push(entry);
      continue;
    }
    const nextHooks = record.hooks.filter((hook) => {
      const matches = qoderHookMatches(hook, commands);
      if (matches) removed += 1;
      return !matches;
    });
    if (nextHooks.length === record.hooks.length) {
      nextEntries.push(entry);
    } else if (nextHooks.length > 0) {
      nextEntries.push({ ...record, hooks: nextHooks });
    }
  }

  return { entries: nextEntries, removed };
}

function resolveQoderSettingsInstall(input: {
  settings: Record<string, unknown>;
  managedHook: QoderManagedHook;
  existingState: QoderInstallState | null;
}): {
  nextSettings: Record<string, unknown>;
  action: "install" | "refresh-managed";
  existingManagedHooks: number;
} {
  const hooks = qoderHooksObject(input.settings);
  const commands = qoderManagedCommands({
    managedHook: input.managedHook,
    existingState: input.existingState,
  });
  const cleanedByEvent = QODER_HOOK_EVENTS.map((eventName) => ({
    eventName,
    cleaned: removeQoderManagedHookEntries(
      qoderHookEventEntries(hooks, eventName),
      commands,
    ),
  }));
  const removed = cleanedByEvent.reduce(
    (count, entry) => count + entry.cleaned.removed,
    0,
  );
  if (removed > QODER_HOOK_EVENTS.length) {
    throw new Error(
      "Qoder settings contain multiple WaitSpin-managed hooks; refusing to guess which ones to refresh.",
    );
  }
  const nextHooks = { ...hooks };
  for (const { eventName, cleaned } of cleanedByEvent) {
    nextHooks[eventName] = [
      ...cleaned.entries,
      qoderHookContainer(input.managedHook),
    ];
  }
  return {
    nextSettings: { ...input.settings, hooks: nextHooks },
    action: removed > 0 ? "refresh-managed" : "install",
    existingManagedHooks: removed,
  };
}

function resolveQoderSettingsUninstall(input: {
  settings: Record<string, unknown>;
  state: QoderInstallState | null;
  managedHook: QoderManagedHook;
}): {
  nextSettings: Record<string, unknown> | null;
  action: "remove-managed" | "skip-user-settings" | "not-managed";
  removedHooks: number;
  warning?: string;
} {
  const hooks = qoderHooksObject(input.settings);
  const commands = qoderManagedCommands({
    managedHook: input.managedHook,
    existingState: input.state,
  });
  const cleanedByEvent = QODER_HOOK_EVENTS.map((eventName) => ({
    eventName,
    cleaned: removeQoderManagedHookEntries(
      qoderHookEventEntries(hooks, eventName),
      commands,
    ),
  }));
  const removed = cleanedByEvent.reduce(
    (count, entry) => count + entry.cleaned.removed,
    0,
  );
  if (removed === 0) {
    if (!input.state?.managed_hook?.command) {
      return { nextSettings: null, action: "not-managed", removedHooks: 0 };
    }
    return {
      nextSettings: null,
      action: "skip-user-settings",
      removedHooks: 0,
      warning:
        "Qoder hooks are no longer the WaitSpin managed command; leaving user settings unchanged while removing WaitSpin-managed files.",
    };
  }
  if (removed > QODER_HOOK_EVENTS.length) {
    throw new Error(
      "Qoder settings contain multiple WaitSpin-managed hooks; refusing to guess which ones to remove.",
    );
  }

  const nextHooks = { ...hooks };
  for (const { eventName, cleaned } of cleanedByEvent) {
    if (cleaned.removed === 0) continue;
    if (cleaned.entries.length > 0) {
      nextHooks[eventName] = cleaned.entries;
    } else {
      delete nextHooks[eventName];
    }
  }
  const nextSettings = { ...input.settings };
  if (Object.keys(nextHooks).length > 0) {
    nextSettings.hooks = nextHooks;
  } else {
    delete nextSettings.hooks;
  }
  return {
    nextSettings,
    action: "remove-managed",
    removedHooks: removed,
  };
}

function qoderManagedHookCountsByEvent(
  settings: Record<string, unknown>,
  state: QoderInstallState | null,
): number[] {
  if (!state?.managed_hook?.command) return QODER_HOOK_EVENTS.map(() => 0);
  const hooks = qoderHooksObject(settings);
  return QODER_HOOK_EVENTS.map(
    (eventName) =>
      removeQoderManagedHookEntries(
        qoderHookEventEntries(hooks, eventName),
        new Set([state.managed_hook.command]),
      ).removed,
  );
}

function redactedQoderState(
  state: QoderInstallState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  return {
    target: state.target,
    install_id: state.install_id,
    publisher_id: state.publisher_id,
    publisher_target: state.publisher_target,
    registered_at: state.registered_at,
    base_url: state.base_url,
    runtime_path: state.runtime_path,
    cache_path: state.cache_path,
    api_key_path: state.api_key_path,
    settings_path: state.settings_path,
    qoder_version: state.qoder_version,
    installed_at: state.installed_at,
    api_key_present: Boolean(state.api_key_path),
  };
}

function qoderHookRuntimeSource(): string {
  return String.raw`#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const FETCH_TIMEOUT_MS = 2500;
const DEFAULT_MIN_VISIBLE_MS = 5000;
const LOCK_RETRY_MS = 40;
const LOCK_TIMEOUT_MS = 2000;
const LOCK_STALE_MS = 10000;
const MAX_ACTIVE_AGE_MS = 60000;
const SHELL_PROCESS_NAMES = new Set([
  "bash",
  "cmd.exe",
  "dash",
  "fish",
  "nu",
  "pwsh",
  "pwsh.exe",
  "powershell",
  "powershell.exe",
  "sh",
  "zsh",
]);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sanitizeQoderHookInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const sanitized = { ...value };
  delete sanitized.prompt;
  delete sanitized.message;
  delete sanitized.messages;
  delete sanitized.response;
  delete sanitized.model_response;
  delete sanitized.modelResponse;
  delete sanitized.assistant_message;
  delete sanitized.assistantMessage;
  delete sanitized.last_assistant_message;
  delete sanitized.lastAssistantMessage;
  return sanitized;
}

function parseQoderHookInput(source) {
  try {
    return sanitizeQoderHookInput(source.trim() ? JSON.parse(source) : {});
  } catch {
    return {};
  }
}

function stripJsoncComments(source) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      output += "  ";
      index += 1;
      while (index + 1 < source.length && source[index + 1] !== "\n") {
        output += " ";
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      output += "  ";
      index += 1;
      while (index + 1 < source.length) {
        const blockChar = source[index + 1];
        const blockNext = source[index + 2];
        if (blockChar === "*" && blockNext === "/") {
          output += "  ";
          index += 2;
          break;
        }
        output += blockChar === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    output += char;
  }
  return output;
}

function removeJsoncTrailingCommas(source) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === ",") {
      let lookahead = index + 1;
      while (/\s/.test(source[lookahead] || "")) lookahead += 1;
      if (source[lookahead] === "}" || source[lookahead] === "]") {
        continue;
      }
    }
    output += char;
  }
  return output;
}

async function readJsonc(filePath, fallback) {
  try {
    const source = await readFile(filePath, "utf8");
    return JSON.parse(removeJsoncTrailingCommas(stripJsoncComments(source)));
  } catch {
    return fallback;
  }
}

async function readSecret(filePath) {
  if (!filePath) return "";
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch {
    return "";
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + "." + process.pid + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tmp, filePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireCacheLock(cachePath) {
  const lockPath = cachePath + ".lock";
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      await mkdir(lockPath);
      return async () => {
        await rm(lockPath, { recursive: true, force: true });
      };
    } catch {
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
  throw new Error("Timed out waiting for WaitSpin Qoder cache lock.");
}

async function withCacheLock(cachePath, callback) {
  const release = await acquireCacheLock(cachePath);
  try {
    return await callback();
  } finally {
    await release();
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
    .slice(0, 120);
}

async function waitspinFetch(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseServe(payload) {
  if (!payload || typeof payload !== "object") return null;
  const creative = payload.creative;
  if (!creative || typeof creative !== "object") return null;
  const line = cleanLine(creative.line);
  if (!line) return null;
  if (
    typeof payload.serve_id !== "string" ||
    typeof payload.serve_receipt !== "string"
  ) {
    return null;
  }
  const parsedExpiresAt = Date.parse(payload.expires_at || "");
  return {
    serveId: payload.serve_id,
    serveReceipt: payload.serve_receipt,
    line,
    shownAt: Date.now(),
    expiresAtMs: Number.isFinite(parsedExpiresAt)
      ? parsedExpiresAt
      : Date.now() + MAX_ACTIVE_AGE_MS,
    minVisibleMs:
      typeof payload.min_visible_ms === "number" &&
      payload.min_visible_ms >= DEFAULT_MIN_VISIBLE_MS
        ? payload.min_visible_ms
        : DEFAULT_MIN_VISIBLE_MS,
    impressionRecorded: false,
  };
}

function serveIsExpired(serve) {
  return (
    Date.now() >= (serve.expiresAtMs || 0) ||
    Date.now() - (serve.shownAt || Date.now()) > MAX_ACTIVE_AGE_MS
  );
}

function processAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function processInfo(pid) {
  if (!processAlive(pid)) return null;
  if (process.platform === "win32") {
    return await new Promise((resolve) => {
      const numericPid = Math.trunc(Number(pid));
      const command = [
        "$p=Get-CimInstance Win32_Process -Filter 'ProcessId = " + numericPid + "';",
        "if ($p) { Write-Output ([string]$p.ParentProcessId + ' ' + [string]$p.Name + ' ' + [string]$p.CommandLine) }",
      ].join(" ");
      const child = spawn("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let stdout = "";
      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > 4000) stdout = stdout.slice(0, 4000);
      });
      child.on("error", () => finish(null));
      child.on("close", (code) => {
        if (code !== 0) {
          finish(null);
          return;
        }
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || "";
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!match) {
          finish(null);
          return;
        }
        finish({ ppid: Number(match[1]), command: match[2] });
      });
    });
  }
  return await new Promise((resolve) => {
    const child = spawn("ps", ["-o", "ppid=,comm=,args=", "-p", String(pid)], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 4000) stdout = stdout.slice(0, 4000);
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(null);
        return;
      }
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || "";
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) {
        finish(null);
        return;
      }
      finish({ ppid: Number(match[1]), command: match[2] });
    });
  });
}

function isShellProcess(command) {
  const first = String(command || "").trim().split(/\s+/)[0] || "";
  const base = path.basename(first).toLowerCase();
  return SHELL_PROCESS_NAMES.has(base);
}

function isQoderProcess(command) {
  const normalized = String(command || "").replace(/\\/g, "/").toLowerCase();
  const first = normalized.trim().split(/\s+/)[0] || "";
  const base = path.basename(first);
  return (
    base === "qoder" ||
    base === "qodercli" ||
    normalized.includes("/qodercli") ||
    normalized.includes("@qoder-ai/qodercli")
  );
}

async function detectOwnerPid() {
  let pid = Number(process.ppid);
  let fallbackPid = 0;
  for (let depth = 0; depth < 10; depth += 1) {
    const info = await processInfo(pid);
    if (!info) return fallbackPid;
    if (isQoderProcess(info.command)) return pid;
    if (!fallbackPid && !isShellProcess(info.command)) fallbackPid = pid;
    const nextPid = Number(info.ppid);
    if (!Number.isFinite(nextPid) || nextPid <= 1 || nextPid === pid) break;
    pid = nextPid;
  }
  return 0;
}

function ownerAlive(ownerPid) {
  return processAlive(Number(ownerPid || 0));
}

function numericArgValue(name, fallback) {
  const parsed = Number(argValue(name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sessionKey(inputJson) {
  const raw = String(
    inputJson.session_id ||
    inputJson.conversation_id ||
    inputJson.transcript_path ||
    inputJson.cwd ||
    "qoder"
  );
  return createHash("sha256").update(raw).digest("hex");
}

function settingsStillConfigured(settings, managedCommand) {
  const entries = settings?.hooks?.UserPromptSubmit;
  if (!Array.isArray(entries)) return false;
  return entries.some(
    (entry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some(
        (hook) => hook?.type === "command" && hook.command === managedCommand,
      ),
  );
}

async function installedSurfaceStillConfigured(state) {
  if (!state?.settings_path || !state?.managed_hook?.command) return false;
  const settings = await readJsonc(state.settings_path, null);
  return settingsStillConfigured(settings, state.managed_hook.command);
}

async function fetchNextServe(state, apiKey) {
  const response = await waitspinFetch(state.base_url + "/v1/serve/next", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ install_id: state.install_id }),
  });
  if (response.status === 204 || !response.ok) return null;
  return parseServe(await response.json());
}

async function recordImpression(state, apiKey, serve) {
  const visibleMs = Date.now() - serve.shownAt;
  if (visibleMs < serve.minVisibleMs) return false;
  const response = await waitspinFetch(state.base_url + "/v1/events/impression", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serve_id: serve.serveId,
      serve_receipt: serve.serveReceipt,
      install_id: state.install_id,
      visible_ms: Math.max(visibleMs, serve.minVisibleMs),
    }),
  });
  return response.ok;
}

function scheduleVisibleImpressionRetry(input) {
  if (!process.argv[1]) return;
  const delayMs = Math.min(
    Math.max(Math.ceil(input.delayMs || 0), 0),
    MAX_ACTIVE_AGE_MS,
  );
  try {
    const child = spawn(process.execPath, [
      process.argv[1],
      "--state",
      input.statePath,
      "--record-visible",
      "--session-key",
      input.sessionKeyValue,
      "--owner-pid",
      String(input.ownerPid),
      "--delay-ms",
      String(delayMs),
    ], {
      detached: true,
      env: { ...process.env },
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
  }
}

function visibleImpressionCheckDelayMs(serve) {
  const minVisibleMs = Math.max(
    serve?.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS,
    DEFAULT_MIN_VISIBLE_MS,
  );
  const maxVisibleDelayMs = Math.max(MAX_ACTIVE_AGE_MS - LOCK_RETRY_MS, 0);
  return Math.min(minVisibleMs, maxVisibleDelayMs) + LOCK_RETRY_MS;
}

async function recordVisibleImpressionFromHook(state, apiKey, sessionKeyValue, ownerPid, options = {}) {
  if (!ownerAlive(ownerPid) || !(await installedSurfaceStillConfigured(state))) {
    return;
  }
  await withCacheLock(state.cache_path, async () => {
    const lockedCache = await readJson(state.cache_path, { sessions: {} });
    const lockedSession = lockedCache.sessions?.[sessionKeyValue];
    const lockedServe = lockedSession?.activeServe;
    const visibleMs = Date.now() - (lockedServe?.shownAt || Date.now());
    const minVisibleMs = Math.max(
      lockedServe?.minVisibleMs || DEFAULT_MIN_VISIBLE_MS,
      DEFAULT_MIN_VISIBLE_MS,
    );
    if (
      !lockedServe ||
      lockedServe.impressionRecorded ||
      serveIsExpired(lockedServe) ||
      !ownerAlive(ownerPid) ||
      !(await installedSurfaceStillConfigured(state))
    ) {
      return;
    }
    if (visibleMs < minVisibleMs) {
      if (options.allowRetry && options.statePath) {
        scheduleVisibleImpressionRetry({
          statePath: options.statePath,
          sessionKeyValue,
          ownerPid,
          delayMs: minVisibleMs - visibleMs + LOCK_RETRY_MS,
        });
      }
      return;
    }
    if (await recordImpression(state, apiKey, lockedServe)) {
      lockedServe.impressionRecorded = true;
      await writeJson(state.cache_path, lockedCache);
    }
  });
}

async function main() {
  const statePath = argValue("--state");
  if (!statePath) return;
  const state = await readJson(statePath, null);
  const apiKey = await readSecret(state?.api_key_path);
  if (!apiKey || !state?.install_id || !state.base_url || !state.cache_path) {
    return;
  }
  if (process.argv.includes("--record-visible")) {
    const key = argValue("--session-key");
    const ownerPid = numericArgValue("--owner-pid", 0);
    const delayMs = numericArgValue("--delay-ms", 0);
    if (!key || !ownerPid) return;
    if (delayMs > 0) await sleep(delayMs);
    await recordVisibleImpressionFromHook(state, apiKey, key, ownerPid, {
      allowRetry: false,
      statePath,
    });
    return;
  }
  const stdin = await readStdin();
  const inputJson = parseQoderHookInput(stdin);
  const key = sessionKey(inputJson);
  const ownerPid = await detectOwnerPid();
  if (!ownerPid) return;
  await recordVisibleImpressionFromHook(state, apiKey, key, ownerPid, {
    allowRetry: inputJson.hook_event_name === "Stop",
    statePath,
  });
  if (inputJson.hook_event_name !== "UserPromptSubmit") return;
  const serve = await fetchNextServe(state, apiKey);
  if (!serve) return;
  await withCacheLock(state.cache_path, async () => {
    const cache = await readJson(state.cache_path, { sessions: {} });
    if (!cache.sessions || typeof cache.sessions !== "object") cache.sessions = {};
    cache.sessions[key] = {
      lastSeenAt: Date.now(),
      ownerPid,
      activeServe: serve,
    };
    await writeJson(state.cache_path, cache);
  });
  process.stdout.write(JSON.stringify({
    systemMessage: "Sponsored: " + serve.line,
  }));
  scheduleVisibleImpressionRetry({
    statePath,
    sessionKeyValue: key,
    ownerPid,
    delayMs: visibleImpressionCheckDelayMs(serve),
  });
}

main().catch(() => {});
  `;
}

async function writeQoderRuntime(runtimePath: string): Promise<void> {
  await mkdir(path.dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, qoderHookRuntimeSource(), {
    encoding: "utf8",
    mode: 0o755,
  });
  await chmod(runtimePath, 0o755);
}

async function readManagedQoderSecretSnapshot(
  filePath: string | undefined,
): Promise<string | null> {
  if (!filePath) return null;
  try {
    return await readFile(assertSafeQoderManagedPath(filePath), "utf8");
  } catch {
    return null;
  }
}

async function writeManagedQoderSecretSnapshot(
  filePath: string,
  value: string,
): Promise<void> {
  const safePath = assertSafeQoderManagedPath(filePath);
  await mkdir(path.dirname(safePath), { recursive: true });
  await writeFile(safePath, value, { encoding: "utf8", mode: 0o600 });
  await chmod(safePath, 0o600);
}

async function readManagedQoderRuntimeSnapshot(
  filePath: string | undefined,
): Promise<string | null> {
  if (!filePath) return null;
  try {
    return await readFile(assertSafeQoderManagedPath(filePath), "utf8");
  } catch {
    return null;
  }
}

async function writeManagedQoderRuntimeSnapshot(
  filePath: string,
  value: string,
): Promise<void> {
  const safePath = assertSafeQoderManagedPath(filePath);
  await mkdir(path.dirname(safePath), { recursive: true });
  await writeFile(safePath, value, { encoding: "utf8", mode: 0o755 });
  await chmod(safePath, 0o755);
}

function assertSafeQoderManagedPath(filePath: string): string {
  const installRoot = path.resolve(qoderInstallDir());
  const resolved = path.resolve(filePath);
  if (
    !resolved.startsWith(`${installRoot}${path.sep}`) ||
    !path.basename(resolved).startsWith("qoder-")
  ) {
    throw new Error("Refusing to manage a Qoder WaitSpin file outside ~/.waitspin.");
  }
  return resolved;
}

function assertSafeQoderSettingsPath(filePath: string): string {
  const expected = path.resolve(qoderSettingsPath());
  const resolved = path.resolve(filePath);
  if (resolved !== expected) {
    throw new Error(
      "Refusing to manage a Qoder settings file outside ~/.qoder/settings.json.",
    );
  }
  return resolved;
}

async function readQoderVersion(): Promise<string> {
  return executableVersion(QODER_BIN_ENV, QODER_DEFAULT_BIN, "Qoder CLI");
}

export async function runQoderInstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const baseUrl = resolveCredentialedBaseUrl(flags);
  const statePath = qoderStatePath();
  const runtimePath = qoderRuntimePath();
  const cachePath = qoderCachePath();
  const apiKeyPath = qoderApiKeyPath();
  const settingsPath = qoderSettingsPath();
  const existingState = await loadQoderInstallState();
  const installId = existingState?.install_id || generateInstallId();
  const managedHook = managedQoderHook({ runtimePath, statePath });
  const loadedSettings = await loadQoderSettings();
  let settingsUpdate: ReturnType<typeof resolveQoderSettingsInstall> | null =
    null;
  let settingsBlockedReason: string | null = null;

  try {
    settingsUpdate = resolveQoderSettingsInstall({
      settings: loadedSettings.settings,
      managedHook,
      existingState,
    });
  } catch (error) {
    if (!dryRun) throw error;
    settingsBlockedReason =
      error instanceof Error ? error.message : String(error);
  }

  const summary = {
    ok: true,
    target: QODER_PUBLISHER_TARGET,
    mode: "qoder-hook-system-message",
    install_id: installId,
    publisher_target: QODER_PUBLISHER_TARGET,
    state_path: statePath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    api_key_path: apiKeyPath,
    settings_path: settingsPath,
    settings_action: settingsUpdate?.action ?? "blocked",
    hook_events: [...QODER_HOOK_EVENTS],
    hook_status_message: QODER_HOOK_STATUS_MESSAGE,
    note: "Installs WaitSpin through Qoder's official UserPromptSubmit and Stop hook surfaces.",
    next: "check_status",
    next_command: "waitspin qoder status",
  };

  if (dryRun) {
    const output = {
      ...summary,
      dry_run: true,
      publisher_registered: false,
      qoder_settings_exists: loadedSettings.existed,
      existing_managed_hooks: settingsUpdate?.existingManagedHooks ?? 0,
      ...(settingsBlockedReason
        ? {
            would_fail: true,
            settings_blocked_reason: settingsBlockedReason,
            next: "resolve_qoder_hook_conflict",
          }
        : {}),
    };
    printCliOutput(flags, output, formatTargetInstallResult(output));
    return;
  }

  if (!settingsUpdate) {
    throw new Error("Unable to resolve Qoder settings update.");
  }
  const qoderVersion = await readQoderVersion();
  const qoderExecutable = executableFromEnv(QODER_BIN_ENV, QODER_DEFAULT_BIN);
  const apiKey = requireApiKey(flags);
  const previousApiKeySecret = await readManagedQoderSecretSnapshot(
    existingState?.api_key_path,
  );
  const previousRuntimeSource = await readManagedQoderRuntimeSnapshot(
    existingState?.runtime_path,
  );
  const registration = await registerPublisherInstall({
    baseUrl,
    apiKey,
    installId,
    target: QODER_PUBLISHER_TARGET,
  });
  const installedAt = new Date().toISOString();
  const installState: QoderInstallState = {
    target: QODER_PUBLISHER_TARGET,
    install_id: registration.install_id,
    publisher_id: registration.publisher_id,
    publisher_target: registration.target,
    registered_at: installedAt,
    base_url: baseUrl,
    api_key_path: apiKeyPath,
    runtime_path: runtimePath,
    cache_path: cachePath,
    settings_path: settingsPath,
    managed_hook: managedHook,
    qoder_version: qoderVersion,
    installed_at: installedAt,
  };

  try {
    await writeQoderRuntime(runtimePath);
    await writeSecretFile(apiKeyPath, apiKey);
    await writeJsonObjectFile(statePath, installState, 0o600);
    await writeJsonObjectFile(settingsPath, settingsUpdate.nextSettings);
  } catch (error) {
    if (existingState) {
      if (previousRuntimeSource !== null) {
        await writeManagedQoderRuntimeSnapshot(
          existingState.runtime_path,
          previousRuntimeSource,
        ).catch(() => {});
      }
      await writeJsonObjectFile(statePath, existingState, 0o600).catch(
        () => {},
      );
      if (previousApiKeySecret !== null) {
        await writeManagedQoderSecretSnapshot(
          existingState.api_key_path,
          previousApiKeySecret,
        ).catch(() => {});
      }
    } else {
      await Promise.all(
        [statePath, runtimePath, apiKeyPath].map((filePath) =>
          rm(filePath, { force: true, recursive: true }).catch(() => {}),
        ),
      );
    }
    if (loadedSettings.existed) {
      await writeJsonObjectFile(settingsPath, loadedSettings.settings).catch(
        () => {},
      );
    } else {
      await rm(settingsPath, { force: true, recursive: true }).catch(() => {});
    }
    throw error;
  }

  const output = {
    ...summary,
    ...redactedQoderState(installState),
    publisher_registered: true,
    qoder_version: qoderVersion,
    next: "launch_qoder",
    next_command: qoderExecutable,
    acceptance_hint: QODER_ACCEPTANCE_HINT,
  };
  printCliOutput(flags, output, formatTargetInstallResult(output));
}

export async function runQoderStatus(
  flags: Map<string, string[]> = new Map(),
) {
  const state = await loadQoderInstallState();
  const loadedSettings = await loadQoderSettings();
  const managedHookCounts = qoderManagedHookCountsByEvent(
    loadedSettings.settings,
    state,
  );
  const managedHookCount = managedHookCounts.reduce(
    (count, eventCount) => count + eventCount,
    0,
  );
  const runtimeReadable = state
    ? await pathAccessible(
        assertSafeQoderManagedPath(state.runtime_path),
        fsConstants.R_OK,
      )
    : false;
  const stateReadable = state
    ? await pathAccessible(
        assertSafeQoderManagedPath(qoderStatePath()),
        fsConstants.R_OK,
      )
    : false;
  const apiKeyReadable = state
    ? await pathAccessible(
        assertSafeQoderManagedPath(state.api_key_path),
        fsConstants.R_OK,
      )
    : false;
  const hookConfigured = managedHookCounts.every(
    (eventCount) => eventCount === 1,
  );
  const installed = Boolean(
    state &&
      stateReadable &&
      runtimeReadable &&
      apiKeyReadable &&
      hookConfigured,
  );
  const output = {
    ok: true,
    target: QODER_PUBLISHER_TARGET,
    mode: "qoder-hook-system-message",
    installed,
    publisher_registered: Boolean(state?.publisher_id),
    install_id: state?.install_id ?? null,
    publisher_id: state?.publisher_id ?? null,
    publisher_target: state?.publisher_target ?? QODER_PUBLISHER_TARGET,
    state_path: qoderStatePath(),
    runtime_path: state?.runtime_path ?? qoderRuntimePath(),
    cache_path: state?.cache_path ?? qoderCachePath(),
    api_key_path: state?.api_key_path ?? qoderApiKeyPath(),
    settings_path: qoderSettingsPath(),
    runtime_readable: runtimeReadable,
    state_readable: stateReadable,
    api_key_readable: apiKeyReadable,
    hook_configured: hookConfigured,
    expected_managed_hook_count: QODER_HOOK_EVENTS.length,
    managed_hook_count: managedHookCount,
    qoder_version: state?.qoder_version ?? null,
    ...(installed
      ? {
          next: "launch_qoder",
          next_command: executableFromEnv(QODER_BIN_ENV, QODER_DEFAULT_BIN),
          acceptance_hint: QODER_ACCEPTANCE_HINT,
        }
      : {
          next: "install_qoder",
          next_command: "waitspin qoder install",
          human_message:
            "Qoder CLI WaitSpin hook support is not installed for this user.",
        }),
  };
  printCliOutput(flags, output, formatTargetStatusResult(output));
}

export async function runQoderUninstall(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const state = await loadQoderInstallState();
  const loadedSettings = await loadQoderSettings();
  const defaultManagedHook = managedQoderHook({
    runtimePath: qoderRuntimePath(),
    statePath: qoderStatePath(),
  });
  const settingsUpdate = resolveQoderSettingsUninstall({
    settings: loadedSettings.settings,
    state,
    managedHook: defaultManagedHook,
  });
  const removePaths: string[] = [];
  const skippedUnsafePaths: string[] = [];
  const declaredRemovePaths = state
    ? [state.runtime_path, state.cache_path, state.api_key_path, qoderStatePath()]
    : [
        qoderRuntimePath(),
        qoderCachePath(),
        qoderApiKeyPath(),
        qoderStatePath(),
      ];

  for (const filePath of declaredRemovePaths) {
    try {
      removePaths.push(assertSafeQoderManagedPath(filePath));
    } catch {
      skippedUnsafePaths.push(filePath);
    }
  }

  if (dryRun) {
    const output = {
      ok: true,
      target: QODER_PUBLISHER_TARGET,
      dry_run: true,
      uninstalled: false,
      would_remove: removePaths,
      settings_action: settingsUpdate.action,
      removed_hooks: settingsUpdate.removedHooks,
      settings_warning: settingsUpdate.warning ?? null,
      ...(skippedUnsafePaths.length > 0
        ? { skipped_unsafe_paths: skippedUnsafePaths }
        : {}),
    };
    printCliOutput(flags, output, formatTargetUninstallResult(output));
    return;
  }

  if (settingsUpdate.nextSettings) {
    await writeJsonObjectFile(
      assertSafeQoderSettingsPath(state?.settings_path || qoderSettingsPath()),
      settingsUpdate.nextSettings,
    );
  }

  await Promise.all(
    removePaths.map((filePath) =>
      rm(filePath, { force: true, recursive: true }),
    ),
  );

  const output = {
    ok: true,
    target: QODER_PUBLISHER_TARGET,
    uninstalled: true,
    removed: removePaths,
    settings_action: settingsUpdate.action,
    removed_hooks: settingsUpdate.removedHooks,
    settings_warning: settingsUpdate.warning ?? null,
    ...(skippedUnsafePaths.length > 0
      ? { skipped_unsafe_paths: skippedUnsafePaths }
      : {}),
  };
  printCliOutput(flags, output, formatTargetUninstallResult(output));
}

type PublicAllInstallTarget = {
  target:
    | "vscode"
    | "cursor"
    | "devin"
    | "claude-code"
    | "mimocode"
    | "opencode"
    | "copilot"
    | "antigravity"
    | "qoder";
  command: string;
  statusCommand: string;
  preflight: (flags: Map<string, string[]>) => Promise<string | null>;
  install: (flags: Map<string, string[]>) => Promise<void>;
  status: (flags: Map<string, string[]>) => Promise<void>;
};

type AllInstallTarget = PublicAllInstallTarget | ExperimentalAllInstallTarget;

type AllTargetSummary = {
  target: AllInstallTarget["target"];
  command: string;
  reason?: string;
  detail?: string | null;
  result?: unknown;
};

function cloneFlags(flags: Map<string, string[]>): Map<string, string[]> {
  return new Map(
    Array.from(flags.entries()).map(([key, values]) => [key, [...values]]),
  );
}

function jsonFlags(flags: Map<string, string[]>): Map<string, string[]> {
  const next = cloneFlags(flags);
  next.set("json", ["true"]);
  return next;
}

function extensionAllFlags(
  flags: Map<string, string[]>,
  target: ExtensionTarget,
): Map<string, string[]> {
  const next = cloneFlags(flags);
  next.set("target", [target]);
  return next;
}

function executableFromEnv(envName: string, defaultBin: string): string {
  return process.env[envName]?.trim() || defaultBin;
}

async function executableVersion(
  envName: string,
  defaultBin: string,
  label: string,
): Promise<string> {
  const binary = executableFromEnv(envName, defaultBin);
  try {
    const result = await execFileText(binary, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return `${result.stdout || result.stderr || label}`.trim();
  } catch (error) {
    throw new Error(
      `${label} was not detected. Install ${label} or set ${envName} to its executable path.`,
      { cause: error },
    );
  }
}

async function preflightVscode(flags: Map<string, string[]>): Promise<string> {
  return resolveExtensionDir(flags);
}

async function preflightEditorExtension(
  target: EditorCliExtensionTarget,
): Promise<string> {
  const editor = await resolveEditorCli(target);
  return `${extensionTargets[target].label} ${editor.version} (${editor.binary})`;
}

async function preflightClaudeCode(): Promise<string> {
  return assertSupportedClaudeCodeVersion();
}

async function preflightMiMoCode(): Promise<string> {
  return executableVersion(MIMOCODE_BIN_ENV, MIMOCODE_DEFAULT_BIN, "MiMo Code");
}

async function preflightOpenCode(): Promise<string> {
  return executableVersion(
    OPENCODE_BIN_ENV,
    OPENCODE_DEFAULT_BIN,
    "OpenCode",
  );
}

async function preflightCopilot(): Promise<string> {
  return readCopilotVersion();
}

async function preflightAntigravity(): Promise<string> {
  return readAntigravityVersion();
}

async function preflightQoder(): Promise<string> {
  return readQoderVersion();
}

function experimentalCliDeps(): ExperimentalCliDeps {
  return {
    booleanFlag,
    optionalFlag,
    resolveCredentialedBaseUrl,
    requireApiKey,
    registerPublisherInstall,
    generateInstallId,
    printJson,
    printCliOutput,
  };
}

function allInstallTargets(flags: Map<string, string[]>): AllInstallTarget[] {
  const experimentalDeps = experimentalCliDeps();
  const targets: AllInstallTarget[] = [
    {
      target: "vscode",
      command: "waitspin extension install --target vscode",
      statusCommand: "waitspin extension status --target vscode",
      preflight: preflightVscode,
      install: (flags) =>
        runExtensionInstall(extensionAllFlags(flags, "vscode")),
      status: (flags) => runExtensionStatus(extensionAllFlags(flags, "vscode")),
    },
    {
      target: "cursor",
      command: "waitspin extension install --target cursor",
      statusCommand: "waitspin extension status --target cursor",
      preflight: () => preflightEditorExtension("cursor"),
      install: (flags) =>
        runExtensionInstall(extensionAllFlags(flags, "cursor")),
      status: (flags) => runExtensionStatus(extensionAllFlags(flags, "cursor")),
    },
    {
      target: "devin",
      command: "waitspin extension install --target devin",
      statusCommand: "waitspin extension status --target devin",
      preflight: () => preflightEditorExtension("devin"),
      install: (flags) =>
        runExtensionInstall(extensionAllFlags(flags, "devin")),
      status: (flags) => runExtensionStatus(extensionAllFlags(flags, "devin")),
    },
    {
      target: CLAUDE_CODE_PUBLISHER_TARGET,
      command: "waitspin claude-code install --compose-existing",
      statusCommand: "waitspin claude-code status",
      preflight: preflightClaudeCode,
      install: runClaudeCodeInstall,
      status: runClaudeCodeStatus,
    },
    {
      target: MIMOCODE_PUBLISHER_TARGET,
      command: "waitspin mimocode install",
      statusCommand: "waitspin mimocode status",
      preflight: preflightMiMoCode,
      install: runMiMoCodeInstall,
      status: runMiMoCodeStatus,
    },
    {
      target: OPENCODE_PUBLISHER_TARGET,
      command: "waitspin opencode install",
      statusCommand: "waitspin opencode status",
      preflight: preflightOpenCode,
      install: runOpencodeInstall,
      status: runOpencodeStatus,
    },
    experimentalInstallTarget("grok", experimentalDeps),
    {
      target: ANTIGRAVITY_PUBLISHER_TARGET,
      command: "waitspin antigravity install --compose-existing",
      statusCommand: "waitspin antigravity status",
      preflight: preflightAntigravity,
      install: runAntigravityInstall,
      status: runAntigravityStatus,
    },
    {
      target: COPILOT_PUBLISHER_TARGET,
      command: "waitspin copilot install --compose-existing",
      statusCommand: "waitspin copilot status",
      preflight: preflightCopilot,
      install: runCopilotInstall,
      status: runCopilotStatus,
    },
    {
      target: QODER_PUBLISHER_TARGET,
      command: "waitspin qoder install",
      statusCommand: "waitspin qoder status",
      preflight: preflightQoder,
      install: runQoderInstall,
      status: runQoderStatus,
    },
  ];
  if (booleanFlag(flags, "include-experimental")) {
    targets.push(
      ...experimentalAllInstallTargets(experimentalDeps).filter(
        (target) => target.target !== "grok",
      ),
    );
  }
  return targets;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactCliSecretText(message);
}

function isNotDetectedError(message: string): boolean {
  if (/WaitSpin extension package not found|assets not found/i.test(message)) {
    return false;
  }
  return /not detected|Unable to run Claude Code|Unable to run GitHub Copilot CLI|Unable to run Antigravity CLI|Qoder CLI was not detected|Unsupported Claude Code version|ENOENT|spawn .*ENOENT|command not found|executable path/i.test(
    message,
  );
}

function isConflictError(message: string): boolean {
  return /statusLine|status line|conflict|override|already has|blocked/i.test(
    message,
  );
}

function isUnsupportedTargetLayoutReason(reason: string): boolean {
  return /unsupported_patch_layout|unsupported_native_cli/i.test(reason);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dryRunConflictReason(result: unknown): string | null {
  const record = objectRecord(result);
  if (!record.would_fail) return null;
  if (
    typeof record.failure_kind === "string" &&
    isUnsupportedTargetLayoutReason(record.failure_kind)
  ) {
    return typeof record.human_message === "string"
      ? record.human_message
      : record.failure_kind;
  }
  const reason =
    record.settings_blocked_reason ??
    (record.failure_kind ? null : record.human_message);
  if (!reason) return null;
  return typeof reason === "string" ? reason : "target reported a conflict";
}

function dryRunFailureReason(result: unknown): string | null {
  const record = objectRecord(result);
  if (!record.would_fail) return null;
  const reason =
    record.failure_kind ??
    record.rollback_reason ??
    record.human_message ??
    "target dry-run reported failure";
  return typeof reason === "string" ? reason : "target dry-run reported failure";
}

export async function runInstallAll(flags: Map<string, string[]>) {
  const dryRun = booleanFlag(flags, "dry-run");
  const includeExperimental = booleanFlag(flags, "include-experimental");
  if (includeExperimental && !dryRun) {
    throw new Error(
      "--include-experimental is only available with install --all --dry-run. Use explicit waitspin <target> install commands for hidden experimental targets.",
    );
  }
  const internalJsonFlags = jsonFlags(flags);
  const installed: AllTargetSummary[] = [];
  const wouldInstall: AllTargetSummary[] = [];
  const skippedNotDetected: AllTargetSummary[] = [];
  const skippedConflict: AllTargetSummary[] = [];
  const failedRollback: AllTargetSummary[] = [];

  for (const target of allInstallTargets(flags)) {
    let detail: string | null = null;
    try {
      detail = await target.preflight(flags);
    } catch (error) {
      const reason = safeErrorMessage(error);
      const bucket = isNotDetectedError(reason)
        ? skippedNotDetected
        : failedRollback;
      bucket.push({
        target: target.target,
        command: target.command,
        reason,
      });
      continue;
    }

    try {
      const result = await capturePrintedJson<unknown>(() =>
        target.install(internalJsonFlags),
      );
      const conflictReason = dryRunConflictReason(result);
      if (conflictReason) {
        skippedConflict.push({
          target: target.target,
          command: target.command,
          reason: conflictReason,
          detail,
          result,
        });
        continue;
      }
      const failureReason = dryRunFailureReason(result);
      if (failureReason) {
        failedRollback.push({
          target: target.target,
          command: target.command,
          reason: failureReason,
          detail,
          result,
        });
        continue;
      }
      const summary = {
        target: target.target,
        command: target.command,
        detail,
        result,
      };
      if (dryRun) {
        wouldInstall.push(summary);
      } else {
        installed.push(summary);
      }
    } catch (error) {
      const reason = safeErrorMessage(error);
      const bucket = isConflictError(reason)
        ? skippedConflict
        : isUnsupportedTargetLayoutReason(reason)
          ? skippedConflict
        : isNotDetectedError(reason)
          ? skippedNotDetected
          : failedRollback;
      bucket.push({
        target: target.target,
        command: target.command,
        reason,
        detail,
      });
    }
  }

  const output = {
    ok: failedRollback.length === 0,
    command: "install --all",
    dry_run: dryRun,
    mode: "detected-targets",
    include_experimental: includeExperimental,
    installed,
    would_install: wouldInstall,
    skipped_not_detected: skippedNotDetected,
    skipped_conflict: skippedConflict,
    failed_rollback: failedRollback,
    next: "check_all_status",
    next_command: includeExperimental
      ? "waitspin status --all --include-experimental"
      : "waitspin status --all",
    human_message:
      "Install-all is an advanced agent command. Explicit target commands remain the canonical debug path.",
  };
  printCliOutput(flags, output, formatInstallAllResult(output));
}

export async function runStatusAll(flags: Map<string, string[]>) {
  if (demoMode(flags)) {
    const output = demoStatusAllPayload();
    printCliOutput(flags, output, formatStatusAllResult(output));
    return;
  }

  const internalJsonFlags = jsonFlags(flags);
  const statuses: AllTargetSummary[] = [];
  const installed: AllTargetSummary[] = [];
  const failedStatus: AllTargetSummary[] = [];

  for (const target of allInstallTargets(flags)) {
    try {
      const result = await capturePrintedJson<unknown>(() =>
        target.status(internalJsonFlags),
      );
      const summary = {
        target: target.target,
        command: target.statusCommand,
        result,
      };
      statuses.push(summary);
      if (objectRecord(result).installed === true) {
        installed.push(summary);
      }
    } catch (error) {
      failedStatus.push({
        target: target.target,
        command: target.statusCommand,
        reason: safeErrorMessage(error),
      });
    }
  }

  const output = {
    ok: failedStatus.length === 0,
    command: "status --all",
    include_experimental: booleanFlag(flags, "include-experimental"),
    installed,
    statuses,
    failed_status: failedStatus,
  };
  printCliOutput(flags, output, formatStatusAllResult(output));
}

export async function main(argv: string[] = process.argv.slice(2)) {
  const { command, flags, positionals } = parseArgs(argv);

  if (command === "init") {
    await runInit(flags);
    return;
  }

  if (command === "bid" && positionals[0] === "create") {
    await runBidCreate(flags);
    return;
  }

  if (command === "bids" && positionals[0] === "list") {
    await runBidsList(flags);
    return;
  }

  if (command === "bid" && positionals[0] === "checkout") {
    await runBidCheckout(flags, positionals.slice(1));
    return;
  }

  if (command === "market") {
    await runMarket(flags);
    return;
  }

  if (command === "wallet" && positionals[0] === "status") {
    await runWalletStatus(flags);
    return;
  }

  if (command === "wallet" && positionals[0] === "connect") {
    await runWalletConnect(flags);
    return;
  }

  if (command === "wallet" && positionals[0] === "ledger") {
    await runWalletLedger(flags);
    return;
  }

  if (command === "wallet" && positionals[0] === "payout") {
    await runWalletPayout(flags);
    return;
  }

  if (command === "extension" && positionals[0] === "install") {
    await runExtensionInstall(flags);
    return;
  }

  if (command === "extension" && positionals[0] === "status") {
    await runExtensionStatus(flags);
    return;
  }

  if (command === "extension" && positionals[0] === "uninstall") {
    await runExtensionUninstall(flags);
    return;
  }

  if (command === "install" && booleanFlag(flags, "all")) {
    await runInstallAll(flags);
    return;
  }

  if (command === "status" && booleanFlag(flags, "all")) {
    await runStatusAll(flags);
    return;
  }

  if (command === "claude-code" && positionals[0] === "install") {
    await runClaudeCodeInstall(flags);
    return;
  }

  if (command === "claude-code" && positionals[0] === "status") {
    await runClaudeCodeStatus(flags);
    return;
  }

  if (command === "claude-code" && positionals[0] === "uninstall") {
    await runClaudeCodeUninstall(flags);
    return;
  }

  if (command === "mimocode" && positionals[0] === "install") {
    await runMiMoCodeInstall(flags);
    return;
  }

  if (command === "mimocode" && positionals[0] === "status") {
    await runMiMoCodeStatus(flags);
    return;
  }

  if (command === "mimocode" && positionals[0] === "uninstall") {
    await runMiMoCodeUninstall(flags);
    return;
  }

  if (command === "opencode" && positionals[0] === "install") {
    await runOpencodeInstall(flags);
    return;
  }

  if (command === "opencode" && positionals[0] === "status") {
    await runOpencodeStatus(flags);
    return;
  }

  if (command === "opencode" && positionals[0] === "uninstall") {
    await runOpencodeUninstall(flags);
    return;
  }

  if (command === "copilot" && positionals[0] === "install") {
    await runCopilotInstall(flags);
    return;
  }

  if (command === "copilot" && positionals[0] === "status") {
    await runCopilotStatus(flags);
    return;
  }

  if (command === "copilot" && positionals[0] === "uninstall") {
    await runCopilotUninstall(flags);
    return;
  }

  if (command === "antigravity" && positionals[0] === "install") {
    await runAntigravityInstall(flags);
    return;
  }

  if (command === "antigravity" && positionals[0] === "status") {
    await runAntigravityStatus(flags);
    return;
  }

  if (command === "antigravity" && positionals[0] === "uninstall") {
    await runAntigravityUninstall(flags);
    return;
  }

  if (command === "qoder" && positionals[0] === "install") {
    await runQoderInstall(flags);
    return;
  }

  if (command === "qoder" && positionals[0] === "status") {
    await runQoderStatus(flags);
    return;
  }

  if (command === "qoder" && positionals[0] === "uninstall") {
    await runQoderUninstall(flags);
    return;
  }

  if (isExperimentalCliTargetName(command) && positionals[0] === "install") {
    await runExperimentalCliTargetInstall(
      command as ExperimentalCliTargetName,
      flags,
      experimentalCliDeps(),
    );
    return;
  }

  if (isExperimentalCliTargetName(command) && positionals[0] === "status") {
    await runExperimentalCliTargetStatus(
      command as ExperimentalCliTargetName,
      flags,
      experimentalCliDeps(),
    );
    return;
  }

  if (isExperimentalCliTargetName(command) && positionals[0] === "uninstall") {
    await runExperimentalCliTargetUninstall(
      command as ExperimentalCliTargetName,
      flags,
      experimentalCliDeps(),
    );
    return;
  }

  usage();
}

function isDirectEntrypoint(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  const entrypointName = path.basename(process.argv[1]);
  return entrypointName === "waitspin" || /^cli\.[cm]?[jt]s$/.test(entrypointName);
}

if (isDirectEntrypoint()) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.stderr.write(usageText());
    process.exit(1);
  });
}
