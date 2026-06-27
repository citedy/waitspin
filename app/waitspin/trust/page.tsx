import type { Metadata } from "next";
import Link from "next/link";

import {
  WAITSPIN_NEVER_SENT_DATA,
  WAITSPIN_PRIVATE_BOUNDARY,
  WAITSPIN_PUBLIC_PUBLISHER_TARGETS,
  WAITSPIN_PUBLIC_TRUST_REPO_URL,
  WAITSPIN_SENT_PAYLOADS,
  waitSpinPublicTargetsSentence,
} from "@/lib/waitspin/public-trust";
import {
  WTS_VSCODE_MARKETPLACE_STATUS,
  WTS_VSCODE_MARKETPLACE_STATUS_PATH,
  WTS_VSCODE_OPEN_VSX_STATUS,
  WTS_VSCODE_OPEN_VSX_STATUS_PATH,
  waitSpinVscodeMarketplaceStateLabel,
  waitSpinVscodeMarketplaceVersionLabel,
  waitSpinVscodeOpenVsxStateLabel,
  waitSpinVscodeOpenVsxVersionLabel,
  waitSpinVscodeProvenanceVersionLabel,
} from "@/lib/waitspin/vscode-marketplace-status";
import { Section, WaitSpinLegalPage } from "../legal-content";
import { PublicSurfaceCopyLabel } from "../public-surface-copy-label";

const marketplaceUrl =
  "https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode";
const sourceUrl = `${WAITSPIN_PUBLIC_TRUST_REPO_URL}/tree/main/extensions/waitspin-vscode`;
const provenancePath = "/provenance/waitspin-vscode.json";

export const metadata: Metadata = {
  title: "WaitSpin Trust",
  description:
    "WaitSpin client trust boundary, VS Code Marketplace provenance, public source links, and privacy guarantees for supported user earning surfaces.",
};

export const dynamic = "force-dynamic";

export default function WaitSpinTrustPage() {
  return (
    <WaitSpinLegalPage
      title="WaitSpin Trust"
      description="Public trust materials for the WaitSpin client surfaces, install channels, source links, and privacy boundary."
    >
      <Section title="Public Trust Boundary">
        <p>
          WaitSpin measures wait-state ad visibility, not developer work. The
          public client surfaces only fetch a sponsored line for a registered
          install, display it in the supported wait-state surface, and report an
          impression after the visible interval.
        </p>
        <p>
          Public user surfaces: {waitSpinPublicTargetsSentence()}.
        </p>
      </Section>

      <Section title="Never Sent By The Public Clients">
        <ul className="list-disc space-y-2 pl-5">
          {WAITSPIN_NEVER_SENT_DATA.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section title="Operational Payloads">
        <ul className="list-disc space-y-2 pl-5">
          {WAITSPIN_SENT_PAYLOADS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          WaitSpin has no separate analytics telemetry stream in the public
          clients. Serve, impression, wallet, and accounting events are
          operational telemetry needed to run the marketplace.
        </p>
      </Section>

      <Section title="VS Code Extension Provenance">
        <p>
          The VS Code-compatible extension is installed from the{" "}
          <a className="underline" href={marketplaceUrl}>
            Visual Studio Marketplace
          </a>{" "}
          for VS Code and Cursor, or from{" "}
          <a
            className="underline"
            href="https://open-vsx.org/extension/waitspin/waitspin-vscode"
          >
            Open VSX
          </a>{" "}
          for Devin Desktop. WaitSpin publishes the client source at{" "}
          <a className="underline" href={sourceUrl}>
            github.com/citedy/waitspin
          </a>{" "}
          and publishes a machine-readable provenance manifest at{" "}
          <Link className="underline" href={provenancePath}>
            {provenancePath}
          </Link>
          . The repository does not track VSIX binaries; release automation
          packages them and records the SHA256 in the manifest.
        </p>
        <p>
          Visual Studio Marketplace version:{" "}
          <code>
            {waitSpinVscodeMarketplaceVersionLabel(
              WTS_VSCODE_MARKETPLACE_STATUS,
            )}
          </code>
          . Provenance version:{" "}
          <code>
            {waitSpinVscodeProvenanceVersionLabel(
              WTS_VSCODE_MARKETPLACE_STATUS,
            )}
          </code>
          . State:{" "}
          <code>
            {waitSpinVscodeMarketplaceStateLabel(
              WTS_VSCODE_MARKETPLACE_STATUS,
            )}
          </code>
          . Live Marketplace status is published at{" "}
          <Link
            className="underline"
            href={WTS_VSCODE_MARKETPLACE_STATUS_PATH}
          >
            {WTS_VSCODE_MARKETPLACE_STATUS_PATH}
          </Link>
          .
        </p>
        <p>
          Open VSX version for Devin Desktop:{" "}
          <code>
            {waitSpinVscodeOpenVsxVersionLabel(WTS_VSCODE_OPEN_VSX_STATUS)}
          </code>
          . State:{" "}
          <code>
            {waitSpinVscodeOpenVsxStateLabel(WTS_VSCODE_OPEN_VSX_STATUS)}
          </code>
          . Live Open VSX status is published at{" "}
          <Link
            className="underline"
            href={WTS_VSCODE_OPEN_VSX_STATUS_PATH}
          >
            {WTS_VSCODE_OPEN_VSX_STATUS_PATH}
          </Link>
          .
        </p>
      </Section>

      <Section title="Client Privacy Boundary">
        <p>
          The VS Code extension connects a user install inside VS Code, stores
          the extension API key in VS Code SecretStorage, stores the
          install ID in user-scoped extension state, polls the WaitSpin API for a
          sponsored line, opens advertiser links only after user action, and
          reports a billable impression after the required visible interval. The
          VS Code-compatible extension path does not read workspace files, open
          editor text, prompts, model responses, integrated terminal output,
          shell history, repository URLs, or source code. Qoder's official hook
          payload is delivered locally by Qoder and can include prompt or
          assistant-message fields; the WaitSpin Qoder runtime discards those
          fields before cache or API work.
        </p>
      </Section>

      <Section title="Supported Public Surfaces">
        <ul className="list-disc space-y-2 pl-5">
          {WAITSPIN_PUBLIC_PUBLISHER_TARGETS.map((target) => (
            <li key={`${target.label}-${target.target}`}>
              {"href" in target ? (
                <a
                  className="underline"
                  href={target.href}
                  rel="noopener noreferrer"
                >
                  <strong>{target.label}</strong>
                </a>
              ) : (
                <PublicSurfaceCopyLabel
                  command={target.installCommand}
                  label={target.label}
                />
              )}
              : <code>{target.target}</code>.{" "}
              {target.localBehavior}
            </li>
          ))}
        </ul>
        <p>
          The current public user earning surfaces are the VS Code Marketplace
          Activity Bar/status-bar extension, the VS Code-compatible Cursor and
          Devin Desktop editor surfaces, Claude Code statusline command,
          Antigravity CLI statusline command, GitHub Copilot CLI statusline
          command, MiMo Code shell hook, OpenCode TUI plugin slot, Grok Code CLI
          footer, and Qoder CLI UserPromptSubmit/Stop hooks.
          Native spinner patching beyond these supported status surfaces remains
          outside the public contract until separately shipped and documented.
        </p>
      </Section>

      <Section title="What Stays Private">
        <p>
          The public trust repository is scoped to client code, public docs,
          public contracts, provenance, and trust-boundary tests. These systems
          stay private:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {WAITSPIN_PRIVATE_BOUNDARY.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>
    </WaitSpinLegalPage>
  );
}
