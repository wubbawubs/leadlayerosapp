/**
 * WordPress.com OAuth2 helpers (server-only).
 * - signState/verifyState: HMAC-signed state param so the callback can trust
 *   tenant_id + user_id without a session cookie.
 * - exchangeCode: code -> access_token
 * - fetchMe / fetchSites: minimal WPCOM API helpers
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const AUTHORIZE_URL = "https://public-api.wordpress.com/oauth2/authorize";
const TOKEN_URL = "https://public-api.wordpress.com/oauth2/token";
const API_BASE = "https://public-api.wordpress.com/rest/v1.1";

function getSecret(): string {
  const s = process.env.ENCRYPTION_KEY;
  if (!s) throw new Error("ENCRYPTION_KEY not configured");
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export interface StatePayload {
  t: string; // tenantId
  u: string; // userId
  n: string; // nonce
  e: number; // expiry epoch ms
}

export function signState(payload: Omit<StatePayload, "n" | "e">): string {
  const full: StatePayload = {
    ...payload,
    n: randomBytes(8).toString("hex"),
    e: Date.now() + 10 * 60 * 1000,
  };
  const body = b64url(JSON.stringify(full));
  const sig = b64url(createHmac("sha256", getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(state: string): StatePayload {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Malformed state");
  const expected = b64url(createHmac("sha256", getSecret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }
  const parsed = JSON.parse(b64urlDecode(body).toString()) as StatePayload;
  if (!parsed.e || Date.now() > parsed.e) throw new Error("State expired");
  return parsed;
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
  blogId?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    state: opts.state,
  });
  if (opts.scope) params.set("scope", opts.scope);
  if (opts.blogId) params.set("blog", opts.blogId);
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{
  access_token: string;
  blog_id?: string;
  blog_url?: string;
  token_type?: string;
  scope?: string;
}> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`WPCOM token exchange failed [${res.status}]: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as {
    access_token: string;
    blog_id?: string;
    blog_url?: string;
  };
}

export async function wpcomFetch<T = unknown>(
  path: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`WPCOM API ${path} failed [${res.status}]: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function getRedirectUri(request: Request): string {
  // Prefer forwarded headers so the redirect_uri matches the public origin
  // (preview/published lovable.app), not the internal worker host (localhost:8080).
  const h = request.headers;
  const forwardedHost = h.get("x-forwarded-host") ?? h.get("host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";
  let origin: string;
  if (forwardedHost) {
    origin = `${forwardedProto}://${forwardedHost}`;
  } else {
    origin = new URL(request.url).origin;
  }
  return `${origin}/api/public/wpcom/callback`;
}
