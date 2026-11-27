#!/usr/bin/env node
// Revokes the Apple Development certificates earlier App Store uploads left
// behind, so this run's cloud signing has room to make its own. Run by
// .github/workflows/app-store.yml before it archives; see scripts/lib/asc-certs.mjs
// for why they pile up and which ones count.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=AuthKey_….p8 node scripts/revoke-ci-certs.mjs [--dry-run]
//
// Lists every certificate on the team, revokes only development certificates
// "Created via API", and leaves everything else — a developer's own
// certificate, every distribution certificate — alone. A revoked development
// certificate signs nothing shipped: an App Store build is signed for
// distribution at export.
import { readFileSync } from "node:fs";

import { isCiLeftover, listCertificates, makeToken, revokeCertificate } from "./lib/asc-certs.mjs";

const dryRun = process.argv.includes("--dry-run");
const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, ASC_KEY_PATH: keyPath } = process.env;
if (!keyId || !issuerId || !keyPath) {
  console.error("ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH must be set");
  process.exit(2);
}

const token = makeToken({ keyId, issuerId, privateKeyPem: readFileSync(keyPath, "utf8") });
const certs = await listCertificates(token);

console.log(`${certs.length} certificate(s) on the team:`);
const leftovers = [];
for (const cert of certs) {
  const a = cert.attributes ?? {};
  const ci = isCiLeftover(cert);
  if (ci) leftovers.push(cert);
  const expires = (a.expirationDate ?? "").slice(0, 10);
  console.log(
    `  ${ci ? "revoke" : "keep  "}  ${a.certificateType}  ${a.name ?? a.displayName}  (expires ${expires})`,
  );
}

if (leftovers.length === 0) {
  console.log("Nothing to revoke.");
} else if (dryRun) {
  console.log(`--dry-run: would revoke ${leftovers.length}.`);
} else {
  for (const cert of leftovers) await revokeCertificate(token, cert.id);
  console.log(`Revoked ${leftovers.length} development certificate(s) left by earlier runs.`);
}
