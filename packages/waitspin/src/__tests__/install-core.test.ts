import {
  runInstallTargets,
  runStatusTargets,
  runUninstallTargets,
  type InstallTarget,
} from "../install-core";

function target(overrides: Partial<InstallTarget> = {}): InstallTarget {
  return {
    target: "test",
    publisherTarget: "test",
    displayName: "Test target",
    command: "install",
    statusCommand: "status",
    uninstallCommand: "uninstall",
    preflight: async () => null,
    install: async () => ({ ok: true }),
    status: async () => ({ installed: true }),
    uninstall: async () => ({ ok: true, uninstalled: true }),
    ...overrides,
  };
}

describe("WaitSpin install core terminal state", () => {
  it("reports target_started before target_result for a selected target", async () => {
    const events: string[] = [];

    await runInstallTargets([target({ target: "vscode" })], {
      dryRun: false,
      redactError: (error) => String(error),
      onTargetStarted: (summary, index, total) =>
        events.push(`started:${summary.target}:${index}/${total}`),
      onTargetResult: (summary, state) =>
        events.push(`result:${summary.target}:${state}`),
    });

    expect(events).toEqual([
      "started:vscode:1/1",
      "result:vscode:ready",
    ]);
  });

  it("marks every cancelled aggregate unsuccessful", async () => {
    const cancelled = () => true;
    const redactError = (error: unknown) => String(error);

    await expect(
      runInstallTargets([target()], { dryRun: false, redactError, cancelled }),
    ).resolves.toMatchObject({ ok: false, cancelled: true, installed: [] });
    await expect(
      runStatusTargets([target()], { redactError, cancelled }),
    ).resolves.toMatchObject({ ok: false, cancelled: true, statuses: [] });
    await expect(
      runUninstallTargets([target()], { redactError, cancelled }),
    ).resolves.toMatchObject({ ok: false, cancelled: true, removed: [] });
  });

  it("surfaces structured uninstall refusal as failed rollback", async () => {
    const result = await runUninstallTargets(
      [
        target({
          uninstall: async () => ({
            ok: false,
            uninstalled: false,
            restore_refused: true,
            human_message: "Safe restore was refused.",
          }),
        }),
      ],
      { redactError: (error) => String(error) },
    );

    expect(result).toMatchObject({ ok: false, cancelled: false, removed: [] });
    expect(result.failed_rollback).toHaveLength(1);
    expect(result.failed_rollback[0]?.reason).toBe("Safe restore was refused.");
  });

  it("classifies a structured conflict without parsing its display message", async () => {
    const result = await runInstallTargets(
      [
        target({
          install: async () => ({
            would_fail: true,
            failure_kind: "conflict",
            human_message: "Manual review is required.",
          }),
        }),
      ],
      { dryRun: false, redactError: (error) => String(error) },
    );

    expect(result).toMatchObject({ ok: true, cancelled: false });
    expect(result.skipped_conflict).toHaveLength(1);
    expect(result.failed_rollback).toHaveLength(0);
  });
});
