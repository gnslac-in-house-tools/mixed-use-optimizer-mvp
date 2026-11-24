// @vitest-environment node
// (Node's own Web Crypto, as a browser's.) Signing in to Speckle (Decision "Speckle sign-in"): the PKCE pair as RFC
// 7636 makes it, Speckle's login and SSO addresses for GFit, where it can sign in, the code traded at /oauth/token.
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accessCodeOf, authorizeUrl, base64url, pkcePair, signsInHere, SPECKLE_APP, ssoUrl, tradeCode } from '../speckleAuth.ts'

afterEach(() => vi.unstubAllGlobals())

describe('signing in to Speckle', () => {
  it('the challenge is BASE64URL(SHA-256(verifier)); each pair its own', async () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe('-_-_')
    const a = await pkcePair()
    const b = await pkcePair()
    expect(a.verifier).toMatch(/^[\w-]{43}$/)
    expect(a.challenge).toBe(createHash('sha256').update(a.verifier).digest('base64url'))
    expect(a.verifier).not.toBe(b.verifier)
  })

  it('Speckle’s login and a workspace’s SSO for GFit; back to the public link', () => {
    expect(authorizeUrl('abc')).toBe('https://app.speckle.systems/authn/verify/f5adce22b8/abc?code_challenge_method=S256')
    const sso = new URL(ssoUrl('gensler'))
    expect(sso.pathname).toBe('/api/v1/workspaces/gensler/sso/auth')
    expect(sso.searchParams.get('appId')).toBe(SPECKLE_APP.id)
    expect(sso.searchParams.get('finalPath')).toBe('/gfit-generative-information-modeler/')
  })

  it('it signs in on the public link, whatever its route; not on localhost', () => {
    expect(signsInHere('https://gnslac-in-house-tools.github.io/gfit-generative-information-modeler/#/p/x')).toBe(true)
    expect(signsInHere('https://gnslac-in-house-tools.github.io/gfit-generative-information-modeler/?access_code=1')).toBe(true)
    expect(signsInHere('http://localhost:5173/#/')).toBe(false)
    expect(accessCodeOf('?access_code=abc')).toBe('abc')
    expect(accessCodeOf('')).toBeNull()
  })

  it('the code and its verifier, traded for a token; what Speckle says when it refuses', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ token: 'tok', refreshToken: 'r' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await tradeCode('code', 'verifier')).toBe('tok')
    expect(fetch.mock.calls[0][0]).toBe('https://app.speckle.systems/oauth/token')
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ appId: 'f5adce22b8', accessCode: 'code', codeVerifier: 'verifier' })
    fetch.mockImplementation(async () => new Response(JSON.stringify({ err: 'Access code not found.' }), { status: 401 }))
    await expect(tradeCode('old', 'verifier')).rejects.toThrow('Access code not found.')
  })
})
