import marketplaceStatusJson from "@/public/status/waitspin-vscode-marketplace.json";
import openVsxStatusJson from "@/public/status/waitspin-vscode-open-vsx.json";

export type WaitSpinVscodeMarketplacePublishState =
  | "published"
  | "pending_marketplace_publish"
  | "marketplace_ahead"
  | "unknown";

export type WaitSpinVscodeOpenVsxPublishState =
  | "published"
  | "pending_open_vsx_publish"
  | "open_vsx_ahead"
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

export type WaitSpinVscodeOpenVsxStatus = {
  schema_version: 1;
  extension_id: string;
  open_vsx_version: string;
  open_vsx_published_at: string;
  open_vsx_url: string;
  open_vsx_verified: boolean;
  open_vsx_published_by: string;
  namespace_access: string;
  source_package_version: string;
  provenance_version: string;
  publish_state: WaitSpinVscodeOpenVsxPublishState;
  checked_at: string;
};

export const WTS_VSCODE_MARKETPLACE_STATUS_PATH =
  "/status/waitspin-vscode-marketplace.json";
export const WTS_VSCODE_OPEN_VSX_STATUS_PATH =
  "/status/waitspin-vscode-open-vsx.json";

export const WTS_VSCODE_MARKETPLACE_STATUS =
  marketplaceStatusJson as WaitSpinVscodeMarketplaceStatus;
export const WTS_VSCODE_OPEN_VSX_STATUS =
  openVsxStatusJson as WaitSpinVscodeOpenVsxStatus;

export function waitSpinVscodeMarketplaceVersionLabel(
  status = WTS_VSCODE_MARKETPLACE_STATUS,
): string {
  return `v${status.marketplace_version}`;
}

export function waitSpinVscodeOpenVsxVersionLabel(
  status = WTS_VSCODE_OPEN_VSX_STATUS,
): string {
  return `v${status.open_vsx_version}`;
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

export function waitSpinVscodeOpenVsxStateLabel(
  status: { publish_state: string } = WTS_VSCODE_OPEN_VSX_STATUS,
): string {
  switch (status.publish_state) {
    case "published":
      return "published";
    case "pending_open_vsx_publish":
      return "pending Open VSX publish";
    case "open_vsx_ahead":
      return "Open VSX ahead of repository";
    case "unknown":
      return "unknown";
    default:
      return "unknown";
  }
}
