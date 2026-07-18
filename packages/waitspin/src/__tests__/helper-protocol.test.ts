import {
  createTargetEvent,
  createTargetStartedEvent,
  createStatusTargetEvent,
  parseHelperRequestText,
  redactHelperText,
  resolveInstallTargetPlan,
  resolveRepairTargetPlan,
  selectHelperTargets,
} from "../helper";

const REQUEST_ID = "12345678-1234-4234-9234-123456789abc";
const REQUIRED_CONTEXT = {
  api_base: "https://api.waitspin.com",
  state_root: "/Users/test/.waitspin",
};

describe("WaitSpin macOS helper protocol", () => {
  it("keeps released protocol-v1 requests compatible while accepting explicit isolation context", () => {
    const request = {
      protocol_version: 1,
      request_id: REQUEST_ID,
      operation: "status_all",
      ...REQUIRED_CONTEXT,
    };
    expect(parseHelperRequestText(JSON.stringify(request))).toMatchObject(
      REQUIRED_CONTEXT,
    );
    expect(
      parseHelperRequestText(
        JSON.stringify({
          protocol_version: 1,
          request_id: REQUEST_ID,
          operation: "preview_install_all",
          compose_existing: true,
        }),
      ),
    ).toMatchObject({
      protocol_version: 1,
      operation: "preview_install_all",
      compose_existing: true,
    });
    expect(() =>
      parseHelperRequestText(JSON.stringify({ ...request, api_base: "" })),
    ).toThrow("Invalid helper api_base");
    expect(() =>
      parseHelperRequestText(JSON.stringify({ ...request, state_root: "" })),
    ).toThrow("Invalid helper state_root");
  });

  it("replays one install operation without rotating target generations", () => {
    const previous = {
      install_id: "wins_vscode_test",
      generation: 4,
      state: "ready",
      updated_at: "2026-07-14T00:00:00.000Z",
    };

    expect(
      resolveInstallTargetPlan({
        fallbackInstallId: "wins_fallback_test",
        previous,
        replayingOperation: true,
      }),
    ).toEqual({
      action: "reuse",
      installId: previous.install_id,
      generation: previous.generation,
      state: "ready",
    });
    expect(
      resolveInstallTargetPlan({
        fallbackInstallId: "wins_fallback_test",
        previous: { ...previous, state: "bootstrap_issued" },
        replayingOperation: true,
      }),
    ).toEqual({
      action: "bootstrap",
      installId: previous.install_id,
      generation: previous.generation,
    });
    expect(
      resolveInstallTargetPlan({
        fallbackInstallId: "wins_fallback_test",
        previous,
        replayingOperation: false,
      }),
    ).toEqual({
      action: "bootstrap",
      installId: previous.install_id,
      generation: previous.generation + 1,
    });
  });

  it("accepts the single canonical preview encoding without a credential", () => {
    expect(
      parseHelperRequestText(
        JSON.stringify({
          protocol_version: 1,
          request_id: REQUEST_ID,
          operation: "preview_install_all",
          compose_existing: true,
          ...REQUIRED_CONTEXT,
        }),
      ),
    ).toMatchObject({
      protocol_version: 1,
      operation: "preview_install_all",
      compose_existing: true,
    });
  });

  it("requires stdin-only parent credentials only for mutations", () => {
    expect(() =>
      parseHelperRequestText(
        JSON.stringify({
          protocol_version: 1,
          request_id: REQUEST_ID,
          operation: "install_all",
          ...REQUIRED_CONTEXT,
        }),
      ),
    ).toThrow("requires a parent credential");
    expect(() =>
      parseHelperRequestText(
        JSON.stringify({
          protocol_version: 1,
          request_id: REQUEST_ID,
          operation: "status_all",
          parent_credential: "wts_live_forbidden",
          ...REQUIRED_CONTEXT,
        }),
      ),
    ).toThrow("must not receive a credential");
  });

  it("accepts a durable mutation operation id and rejects it for reads", () => {
    expect(
      parseHelperRequestText(
        JSON.stringify({
          protocol_version: 1,
          request_id: REQUEST_ID,
          operation_id: "00000000-0000-4000-8000-000000000007",
          operation: "install_all",
          parent_credential: "wts_live_parent_secret",
          ...REQUIRED_CONTEXT,
        }),
      ),
    ).toMatchObject({ operation_id: "00000000-0000-4000-8000-000000000007" });
    expect(() =>
      parseHelperRequestText(
        JSON.stringify({
          protocol_version: 1,
          request_id: REQUEST_ID,
          operation_id: "00000000-0000-4000-8000-000000000007",
          operation: "status_all",
          ...REQUIRED_CONTEXT,
        }),
      ),
    ).toThrow("must not receive an operation_id");
  });

  it("accepts target-scoped repair and rejects missing or unknown targets", () => {
    const request = {
      protocol_version: 1,
      request_id: REQUEST_ID,
      operation_id: "00000000-0000-4000-8000-000000000008",
      operation: "repair_target",
      install_target: "vscode",
      parent_credential: "wts_live_parent_secret",
      ...REQUIRED_CONTEXT,
    };

    expect(parseHelperRequestText(JSON.stringify(request))).toMatchObject({
      operation: "repair_target",
      install_target: "vscode",
    });
    expect(() =>
      parseHelperRequestText(
        JSON.stringify({ ...request, install_target: undefined }),
      ),
    ).toThrow("requires a canonical install_target");
    expect(() =>
      parseHelperRequestText(
        JSON.stringify({ ...request, install_target: "not-a-tool" }),
      ),
    ).toThrow("requires a canonical install_target");
  });

  it("rejects protocol drift, multiline input, and oversized input", () => {
    expect(() =>
      parseHelperRequestText(
        JSON.stringify({
          protocol_version: 2,
          request_id: REQUEST_ID,
          operation: "status_all",
        }),
      ),
    ).toThrow("Unsupported helper protocol version");
    expect(() => parseHelperRequestText("{}\n{}\n")).toThrow(
      "exactly one JSON request line",
    );
    expect(() => parseHelperRequestText("x".repeat(256 * 1024 + 1))).toThrow(
      "too large",
    );
  });

  it("redacts parent and bootstrap credentials from diagnostics", () => {
    expect(
      redactHelperText(
        "bad wts_live_parent_secret_value- and wbst_bootstrap_secret_value",
      ),
    ).toBe("bad [credential] and [credential]");
  });

  it("rejects invalid optional protocol field types", () => {
    for (const invalid of [
      { compose_existing: "false" },
      { api_base: 42 },
      { app_runtime_root: false },
    ]) {
      expect(() =>
        parseHelperRequestText(
          JSON.stringify({
            protocol_version: 1,
            request_id: REQUEST_ID,
            operation: "status_all",
            ...REQUIRED_CONTEXT,
            ...invalid,
          }),
        ),
      ).toThrow("Invalid helper");
    }
  });

  it("keeps non-secret generation metadata available for crash recovery", () => {
    const event = createTargetEvent(
      { request_id: REQUEST_ID },
      {
        target: "vscode",
        publisher_target: "status-bar-fallback",
        display_name: "VS Code",
        command: "waitspin extension install --target vscode",
        install_id: "wins_vscode_test",
        credential_id: "wkey_child_test",
        generation: 2,
      },
      "installed_credential_pending_activation",
    );

    expect(JSON.stringify(event)).not.toContain("api_key");
    expect(event).toMatchObject({
      install_id: "wins_vscode_test",
      generation: 2,
    });
  });

  it("emits a progress event before a target is changed", () => {
    expect(
      createTargetStartedEvent(
        { request_id: REQUEST_ID },
        {
          target: "vscode",
          publisher_target: "status-bar-fallback",
          display_name: "VS Code",
          command: "waitspin extension install --target vscode",
        },
        2,
        6,
      ),
    ).toMatchObject({
      event: "target_started",
      install_target: "vscode",
      display_name: "VS Code",
      index: 2,
      total: 6,
    });
  });

  it("requires a locally registered editor before preserving server readiness", () => {
    const summary = {
      target: "vscode",
      publisher_target: "status-bar-fallback",
      display_name: "VS Code",
      command: "waitspin extension status --target vscode",
      result: {
        installed: true,
        publisher_registered: false,
        install_id: "wins_vscode_test",
      },
    };

    expect(
      createStatusTargetEvent(
        { request_id: REQUEST_ID },
        summary,
        "ready",
        {
          install_id: "wins_vscode_test",
          generation: 4,
          state: "ready",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
      ),
    ).toMatchObject({ state: "repair_required" });
    expect(
      createStatusTargetEvent(
        { request_id: REQUEST_ID },
        {
          ...summary,
          result: {
            ...summary.result,
            publisher_registered: true,
          },
        },
        "ready",
        {
          install_id: "wins_vscode_test",
          generation: 4,
          state: "ready",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
      ),
    ).toMatchObject({
      state: "ready",
      install_id: "wins_vscode_test",
      generation: 4,
    });
    expect(
      createStatusTargetEvent(
        { request_id: REQUEST_ID },
        summary,
        "ready",
      ),
    ).toMatchObject({ state: "repair_required" });
    expect(
      createStatusTargetEvent(
        { request_id: REQUEST_ID },
        { ...summary, result: { installed: true, install_id: "wins_other" } },
        "ready",
        {
          install_id: "wins_vscode_test",
          generation: 4,
          state: "ready",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
      ),
    ).toMatchObject({ state: "repair_required" });
  });

  it("preserves expected editor activation while publisher registration is pending", () => {
    expect(
      createStatusTargetEvent(
        { request_id: REQUEST_ID },
        {
          target: "vscode",
          publisher_target: "status-bar-fallback",
          display_name: "VS Code",
          command: "waitspin extension status --target vscode",
          result: {
            installed: true,
            publisher_registered: false,
            install_id: "wins_vscode_test",
          },
        },
        "ready",
        {
          install_id: "wins_vscode_test",
          generation: 4,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
      ),
    ).toMatchObject({
      state: "installed_credential_pending_activation",
      install_id: "wins_vscode_test",
      generation: 4,
    });
  });

  it.each(["conflict", "failed_rollback"])(
    "preserves durable %s status instead of reporting pending activation",
    (state) => {
      expect(
        createStatusTargetEvent(
          { request_id: REQUEST_ID },
          {
            target: "vscode",
            publisher_target: "status-bar-fallback",
            display_name: "VS Code",
            command: "waitspin extension status --target vscode",
            result: {
              installed: true,
              publisher_registered: true,
              install_id: "wins_other_install",
            },
          },
          "ready",
          {
            install_id: "wins_vscode_test",
            generation: 4,
            state,
            updated_at: "2026-07-12T00:00:00.000Z",
          },
        ),
      ).toMatchObject({
        state,
        install_id: "wins_vscode_test",
        generation: 4,
      });
    },
  );

  it("does not promote pending editor activation from a local receipt alone", () => {
    expect(
      createStatusTargetEvent(
        { request_id: REQUEST_ID },
        {
          target: "cursor",
          publisher_target: "status-bar-fallback",
          display_name: "Cursor",
          command: "waitspin extension status --target cursor",
          result: {
            installed: true,
            publisher_registered: true,
            publisher_registration_managed_by: "editor-extension",
            install_id: "wins_cursor_test",
          },
        },
        "ready",
        {
          install_id: "wins_cursor_test",
          generation: 4,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
      ),
    ).toMatchObject({
      state: "installed_credential_pending_activation",
      install_id: "wins_cursor_test",
      generation: 4,
    });
  });

  it("keeps a server-ready editor stable while the activation receipt is missing", () => {
    expect(
      createStatusTargetEvent(
        { request_id: REQUEST_ID },
        {
          target: "cursor",
          publisher_target: "status-bar-fallback",
          display_name: "Cursor",
          command: "waitspin extension status --target cursor",
          result: {
            installed: true,
            publisher_registered: false,
            install_id: null,
            publisher_registration_managed_by: "editor-extension",
          },
        },
        "ready",
        {
          install_id: "wins_cursor_test",
          generation: 4,
          state: "ready",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
      ),
    ).toMatchObject({
      state: "ready",
      install_id: "wins_cursor_test",
      generation: 4,
    });
  });

  it("preserves ready for a healthy file-target installation", () => {
    expect(
      createStatusTargetEvent(
        { request_id: REQUEST_ID },
        {
          target: "claude-code",
          publisher_target: "claude-code",
          display_name: "Claude Code",
          command: "waitspin claude-code status",
          result: {
            installed: true,
            publisher_registered: true,
            install_id: "wins_claude_test",
          },
        },
        "ready",
        {
          install_id: "wins_claude_test",
          generation: 2,
          state: "ready",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
      ),
    ).toMatchObject({
      state: "ready",
      install_id: "wins_claude_test",
      generation: 2,
    });
  });

  it("selects exactly one platform for repair_target", () => {
    const targets = [{ target: "vscode" }, { target: "cursor" }];
    expect(
      selectHelperTargets(
        { operation: "repair_target", install_target: "cursor" },
        targets,
      ),
    ).toEqual([{ target: "cursor" }]);
    expect(
      selectHelperTargets({ operation: "repair_all" }, targets),
    ).toEqual(targets);
  });

  it("adopts an exact healthy local and server installation during repair", () => {
    expect(
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_stale_journal",
          generation: 4,
          state: "bootstrap_issued",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: true,
          install_id: "wins_live_vscode",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_live_vscode",
              install_target: "vscode",
              generation: 7,
              status: "ready",
            },
          ],
        },
      }),
    ).toEqual({
      action: "adopt_ready",
      installId: "wins_live_vscode",
      generation: 7,
    });
  });

  it("advances the exact server generation when repair needs a new bootstrap", () => {
    expect(
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        localStatus: {
          installed: true,
          publisher_registered: false,
          install_id: "wins_pending_vscode",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_pending_vscode",
              install_target: "vscode",
              generation: 5,
              status: "installed_credential_pending_activation",
            },
          ],
        },
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_pending_vscode",
      generation: 6,
    });
  });

  it("rejects a server identity bound to another install target", () => {
    expect(() =>
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        localStatus: {
          installed: true,
          publisher_registered: true,
          install_id: "wins_bound_elsewhere",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_bound_elsewhere",
              install_target: "cursor",
              generation: 3,
              status: "ready",
            },
          ],
        },
      }),
    ).toThrow("target binding mismatch");
  });

  it("rejects malformed repair inventory rather than guessing a generation", () => {
    expect(() =>
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        localStatus: { installed: true, install_id: "wins_local" },
        inventory: { installations: "unavailable" },
      }),
    ).toThrow("Invalid publisher installation inventory");
  });

  it("does not adopt a server-ready identity when the local install is unhealthy", () => {
    expect(
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        localStatus: {
          installed: false,
          publisher_registered: true,
          install_id: "wins_missing_runtime",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_missing_runtime",
              install_target: "vscode",
              generation: 8,
              status: "ready",
            },
          ],
        },
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_missing_runtime",
      generation: 9,
    });
  });

  it("refreshes a server-ready editor activation without local key proof", () => {
    expect(
      resolveRepairTargetPlan({
        target: "cursor",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_cursor_managed",
          generation: 3,
          state: "installed_credential_pending_activation",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
        localStatus: {
          detected: true,
          installed: true,
          publisher_registration_managed_by: "editor-extension",
          install_id: null,
        },
        inventory: {
          installations: [
            {
              install_id: "wins_cursor_managed",
              install_target: "cursor",
              generation: 3,
              status: "ready",
            },
          ],
        },
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_cursor_managed",
      generation: 4,
    });
  });

  it("bootstraps an editor whose local activation receipt is explicitly failed", () => {
    expect(
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_vscode_managed",
          generation: 3,
          state: "ready",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
        localStatus: {
          detected: true,
          installed: true,
          publisher_registered: false,
          publisher_registration_managed_by: "editor-extension",
          install_id: "wins_vscode_managed",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_vscode_managed",
              install_target: "vscode",
              generation: 3,
              status: "ready",
            },
          ],
        },
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_vscode_managed",
      generation: 4,
    });
  });

  it("advances a removed server generation for the exact local identity", () => {
    expect(
      resolveRepairTargetPlan({
        target: "vscode",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_stale_journal",
          generation: 2,
          state: "removed",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
        localStatus: {
          installed: true,
          publisher_registered: true,
          install_id: "wins_removed_vscode",
        },
        inventory: {
          installations: [
            {
              install_id: "wins_removed_vscode",
              install_target: "vscode",
              generation: 7,
              status: "removed",
            },
          ],
        },
      }),
    ).toEqual({
      action: "bootstrap",
      installId: "wins_removed_vscode",
      generation: 8,
    });
  });

  it("rejects malformed and globally duplicated inventory rows", () => {
    const base = {
      target: "vscode",
      fallbackInstallId: "wins_fallback",
      localStatus: { installed: false },
    };
    expect(() =>
      resolveRepairTargetPlan({
        ...base,
        inventory: { installations: ["malformed"] },
      }),
    ).toThrow("Invalid publisher installation inventory");
    expect(() =>
      resolveRepairTargetPlan({
        ...base,
        inventory: {
          installations: [
            {
              install_id: "wins_duplicate",
              install_target: "cursor",
              generation: 1,
              status: "ready",
            },
            {
              install_id: "wins_duplicate",
              install_target: "devin",
              generation: 2,
              status: "ready",
            },
          ],
        },
      }),
    ).toThrow("Invalid publisher installation inventory");
  });

  it("fails closed for a registered non-editor without a local install ID", () => {
    expect(() =>
      resolveRepairTargetPlan({
        target: "claude-code",
        fallbackInstallId: "wins_fallback",
        previous: {
          install_id: "wins_claude_journal",
          generation: 2,
          state: "ready",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
        localStatus: { installed: true, publisher_registered: true },
        inventory: {
          installations: [
            {
              install_id: "wins_claude_journal",
              install_target: "claude-code",
              generation: 2,
              status: "ready",
            },
          ],
        },
      }),
    ).toThrow("Local publisher installation identity is unavailable");
  });
});
