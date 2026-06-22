import statusJson from "@/public/status/waitspin-vscode-marketplace.json";

export type WaitSpinVscodeMarketplacePublishState =
  | "published"
  | "pending_marketplace_publish"
  | "marketplace_ahead"
  | "unknown";

export type WaitSpinVscodeMarketplaceStatus = {
  schema_version: 1;
  extension_id: string;
  marketplace_version: string;
  marketplace_last_updated: string;
  marketplace_url: string;
  source_package_version: string;
  provenance_version: string;
  publish_state: WaitSpinVscodeMarketplacePublishState;
  checked_at: string;
};

export const WTS_VSCODE_MARKETPLACE_STATUS_PATH =
  "/status/waitspin-vscode-marketplace.json";

export const WTS_VSCODE_MARKETPLACE_STATUS =
  statusJson as WaitSpinVscodeMarketplaceStatus;

export function waitSpinVscodeMarketplaceVersionLabel(
  status = WTS_VSCODE_MARKETPLACE_STATUS,
): string {
  return `v${status.marketplace_version}`;
}

export function waitSpinVscodeProvenanceVersionLabel(
  status = WTS_VSCODE_MARKETPLACE_STATUS,
): string {
  return `v${status.provenance_version}`;
}

export function waitSpinVscodeMarketplaceStateLabel(
  status: { publish_state: string } = WTS_VSCODE_MARKETPLACE_STATUS,
): string {
  switch (status.publish_state) {
    case "published":
      return "published";
    case "pending_marketplace_publish":
      return "pending Marketplace publish";
    case "marketplace_ahead":
      return "Marketplace ahead of repository";
    case "unknown":
      return "unknown";
    default:
      return "unknown";
  }
}
