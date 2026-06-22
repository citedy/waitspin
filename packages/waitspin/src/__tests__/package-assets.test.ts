/** @jest-environment node */

import { readFile } from "node:fs/promises";
import path from "node:path";

describe("waitspin package assets", () => {
  const repoRoot = process.cwd();

  it("keeps the packaged VS Code extension source synced with the canonical source", async () => {
    for (const file of [
      "extension.ts",
      "extension-core.ts",
      "extension-onboarding.ts",
      "extension-surfaces.ts",
      "extension-wallet.ts",
    ]) {
      const [canonical, packaged] = await Promise.all([
        readFile(
          path.join(repoRoot, "extensions/waitspin-vscode/src", file),
          "utf8",
        ),
        readFile(
          path.join(
            repoRoot,
            "packages/waitspin/assets/waitspin-vscode/src",
            file,
          ),
          "utf8",
        ),
      ]);

      expect(packaged).toBe(canonical);
    }
  });

  it("publishes only curated runtime extension assets", async () => {
    const packageJson = JSON.parse(
      await readFile(
        path.join(repoRoot, "packages/waitspin/package.json"),
        "utf8",
      ),
    ) as { files: string[] };

    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        "dist",
        "assets/waitspin-vscode/package.json",
        "assets/waitspin-vscode/media",
        "assets/waitspin-vscode/out",
        "assets/waitspin-mimocode",
        "assets/waitspin-opencode/opencode-statusline.mjs",
        "assets/waitspin-opencode/waitspin-opencode.plugin.tsx",
        "README.md",
      ]),
    );
    expect(packageJson.files).not.toContain("assets");
  });

  it("keeps npm metadata scoped to verified user targets", async () => {
    const packageJson = JSON.parse(
      await readFile(
        path.join(repoRoot, "packages/waitspin/package.json"),
        "utf8",
      ),
    ) as {
      description: string;
      homepage?: string;
      repository?: { url?: string; directory?: string };
      bugs?: { url?: string };
      keywords: string[];
    };

    expect(packageJson.description).toContain("VS Code");
    expect(packageJson.description).toContain("Claude Code");
    expect(packageJson.description).toContain("MiMo Code");
    expect(packageJson.description).toContain("OpenCode");
    expect(packageJson.description).toContain("Grok Code CLI");
    expect(packageJson.homepage).toBe("https://waitspin.com");
    expect(packageJson.repository?.url).toBe(
      "git+https://github.com/citedy/waitspin.git",
    );
    expect(packageJson.repository?.directory).toBe("packages/waitspin");
    expect(packageJson.bugs?.url).toBe(
      "https://github.com/citedy/waitspin/issues",
    );
    expect(packageJson.keywords).toContain("vscode");
    expect(packageJson.keywords).toContain("claude-code");
    expect(packageJson.keywords).toContain("mimocode");
    expect(packageJson.keywords).toContain("opencode");
    expect(packageJson.keywords).toContain("grok");
    expect(packageJson.keywords).not.toContain("codex");
  });

  it("keeps OpenCode packaged surfaces hardened against terminal controls", async () => {
    const [pluginSource, statuslineSource] = await Promise.all([
      readFile(
        path.join(
          repoRoot,
          "packages/waitspin/assets/waitspin-opencode/waitspin-opencode.plugin.tsx",
        ),
        "utf8",
      ),
      readFile(
        path.join(
          repoRoot,
          "packages/waitspin/assets/waitspin-opencode/opencode-statusline.mjs",
        ),
        "utf8",
      ),
    ]);

    for (const source of [pluginSource, statuslineSource]) {
      expect(source).toContain("\\u001B\\[");
      expect(source).toContain("\\u007F-\\u009F");
    }
    expect(pluginSource).toContain('parsed.protocol !== "https:"');
    expect(pluginSource).toContain("rawHostname(url)");
    expect(pluginSource).toContain("0x[0-9a-f]");
    expect(pluginSource).toContain("127\\.");
    expect(pluginSource).toContain("169\\.254\\.");
    expect(pluginSource).toContain('host.startsWith("::ffff:")');
    expect(pluginSource).toContain("__WAITSPIN_STATE_PATH__");
    expect(pluginSource).not.toContain("__WAITSPIN_API_KEY__");
    expect(pluginSource).not.toContain("globalThis");
  });

  it("keeps packaged extension metadata aligned with the first-class VS Code plugin", async () => {
    const manifest = JSON.parse(
      await readFile(
        path.join(
          repoRoot,
          "packages/waitspin/assets/waitspin-vscode/package.json",
        ),
        "utf8",
      ),
    ) as {
      publisher: string;
      description: string;
      repository: { url?: string; directory?: string };
      contributes: {
        commands: Array<{ command: string }>;
        configuration: { properties: Record<string, unknown> };
        views: Record<string, Array<{ id: string; type?: string }>>;
        viewsContainers: { activitybar: Array<{ id: string; icon: string }> };
      };
    };
    const apiKeySetting = manifest.contributes.configuration.properties[
      "waitspin.apiKey"
    ] as { description?: string } | undefined;

    expect(manifest.publisher).toBe("waitspin");
    expect(manifest.description).toContain("Earn from VS Code wait states");
    expect(manifest.description).toContain("ledger visibility");
    expect(manifest.repository.url).toBe("https://github.com/citedy/waitspin.git");
    expect(manifest.repository.directory).toBe("extensions/waitspin-vscode");
    expect(manifest.description).not.toMatch(/Claude|Codex|patch/i);
    expect(manifest.contributes.viewsContainers.activitybar).toEqual([
      expect.objectContaining({
        id: "waitspin",
        icon: "media/waitspin-activitybar.svg",
      }),
    ]);
    expect(manifest.contributes.views.waitspin).toEqual([
      expect.objectContaining({
        id: "waitspin.publisherView",
        type: "webview",
      }),
    ]);
    expect(manifest.contributes.commands.map((command) => command.command)).toEqual(
      expect.arrayContaining([
        "waitspin.refreshWallet",
        "waitspin.connectPublisher",
        "waitspin.openDocs",
        "waitspin.openMarket",
        "waitspin.openCliInstallHelp",
      ]),
    );
    expect(manifest.contributes.configuration.properties).not.toHaveProperty(
      "waitspin.useSpinnerPatch",
    );
    expect(apiKeySetting?.description).toContain("SecretStorage only");
    expect(apiKeySetting?.description).not.toMatch(/WAITSPIN_API_KEY|env/i);
  });

  it("keeps extension runtime credentials out of VS Code settings", async () => {
    const source = await readFile(
      path.join(repoRoot, "extensions/waitspin-vscode/src/extension.ts"),
      "utf8",
    );
    const resolveApiKeyBody = source.match(
      /function resolveApiKey\(\): string \| undefined \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(resolveApiKeyBody).toBeDefined();
    expect(resolveApiKeyBody).not.toContain("readGlobalWaitSpinSetting");
    expect(resolveApiKeyBody).not.toContain("process.env.WAITSPIN_API_KEY");
    expect(source).not.toContain("secretApiKey = fromConfig;\n    warnCredentialStorageFailure");
    expect(source).not.toContain("WAITSPIN_API_KEY remains env-only");
    expect(source).not.toMatch(/workspace\.(textDocuments|workspaceFolders|fs)/);
    expect(source).not.toContain("activeTextEditor");
    expect(source).not.toContain("Terminal.shellIntegration");
    expect(source).toContain("vscode.window.state.focused");
    expect(source).toContain("onDidChangeWindowState");
    expect(source).toContain("visibleStartedAt");
    expect(source).toContain("hasImpressionVisibilityEvidence");
    expect(source).toContain("shouldKeepActiveServeBeforeNextFetch");
    expect(source).toContain("if (shouldKeepActiveServeBeforeNextFetch())");
  });

  it("does not expose dev verification codes in VS Code onboarding", async () => {
    const source = await readFile(
      path.join(repoRoot, "extensions/waitspin-vscode/src/extension-onboarding.ts"),
      "utf8",
    );

    expect(source).not.toContain("verification_debug_code");
    expect(source).not.toContain("debugCode");
  });
});
