// server.js — Serveur Express avec authentification en deux étapes
//
// Flux :
//   1. L'utilisateur arrive sur l'écran d'accueil (/).
//   2. Il saisit email + mot de passe.
//   3. Si cet appareil a déjà une "clef d'accès" valide (cookie device_key),
//      il est connecté directement.
//   4. Sinon, un code à 6 chiffres est envoyé par email (/login).
//      L'utilisateur saisit le code (/verify-code) et peut choisir
//      de "faire confiance à cet appareil" — une clef d'accès est alors
//      enregistrée dans un cookie sécurisé pour les prochaines connexions.
//   5. Une fois authentifié, il accède à /dashboard.

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const db = require('./db');
const { sendLoginCode } = require('./mailer');
const { computeCashflow } = require('./cashflow');
const { computeAccount, isPortfolio, TYPE_LABELS: FIN_TYPE_LABELS } = require('./financial');
const { fetchQuote, fetchQuotesBatch } = require('./quotes');
const { LIVRET_REFERENCE_RATES, LIVRET_REFERENCE_NOTE } = require('./rates');
const apiProviders = require('./api-providers');
const { KNOWN_TICKERS, searchTickers } = require('./api-providers/known-tickers');
const setupApiRoutes = require('./api-routes');
const setupV2Routes = require('./routes-v2');
const { calculerIR, calculerNbParts } = require('./tax');
const { simulerImpactFiscal } = require('./fiscal-simulator');
const {
  securityHeaders, createRateLimiter, sameOriginGuard, loadOrCreateSessionSecret
} = require('./security');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
// Secret persistant : ne pas invalider les sessions à chaque redémarrage
const SESSION_SECRET = loadOrCreateSessionSecret(path.join(__dirname, 'data'));
const IS_PROD = process.env.NODE_ENV === 'production';

// --- Middlewares ---------------------------------------------------------

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '3mb' }));       // 3 Mo : import de relevés CSV
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
  name: 'sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,               // HTTPS obligatoire en production
    maxAge: 1000 * 60 * 60 * 8 // 8 heures
  }
}));

// Protection CSRF : refuse les requêtes mutantes venant d'une autre origine
app.use('/api', sameOriginGuard);

// Anti brute-force sur les endpoints d'authentification
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, max: 20,
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
});
const codeLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, max: 10,
  message: 'Trop de codes demandés ou essayés. Réessayez dans 15 minutes.'
});
app.use(['/api/login', '/api/register'], authLimiter);
app.use(['/api/verify-code', '/api/resend-code'], codeLimiter);

// Sert les fichiers statiques (HTML/CSS/JS) sauf /dashboard qui est protégé
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

// Enregistrer les nouvelles routes API financières (cache, cotations, taux)
setupApiRoutes(app, db, requireAuth);

// Routes v2 : projection, insights/news, abonnements, opportunités immo
setupV2Routes(app, db, requireAuth);

// --- Utilitaires ---------------------------------------------------------

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateCode() {
  // Code à 6 chiffres, sans biais modulo
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function generateAccessKey() {
  // Clef aléatoire longue, stockée dans un cookie et (hashée) en DB
  return crypto.randomBytes(32).toString('base64url');
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié' });
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
  next();
}

// Vérifie si le cookie "device_key" correspond à un appareil de confiance valide
// pour un utilisateur donné. Renvoie le user_id si oui, sinon null.
function getTrustedUserIdFromCookie(req) {
  const raw = req.cookies && req.cookies.device_key;
  if (!raw) return null;
  const row = db.prepare('SELECT user_id FROM trusted_devices WHERE key_hash = ?')
                .get(hashToken(raw));
  if (!row) return null;
  db.prepare('UPDATE trusted_devices SET last_used_at = datetime(\'now\') WHERE key_hash = ?')
    .run(hashToken(raw));
  return row.user_id;
}

// --- Routes API ----------------------------------------------------------

// Inscription : crée le compte, envoie un code de vérification par email
app.post('/api/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Adresse email invalide.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Mot de passe trop court (min 8 caractères).' });

    if (findUserByEmail(email))
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });

    const hash = await bcrypt.hash(password, 12);

    // Vérifie si cet email est pré-approuvé admin
    const preApproved = db.prepare('SELECT id FROM pending_admin_emails WHERE email = ?').get(email);
    const isAdmin = preApproved ? 1 : 0;

    const info = db.prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, ?)')
                   .run(email, hash, isAdmin);
    const userId = info.lastInsertRowid;

    // Supprime l'entrée de pré-approbation si elle existait
    if (preApproved) {
      db.prepare('DELETE FROM pending_admin_emails WHERE email = ?').run(email);
    }

    // Envoie un code pour confirmer l'email dès l'inscription
    const code = generateCode();
    const codeHash = hashToken(code);
    db.prepare(`INSERT INTO login_codes (user_id, code_hash, purpose, expires_at)
                VALUES (?, ?, 'register', datetime('now', '+10 minutes'))`)
      .run(userId, codeHash);

    await sendLoginCode(email, code);

    // L'utilisateur n'est pas encore connecté : il doit d'abord saisir le code
    req.session.pendingUserId = userId;
    req.session.pendingPurpose = 'register';
    res.json({ ok: true, email });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Étape 1 : vérifier email + mot de passe, puis :
//   - si appareil de confiance reconnu → connexion immédiate
//   - sinon → envoi d'un code par email
app.post('/api/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const user = findUserByEmail(email);

    // Message générique pour éviter la fuite d'information
    const genericFail = { error: 'Email ou mot de passe incorrect.' };
    if (!user) return res.status(401).json(genericFail);

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json(genericFail);

    // Appareil de confiance ?
    const trustedUserId = getTrustedUserIdFromCookie(req);
    if (trustedUserId && trustedUserId === user.id) {
      req.session.userId = user.id;
      req.session.email = user.email;
      return res.json({ ok: true, step: 'authenticated', trusted: true });
    }

    // Sinon : envoyer un code
    const code = generateCode();
    db.prepare(`INSERT INTO login_codes (user_id, code_hash, purpose, expires_at)
                VALUES (?, ?, 'login', datetime('now', '+10 minutes'))`)
      .run(user.id, hashToken(code));
    const result = await sendLoginCode(user.email, code);

    req.session.pendingUserId = user.id;
    req.session.pendingPurpose = 'login';

    res.json({
      ok: true,
      step: 'code-sent',
      email: user.email,
      mocked: !!result.mocked       // true = le code s'affiche dans le terminal
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Étape 2 : vérifier le code reçu par email
app.post('/api/verify-code', (req, res) => {
  try {
    const code = String(req.body.code || '').trim();
    const trustDevice = !!req.body.trustDevice;
    const userId = req.session.pendingUserId;
    const purpose = req.session.pendingPurpose;

    if (!userId || !purpose)
      return res.status(400).json({ error: 'Aucune vérification en cours.' });
    if (!/^\d{6}$/.test(code))
      return res.status(400).json({ error: 'Le code doit contenir 6 chiffres.' });

    // Anti brute-force : 5 essais max par vérification en cours.
    req.session.verifyAttempts = (req.session.verifyAttempts || 0) + 1;
    if (req.session.verifyAttempts > 5) {
      db.prepare('DELETE FROM login_codes WHERE user_id = ? AND used_at IS NULL').run(userId);
      delete req.session.pendingUserId;
      delete req.session.pendingPurpose;
      delete req.session.verifyAttempts;
      return res.status(429).json({ error: 'Trop d’essais. Recommencez la connexion.' });
    }

    const row = db.prepare(`
      SELECT id FROM login_codes
       WHERE user_id = ? AND purpose = ? AND code_hash = ?
         AND used_at IS NULL AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1
    `).get(userId, purpose, hashToken(code));

    if (!row) return res.status(401).json({ error: 'Code invalide ou expiré.' });

    // Marque le code comme utilisé et ouvre la session
    db.prepare('UPDATE login_codes SET used_at = datetime(\'now\') WHERE id = ?').run(row.id);
    const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
    req.session.userId = user.id;
    req.session.email = user.email;
    delete req.session.pendingUserId;
    delete req.session.pendingPurpose;
    delete req.session.verifyAttempts;

    // Option : enregistrer une clef d'accès pour cet appareil
    if (trustDevice) {
      const key = generateAccessKey();
      db.prepare(`INSERT INTO trusted_devices (user_id, key_hash, user_agent)
                  VALUES (?, ?, ?)`)
        .run(user.id, hashToken(key), req.headers['user-agent'] || '');
      res.cookie('device_key', key, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 180 // 180 jours
      });
    }

    res.json({ ok: true, email: user.email, trusted: trustDevice });
  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Renvoyer un nouveau code (si l'utilisateur n'a pas reçu le premier)
app.post('/api/resend-code', async (req, res) => {
  try {
    const userId = req.session.pendingUserId;
    const purpose = req.session.pendingPurpose;
    if (!userId || !purpose)
      return res.status(400).json({ error: 'Aucune vérification en cours.' });

    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const code = generateCode();
    db.prepare(`INSERT INTO login_codes (user_id, code_hash, purpose, expires_at)
                VALUES (?, ?, ?, datetime('now', '+10 minutes'))`)
      .run(userId, hashToken(code), purpose);
    const result = await sendLoginCode(user.email, code);
    res.json({ ok: true, mocked: !!result.mocked });
  } catch (err) {
    console.error('resend-code error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Déconnexion — on supprime aussi la clef d'accès locale si présente
app.post('/api/logout', (req, res) => {
  const raw = req.cookies && req.cookies.device_key;
  if (raw) {
    db.prepare('DELETE FROM trusted_devices WHERE key_hash = ?').run(hashToken(raw));
    res.clearCookie('device_key');
  }
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

// Infos de l'utilisateur connecté
app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ id: user.id, email: user.email, isAdmin: !!user.is_admin });
});

// --- Routes Immobilier ---------------------------------------------------

const ALLOWED_TYPES   = ['principale', 'secondaire', 'locative_meublee', 'locative_nue', 'nue_propriete'];
const ALLOWED_REGIMES = ['aucune', 'micro_foncier', 'reel_foncier', 'micro_bic', 'reel_bic'];

function validatePropertyPayload(body) {
  const errors = [];
  const label = String(body.label || '').trim();
  if (!label) errors.push('Le libellé est obligatoire.');
  if (label.length > 120) errors.push('Libellé trop long (max 120 caractères).');

  const type = String(body.property_type || '').trim();
  if (!ALLOWED_TYPES.includes(type)) errors.push('Type de bien invalide.');

  const regime = String(body.tax_regime || 'aucune').trim();
  if (!ALLOWED_REGIMES.includes(regime)) errors.push('Régime fiscal invalide.');

  const nums = ['current_value','credit_monthly_payment','rent_monthly',
                'property_tax_annual','condo_charges_annual',
                'deductible_charges_annual'];
  const data = { label, property_type: type, tax_regime: regime };
  for (const k of nums) {
    const v = Number(body[k]);
    if (body[k] !== undefined && body[k] !== '' && (!Number.isFinite(v) || v < 0)) {
      errors.push(`Valeur invalide pour ${k}.`);
    }
    data[k] = Number.isFinite(v) ? v : 0;
  }
  data.notes = String(body.notes || '').slice(0, 1000);
  return { errors, data };
}

function propertyWithCashflow(row) {
  return { ...row, cashflow: computeCashflow(row) };
}

// Liste des biens du user connecté
app.get('/api/properties', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM properties WHERE user_id = ? ORDER BY id ASC')
                 .all(req.session.userId);
  res.json(rows.map(propertyWithCashflow));
});

// Détails d'un bien
app.get('/api/properties/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?')
                .get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Bien introuvable.' });
  res.json(propertyWithCashflow(row));
});

// Créer un bien
app.post('/api/properties', requireAuth, (req, res) => {
  const { errors, data } = validatePropertyPayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const info = db.prepare(`
    INSERT INTO properties
      (user_id, label, property_type, current_value,
       credit_monthly_payment, rent_monthly,
       property_tax_annual, condo_charges_annual,
       tax_regime, deductible_charges_annual, notes)
    VALUES (@user_id, @label, @property_type, @current_value,
            @credit_monthly_payment, @rent_monthly,
            @property_tax_annual, @condo_charges_annual,
            @tax_regime, @deductible_charges_annual, @notes)
  `).run({ user_id: req.session.userId, ...data });

  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(propertyWithCashflow(row));
});

// Mettre à jour un bien
app.put('/api/properties/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT id FROM properties WHERE id = ? AND user_id = ?')
                     .get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: 'Bien introuvable.' });

  const { errors, data } = validatePropertyPayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  db.prepare(`
    UPDATE properties SET
      label = @label,
      property_type = @property_type,
      current_value = @current_value,
      credit_monthly_payment = @credit_monthly_payment,
      rent_monthly = @rent_monthly,
      property_tax_annual = @property_tax_annual,
      condo_charges_annual = @condo_charges_annual,
      tax_regime = @tax_regime,
      deductible_charges_annual = @deductible_charges_annual,
      notes = @notes,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({ id: Number(req.params.id), ...data });

  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  res.json(propertyWithCashflow(row));
});

// Simulation d'impact fiscal — 3 régimes côte à côte pour un bien donné
// GET /api/biens/:id/fiscal-simulation
app.get('/api/biens/:id/fiscal-simulation', requireAuth, (req, res) => {
  const bien = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?')
                 .get(req.params.id, req.session.userId);
  if (!bien) return res.status(404).json({ error: 'Bien introuvable.' });

  // Récupérer le foyer fiscal et les revenus pour calculer la TMI réelle
  const foyer   = getFoyerForUser(req.session.userId);
  const revenus = getRevenusForUser(req.session.userId);

  try {
    const simulation = simulerImpactFiscal({ bien, foyer, revenus });
    res.json(simulation);
  } catch (err) {
    console.error('fiscal-simulation error:', err);
    res.status(500).json({ error: 'Erreur lors du calcul de la simulation fiscale.' });
  }
});

// Supprimer un bien
app.delete('/api/properties/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM properties WHERE id = ? AND user_id = ?')
                 .run(req.params.id, req.session.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Bien introuvable.' });
  res.json({ ok: true });
});

// --- Routes Financier ---------------------------------------------------

const ALLOWED_ACCOUNT_TYPES = [
  'livret','livret_banque','assurance_vie_euro','pel','cel','epargne_simple',
  'compte_titres','pea','assurance_vie_uc','per','crypto','autre'
];

function validateAccountPayload(body) {
  const errors = [];
  const label = String(body.label || '').trim();
  if (!label) errors.push('Le libellé est obligatoire.');
  if (label.length > 120) errors.push('Libellé trop long (max 120).');

  const type = String(body.account_type || '').trim();
  if (!ALLOWED_ACCOUNT_TYPES.includes(type)) errors.push('Type de placement invalide.');

  const nums = ['amount','monthly_in','monthly_out','annual_rate',
                'fees_entry_pct','fees_mgmt_pct','fees_exit_pct'];
  const data = { label, account_type: type };
  for (const k of nums) {
    const v = Number(body[k]);
    if (body[k] !== undefined && body[k] !== '' && !Number.isFinite(v)) {
      errors.push(`Valeur invalide pour ${k}.`);
    }
    data[k] = Number.isFinite(v) ? v : 0;
  }
  // Les frais sont des pourcentages raisonnables (0 à 10%)
  for (const k of ['fees_entry_pct','fees_mgmt_pct','fees_exit_pct']) {
    if (data[k] < 0 || data[k] > 10) errors.push(`Frais invalides pour ${k} (0 à 10%).`);
  }
  // Année d'ouverture : sert au calcul de l'ancienneté fiscale (PEA, AV)
  const oy = Number(body.opened_year);
  data.opened_year = (Number.isFinite(oy) && oy >= 1950 && oy <= new Date().getFullYear()) ? Math.floor(oy) : null;
  data.notes = String(body.notes || '').slice(0, 1000);
  return { errors, data };
}

function validatePositionPayload(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  if (!name) errors.push('Le nom de la position est obligatoire.');
  if (name.length > 120) errors.push('Nom trop long (max 120).');

  const data = {
    ticker: String(body.ticker || '').trim().slice(0, 30),
    name,
    currency: String(body.currency || 'EUR').trim().slice(0, 10) || 'EUR'
  };
  for (const k of ['quantity','buy_price','current_price']) {
    const v = Number(body[k]);
    if (body[k] !== undefined && body[k] !== '' && (!Number.isFinite(v) || v < 0)) {
      errors.push(`Valeur invalide pour ${k}.`);
    }
    data[k] = Number.isFinite(v) ? v : 0;
  }
  return { errors, data };
}

function getPositionsFor(accountId) {
  return db.prepare('SELECT * FROM positions WHERE account_id = ? ORDER BY id ASC').all(accountId);
}

function accountWithDetails(account) {
  const positions = isPortfolio(account.account_type) ? getPositionsFor(account.id) : [];
  return { ...account, positions, metrics: computeAccount(account, positions) };
}

// Liste des comptes financiers
app.get('/api/financial-accounts', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM financial_accounts WHERE user_id = ? ORDER BY id ASC')
                 .all(req.session.userId);
  res.json(rows.map(accountWithDetails));
});

// Détail
app.get('/api/financial-accounts/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM financial_accounts WHERE id = ? AND user_id = ?')
                .get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Compte introuvable.' });
  res.json(accountWithDetails(row));
});

// Créer
app.post('/api/financial-accounts', requireAuth, (req, res) => {
  const { errors, data } = validateAccountPayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const info = db.prepare(`
    INSERT INTO financial_accounts
      (user_id, label, account_type, amount, monthly_in, monthly_out, annual_rate,
       fees_entry_pct, fees_mgmt_pct, fees_exit_pct, opened_year, notes)
    VALUES (@user_id, @label, @account_type, @amount, @monthly_in, @monthly_out, @annual_rate,
            @fees_entry_pct, @fees_mgmt_pct, @fees_exit_pct, @opened_year, @notes)
  `).run({ user_id: req.session.userId, ...data });
  const row = db.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(accountWithDetails(row));
});

// Mettre à jour
app.put('/api/financial-accounts/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT id FROM financial_accounts WHERE id = ? AND user_id = ?')
                     .get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: 'Compte introuvable.' });
  const { errors, data } = validateAccountPayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  db.prepare(`
    UPDATE financial_accounts SET
      label = @label, account_type = @account_type,
      amount = @amount, monthly_in = @monthly_in, monthly_out = @monthly_out,
      annual_rate = @annual_rate,
      fees_entry_pct = @fees_entry_pct, fees_mgmt_pct = @fees_mgmt_pct,
      fees_exit_pct = @fees_exit_pct, opened_year = @opened_year,
      notes = @notes, updated_at = datetime('now')
    WHERE id = @id
  `).run({ id: Number(req.params.id), ...data });
  const row = db.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(req.params.id);
  res.json(accountWithDetails(row));
});

// Supprimer (les positions partent en cascade)
app.delete('/api/financial-accounts/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM financial_accounts WHERE id = ? AND user_id = ?')
                 .run(req.params.id, req.session.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Compte introuvable.' });
  res.json({ ok: true });
});

// --- Positions (portefeuilles) ------------------------------------------

function ensureOwnedAccount(accountId, userId) {
  return db.prepare('SELECT id, account_type FROM financial_accounts WHERE id = ? AND user_id = ?')
           .get(accountId, userId);
}

app.get('/api/financial-accounts/:id/positions', requireAuth, (req, res) => {
  const acc = ensureOwnedAccount(req.params.id, req.session.userId);
  if (!acc) return res.status(404).json({ error: 'Compte introuvable.' });
  res.json(getPositionsFor(acc.id));
});

app.post('/api/financial-accounts/:id/positions', requireAuth, async (req, res) => {
  const acc = ensureOwnedAccount(req.params.id, req.session.userId);
  if (!acc) return res.status(404).json({ error: 'Compte introuvable.' });
  if (!isPortfolio(acc.account_type))
    return res.status(400).json({ error: 'Ce type de placement n\u2019accepte pas de positions.' });
  const { errors, data } = validatePositionPayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  // Si un ticker est fourni et qu'aucun prix actuel n'est renseigné, on tente
  // de récupérer la cotation en direct via Yahoo. En cas d'échec, on persiste
  // quand même avec la valeur fournie par l'utilisateur.
  let fetched = null;
  if (data.ticker && (!data.current_price || data.current_price === 0)) {
    try {
      const q = await fetchQuote(data.ticker);
      data.current_price = q.price;
      data.currency = q.currency || data.currency;
      // Si l'utilisateur n'a pas saisi de nom, on utilise celui renvoyé par Yahoo.
      if (!data.name || data.name.trim() === data.ticker.trim()) data.name = q.name;
      fetched = { ok: true, price: q.price, source: q.symbol };
    } catch (e) {
      fetched = { ok: false, error: e.message };
    }
  }

  const info = db.prepare(`
    INSERT INTO positions (account_id, ticker, name, quantity, buy_price, current_price, currency, last_updated)
    VALUES (@account_id, @ticker, @name, @quantity, @buy_price, @current_price, @currency, @last_updated)
  `).run({
    account_id: acc.id,
    ...data,
    last_updated: fetched && fetched.ok ? new Date().toISOString() : null
  });
  const row = db.prepare('SELECT * FROM positions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...row, fetched });
});

app.put('/api/positions/:id', requireAuth, async (req, res) => {
  // Vérifie que la position appartient à un compte de l'utilisateur
  const row = db.prepare(`
    SELECT p.* FROM positions p
    JOIN financial_accounts a ON a.id = p.account_id
    WHERE p.id = ? AND a.user_id = ?
  `).get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Position introuvable.' });
  const { errors, data } = validatePositionPayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  // Si le ticker vient de changer, on refait un fetch (silencieux en cas d'échec).
  let last_updated = row.last_updated;
  if (data.ticker && data.ticker !== row.ticker) {
    try {
      const q = await fetchQuote(data.ticker);
      data.current_price = q.price;
      data.currency = q.currency || data.currency;
      last_updated = new Date().toISOString();
    } catch {/* on laisse les valeurs saisies par l'utilisateur */}
  }

  db.prepare(`
    UPDATE positions SET ticker=@ticker, name=@name, quantity=@quantity,
      buy_price=@buy_price, current_price=@current_price, currency=@currency,
      last_updated=@last_updated
    WHERE id = @id
  `).run({ id: Number(req.params.id), ...data, last_updated });
  res.json(db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id));
});

app.delete('/api/positions/:id', requireAuth, (req, res) => {
  const info = db.prepare(`
    DELETE FROM positions WHERE id = ? AND account_id IN
      (SELECT id FROM financial_accounts WHERE user_id = ?)
  `).run(req.params.id, req.session.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Position introuvable.' });
  res.json({ ok: true });
});

// --- Résumé global (page Accueil) ---------------------------------------

app.get('/api/summary', requireAuth, (req, res) => {
  // Immobilier
  const propertyRows = db.prepare('SELECT * FROM properties WHERE user_id = ?').all(req.session.userId);
  const immo = {
    propertyCount: propertyRows.length,
    totalCurrentValue: 0, annualRevenue: 0, annualCredit: 0,
    annualPropertyTax: 0, annualCondoCharges: 0, annualExpenses: 0,
    estimatedTax: 0, grossCashflow: 0, netCashflow: 0, monthlyNetCashflow: 0,
    perProperty: []   // pour le graphique "cashflow par bien"
  };
  for (const r of propertyRows) {
    const c = computeCashflow(r);
    immo.totalCurrentValue  += Number(r.current_value) || 0;
    immo.annualRevenue      += c.annualRevenue;
    immo.annualCredit       += c.annualCredit;
    immo.annualPropertyTax  += c.annualPropertyTax;
    immo.annualCondoCharges += c.annualCondoCharges;
    immo.annualExpenses     += c.annualExpenses;
    immo.estimatedTax       += c.estimatedTax;
    immo.grossCashflow      += c.grossCashflow;
    immo.netCashflow        += c.netCashflow;
    immo.perProperty.push({
      id: r.id, label: r.label, type: r.property_type,
      annualCashflow: c.netCashflow, monthlyCashflow: c.monthlyNetCashflow
    });
  }
  immo.monthlyNetCashflow = immo.netCashflow / 12;

  // Financier
  const accountRows = db.prepare('SELECT * FROM financial_accounts WHERE user_id = ?').all(req.session.userId);
  const fin = {
    accountCount: accountRows.length,
    totalValue: 0, totalInvested: 0, totalUnrealizedGain: 0,
    monthlyNet: 0, annualNet: 0, estimatedAnnualReturn: 0,
    byType: {}   // { pea: 12000, livret: 5000, ... } pour le graphique "composition"
  };
  for (const a of accountRows) {
    const positions = isPortfolio(a.account_type) ? getPositionsFor(a.id) : [];
    const m = computeAccount(a, positions);
    fin.totalValue            += m.currentValue;
    fin.totalInvested         += m.investedValue;
    fin.totalUnrealizedGain   += m.unrealizedGain;
    fin.monthlyNet            += m.monthlyNet;
    fin.annualNet             += m.annualNet;
    fin.estimatedAnnualReturn += m.estimatedAnnualReturn;
    fin.byType[a.account_type] = (fin.byType[a.account_type] || 0) + m.currentValue;
  }

  res.json({
    immobilier: immo,
    financier: fin,
    patrimoine: {
      total: immo.totalCurrentValue + fin.totalValue,
      immobilier: immo.totalCurrentValue,
      financier: fin.totalValue
    }
  });
});

// --- Routes Cotations (Yahoo Finance) ----------------------------------

// Taux de référence des livrets : pour pré-remplir le formulaire côté client.
app.get('/api/reference-rates', requireAuth, (req, res) => {
  res.json({ rates: LIVRET_REFERENCE_RATES, note: LIVRET_REFERENCE_NOTE });
});

// Rafraîchir toutes les positions de l'utilisateur (appelé automatiquement
// à l'ouverture du dashboard, ou via un bouton). Non bloquant côté client.
app.post('/api/refresh-quotes', requireAuth, async (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.ticker FROM positions p
    JOIN financial_accounts a ON a.id = p.account_id
    WHERE a.user_id = ? AND p.ticker IS NOT NULL AND TRIM(p.ticker) != ''
  `).all(req.session.userId);

  if (rows.length === 0) return res.json({ refreshed: 0, failed: 0, details: [] });

  const tickers = [...new Set(rows.map(r => r.ticker.trim()))];
  const quotes = await fetchQuotesBatch(tickers);
  const quoteMap = new Map(quotes.map(q => [q.ticker, q]));

  const update = db.prepare(`
    UPDATE positions SET current_price = ?, currency = COALESCE(?, currency), last_updated = ?
    WHERE id = ?
  `);
  const now = new Date().toISOString();

  const details = [];
  let refreshed = 0, failed = 0;

  const tx = db.transaction(() => {
    for (const r of rows) {
      const q = quoteMap.get(r.ticker.trim());
      if (q && q.ok) {
        update.run(q.data.price, q.data.currency || null, now, r.id);
        refreshed++;
        details.push({ id: r.id, ticker: r.ticker, ok: true, price: q.data.price });
      } else {
        failed++;
        details.push({ id: r.id, ticker: r.ticker, ok: false, error: q?.error || 'Inconnu' });
      }
    }
  });
  tx();

  res.json({ refreshed, failed, at: now, details });
});

// Rafraîchir une position unique (bouton dédié si l'utilisateur veut forcer)
app.post('/api/positions/:id/refresh', requireAuth, async (req, res) => {
  const row = db.prepare(`
    SELECT p.* FROM positions p
    JOIN financial_accounts a ON a.id = p.account_id
    WHERE p.id = ? AND a.user_id = ?
  `).get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Position introuvable.' });
  if (!row.ticker || !row.ticker.trim())
    return res.status(400).json({ error: 'Aucun ticker pour cette position.' });

  try {
    const q = await fetchQuote(row.ticker);
    const now = new Date().toISOString();
    db.prepare('UPDATE positions SET current_price=?, currency=?, last_updated=? WHERE id=?')
      .run(q.price, q.currency || row.currency, now, row.id);
    res.json({ ok: true, price: q.price, currency: q.currency, at: now });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// --- Routes Foyer Fiscal -----------------------------------------------

const ALLOWED_SITUATIONS = ['celibataire', 'marie', 'pacse', 'divorce', 'veuf', 'separe'];

function getFoyerForUser(userId) {
  return db.prepare('SELECT * FROM foyer_fiscal WHERE user_id = ?').get(userId) || null;
}

function getRevenusForUser(userId) {
  return db.prepare('SELECT * FROM revenus WHERE user_id = ? ORDER BY id ASC').all(userId);
}

// GET /api/foyer — récupère le foyer fiscal
app.get('/api/foyer', requireAuth, (req, res) => {
  const foyer = getFoyerForUser(req.session.userId);
  if (!foyer) {
    // Retourner un foyer vide avec les valeurs par défaut
    return res.json({
      user_id: req.session.userId,
      situation_maritale: 'celibataire',
      nb_enfants: 0,
      nb_enfants_altgarde: 0,
      parent_isole: 0,
      nb_personnes_charge: 0,
      notes: ''
    });
  }
  res.json(foyer);
});

// PUT /api/foyer — crée ou met à jour le foyer fiscal
app.put('/api/foyer', requireAuth, (req, res) => {
  const situation = String(req.body.situation_maritale || 'celibataire').toLowerCase().trim();
  if (!ALLOWED_SITUATIONS.includes(situation)) {
    return res.status(400).json({ error: 'Situation maritale invalide.' });
  }

  // Année de naissance : utilisée pour la durée maximale d'emprunt (70 ans)
  const by = Number(req.body.birth_year);
  const birthYear = (Number.isFinite(by) && by >= 1920 && by <= new Date().getFullYear() - 18)
    ? Math.floor(by) : null;

  const data = {
    user_id: req.session.userId,
    situation_maritale: situation,
    nb_enfants: Math.max(0, Math.floor(Number(req.body.nb_enfants) || 0)),
    nb_enfants_altgarde: Math.max(0, Math.floor(Number(req.body.nb_enfants_altgarde) || 0)),
    parent_isole: req.body.parent_isole ? 1 : 0,
    nb_personnes_charge: Math.max(0, Math.floor(Number(req.body.nb_personnes_charge) || 0)),
    birth_year: birthYear,
    notes: String(req.body.notes || '').slice(0, 1000)
  };

  db.prepare(`
    INSERT INTO foyer_fiscal
      (user_id, situation_maritale, nb_enfants, nb_enfants_altgarde, parent_isole, nb_personnes_charge, birth_year, notes)
    VALUES
      (@user_id, @situation_maritale, @nb_enfants, @nb_enfants_altgarde, @parent_isole, @nb_personnes_charge, @birth_year, @notes)
    ON CONFLICT(user_id) DO UPDATE SET
      situation_maritale  = excluded.situation_maritale,
      nb_enfants          = excluded.nb_enfants,
      nb_enfants_altgarde = excluded.nb_enfants_altgarde,
      parent_isole        = excluded.parent_isole,
      nb_personnes_charge = excluded.nb_personnes_charge,
      birth_year          = excluded.birth_year,
      notes               = excluded.notes,
      updated_at          = datetime('now')
  `).run(data);

  const foyer = getFoyerForUser(req.session.userId);
  res.json(foyer);
});

// --- Routes Revenus --------------------------------------------------------

const ALLOWED_TYPES_REVENU = ['salaire', 'retraite', 'chomage', 'bic_location_meublee', 'autre'];
const ALLOWED_MEMBRES = ['declarant1', 'declarant2'];

// GET /api/revenus
app.get('/api/revenus', requireAuth, (req, res) => {
  const revenus = getRevenusForUser(req.session.userId);
  res.json(revenus);
});

// POST /api/revenus
app.post('/api/revenus', requireAuth, (req, res) => {
  const type = String(req.body.type_revenu || '').toLowerCase().trim();
  if (!ALLOWED_TYPES_REVENU.includes(type)) {
    return res.status(400).json({ error: `Type de revenu invalide. Valides: ${ALLOWED_TYPES_REVENU.join(', ')}` });
  }
  const membre = String(req.body.membre || 'declarant1').toLowerCase().trim();
  if (!ALLOWED_MEMBRES.includes(membre)) {
    return res.status(400).json({ error: 'Membre invalide (declarant1 ou declarant2).' });
  }
  const montant = Number(req.body.montant_annuel);
  if (!Number.isFinite(montant) || montant < 0) {
    return res.status(400).json({ error: 'Montant invalide.' });
  }

  const info = db.prepare(`
    INSERT INTO revenus (user_id, type_revenu, membre, label, montant_annuel, notes)
    VALUES (@user_id, @type_revenu, @membre, @label, @montant_annuel, @notes)
  `).run({
    user_id: req.session.userId,
    type_revenu: type,
    membre,
    label: String(req.body.label || '').trim().slice(0, 120),
    montant_annuel: montant,
    notes: String(req.body.notes || '').slice(0, 1000)
  });

  res.status(201).json(db.prepare('SELECT * FROM revenus WHERE id = ?').get(info.lastInsertRowid));
});

// PUT /api/revenus/:id
app.put('/api/revenus/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT id FROM revenus WHERE id = ? AND user_id = ?')
                     .get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: 'Revenu introuvable.' });

  const type = String(req.body.type_revenu || '').toLowerCase().trim();
  if (!ALLOWED_TYPES_REVENU.includes(type)) {
    return res.status(400).json({ error: 'Type de revenu invalide.' });
  }
  const membre = String(req.body.membre || 'declarant1').toLowerCase().trim();
  if (!ALLOWED_MEMBRES.includes(membre)) {
    return res.status(400).json({ error: 'Membre invalide.' });
  }
  const montant = Number(req.body.montant_annuel);
  if (!Number.isFinite(montant) || montant < 0) {
    return res.status(400).json({ error: 'Montant invalide.' });
  }

  db.prepare(`
    UPDATE revenus SET
      type_revenu    = @type_revenu,
      membre         = @membre,
      label          = @label,
      montant_annuel = @montant_annuel,
      notes          = @notes,
      updated_at     = datetime('now')
    WHERE id = @id
  `).run({
    id: Number(req.params.id),
    type_revenu: type,
    membre,
    label: String(req.body.label || '').trim().slice(0, 120),
    montant_annuel: montant,
    notes: String(req.body.notes || '').slice(0, 1000)
  });

  res.json(db.prepare('SELECT * FROM revenus WHERE id = ?').get(req.params.id));
});

// DELETE /api/revenus/:id
app.delete('/api/revenus/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM revenus WHERE id = ? AND user_id = ?')
                 .run(req.params.id, req.session.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Revenu introuvable.' });
  res.json({ ok: true });
});

// GET /api/impot — calcul complet de l'IR (inclut revenus fonciers des biens)
app.get('/api/impot', requireAuth, (req, res) => {
  const userId = req.session.userId;

  // Foyer fiscal
  const foyer = getFoyerForUser(userId) || {
    situation_maritale: 'celibataire',
    nb_enfants: 0, nb_enfants_altgarde: 0, parent_isole: 0
  };

  // Revenus déclarés
  const revenus = getRevenusForUser(userId);

  // Revenus fonciers calculés depuis les biens immobiliers
  const propertyRows = db.prepare('SELECT * FROM properties WHERE user_id = ?').all(userId);
  const { computeCashflow } = require('./cashflow');
  let revenusFonciers = 0;
  let revenusBIC = 0;
  for (const r of propertyRows) {
    const c = computeCashflow(r);
    // Seulement les biens avec un régime foncier ou BIC actif
    if (['micro_foncier', 'reel_foncier'].includes(r.tax_regime)) {
      revenusFonciers += c.taxableBase;
    } else if (['micro_bic', 'reel_bic'].includes(r.tax_regime)) {
      revenusBIC += c.taxableBase;
    }
  }

  const result = calculerIR({ foyer, revenus, revenusFonciers, revenusBIC });

  res.json({
    ...result,
    foyer,
    revenusFonciers: Math.round(revenusFonciers),
    revenusBIC: Math.round(revenusBIC),
    nbBiens: propertyRows.length
  });
});

// --- Routes Admin -------------------------------------------------------

// Page d'administration (HTML)
app.get('/admin', (req, res) => {
  if (!req.session.userId) return res.redirect('/');
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_admin) return res.status(403).sendFile(path.join(__dirname, 'public', '403.html'));
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Statistiques globales
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalUsers        = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const totalProperties   = db.prepare('SELECT COUNT(*) AS n FROM properties').get().n;
  const totalAccounts     = db.prepare('SELECT COUNT(*) AS n FROM financial_accounts').get().n;
  const totalPositions    = db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
  const totalPatrimoineImmo = db.prepare('SELECT COALESCE(SUM(current_value),0) AS s FROM properties').get().s;

  // Valeur financière totale : types simples (somme amount) + portefeuilles (sum qty*prix)
  const simpleAccountsSum = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS s FROM financial_accounts
    WHERE account_type NOT IN ('compte_titres','pea','assurance_vie_uc','per','crypto')
  `).get().s;
  const portfolioSum = db.prepare(`
    SELECT COALESCE(SUM(p.quantity * p.current_price),0) AS s
    FROM positions p
  `).get().s;
  const totalPatrimoineFin = simpleAccountsSum + portfolioSum;

  res.json({
    totalUsers,
    totalProperties,
    totalAccounts,
    totalPositions,
    totalPatrimoineImmo,
    totalPatrimoineFin,
    totalPatrimoine: totalPatrimoineImmo + totalPatrimoineFin
  });
});

// Liste de tous les utilisateurs avec résumé de leur patrimoine
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, is_admin, created_at FROM users ORDER BY id ASC').all();

  const result = users.map(u => {
    // Immobilier
    const props = db.prepare('SELECT current_value FROM properties WHERE user_id = ?').all(u.id);
    const patrimoineImmo = props.reduce((s, r) => s + (Number(r.current_value) || 0), 0);
    const nbBiens = props.length;

    // Financier : types simples
    const simpleAccounts = db.prepare(`
      SELECT amount FROM financial_accounts
      WHERE user_id = ? AND account_type NOT IN ('compte_titres','pea','assurance_vie_uc','per','crypto')
    `).all(u.id);
    const simpleSum = simpleAccounts.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    // Financier : portefeuilles
    const portfolioVal = db.prepare(`
      SELECT COALESCE(SUM(p.quantity * p.current_price), 0) AS s
      FROM positions p
      JOIN financial_accounts a ON a.id = p.account_id
      WHERE a.user_id = ?
    `).get(u.id).s;

    const patrimoineFin = simpleSum + portfolioVal;
    const nbComptes = db.prepare('SELECT COUNT(*) AS n FROM financial_accounts WHERE user_id = ?').get(u.id).n;

    return {
      id: u.id,
      email: u.email,
      isAdmin: !!u.is_admin,
      createdAt: u.created_at,
      nbBiens,
      nbComptes,
      patrimoineImmo,
      patrimoineFin,
      patrimoineTotal: patrimoineImmo + patrimoineFin
    };
  });

  res.json(result);
});

// Données financières détaillées d'un utilisateur
app.get('/api/admin/users/:id/financial', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const user = db.prepare('SELECT id, email, is_admin, created_at FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  // Biens immobiliers
  const propertyRows = db.prepare('SELECT * FROM properties WHERE user_id = ? ORDER BY id ASC').all(targetId);
  const properties = propertyRows.map(r => ({ ...r, cashflow: computeCashflow(r) }));

  // Comptes financiers + positions
  const accountRows = db.prepare('SELECT * FROM financial_accounts WHERE user_id = ? ORDER BY id ASC').all(targetId);
  const accounts = accountRows.map(a => {
    const positions = isPortfolio(a.account_type) ? getPositionsFor(a.id) : [];
    return { ...a, positions, metrics: computeAccount(a, positions) };
  });

  // Calcul du résumé
  const patrimoineImmo  = propertyRows.reduce((s, r) => s + (Number(r.current_value) || 0), 0);
  const patrimoineFin   = accounts.reduce((s, a) => s + a.metrics.currentValue, 0);

  res.json({
    user: { id: user.id, email: user.email, isAdmin: !!user.is_admin, createdAt: user.created_at },
    summary: {
      patrimoineImmo,
      patrimoineFin,
      patrimoineTotal: patrimoineImmo + patrimoineFin,
      nbBiens: properties.length,
      nbComptes: accounts.length
    },
    properties,
    accounts
  });
});

// Modifier le rôle admin d'un utilisateur
app.patch('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  // Empêcher un admin de se révoquer lui-même
  if (targetId === req.session.userId)
    return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const isAdmin = req.body.isAdmin ? 1 : 0;
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin, targetId);
  res.json({ ok: true, id: targetId, isAdmin: !!isAdmin });
});

// --- Page protégée -------------------------------------------------------

app.get('/dashboard', (req, res) => {
  if (!req.session.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Interface iPhone (PWA) — mêmes API, protégée de la même façon
app.get('/mobile', (req, res) => {
  if (!req.session.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// API : Lister tous les instruments financiers utilisés (Admin only)
app.get('/api/admin/instruments', requireAdmin, (req, res) => {
  const instruments = db.prepare(`
    SELECT DISTINCT
      p.ticker,
      p.current_price as lastPrice,
      p.currency,
      p.name,
      p.last_updated as lastUpdated,
      COUNT(*) as positionCount,
      SUM(p.quantity) as totalQuantity
    FROM positions p
    WHERE p.ticker IS NOT NULL AND TRIM(p.ticker) != ''
    GROUP BY LOWER(p.ticker), p.currency
    ORDER BY p.ticker
  `).all();

  res.json({ instruments, count: instruments.length });
});

// API : Autocomplete pour les tickers (combine liste connue + tickers utilisés)
app.get('/api/tickers/search', requireAuth, (req, res) => {
  const q = req.query.q || '';

  // Si pas de query, retourner les tickers récents de l'utilisateur
  if (q.length === 0) {
    const recent = db.prepare(`
      SELECT DISTINCT UPPER(TRIM(p.ticker)) as ticker, p.name, p.currency
      FROM positions p
      JOIN financial_accounts a ON a.id = p.account_id
      WHERE p.ticker IS NOT NULL AND TRIM(p.ticker) != '' AND a.user_id = ?
      ORDER BY p.last_updated DESC LIMIT 20
    `).all(req.session.userId);
    return res.json({ tickers: recent });
  }

  // Chercher dans la liste connue + les tickers utilisés
  const knownMatches = searchTickers(q, 20);
  const userMatches = db.prepare(`
    SELECT DISTINCT UPPER(TRIM(p.ticker)) as ticker, p.name, p.currency
    FROM positions p
    JOIN financial_accounts a ON a.id = p.account_id
    WHERE p.ticker IS NOT NULL AND TRIM(p.ticker) != ''
      AND (UPPER(p.ticker) LIKE ? OR UPPER(p.name) LIKE ?)
      AND a.user_id = ?
    LIMIT 10
  `).all(`%${q}%`, `%${q}%`, req.session.userId);

  // Fusionner et dédupliquer
  const all = [...knownMatches, ...userMatches];
  const seen = new Set();
  const unique = all.filter(t => {
    const key = (t.ticker || '').toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json({ tickers: unique.slice(0, 20) });
});

// API : Lister TOUS les tickers connus (pour page Admin)
app.get('/api/tickers/all', requireAdmin, (req, res) => {
  res.json({ tickers: KNOWN_TICKERS });
});

// --- Démarrage -----------------------------------------------------------

app.listen(PORT, () => {
  const mode = (process.env.SMTP_USER && process.env.SMTP_PASS) ? 'EMAIL RÉEL' : 'MODE CONSOLE';
  console.log('\n────────────────────────────────────────');
  console.log(`  Application démarrée : http://localhost:${PORT}`);
  console.log(`  Envoi email : ${mode}`);
  console.log('────────────────────────────────────────\n');
});
