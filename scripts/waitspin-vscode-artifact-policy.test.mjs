import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRegistryArtifactPolicy,
  WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
  WAITSPIN_VSCODE_0_1_15_MARKETPLACE_SHA256,
} from "./waitspin-vscode-artifact-policy.mjs";

test("accepts the exact historical 0.1.15 registry envelopes", () => {
  const artifacts = assertRegistryArtifactPolicy({
    version: "0.1.15",
    canonicalSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
    marketplaceSha256: WAITSPIN_VSCODE_0_1_15_MARKETPLACE_SHA256,
    openVsxSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
  });

  assert.equal(artifacts.marketplace.matches_canonical, false);
  assert.equal(artifacts.open_vsx.matches_canonical, true);
});

test("rejects malformed and altered historical hashes", () => {
  assert.throws(
    () =>
      assertRegistryArtifactPolicy({
        version: "0.1.15",
        canonicalSha256: "not-a-sha",
        marketplaceSha256: WAITSPIN_VSCODE_0_1_15_MARKETPLACE_SHA256,
        openVsxSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
      }),
    /lowercase 64-character SHA-256/,
  );
  assert.throws(
    () =>
      assertRegistryArtifactPolicy({
        version: "0.1.15",
        canonicalSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
        marketplaceSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
        openVsxSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
      }),
    /exact historical/,
  );
});

test("requires one canonical archive for every release after 0.1.15", () => {
  assert.throws(
    () =>
      assertRegistryArtifactPolicy({
        version: "0.1.16",
        canonicalSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
        marketplaceSha256: WAITSPIN_VSCODE_0_1_15_MARKETPLACE_SHA256,
        openVsxSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
      }),
    /byte-identical canonical VSIX/,
  );

  assert.doesNotThrow(() =>
    assertRegistryArtifactPolicy({
      version: "0.1.16",
      canonicalSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
      marketplaceSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
      openVsxSha256: WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256,
    }),
  );
});
