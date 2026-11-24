// Signing in to Speckle (Decision "Speckle sign-in"): its OAuth with PKCE, so the page holds no secret. GFit is a
// registered app on app.speckle.systems whose one redirect is the public link; a one-time verifier, its SHA-256
// (the challenge) in Speckle's authorize address, and back with `?access_code=`, the code and the verifier traded at
// `/oauth/token` for a token. No navigation here (speckle.ts and speckleReturn.ts do it).
import { SPECKLE_SERVER } from './speckleClient.ts'

/** GFit as registered on app.speckle.systems (*GFit Industrial App*). */
export const SPECKLE_APP = {
  id: 'f5adce22b8',
  server: SPECKLE_SERVER,
  /** Where Speckle sends the browser back: the public link, exactly as registered. */
  redirect: 'https://gnslac-in-house-tools.github.io/gfit-generative-information-modeler/',
}

export function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const random = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)))

/** A one-time verifier and its challenge: BASE64URL(SHA-256(verifier)) (RFC 7636). */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = random(32)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64url(new Uint8Array(hash)) }
}

/** Speckle's login for GFit, for this challenge. */
export const authorizeUrl = (challenge: string) => `${SPECKLE_APP.server}/authn/verify/${SPECKLE_APP.id}/${challenge}?code_challenge_method=S256`

/** A workspace's single sign-on, back to the public link. */
export const ssoUrl = (workspace: string) =>
  `${SPECKLE_APP.server}/api/v1/workspaces/${encodeURIComponent(workspace)}/sso/auth?challenge=${random(16)}&appId=${SPECKLE_APP.id}&finalPath=${encodeURIComponent(new URL(SPECKLE_APP.redirect).pathname)}`

/** Whether Speckle can send the browser back to this page: the public link, not localhost. */
export function signsInHere(href: string): boolean {
  const u = new URL(href)
  return `${u.origin}${u.pathname}` === SPECKLE_APP.redirect
}

/** The code Speckle came back with, if any. */
export const accessCodeOf = (search: string): string | null => new URLSearchParams(search).get('access_code')

/** The code and its verifier, traded for a token. */
export async function tradeCode(accessCode: string, verifier: string): Promise<string> {
  const res = await fetch(`${SPECKLE_APP.server}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId: SPECKLE_APP.id, accessCode, codeVerifier: verifier }),
  })
  const json = (await res.json().catch(() => ({}))) as { token?: string; err?: string }
  if (!res.ok || !json.token) throw new Error(json.err ?? `${SPECKLE_APP.server} answered ${res.status}`)
  return json.token
}
