import {
  formatInitResult,
  formatInstallAllResult,
  formatStatusAllResult,
  formatTargetInstallResult,
  formatTargetStatusResult,
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

  it("summarizes install --all results as user-facing target rows", () => {
    const output = formatInstallAllResult({
      installed: [
        { target: "vscode", installed: true },
        { target: "grok", installed: true },
      ],
      skipped_conflict: [{ target: "mimocode", reason: "already_configured" }],
      failed: [],
    });

    expect(output).toContain("WaitSpin install all");
    expect(output).toContain("Installed: 2");
    expect(output).toContain("- vscode: installed");
    expect(output).toContain("- mimocode: already configured");
    expect(output).not.toContain("already_configured");
  });

  it("summarizes status --all results without requiring JSON parsing", () => {
    const output = formatStatusAllResult({
      statuses: [
        { target: "vscode", installed: true, publisher_registered: true },
        { target: "grok", installed: false, publisher_registered: false },
      ],
    });

    expect(output).toContain("WaitSpin status all");
    expect(output).toContain("- vscode: installed, publisher registered: yes");
    expect(output).toContain("- grok: not installed, publisher registered: no");
    expect(output).toContain("Raw API fields: rerun with --json.");
  });
});
