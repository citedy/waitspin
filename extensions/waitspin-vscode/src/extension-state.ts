import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  VSCODE_PUBLISHER_TARGET,
  type EditorInstallTarget,
} from "./extension-core";

const INSTALL_ID_PATTERN = /^wins_[A-Za-z0-9._-]{3,123}$/;

export type EditorActivationReceipt = {
  install_id: string;
  publisher_target: typeof VSCODE_PUBLISHER_TARGET;
  publisher_registered: boolean;
};

export function resolveActivationReceiptRegistration(input: {
  secretReadSucceeded: boolean;
  secretApiKey: string | undefined;
  installId: string;
  receipt: EditorActivationReceipt | undefined;
}): boolean | undefined {
  if (!input.secretReadSucceeded) return undefined;
  if (
    input.receipt?.install_id === input.installId &&
    input.receipt.publisher_registered === false
  ) {
    return false;
  }
  return Boolean(input.secretApiKey);
}

export async function readEditorActivationReceipt(
  stateDirectory: string,
  target: EditorInstallTarget,
): Promise<EditorActivationReceipt | undefined> {
  const receiptPath = path.join(stateDirectory, `${target}-install.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(receiptPath, "utf8"));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const receipt = parsed as Record<string, unknown>;
  if (
    typeof receipt.install_id !== "string" ||
    !INSTALL_ID_PATTERN.test(receipt.install_id) ||
    receipt.publisher_target !== VSCODE_PUBLISHER_TARGET ||
    typeof receipt.publisher_registered !== "boolean"
  ) {
    return undefined;
  }
  return {
    install_id: receipt.install_id,
    publisher_target: VSCODE_PUBLISHER_TARGET,
    publisher_registered: receipt.publisher_registered,
  };
}

export async function writeEditorActivationReceipt(
  stateDirectory: string,
  target: EditorInstallTarget,
  installId: string,
  publisherRegistered: boolean,
): Promise<void> {
  if (!INSTALL_ID_PATTERN.test(installId)) {
    throw new Error("Invalid editor activation install ID");
  }
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  let directoryInfo = await lstat(stateDirectory);
  const uid = process.getuid?.();
  if (
    !directoryInfo.isDirectory() ||
    directoryInfo.isSymbolicLink() ||
    (uid !== undefined && directoryInfo.uid !== uid)
  ) {
    throw new Error("WaitSpin state directory ownership or mode is unsafe");
  }
  if (process.platform !== "win32" && (directoryInfo.mode & 0o077) !== 0) {
    await chmod(stateDirectory, 0o700);
    directoryInfo = await lstat(stateDirectory);
    if ((directoryInfo.mode & 0o077) !== 0) {
      throw new Error("WaitSpin state directory ownership or mode is unsafe");
    }
  }

  const receiptPath = path.join(stateDirectory, `${target}-install.json`);
  const temporaryPath = path.join(
    stateDirectory,
    `.${target}-install-${randomUUID()}.tmp`,
  );
  let temporaryExists = false;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(
        {
          install_id: installId,
          publisher_target: VSCODE_PUBLISHER_TARGET,
          publisher_registered: publisherRegistered,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    temporaryExists = true;
    await rename(temporaryPath, receiptPath);
    temporaryExists = false;
  } finally {
    if (temporaryExists) await unlink(temporaryPath).catch(() => undefined);
  }
}
