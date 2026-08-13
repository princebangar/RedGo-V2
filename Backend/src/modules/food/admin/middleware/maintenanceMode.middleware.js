import {
  isMaintenanceModeEnabled,
} from '../services/maintenanceMode.service.js';
import { verifyAccessToken } from '../../../../core/auth/token.util.js';

const ADMIN_ROLES = new Set(['ADMIN', 'SUB_ADMIN']);

const ALWAYS_ALLOW_PREFIXES = [
  '/v1/health',
  '/v1/food/public/customization-settings',
  '/v1/food/admin',
  '/v1/admin',
  '/v1/payments/webhook',
  '/v1/food/auth',
  '/v1/auth',
];

function resolvePath(req) {
  const raw = String(req.originalUrl || req.url || req.path || '');
  const withoutQuery = raw.split('?')[0] || '';
  if (withoutQuery.startsWith('/api/')) return withoutQuery.slice(4) || '/';
  if (withoutQuery === '/api') return '/';
  return String(req.path || withoutQuery || '');
}

function isAlwaysAllowed(path) {
  const p = String(path || '');
  return ALWAYS_ALLOW_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`)
  );
}

function isAdminBearer(req) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return false;
    const decoded = verifyAccessToken(token);
    const role = String(decoded?.role || '').toUpperCase();
    return ADMIN_ROLES.has(role);
  } catch {
    return false;
  }
}

/**
 * Blocks user / restaurant / delivery APIs while maintenance is on.
 * Admin stays fully available (admin routes + any admin-authenticated request).
 */
export async function maintenanceModeMiddleware(req, res, next) {
  try {
    const path = resolvePath(req);

    if (isAlwaysAllowed(path) || isAdminBearer(req)) {
      return next();
    }

    const enabled = await isMaintenanceModeEnabled();
    if (enabled !== true) {
      return next();
    }

    return res.status(503).json({
      success: false,
      code: 'MAINTENANCE_MODE',
      message: 'Service is under maintenance. Please try again later.',
    });
  } catch {
    return next();
  }
}
