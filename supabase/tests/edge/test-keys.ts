// ============================================================
// test-keys.ts — أدوات المفاتيح المشتركة بين اختبارات Edge
//
// توليد أزواج VAPID بنفس تمثيل app_config (عام 65B خام /
// خاص 32B سلمار — jwk.d)، توليد أزواج «اشتراك متصفح»،
// وفك تشفير aes128gcm بجهة مزود البوش (إثبات الدورة كاملة).
// ============================================================

import { bytesToB64Url, b64UrlToBytes } from '../../functions/_shared/webpush.ts'
import type { VapidConfig } from '../../functions/_shared/webpush.ts'

/** توليد زوج VAPID بنفس تمثيل npx web-push generate-vapid-keys */
export async function generateVapidLikeKeys(): Promise<VapidConfig> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return {
    publicKey: bytesToB64Url(publicRaw),
    privateKey: jwk.d!,
    subject: 'mailto:test@awj.life',
  }
}

/** زوج اشتراك المتصفح (p256dh + سر auth + المفتاح الخاص للمحاكاة) */
export async function generateSubscriptionKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return {
    p256dh: bytesToB64Url(publicRaw),
    auth: bytesToB64Url(crypto.getRandomValues(new Uint8Array(16))),
    privateKeyJwk: jwk as { kty: string; crv: string; x: string; y: string; d: string },
  }
}

async function hmacSha256(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

async function hkdf(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const prk = await hmacSha256(salt, ikm)
  const info1 = new Uint8Array(info.length + 1)
  info1.set(info, 0)
  info1[info.length] = 1
  const t1 = await hmacSha256(prk, info1)
  return t1.slice(0, length)
}

/** فك جسم aes128gcm كما يفعل المزود — يعيد النص الأصلي */
export async function decryptAes128gcm(
  body: Uint8Array<ArrayBuffer>,
  serverDhB64: string,
  sub: { p256dh: string; auth: string; privateKeyJwk: { kty: string; crv: string; x: string; y: string; d: string } },
): Promise<string> {
  const enc = new TextEncoder()
  const salt = body.slice(0, 16)
  const ciphertext = body.slice(20)

  const browserPriv = await crypto.subtle.importKey(
    'jwk',
    { ...sub.privateKeyJwk, ext: true },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  const serverPub = await crypto.subtle.importKey(
    'raw',
    b64UrlToBytes(serverDhB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: serverPub }, browserPriv, 256),
  )

  const authSecret = b64UrlToBytes(sub.auth)
  const ikm = new Uint8Array(authSecret.length + shared.length)
  ikm.set(authSecret, 0)
  ikm.set(shared, authSecret.length)

  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm'), 16)
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce'), 12)

  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM', length: 128 }, false, ['decrypt'])
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, ciphertext),
  )

  let end = plain.length - 1
  if (plain[end] !== 0x02) throw new Error('محرف فصل السجل الأخير مفقود (0x02)')
  while (end > 0 && plain[end - 1] === 0x00) end -= 1
  return new TextDecoder().decode(plain.slice(0, end))
}

/** خادم مزود بوش وهمي: يملك «اشتراكًا» يفك به التشفير ويسجل ما استلمه */
export interface FakePushProvider {
  /** نقطة الاشتراك (تُكتب في push_subscriptions بالقاعدة الوهمية) */
  subscription: { endpoint: string; p256dh: string; auth: string; privateKeyJwk: { kty: string; crv: string; x: string; y: string; d: string } }
  received: { endpointPath: string; headers: Record<string, string>; decrypted: string }[]
  setResponse(status: number): void
  close(): Promise<void>
}

export async function startFakePushProvider(): Promise<FakePushProvider> {
  const received: FakePushProvider['received'] = []
  const sub = await generateSubscriptionKeys()
  let respondStatus = 201

  const server = Deno.serve({ port: 0 }, (req) => {
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))
    const endpointPath = new URL(req.url).pathname
    return req.arrayBuffer().then(async (buf) => {
      const body = new Uint8Array(buf)
      const dh = (headers['crypto-key'] || '').replace('dh=', '')
      let decrypted = ''
      try {
        decrypted = await decryptAes128gcm(body, dh, sub)
      } catch (err) {
        decrypted = `DECRYPT-FAILED: ${(err as Error).message}`
      }
      received.push({ endpointPath, headers, decrypted })
      return new Response(null, { status: respondStatus })
    })
  })

  const port = (server.addr as { port: number }).port
  return {
    subscription: {
      endpoint: `http://127.0.0.1:${port}/push/device-001`,
      p256dh: sub.p256dh,
      auth: sub.auth,
      privateKeyJwk: sub.privateKeyJwk,
    },
    received,
    setResponse: (status: number) => {
      respondStatus = status
    },
    close: () => server.shutdown(),
  }
}
