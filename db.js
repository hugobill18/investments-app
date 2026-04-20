const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'app.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS login_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    code_hash  TEXT    NOT NULL,
    purpose    TEXT    NOT NULL,
    expires_at TEXT    NOT NULL,
    used_at    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trusted_devices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    key_hash     TEXT    NOT NULL UNIQUE,
    device_label TEXT,
    user_agent   TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS properties (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                   INTEGER NOT NULL,
    label                     TEXT    NOT NULL,
    property_type             TEXT    NOT NULL,
    current_value             REAL    NOT NULL DEFAULT 0,
    credit_monthly_payment    REAL    NOT NULL DEFAULT 0,
    rent_monthly              REAL    NOT NULL DEFAULT 0,
    property_tax_annual       REAL    NOT NULL DEFAULT 0,
    condo_charges_annual      REAL    NOT NULL DEFAULT 0,
    tax_regime                TEXT    NOT NULL DEFAULT 'aucune',
    marginal_tax_rate         REAL    NOT NULL DEFAULT 30,
    deductible_charges_annual REAL    NOT NULL DEFAULT 0,
    notes                     TEXT    DEFAULT '',
    created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at                TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);

  CREATE TABLE IF NOT EXISTS financial_accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    label         TEXT    NOT NULL,
    account_type  TEXT    NOT NULL,
    amount        REAL    NOT NULL DEFAULT 0,
    monthly_in    REAL    NOT NULL DEFAULT 0,
    monthly_out   REAL    NOT NULL DEFAULT 0,
    annual_rate   REAL    NOT NULL DEFAULT 0,
    notes         TEXT    DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_financial_accounts_user ON financial_accounts(user_id);

  CREATE TABLE IF NOT EXISTS positions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id     INTEGER NOT NULL,
    ticker         TEXT,
    name           TEXT    NOT NULL,
    quantity       REAL    NOT NULL DEFAULT 0,
    buy_price      REAL    NOT NULL DEFAULT 0,
    current_price  REAL    NOT NULL DEFAULT 0,
    currency       TEXT    NOT NULL DEFAULT 'EUR',
    last_updated   TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(account_id);

  CREATE TABLE IF NOT EXISTS pending_admin_emails (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Foyer fiscal : situation personnelle et familiale de l'utilisateur
  -- Une seule ligne par utilisateur (INSERT OR REPLACE)
  CREATE TABLE IF NOT EXISTS foyer_fiscal (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL UNIQUE,
    situation_maritale TEXT    NOT NULL DEFAULT 'celibataire',
    -- 'celibataire' | 'marie' | 'pacse' | 'divorce' | 'veuf'
    nb_enfants         INTEGER NOT NULL DEFAULT 0,
    -- Enfants à charge (demi-parts supplémentaires selon barème)
    nb_enfants_altgarde INTEGER NOT NULL DEFAULT 0,
    -- Enfants en garde alternée (comptés pour moitié chacun)
    parent_isole       INTEGER NOT NULL DEFAULT 0,
    -- 1 si parent isolé (demi-part supplémentaire)
    nb_personnes_charge INTEGER NOT NULL DEFAULT 0,
    -- Autres personnes à charge (invalides, ascendants, etc.)
    notes              TEXT    DEFAULT '',
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_foyer_user ON foyer_fiscal(user_id);

  -- Revenus du foyer fiscal (salaires, autres revenus)
  -- Chaque ligne représente une source de revenus d'un membre du foyer
  CREATE TABLE IF NOT EXISTS revenus (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    type_revenu    TEXT    NOT NULL,
    -- 'salaire' | 'retraite' | 'chomage' | 'bic_location_meublee' | 'autre'
    -- NOTE: revenus_fonciers sont calculés depuis la table properties, pas saisis ici
    membre         TEXT    NOT NULL DEFAULT 'declarant1',
    -- 'declarant1' | 'declarant2' (pour couples)
    label          TEXT    NOT NULL DEFAULT '',
    -- libellé libre (ex: "Salaire employeur principal")
    montant_annuel REAL    NOT NULL DEFAULT 0,
    -- Revenus bruts annuels en EUR
    notes          TEXT    DEFAULT '',
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_revenus_user ON revenus(user_id);
`);

const hasAdminCol = db.prepare("PRAGMA table_info(users)").all().some(c => c.name === 'is_admin');
if (!hasAdminCol) {
  db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
}

module.exports = db;
