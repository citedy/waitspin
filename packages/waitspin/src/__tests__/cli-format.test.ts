import {
  formatInitResult,
  formatInstallAllResult,
  formatStatusAllResult,
  formatTargetInstallResult,
  formatTargetStatusResult,
  formatTargetUninstallResult,
} from "../cli-format";

describe("WaitSpin CLI human-readable formatters", () => {
  it("masks init API keys in human-readable output", () => {
    const output = formatInitResult({
      api_key: "wts_live_secret_key_123456",
      account_id: "wacct_test",
      base_url: "https://api.waitspin.com",
      scopes: ["market:read"],
    });

    expect(output).toContain("WaitSpin API key active");
    expect(output).toContain("API key: wts_...3456");
    expect(output).not.toContain("wts_live_secret_key_123456");
  });

  it("formats a target install result without exposing raw JSON keys", () => {
    const output = formatTargetInstallResult({
      target: "grok",
      mode: "managed-tui-footer-patch",
      install_id: "wins_test",
      publisher_registered: true,
      state_path: "/tmp/waitspin-state.json",
      runtime_path: "/tmp/waitspin-runtime.mjs",
      next_command: "waitspin grok status",
    });

    expect(output).toContain("WaitSpin grok install");
    expect(output).toContain("Install ID: wins_test");
    expect(output).toContain("Publisher registered: yes");
    expect(output).toContain("Next: waitspin grok status");
    expect(output).not.toContain("publisher_registered");
  });

  it("formats a target status result with a clear next action", () => {
    const output = formatTargetStatusResult({
      target: "grok",
      mode: "managed-tui-footer-patch",
      installed: false,
      publisher_registered: false,
      install_id: null,
      next_command: "waitspin grok install",
    });

    expect(output).toContain("WaitSpin grok status");
    expect(output).toContain("Status: not installed");
    expect(output).toContain("Publisher registered: no");
    expect(output).toContain("Next: waitspin grok install");
    expect(output).not.toContain('"installed"');
  });

  it("does not claim editor-managed publisher registration is false", () => {
    const output = formatTargetStatusResult({
      target: "cursor",
      mode: "status-bar-fallback",
      installed: true,
      publisher_registration_managed_by: "editor-extension",
      next_command: "WaitSpin: Connect and earn inside Cursor",
    });

    expect(output).toContain(
      "Publisher registration: managed in editor (not inspected)",
    );
    expect(output).not.toContain("Publisher registered: no");
    expect(output).toContain("Next: WaitSpin: Connect and earn inside Cursor");
  });

  it("describes every planned editor install detail in a human dry-run", () => {
    const output = formatTargetInstallResult({
      target: "cursor",
      mode: "status-bar-fallback",
      dry_run: true,
      editor_binary: "cursor",
      registry: "VS Code Marketplace",
      extension: "waitspin.waitspin-vscode",
      publisher_target: "status-bar-fallback",
      version: "0.1.6",
      planned_argv: [
        "cursor",
        "--install-extension",
        "waitspin.waitspin-vscode",
        "--force",
      ],
      publisher_registration_managed_by: "editor-extension",
      next_command: "WaitSpin: Connect and earn inside Cursor",
    });

    expect(output).toContain("WaitSpin cursor install dry run");
    expect(output).toContain("Editor binary: cursor");
    expect(output).toContain("Registry: VS Code Marketplace");
    expect(output).toContain("Extension: waitspin.waitspin-vscode");
    expect(output).toContain("Server target: status-bar-fallback");
    expect(output).toContain("Current version: 0.1.6");
    expect(output).toContain(
      "Planned argv: cursor --install-extension waitspin.waitspin-vscode --force",
    );
    expect(output).not.toContain("Install ID: not created");
    expect(output).not.toContain("State: not written");
  });

  it("describes an editor uninstall dry-run as an extension operation", () => {
    const output = formatTargetUninstallResult({
      target: "devin",
      dry_run: true,
      would_remove_extension: "waitspin.waitspin-vscode",
      planned_argv: [
        "devin-desktop",
        "--uninstall-extension",
        "waitspin.waitspin-vscode",
      ],
    });

    expect(output).toContain("WaitSpin devin uninstall dry run");
    expect(output).toContain(
      "Would remove extension: waitspin.waitspin-vscode",
    );
    expect(output).toContain(
      "Planned argv: devin-desktop --uninstall-extension waitspin.waitspin-vscode",
    );
    expect(output).not.toContain("Would remove: 0 path(s)");
    expect(output).not.toContain("Uninstalled: no");
  });

  it("explains that an editor uninstall dry-run cannot detect the editor", () => {
    const output = formatTargetUninstallResult({
      target: "devin",
      dry_run: true,
      detected: false,
      detection_error: "Devin Desktop was not detected.",
      publisher_target: "status-bar-fallback",
    });

    expect(output).toContain(
      "Editor not detected: Devin Desktop was not detected.",
    );
    expect(output).not.toContain("Would remove: 0 path(s)");
    expect(output).not.toContain("Uninstalled: no");
  });

  it("explains that a detected editor has no extension to uninstall", () => {
    const output = formatTargetUninstallResult({
      target: "cursor",
      dry_run: true,
      detected: true,
      installed: false,
      extension: "waitspin.waitspin-vscode",
      publisher_target: "status-bar-fallback",
    });

    expect(output).toContain(
      "Extension not installed: waitspin.waitspin-vscode",
    );
    expect(output).not.toContain("Would remove: 0 path(s)");
    expect(output).not.toContain("Uninstalled: no");
  });

  it("summarizes install --all results as user-facing target rows", () => {
    const output = formatInstallAllResult({
      installed: [
        { target: "vscode", installed: true },
        { target: "grok", installed: true },
      ],
      skipped_not_detected: [
        { target: "devin", reason: "Devin Desktop was not detected" },
      ],
      skipped_conflict: [{ target: "mimocode", reason: "already_configured" }],
      failed: [],
    });

    expect(output).toContain("WaitSpin install all");
    expect(output).toContain("Installed: 2");
    expect(output).toContain("- vscode: installed");
    expect(output).toContain("- mimocode: already configured");
    expect(output).toContain("Skipped, not detected targets:");
    expect(output).toContain("- devin: Devin Desktop was not detected");
    expect(output).not.toContain("already_configured");
  });

  it("summarizes status --all results without requiring JSON parsing", () => {
    const output = formatStatusAllResult({
      statuses: [
        { target: "vscode", installed: true, publisher_registered: true },
        {
          target: "cursor",
          installed: true,
          publisher_registration_managed_by: "editor-extension",
        },
        { target: "grok", installed: false, publisher_registered: false },
      ],
    });

    expect(output).toContain("WaitSpin status all");
    expect(output).toContain("- vscode: installed, publisher registered: yes");
    expect(output).toContain(
      "- cursor: installed, publisher registration: managed in editor (not inspected)",
    );
    expect(output).toContain("- grok: not installed, publisher registered: no");
    expect(output).toContain("Raw API fields: rerun with --json.");
  });
});
