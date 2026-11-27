// The App Store Connect API calls scripts/revoke-ci-certs.mjs makes, and the
// one decision it takes: which certificates are a CI run's leftovers.
//
// Why: app-store.yml signs with Xcode's automatic cloud signing on a fresh
// GitHub runner. Its keychain is empty, so every `xcodebuild archive` has Xcode
// create a new Apple Development certificate through the API key, and its
// private key is thrown away with the runner. Apple caps the certificates a
// team may hold, and once a dozen uploads had used them up the archive failed
// with "Your account has reached the maximum number of certificates".
import { X509Certificate, createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com/v1";

// The development types a cloud-signed archive creates. Distribution
// certificates are never touched: the export signs with Apple's cloud-managed
// one, which is not in this list and not "Created via API".
export const DEVELOPMENT_TYPES = new Set(["DEVELOPMENT", "IOS_DEVELOPMENT", "MAC_APP_DEVELOPMENT"]);

// Xcode names a certificate it makes with an API key, rather than with a
// person's Apple ID, "Created via API" — in the subject's common name
// ("Apple Development: Created via API (TEAMID)") and in the API's name and
// displayName. A developer's own certificate carries their name, so it is
// never matched.
const MADE_BY_CI = /Created via API/i;

/** The subject's common name, or "" where the content is missing or unreadable. */
export function subjectOf(certificateContent) {
  if (!certificateContent) return "";
  try {
    return new X509Certificate(Buffer.from(certificateContent, "base64")).subject;
  } catch {
    return "";
  }
}

/** Whether an API certificate record is a development certificate a CI run made. */
export function isCiLeftover(cert) {
  const a = cert.attributes ?? {};
  if (!DEVELOPMENT_TYPES.has(a.certificateType)) return false;
  return [a.name, a.displayName, subjectOf(a.certificateContent)].some(
    (s) => typeof s === "string" && MADE_BY_CI.test(s),
  );
}

const base64url = (buf) => Buffer.from(buf).toString("base64url");

/** A 20-minute ES256 token for the App Store Connect API (Apple's maximum). */
export function makeToken({ keyId, issuerId, privateKeyPem, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: issuerId, iat, exp: iat + 20 * 60, aud: "appstoreconnect-v1" }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363", // JWS wants r‖s, not DER
  });
  return `${header}.${payload}.${base64url(signature)}`;
}

async function call(token, method, url) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${method} ${url}: ${res.status} ${body.slice(0, 500)}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Every certificate on the team, following the API's pages. */
export async function listCertificates(token) {
  const fields = "name,displayName,certificateType,certificateContent,expirationDate,serialNumber";
  let url = `${API}/certificates?limit=200&fields[certificates]=${fields}`;
  const all = [];
  while (url) {
    const page = await call(token, "GET", url);
    all.push(...page.data);
    url = page.links?.next ?? null;
  }
  return all;
}

export async function revokeCertificate(token, id) {
  await call(token, "DELETE", `${API}/certificates/${encodeURIComponent(id)}`);
}
