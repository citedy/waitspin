import { createCanonicalInstallTargets } from "../managed-install-orchestration";

const editorTargets = ["vscode", "cursor", "devin"];

describe("WaitSpin managed install orchestration", () => {
  it("maps every editor install target to the public publisher target", () => {
    const targets = createCanonicalInstallTargets(new Map(), {
      allTargets: () =>
        [...editorTargets, "claude-code"].map((target) => ({
          target,
          command: `install ${target}`,
          statusCommand: `status ${target}`,
          preflight: async () => null,
          install: async () => {},
          status: async () => {},
        })),
      booleanFlag: () => false,
      capturePrintedJson: async <T>(callback: () => Promise<void>) => {
        await callback();
        return {} as T;
      },
      formatInstallAllResult: () => "",
      formatStatusAllResult: () => "",
      printCliOutput: () => {},
      redactError: (error) => String(error),
      uninstallTarget: async () => {},
    });

    expect(
      Object.fromEntries(
        targets.map(({ target, publisherTarget }) => [target, publisherTarget]),
      ),
    ).toEqual({
      vscode: "status-bar-fallback",
      cursor: "status-bar-fallback",
      devin: "status-bar-fallback",
      "claude-code": "claude-code",
    });
  });
});
