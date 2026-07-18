import type { HelperJournal } from "../helper-state";
import { markBootstrapIssued } from "../helper-state";

describe("WaitSpin helper journal", () => {
  it("records every issued bootstrap before local installation can begin", () => {
    const journal: HelperJournal = {
      schema_version: 1,
      operation_id: "12345678-1234-4234-9234-123456789abc",
      phase: "install_all",
      targets: {},
      updated_at: "2026-07-11T00:00:00.000Z",
    };

    markBootstrapIssued(journal, {
      target: "vscode",
      installId: "wins_vscode_test",
      generation: 2,
      updatedAt: "2026-07-11T01:00:00.000Z",
    });

    expect(journal.targets.vscode).toEqual({
      install_id: "wins_vscode_test",
      generation: 2,
      state: "bootstrap_issued",
      updated_at: "2026-07-11T01:00:00.000Z",
    });
  });
});
