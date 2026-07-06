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

  -- Abonnements récurrents détectés / saisis (module Dépenses)
  -- Seuls les abonnements confirmés par l'utilisateur sont stockés :
  -- les transactions bancaires importées ne sont JAMAIS persistées.
  CREATE TABLE IF NOT EXISTS subscriptions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    label         TEXT    NOT NULL,
    category      TEXT    NOT NULL DEFAULT 'autre',
    periodicity   TEXT    NOT NULL DEFAULT 'mensuel',
    -- 'mensuel' | 'trimestriel' | 'annuel'
    amount        REAL    NOT NULL DEFAULT 0,
    -- montant par échéance (selon periodicity)
    monthly_cost  REAL    NOT NULL DEFAULT 0,
    essential     INTEGER NOT NULL DEFAULT 1,
    -- 0 = l'utilisateur juge cet abonnement dispensable (économie potentielle)
    notes         TEXT    DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

  -- Opportunités immobilières : annonces (Leboncoin, PAP, SeLoger…) simulées
  -- et sauvegardées avec leurs hypothèses (JSON) pour comparaison.
  CREATE TABLE IF NOT EXISTS property_opportunities (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    label      TEXT    NOT NULL,
    url        TEXT    DEFAULT '',
    inputs     TEXT    NOT NULL DEFAULT '{}',
    -- hypothèses de simulation (JSON : prix, loyer, apport, taux…)
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_opportunities_user ON property_opportunities(user_id);
`);

// --- Migrations additives (colonnes ajoutées après coup) --------------------

function addColumnIfMissing(table, column, ddl) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

addColumnIfMissing('users', 'is_admin', 'is_admin INTEGER NOT NULL DEFAULT 0');

// Frais et ancienneté des placements (fiscalité et projections)
addColumnIfMissing('financial_accounts', 'fees_entry_pct', 'fees_entry_pct REAL NOT NULL DEFAULT 0');
addColumnIfMissing('financial_accounts', 'fees_mgmt_pct',  'fees_mgmt_pct REAL NOT NULL DEFAULT 0');
addColumnIfMissing('financial_accounts', 'fees_exit_pct',  'fees_exit_pct REAL NOT NULL DEFAULT 0');
addColumnIfMissing('financial_accounts', 'opened_year',    'opened_year INTEGER');

// Année de naissance du déclarant 1 : sert à calculer la durée maximale
// d'emprunt (fin de prêt à 70 ans) dans le simulateur immobilier.
addColumnIfMissing('foyer_fiscal', 'birth_year', 'birth_year INTEGER');

module.exports = db;
