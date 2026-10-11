import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const localWindows = new Map();
const limiters = new Map();

function requestIdentity(request, identifier = '') {
  const ip = request.headers.get('x-real-ip')
    || request.headers.get('cf-connecting-ip')
    || 'unknown';
  return createHash('sha256').update(`${ip}:${String(identifier).trim().toLowerCase()}`).digest('hex');
}

function localRateLimit(namespace, identity, limit, windowMs) {
  const now = Date.now();
  const key = `${namespace}:${identity}`;
  const entry = localWindows.get(key);
  if (!entry || entry.resetAt <= now) {
    localWindows.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, retryAfter: 0 };
  }
  entry.count += 1;
  return {
    success: entry.count <= limit,
    retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export async function enforceRateLimit(request, { namespace, limit, windowSeconds, identifier = '' }) {
  const identity = requestIdentity(request, identifier);
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV !== 'production') {
      return localRateLimit(namespace, identity, limit, windowSeconds * 1000);
    }
    return { success: false, unavailable: true, retryAfter: 0 };
  }

  const cacheKey = `${namespace}:${limit}:${windowSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.fixedWindow(limit, `${windowSeconds} s`),
      prefix: `rnt:${namespace}`,
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }

  try {
    const result = await limiter.limit(identity);
    return {
      success: result.success,
      retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  } catch (error) {
    console.error('Rate limiter service unavailable:', error);
    return { success: false, unavailable: true, retryAfter: 0 };
  }
}

export function rateLimitResponse(result) {
  if (result.unavailable) {
    return Response.json(
      { success: false, error: 'Layanan keamanan sedang tidak tersedia.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!result.success) {
    return Response.json(
      { success: false, error: 'Terlalu banyak permintaan. Coba lagi setelah beberapa saat.' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(result.retryAfter),
        },
      },
    );
  }
  return null;
}
