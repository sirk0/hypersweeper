// Which certificates scripts/revoke-ci-certs.mjs revokes, and the token it
// signs (scripts/lib/asc-certs.mjs). Nothing here reaches Apple.
//
//   node --test scripts/test/
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { test } from "node:test";

import { isCiLeftover, makeToken } from "../lib/asc-certs.mjs";

const cert = (attributes) => ({ type: "certificates", id: "X", attributes });

test("development certificates Xcode made with the API key are leftovers", () => {
  for (const certificateType of ["DEVELOPMENT", "IOS_DEVELOPMENT", "MAC_APP_DEVELOPMENT"]) {
    assert.ok(
      isCiLeftover(
        cert({
          certificateType,
          name: "Apple Development: Created via API",
          displayName: "Created via API",
        }),
      ),
    );
  }
  assert.ok(isCiLeftover(cert({ certificateType: "DEVELOPMENT", displayName: "Created via API" })));
});

test("a person's certificate and every distribution certificate are kept", () => {
  assert.ok(
    !isCiLeftover(
      cert({
        certificateType: "DEVELOPMENT",
        name: "Apple Development: Jo Doe",
        displayName: "Jo Doe",
      }),
    ),
  );
  for (const certificateType of ["DISTRIBUTION", "IOS_DISTRIBUTION", "MAC_APP_DISTRIBUTION"]) {
    assert.ok(
      !isCiLeftover(cert({ certificateType, name: "Apple Distribution: Created via API" })),
    );
  }
  assert.ok(!isCiLeftover(cert({})));
  assert.ok(!isCiLeftover({}));
});

test("an unreadable certificate body is no match, not an error", () => {
  assert.ok(
    !isCiLeftover(
      cert({ certificateType: "DEVELOPMENT", name: "Jo", certificateContent: "not base64 DER" }),
    ),
  );
});

test("the token is an ES256 JWT Apple's API accepts", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const now = Date.UTC(2026, 0, 1);
  const token = makeToken({ keyId: "KEY123", issuerId: "issuer-uuid", privateKeyPem: pem, now });
  const [h, p, s] = token.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url"));
  const payload = JSON.parse(Buffer.from(p, "base64url"));
  assert.deepEqual(header, { alg: "ES256", kid: "KEY123", typ: "JWT" });
  assert.equal(payload.iss, "issuer-uuid");
  assert.equal(payload.aud, "appstoreconnect-v1");
  assert.equal(payload.exp - payload.iat, 1200);
  const sig = Buffer.from(s, "base64url");
  assert.equal(sig.length, 64); // r‖s, not DER
  assert.ok(
    verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, sig),
  );
});
