import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { verifyAccessToken } from '../core/auth/token.util.js';

const privateWindowMs = config.rateLimitWindowMinutes * 60 * 1000;
const authWindowMs = config.authRateLimitWindowMinutes * 60 * 1000;

const privateMax =
    config.nodeEnv === 'development'
        ? config.rateLimitDevMaxRequests
        : config.rateLimitMaxRequests;

/**
 * Resolve the real client IP behind Vite / nginx / Cloudflare / mobile gateways.
 * Prefer proxy headers, then Express `req.ip` (requires `trust proxy`).
 */
export function getClientIp(req) {
    const headerFirst = (value) => {
        if (!value) return null;
        const raw = Array.isArray(value) ? value[0] : String(value);
        const first = raw.split(',')[0]?.trim();
        return first || null;
    };

    const fromCf = headerFirst(req.headers['cf-connecting-ip']);
    if (fromCf) return stripIpv6Mapped(fromCf);

    const fromRealIp = headerFirst(req.headers['x-real-ip']);
    if (fromRealIp) return stripIpv6Mapped(fromRealIp);

    const fromForwarded = headerFirst(req.headers['x-forwarded-for']);
    if (fromForwarded) return stripIpv6Mapped(fromForwarded);

    const fromTrueClient = headerFirst(req.headers['true-client-ip']);
    if (fromTrueClient) return stripIpv6Mapped(fromTrueClient);

    if (req.ip) return stripIpv6Mapped(req.ip);

    const remote = req.socket?.remoteAddress || req.connection?.remoteAddress;
    return stripIpv6Mapped(remote || 'unknown');
}

function stripIpv6Mapped(ip) {
    const s = String(ip || '').trim();
    if (!s) return 'unknown';
    if (s.startsWith('::ffff:')) return s.slice(7);
    return s;
}

function normalizePath(req) {
    const raw = String(req.originalUrl || req.url || '').split('?')[0];
    // Mounted under /api → paths look like /api/v1/...
    return raw.replace(/\/+$/, '') || '/';
}

/**
 * Public / unauthenticated catalog & CMS routes — no rate limiting.
 */
export function isPublicApiPath(req) {
    const path = normalizePath(req);

    if (path === '/api/v1/health' || path === '/api/health') return true;

    // Explicit public segments
    if (
        path.includes('/public') ||
        /\/pages\/[^/]+$/.test(path) ||
        path.endsWith('/referral-settings') ||
        path.includes('/zones/detect') ||
        path.includes('/zones/nearby') ||
        path.includes('/zones/public') ||
        path.includes('/geocode/') ||
        path.includes('/payments/webhook') ||
        path.includes('/webhook/razorpay')
    ) {
        return true;
    }

    // Food user catalog (no auth)
    if (
        /\/food\/restaurant\/restaurants(\/|$)/.test(path) ||
        /\/food\/restaurant\/under-250$/.test(path) ||
        /\/food\/restaurant\/offers$/.test(path) ||
        /\/food\/restaurant\/categories\/public$/.test(path) ||
        /\/food\/dining\/(categories|restaurants)\/public$/.test(path) ||
        /\/food\/search\/unified$/.test(path) ||
        /\/food\/explore-icons\/public$/.test(path)
    ) {
        return true;
    }

    // Public registration entry (no token yet) — free; OTP still auth-limited
    if (
        path.endsWith('/food/delivery/register') ||
        path.endsWith('/food/restaurant/register')
    ) {
        return true;
    }

    return false;
}

/**
 * Auth credential endpoints — handled only by `authRateLimiter` on the route.
 */
export function isAuthCredentialPath(req) {
    const path = normalizePath(req);
    if (!path.includes('/auth/')) return false;

    return (
        /\/request-otp$/.test(path) ||
        /\/verify-otp$/.test(path) ||
        /\/admin\/login$/.test(path) ||
        /\/forgot-password\//.test(path) ||
        /\/restaurant\/reapply$/.test(path) ||
        /\/refresh-token$/.test(path) ||
        /\/logout$/.test(path)
    );
}

function getRateLimitUserId(req) {
    if (req.user?.userId) return String(req.user.userId);

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return null;

    try {
        const decoded = verifyAccessToken(token);
        return decoded?.userId ? String(decoded.userId) : null;
    } catch {
        return null;
    }
}

const rateLimitJson = (message) => ({
    success: false,
    message,
});

/** Private / authenticated API budget — keyed by user + real IP. */
export const privateRateLimiter = rateLimit({
    windowMs: privateWindowMs,
    max: privateMax,
    standardHeaders: true,
    legacyHeaders: false,
    // We resolve IP ourselves (proxy headers + trust proxy).
    validate: { xForwardedForHeader: false, default: true },
    keyGenerator: (req) => {
        const ip = getClientIp(req);
        const userId = getRateLimitUserId(req);
        return userId ? `private:user:${userId}:ip:${ip}` : `private:ip:${ip}`;
    },
    message: rateLimitJson('Too many requests, please try again later.'),
    skip: () => !config.rateLimitEnabled,
});

/** Auth OTP / login budget — keyed by real IP (and optional phone). */
export const authRateLimiter = rateLimit({
    windowMs: authWindowMs,
    max: config.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: true },
    keyGenerator: (req) => {
        const ip = getClientIp(req);
        const phone =
            req.body?.phone != null
                ? String(req.body.phone).replace(/\D/g, '').slice(-15)
                : '';
        return phone ? `auth:phone:${phone}:ip:${ip}` : `auth:ip:${ip}`;
    },
    message: rateLimitJson('Too many authentication attempts. Please try again later.'),
    skip: () => !config.rateLimitEnabled,
});

/**
 * Mount on `/api`:
 * 1) public → no limit
 * 2) auth credential routes → skip here (route-level authRateLimiter)
 * 3) everything else (private) → user+IP private limit
 */
export function apiRateLimitMiddleware(req, res, next) {
    if (!config.rateLimitEnabled) return next();
    if (isPublicApiPath(req)) return next();
    if (isAuthCredentialPath(req)) return next();
    return privateRateLimiter(req, res, next);
}

/** @deprecated Use apiRateLimitMiddleware / privateRateLimiter */
export const apiRateLimiter = apiRateLimitMiddleware;
