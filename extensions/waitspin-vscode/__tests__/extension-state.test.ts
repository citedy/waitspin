import { chmod, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readEditorActivationReceipt,
  resolveActivationReceiptRegistration,
  writeEditorActivationReceipt,
} from "../src/extension-state";

describe("resolveActivationReceiptRegistration", () => {
  it("does not update a receipt after SecretStorage read failure", () => {
    expect(
      resolveActivationReceiptRegistration({
        secretReadSucceeded: false,
        secretApiKey: undefined,
        installId: "wins_vscode_managed",
        receipt: {
          install_id: "wins_vscode_managed",
          publisher_target: "status-bar-fallback",
          publisher_registered: true,
        },
      }),
    ).toBeUndefined();
  });

  it("preserves an explicit failed receipt after a successful read", () => {
    expect(
      resolveActivationReceiptRegistration({
        secretReadSucceeded: true,
        secretApiKey: "wpub_secret",
        installId: "wins_vscode_managed",
        receipt: {
          install_id: "wins_vscode_managed",
          publisher_target: "status-bar-fallback",
          publisher_registered: false,
        },
      }),
    ).toBe(false);
  });
});

describe("writeEditorActivationReceipt", () => {
  it("atomically exports only the editor activation identity", async () => {
    const stateDirectory = await mkdtemp(
      path.join(os.tmpdir(), "waitspin-editor-state-"),
    );
    try {
      await writeEditorActivationReceipt(
        stateDirectory,
        "cursor",
        "wins_cursor_managed",
        true,
      );

      const receiptPath = path.join(stateDirectory, "cursor-install.json");
      expect(JSON.parse(await readFile(receiptPath, "utf8"))).toEqual({
        install_id: "wins_cursor_managed",
        publisher_target: "status-bar-fallback",
        publisher_registered: true,
      });
      if (process.platform !== "win32") {
        expect((await stat(receiptPath)).mode & 0o777).toBe(0o600);
      }
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  });

  it("rejects malformed activation install IDs", async () => {
    const stateDirectory = await mkdtemp(
      path.join(os.tmpdir(), "waitspin-editor-state-"),
    );
    try {
      await expect(
        writeEditorActivationReceipt(stateDirectory, "cursor", "bad", true),
      ).rejects.toThrow("Invalid editor activation install ID");
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  });

  it("reads a valid activation receipt", async () => {
    const stateDirectory = await mkdtemp(
      path.join(os.tmpdir(), "waitspin-editor-state-"),
    );
    try {
      await writeEditorActivationReceipt(
        stateDirectory,
        "cursor",
        "wins_cursor_managed",
        false,
      );

      await expect(readEditorActivationReceipt(stateDirectory, "cursor")).resolves.toEqual({
        install_id: "wins_cursor_managed",
        publisher_target: "status-bar-fallback",
        publisher_registered: false,
      });
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  });

  it("tightens owned state directory permissions before writing", async () => {
    if (process.platform === "win32") return;
    const stateDirectory = await mkdtemp(
      path.join(os.tmpdir(), "waitspin-editor-state-"),
    );
    try {
      await chmod(stateDirectory, 0o755);
      await writeEditorActivationReceipt(
        stateDirectory,
        "cursor",
        "wins_cursor_managed",
        true,
      );

      expect((await stat(stateDirectory)).mode & 0o777).toBe(0o700);
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  });

  it("rejects symlinked state directories", async () => {
    if (process.platform === "win32") return;
    const parentDirectory = await mkdtemp(
      path.join(os.tmpdir(), "waitspin-editor-state-"),
    );
    const realDirectory = path.join(parentDirectory, "real");
    const linkedDirectory = path.join(parentDirectory, "linked");
    try {
      await writeEditorActivationReceipt(
        realDirectory,
        "cursor",
        "wins_cursor_managed",
        true,
      );
      await symlink(realDirectory, linkedDirectory);

      await expect(
        writeEditorActivationReceipt(
          linkedDirectory,
          "cursor",
          "wins_cursor_managed",
          true,
        ),
      ).rejects.toThrow("WaitSpin state directory ownership or mode is unsafe");
    } finally {
      await rm(parentDirectory, { recursive: true, force: true });
    }
  });
});
