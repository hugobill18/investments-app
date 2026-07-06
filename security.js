// security.js — Durcissement de l'application (headers, rate-limiting, CSRF).
//
// Tout est implémenté sans dépendance externe :
//   - securityHeaders : CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS.
//   - createRateLimiter : limiteur en mémoire à fenêtre glissante (anti brute-force).
//   - sameOriginGuard : vérifie l'en-tête Origin sur les requêtes mutantes
//     (protection CSRF complémentaire au cookie SameSite=Lax).
//   - loadOrCreateSessionSecret : persiste le secret de session sur disque pour
//     ne pas invalider toutes les sessions à chaque redémarrage.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- En-têtes de sécurité --------------------------------------------------

// Tous les scripts sont servis en local (Chart.js vendorisé). Le dashboard
// conserve un gros script inline : la CSP autorise donc 'unsafe-inline' pour
// script/style, mais bloque tout domaine externe (exfiltration, injection).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (req.secure || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

// --- Rate limiting (fenêtre glissante en mémoire) ---------------------------

function createRateLimiter({ windowMs, max, message, keyFn }) {
  const hits = new Map(); // key -> [timestamps]

  // Purge périodique pour éviter la croissance mémoire
  const interval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, arr] of hits) {
      const kept = arr.filter(t => t > cutoff);
      if (kept.length === 0) hits.delete(k); else hits.set(k, kept);
    }
  }, windowMs);
  interval.unref?.();

  return function rateLimit(req, res, next) {
    const key = keyFn ? keyFn(req) : (req.ip || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = (hits.get(key) || []).filter(t => t > cutoff);
    if (arr.length >= max) {
      const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
      return res.status(429).json({
        error: message || 'Trop de tentatives. Réessayez dans quelques minutes.'
      });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

// --- Garde same-origin (CSRF) ----------------------------------------------

// Les navigateurs envoient toujours Origin sur les requêtes cross-site
// mutantes. Si Origin est présent et ne correspond pas à l'hôte servi,
// on refuse. Origin absent = requête same-origin ancienne ou outil local
// (curl) : on laisse passer, le cookie SameSite=Lax couvre déjà ce cas.
function sameOriginGuard(req, res, next) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!mutating) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Origine de la requête invalide.' });
  }
  if (originHost !== req.headers.host) {
    return res.status(403).json({ error: 'Requête inter-site refusée.' });
  }
  next();
}

// --- Secret de session persistant -------------------------------------------

function loadOrCreateSessionSecret(dataDir) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(dataDir, '.session-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch { /* fichier absent : on le crée */ }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = {
  securityHeaders,
  createRateLimiter,
  sameOriginGuard,
  loadOrCreateSessionSecret
};
