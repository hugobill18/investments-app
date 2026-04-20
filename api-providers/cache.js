// cache.js — Gestion du cache avec TTL pour les requêtes API
//
// Évite les appels répétés à la même API dans les 30 minutes.
// Structure : { key: { value, expiresAt, source } }

const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

class APICache {
  constructor(ttlMs = DEFAULT_TTL) {
    this.store = new Map();
    this.ttl = ttlMs;
  }

  // Ajoute une valeur au cache
  set(key, value, source = 'unknown') {
    this.store.set(key, {
      value,
      source,
      expiresAt: Date.now() + this.ttl,
      cachedAt: new Date().toISOString()
    });
  }

  // Récupère une valeur du cache (null si expiré ou inexistant)
  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return { value: item.value, source: item.source, cachedAt: item.cachedAt };
  }

  // Vérifie si une clé existe et n'est pas expirée
  has(key) {
    const item = this.store.get(key);
    if (!item) return false;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  // Supprime une clé
  delete(key) {
    this.store.delete(key);
  }

  // Vide le cache
  clear() {
    this.store.clear();
  }

  // Nettoie les entrées expirées (utile pour libérer la mémoire)
  prune() {
    const now = Date.now();
    let pruned = 0;
    for (const [key, item] of this.store.entries()) {
      if (now > item.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  // Retourne les stats du cache
  stats() {
    return {
      size: this.store.size,
      ttlMs: this.ttl,
      entries: Array.from(this.store.entries()).map(([key, item]) => ({
        key,
        source: item.source,
        expiresIn: Math.max(0, item.expiresAt - Date.now()),
        cachedAt: item.cachedAt
      }))
    };
  }
}

module.exports = { APICache };
