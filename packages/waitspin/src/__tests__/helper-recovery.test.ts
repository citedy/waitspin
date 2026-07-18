import {
  resolveBootstrapBinding,
  resolveInstallJournalPhase,
  resolveInstallTargetPlan,
  resolveRepairTargetPlan,
  shouldUseRecoveryPlan,
} from "../helper-recovery";

describe("WaitSpin helper recovery planning", () => {
  it("adopts a higher server-authoritative bootstrap generation", () => {
    expect(
      resolveBootstrapBinding({
        target: "vscode",
        publisherTarget: "status-bar-fallback",
        installId: "wins_vscode_test",
        requestedGeneration: 4,
        response: {
          install_id: "wins_vscode_test",
          install_target: "vscode",
          publisher_target: "status-bar-fallback",
          generation: 8,
        },
      }),
    ).toEqual({ installId: "wins_vscode_test", generation: 8 });
  });

  it("rejects bootstrap responses that diverge from the requested binding", () => {
    const base = {
      target: "vscode",
      publisherTarget: "status-bar-fallback",
      installId: "wins_vscode_test",
      requestedGeneration: 4,
    };
    expect(() =>
      resolveBootstrapBinding({
        ...base,
        response: {
          install_id: "wins_other",
          install_target: "vscode",
          publisher_target: "status-bar-fallback",
          generation: 8,
        },
      }),
    ).toThrow("binding mismatch");
    expect(() =>
      resolveBootstrapBinding({
        ...base,
        response: {
          install_id: "wins_vscode_test",
          install_target: "vscode",
          publisher_target: "status-bar-fallback",
          generation: 3,
        },
      }),
    ).toThrow("generation is stale");
  });

  it("keeps journals partial while a requested target has an unresolved failure", () => {
    for (const state of ["conflict", "failed_rollback"] as const) {
      expect(
        resolveInstallJournalPhase({
          aggregateOk: true,
          skippedConflictCount: 0,
          skippedManagedTargetCount: 0,
          requestedTargetStates: ["ready", state],
        }),
      ).toBe("partial");
    }
    expect(
      resolveInstallJournalPhase({
        aggregateOk: true,
        skippedConflictCount: 0,
        skippedManagedTargetCount: 0,
        requestedTargetStates: [
          "ready",
          "installed_credential_pending_activation",
        ],
      }),
    ).toBe("complete");
    expect(
      resolveInstallJournalPhase({
        aggregateOk: true,
        skippedConflictCount: 0,
        skippedManagedTargetCount: 1,
        requestedTargetStates: ["installed_credential_pending_activation"],
      }),
    ).toBe("partial");
  });

  it("preserves conflict and rollback outcomes during automatic replay", () => {
    for (const state of ["conflict", "failed_rollback"] as const) {
      expect(
        resolveInstallTargetPlan({
          fallbackInstallId: "wins_fallback_test",
          previous: {
            install_id: "wins_vscode_test",
            generation: 4,
            state,
            updated_at: "2026-07-14T00:00:00.000Z",
          },
          replayingOperation: true,
        }),
      ).toEqual({
        action: "preserve",
        installId: "wins_vscode_test",
        generation: 4,
        state,
      });
    }
  });

  it("routes pending editor replay through recovery without touching ready CLI replay", () => {
    expect(
      shouldUseRecoveryPlan({
        operation: "install_all",
        replayingInstallOperation: true,
        target: "vscode",
        previousState: "installed_credential_pending_activation",
      }),
    ).toBe(true);
    expect(
      shouldUseRecoveryPlan({
        operation: "install_all",
        replayingInstallOperation: true,
        target: "claude-code",
        previousState: "ready",
      }),
    ).toBe(false);
    expect(
      shouldUseRecoveryPlan({
        operation: "repair_all",
        replayingInstallOperation: false,
        target: "cursor",
        previousState: "installed_credential_pending_activation",
      }),
    ).toBe(true);
  });

  it("refreshes only expired editor bootstraps from a completed journal", () => {
    const now = Date.parse("2026-07-14T12:00:00.000Z");
    const journal = {
      phase: "complete",
      targets: {
        vscode: {
          install_id: "wins_vscode_test",
          generation: 4,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-14T11:40:00.000Z",
        },
        cursor: {
          install_id: "wins_cursor_test",
          generation: 6,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-14T11:59:00.000Z",
        },
        "claude-code": {
          install_id: "wins_claude_test",
          generation: 2,
          state: "ready",
          updated_at: "2026-07-14T11:30:00.000Z",
        },
      },
    };
    expect(journal.phase).toBe("complete");

    const expiredEditor = resolveRepairTargetPlan({
      target: "vscode",
      fallbackInstallId: "wins_fallback",
      previous: journal.targets.vscode,
      localStatus: {
        installed: true,
        publisher_registered: false,
        install_id: "wins_vscode_test",
      },
      inventory: {
        installations: [
          {
            install_id: "wins_vscode_test",
            install_target: "vscode",
            generation: 4,
            status: "installed_credential_pending_activation",
            confirmation_expires_at: "2026-07-14T11:50:00.000Z",
          },
        ],
      },
      editorBootstrapGeneration: 4,
      now,
    });
    const validEditor = resolveRepairTargetPlan({
      target: "cursor",
      fallbackInstallId: "wins_fallback",
      previous: journal.targets.cursor,
      localStatus: {
        installed: true,
        publisher_registered: false,
        publisher_registration_managed_by: "editor-extension",
        install_id: null,
      },
      inventory: {
        installations: [
          {
            install_id: "wins_cursor_test",
            install_target: "cursor",
            generation: 6,
            status: "installed_credential_pending_activation",
            confirmation_expires_at: "2026-07-14T12:09:00.000Z",
          },
        ],
      },
      editorBootstrapGeneration: 6,
      now,
    });
    const readyCli = resolveRepairTargetPlan({
      target: "claude-code",
      fallbackInstallId: "wins_fallback",
      previous: journal.targets["claude-code"],
      localStatus: {
        installed: true,
        publisher_registered: true,
        install_id: "wins_claude_test",
      },
      inventory: {
        installations: [
          {
            install_id: "wins_claude_test",
            install_target: "claude-code",
            generation: 2,
            status: "ready",
          },
        ],
      },
      now,
    });

    expect(expiredEditor).toEqual({
      action: "bootstrap",
      installId: "wins_vscode_test",
      generation: 5,
    });
    expect(validEditor).toEqual({
      action: "reuse",
      installId: "wins_cursor_test",
      generation: 6,
      state: "installed_credential_pending_activation",
    });
    expect(readyCli).toEqual({
      action: "adopt_ready",
      installId: "wins_claude_test",
      generation: 2,
    });
  });

  it("refreshes a missing editor descriptor while preserving its install ID", () => {
    expect(
      resolveRepairTargetPlan({
        target: "devin",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_devin_test",
          generation: 8,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-14T11:59:00.000Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: false,
          publisher_registration_managed_by: "editor-extension",
          install_id: null,
        },
        inventory: {
          installations: [
            {
              install_id: "wins_devin_test",
              install_target: "devin",
              generation: 8,
              status: "installed_credential_pending_activation",
              confirmation_expires_at: "2026-07-14T12:09:00.000Z",
            },
          ],
        },
        editorBootstrapGeneration: undefined,
        now: Date.parse("2026-07-14T12:00:00.000Z"),
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_devin_test",
      generation: 9,
    });
  });

  it("refreshes a stale descriptor generation while server confirmation is valid", () => {
    expect(
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_vscode_test",
          generation: 8,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-14T11:59:00.000Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: false,
          install_id: "wins_vscode_test",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_vscode_test",
              install_target: "vscode",
              generation: 8,
              status: "installed_credential_pending_activation",
              confirmation_expires_at: "2026-07-14T12:09:00.000Z",
            },
          ],
        },
        editorBootstrapGeneration: 7,
        now: Date.parse("2026-07-14T12:00:00.000Z"),
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_vscode_test",
      generation: 9,
    });
  });

  it("replaces a failed editor install ID when it is absent from the current account inventory", () => {
    expect(
      resolveRepairTargetPlan({
        target: "cursor",
        fallbackInstallId: "wins_fresh_cursor",
        previous: {
          install_id: "wins_foreign_cursor",
          generation: 9,
          state: "failed_rollback",
          updated_at: "2026-07-14T13:23:39.760Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: true,
          install_id: "wins_foreign_cursor",
        },
        inventory: {
          installations: [],
        },
        editorBootstrapGeneration: undefined,
        now: Date.parse("2026-07-14T13:30:00.000Z"),
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_fresh_cursor",
      generation: 1,
    });
  });

  it("refreshes a server-ready editor when its bootstrap descriptor was never consumed", () => {
    expect(
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_vscode_test",
          generation: 8,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-14T01:14:00.000Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: true,
          publisher_registration_managed_by: "editor-extension",
          install_id: "wins_vscode_test",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_vscode_test",
              install_target: "vscode",
              generation: 8,
              status: "ready",
            },
          ],
        },
        editorBootstrapGeneration: 8,
        now: Date.parse("2026-07-14T12:00:00.000Z"),
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_vscode_test",
      generation: 9,
    });
  });

  it("moves a cross-account editor repair onto a fresh bootstrap install id", () => {
    expect(
      resolveRepairTargetPlan({
        target: "cursor",
        fallbackInstallId: "wins_cursor_new",
        previous: {
          install_id: "wins_cursor_old",
          generation: 3,
          state: "ready",
          updated_at: "2026-07-14T01:14:00.000Z",
        },
        localStatus: {
          installed: true,
          install_id: "wins_cursor_old",
          publisher_registered: true,
          publisher_registration_managed_by: "editor-extension",
        },
        inventory: {
          installations: [],
        },
        editorBootstrapGeneration: undefined,
        now: Date.parse("2026-07-14T12:00:00.000Z"),
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_cursor_new",
      generation: 1,
    });
  });

  it("refreshes a failed editor even when its receipt and server row are ready", () => {
    expect(
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_vscode_test",
          generation: 7,
          state: "failed_rollback",
          updated_at: "2026-07-14T13:23:39.760Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: true,
          publisher_registration_managed_by: "editor-extension",
          install_id: null,
        },
        inventory: {
          installations: [
            {
              install_id: "wins_vscode_test",
              install_target: "vscode",
              generation: 7,
              status: "ready",
            },
          ],
        },
        editorBootstrapGeneration: 7,
        now: Date.parse("2026-07-14T14:00:00.000Z"),
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_vscode_test",
      generation: 8,
    });
  });

  it("refreshes a pending editor when server ready cannot prove its local wallet key", () => {
    expect(
      resolveRepairTargetPlan({
        target: "devin",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_devin_test",
          generation: 4,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-14T13:23:39.760Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: true,
          publisher_registration_managed_by: "editor-extension",
          install_id: null,
        },
        inventory: {
          installations: [
            {
              install_id: "wins_devin_test",
              install_target: "devin",
              generation: 4,
              status: "ready",
            },
          ],
        },
        editorBootstrapGeneration: undefined,
        now: Date.parse("2026-07-14T14:00:00.000Z"),
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_devin_test",
      generation: 5,
    });
  });

  it("adopts a server-ready editor after its matching managed activation receipt is written", () => {
    expect(
      resolveRepairTargetPlan({
        target: "cursor",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_cursor_test",
          generation: 4,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-14T13:23:39.760Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: false,
          publisher_registration_managed_by: "editor-extension",
          install_id: "wins_cursor_test",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_cursor_test",
              install_target: "cursor",
              generation: 4,
              status: "ready",
            },
          ],
        },
        editorBootstrapGeneration: undefined,
        now: Date.parse("2026-07-14T14:00:00.000Z"),
      }),
    ).toEqual({
      action: "adopt_ready",
      installId: "wins_cursor_test",
      generation: 4,
    });
  });

  it("refreshes an expired editor bootstrap after rollback failure", () => {
    expect(
      resolveRepairTargetPlan({
        target: "cursor",
        fallbackInstallId: "wins_cursor_fallback",
        previous: {
          install_id: "wins_cursor_test",
          generation: 9,
          state: "failed_rollback",
          updated_at: "2026-07-14T13:23:39.760Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: true,
          publisher_registration_managed_by: "editor-extension",
          install_id: null,
        },
        inventory: {
          installations: [
            {
              install_id: "wins_cursor_test",
              install_target: "cursor",
              generation: 9,
              status: "installed_credential_pending_activation",
              confirmation_expires_at: "2026-07-14T01:14:25.148Z",
            },
          ],
        },
        editorBootstrapGeneration: 9,
        now: Date.parse("2026-07-14T13:30:00.000Z"),
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_cursor_test",
      generation: 10,
    });
  });
});
