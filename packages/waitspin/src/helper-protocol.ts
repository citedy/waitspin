import type { Readable, Writable } from "node:stream";
import { CANONICAL_INSTALL_TARGETS } from "./managed-install-orchestration.js";

export const HELPER_PROTOCOL_VERSION = 1 as const;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_LINE_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_PATTERN = /(?:wts_live_|wbst_)[A-Za-z0-9_-]+/g;
const MUTATING_OPERATIONS = new Set([
  "install_all",
  "repair_target",
  "repair_all",
  "uninstall_local_all",
  "deactivate_all",
  "uninstall_all",
]);
const OPERATIONS = new Set([
  "preview_install_all",
  "install_all",
  "status_all",
  "repair_target",
  "repair_all",
  "uninstall_local_all",
  "deactivate_all",
  "uninstall_all",
]);

export type HelperRequest = {
  protocol_version: 1;
  request_id: string;
  operation_id?: string;
  operation:
    | "preview_install_all"
    | "install_all"
    | "status_all"
    | "repair_target"
    | "repair_all"
    | "uninstall_local_all"
    | "deactivate_all"
    | "uninstall_all";
  compose_existing?: boolean;
  parent_credential?: string;
  api_base?: string;
  state_root?: string;
  app_runtime_root?: string;
  install_target?: string;
};

let emittedBytes = 0;

export function resetHelperOutputBudget(): void {
  emittedBytes = 0;
}

export function redactHelperText(value: unknown): string {
  return (value instanceof Error ? value.message : String(value))
    .replace(SECRET_PATTERN, "[credential]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 2_000);
}

export function emitHelperEvent(
  value: Record<string, unknown>,
  output: Pick<Writable, "write"> = process.stdout,
): void {
  const line = `${JSON.stringify(value)}\n`;
  const bytes = Buffer.byteLength(line);
  if (bytes > MAX_LINE_BYTES || emittedBytes + bytes > MAX_OUTPUT_BYTES) {
    throw new Error("Helper output limit exceeded");
  }
  emittedBytes += bytes;
  output.write(line);
}

export async function readHelperRequest(
  input: Readable = process.stdin,
): Promise<HelperRequest> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_REQUEST_BYTES) {
      throw new Error("Helper request is too large");
    }
    chunks.push(buffer);
  }
  return parseHelperRequestText(Buffer.concat(chunks).toString("utf8"));
}

export function parseHelperRequestText(raw: string): HelperRequest {
  if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) {
    throw new Error("Helper request is too large");
  }
  if (!raw.trim() || raw.trim().split(/\r?\n/).length !== 1) {
    throw new Error("Helper expects exactly one JSON request line");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Helper request is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Helper request must be an object");
  }
  const request = parsed as Record<string, unknown>;
  if (request.protocol_version !== HELPER_PROTOCOL_VERSION) {
    throw new Error("Unsupported helper protocol version");
  }
  if (
    typeof request.request_id !== "string" ||
    !UUID_PATTERN.test(request.request_id)
  ) {
    throw new Error("Invalid helper request_id");
  }
  if (
    typeof request.operation !== "string" ||
    !OPERATIONS.has(request.operation)
  ) {
    throw new Error("Unknown helper operation");
  }
  const mutating = MUTATING_OPERATIONS.has(request.operation);
  if (
    request.operation_id !== undefined &&
    (typeof request.operation_id !== "string" ||
      !UUID_PATTERN.test(request.operation_id))
  ) {
    throw new Error("Invalid helper operation_id");
  }
  if (
    mutating &&
    (typeof request.parent_credential !== "string" ||
      !request.parent_credential.startsWith("wts_live_") ||
      request.parent_credential.length > 512)
  ) {
    throw new Error("Mutating helper operation requires a parent credential");
  }
  if (!mutating && request.parent_credential !== undefined) {
    throw new Error("Read-only helper operation must not receive a credential");
  }
  if (!mutating && request.operation_id !== undefined) {
    throw new Error("Read-only helper operation must not receive an operation_id");
  }
  if (
    request.compose_existing !== undefined &&
    typeof request.compose_existing !== "boolean"
  ) {
    throw new Error("Invalid helper compose_existing value");
  }
  if (
    request.api_base !== undefined &&
    (typeof request.api_base !== "string" || !request.api_base.trim())
  ) {
    throw new Error("Invalid helper api_base");
  }
  if (
    request.state_root !== undefined &&
    (typeof request.state_root !== "string" || !request.state_root.trim())
  ) {
    throw new Error("Invalid helper state_root");
  }
  if (
    request.app_runtime_root !== undefined &&
    typeof request.app_runtime_root !== "string"
  ) {
    throw new Error("Invalid helper app_runtime_root");
  }
  if (
    request.operation === "repair_target" &&
    (typeof request.install_target !== "string" ||
      !CANONICAL_INSTALL_TARGETS.includes(request.install_target))
  ) {
    throw new Error("repair_target requires a canonical install_target");
  }
  if (
    request.operation !== "repair_target" &&
    request.install_target !== undefined
  ) {
    throw new Error("install_target is only valid for repair_target");
  }
  return request as HelperRequest;
}
