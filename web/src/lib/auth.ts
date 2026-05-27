import { createHmac, timingSafeEqual } from 'crypto';

interface ShopifyTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  exp: number;
  nbf?: number;
}

/**
 * Verifies a Shopify App Bridge session token (HS256 JWT).
 * Returns the verified shop domain (e.g. "store.myshopify.com").
 * Throws with { status: 401 } on any failure.
 */
export async function verifySessionToken(request: Request): Promise<string> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing session token'), { status: 401 });
  }

  const token = auth.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw Object.assign(new Error('Invalid token format'), { status: 401 });
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error('SHOPIFY_API_SECRET not configured');

  const expectedSig = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const expectedBuf = Buffer.from(expectedSig);
  const actualBuf = Buffer.from(signatureB64);
  const sigsMatch =
    expectedBuf.length === actualBuf.length &&
    timingSafeEqual(expectedBuf, actualBuf);

  if (!sigsMatch) {
    throw Object.assign(new Error('Invalid token signature'), { status: 401 });
  }

  let payload: ShopifyTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('Malformed token payload'), { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw Object.assign(new Error('Token expired'), { status: 401 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (apiKey && payload.aud !== apiKey) {
    throw Object.assign(new Error('Invalid audience'), { status: 401 });
  }

  if (!payload.dest?.endsWith('.myshopify.com')) {
    throw Object.assign(new Error('Invalid destination'), { status: 401 });
  }

  // dest is "https://store.myshopify.com" — return just the hostname
  try {
    return new URL(payload.dest).hostname;
  } catch {
    throw Object.assign(new Error('Invalid dest URL'), { status: 401 });
  }
}
