import { createLink, parseIntent } from "@calimero-network/mero-platform";

export function encodeInvitation(raw: string): string {
  // btoa only accepts Latin1 (code points 0-255) and throws on anything else, so
  // UTF-8-encode to bytes first — otherwise a team name with an emoji or accented
  // character would break invitation generation. ASCII input is unchanged.
  const bytes = new TextEncoder().encode(raw);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function decodeInvitation(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  try {
    const bin = atob(pad ? padded + "=".repeat(4 - pad) : padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return encoded;
  }
}

/** Encode an invitation *object* (the node's signed invitation response, plus
 *  any extra fields like the team name) as a url-safe base64 token. */
export function encodeInvitationObject(obj: unknown): string {
  return encodeInvitation(JSON.stringify(obj));
}

/** Decode a token produced by {@link encodeInvitationObject} back to its object. */
export function decodeInvitationObject<T = Record<string, unknown>>(encoded: string): T {
  return JSON.parse(decodeInvitation(encoded)) as T;
}

/**
 * The app's deep-link slug. The desktop resolves a link by
 * `Application.package`, and links.calimero.network resolves the web build by
 * asking the registry for that same package — so the slug IS the package id.
 * Keep equal to `slug`/`package` in `logic/Cargo.toml`.
 */
export const APP_SLUG = "com.calimero.meropixart";

/** The intent action an invitation link carries. */
export const JOIN_ACTION = "join";

/** Query parameter carrying the invitation payload. */
export const INVITATION_PARAM = "invitation";

/**
 * The shareable form of an invitation token: a canonical HTTPS link that opens
 * the desktop app where it is installed and the published web build otherwise.
 *
 * Previously the invite modal copied the bare token, which put the burden of
 * knowing what to do with it on the recipient. {@link invitationTokenFrom}
 * reads a link back, and still accepts a bare token so links already shared
 * keep working.
 */
export function invitationLink(token: string): string {
  return createLink(APP_SLUG, JOIN_ACTION, { [INVITATION_PARAM]: token });
}

/** The token carried by an invitation link, or the input unchanged if it isn't one. */
export function invitationTokenFrom(input: string): string {
  const trimmed = input.trim();
  if (!/^(https?|calimero):\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed).searchParams.get(INVITATION_PARAM) ?? trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Pull an invitation token out of anything that might carry one: a platform
 * HTTPS link, a `calimero://` deep link, a bare query string, or the token
 * itself.
 *
 * Parsing goes through the SDK's `parseIntent` rather than `new URL()`, for one
 * specific reason: `calimero://<slug>/<action>` has to be split by hand,
 * because non-special-scheme host parsing mangles a dotted slug like
 * `com.calimero.meropixart`.
 *
 * Returns null when there is no invitation in it — including a link carrying
 * some other app's slug, which is not ours to redeem.
 */
export function invitationFromRaw(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const intent = parseIntent(trimmed);

  // Reject another app's invitation — but only when this really is a platform
  // intent, meaning BOTH a slug and an action. `parseIntent` reports the first
  // path segment as the slug whatever it is, so this app's own routes
  // (`/teams?invitation=…`) come back as `{slug: "teams", action: null}` — a
  // route misread as a slug, which it has no way to know. Rejecting on the slug
  // alone would throw away our own links.
  if (intent.slug && intent.action && intent.slug !== APP_SLUG) return null;

  const fromIntent = intent.params[INVITATION_PARAM];
  if (fromIntent) return fromIntent;

  if (/^(https?|calimero):\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).searchParams.get(INVITATION_PARAM);
    } catch {
      return null;
    }
  }
  return trimmed;
}

/**
 * The current URL with `?invitation=` removed, for tidying the address bar after
 * the intent has been captured. Returns the input unchanged when there is
 * nothing to strip or it cannot be parsed.
 */
export function urlWithoutInvitation(href: string): string {
  try {
    const url = new URL(href);
    if (!url.searchParams.has(INVITATION_PARAM)) return href;
    url.searchParams.delete(INVITATION_PARAM);
    return url.pathname + (url.search ? url.search : "") + url.hash;
  } catch {
    return href;
  }
}
