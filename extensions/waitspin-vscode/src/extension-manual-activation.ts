import {
  parsePublisherRegistrationPayload,
  parseWalletStatusPayload,
  VSCODE_PUBLISHER_TARGET,
} from "./extension-core";
import type { ManualPendingCredentialEnvelope } from "./extension-activation-state";
import { assertEditorActivationCurrent } from "./extension-activation-retry";

export type ManualActivationRequestInput = {
  fetchWithTimeout(url: string, init: RequestInit): Promise<Response>;
  signal?: AbortSignal;
};

export async function validateManualWallet(
  input: ManualActivationRequestInput,
  pending: ManualPendingCredentialEnvelope,
): Promise<boolean> {
  assertEditorActivationCurrent(input.signal, "promotion");
  const response = await input.fetchWithTimeout(
    `${pending.apiBase}/v1/wallet/status`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${pending.apiKey}` },
      signal: input.signal,
    },
  );
  assertEditorActivationCurrent(input.signal, "promotion");
  if (response.status === 401 || response.status === 403) {
    if (pending.allowLegacyWalletFailure) return false;
    throw new Error(
      "extension key cannot read wallet status; rotate it with wallet:read",
    );
  }
  if (!response.ok) {
    throw new Error(`wallet validation failed with HTTP ${response.status}`);
  }
  const wallet = parseWalletStatusPayload(await response.json());
  assertEditorActivationCurrent(input.signal, "promotion");
  if (!wallet) throw new Error("wallet validation response failed validation");
  return true;
}

export async function registerManualPublisher(
  input: ManualActivationRequestInput,
  pending: ManualPendingCredentialEnvelope,
): Promise<void> {
  assertEditorActivationCurrent(input.signal, "promotion");
  const response = await input.fetchWithTimeout(
    `${pending.apiBase}/v1/publishers/register`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pending.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        install_id: pending.installId,
        target: VSCODE_PUBLISHER_TARGET,
      }),
      signal: input.signal,
    },
  );
  assertEditorActivationCurrent(input.signal, "promotion");
  if (!response.ok) {
    throw new Error(
      `publisher registration failed with HTTP ${response.status}`,
    );
  }
  const registration = parsePublisherRegistrationPayload(await response.json());
  assertEditorActivationCurrent(input.signal, "promotion");
  if (!registration || registration.installId !== pending.installId) {
    throw new Error("publisher registration response failed validation");
  }
}
