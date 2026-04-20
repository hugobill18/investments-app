/**
 * api-client.js — Client JavaScript pour les APIs financières
 *
 * Fournit des fonctions pour :
 * - Récupérer les cours (1 ou plusieurs)
 * - Récupérer les taux des livrets
 * - Rafraîchir les positions
 * - Gérer les erreurs et le loading
 */

// ============================================================================
// 📡 API CALLS
// ============================================================================

/**
 * Récupère un cours pour un ticker
 * @param {string} ticker - Ex: "AAPL", "BTC"
 * @param {string} currency - Devise (default: "EUR")
 * @returns {Promise<{symbol, price, currency, name, timestamp, apiSource}>}
 */
async function fetchQuote(ticker, currency = 'EUR') {
  if (!ticker) throw new Error('Ticker manquant');

  try {
    const response = await fetch(`/api/quote/${encodeURIComponent(ticker)}?currency=${currency}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    return data;
  } catch (error) {
    throw new Error(`Impossible de récupérer ${ticker}: ${error.message}`);
  }
}

/**
 * Récupère plusieurs cours en parallèle
 * @param {string[]} tickers - Ex: ["AAPL", "BTC", "MSFT"]
 * @param {string} currency - Devise (default: "EUR")
 * @returns {Promise<{tickers, currency, quotes: {ticker, ok, data|error}[]}>}
 */
async function fetchQuotesBatch(tickers, currency = 'EUR') {
  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new Error('Liste de tickers invalide');
  }

  try {
    const response = await fetch('/api/quotes/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers, currency })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    return data;
  } catch (error) {
    throw new Error(`Impossible de récupérer les cours: ${error.message}`);
  }
}

/**
 * Récupère les taux des livrets
 * @returns {Promise<{rates: {livret_a, pel, etc}, lastUpdate, source}>}
 */
async function fetchLivretRates() {
  try {
    const response = await fetch('/api/livret-rates');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    return data;
  } catch (error) {
    throw new Error(`Impossible de récupérer les taux: ${error.message}`);
  }
}

/**
 * Rafraîchit toutes les positions de l'utilisateur
 * @returns {Promise<{refreshed, failed, at, details}>}
 */
async function refreshAllQuotes() {
  try {
    const response = await fetch('/api/refresh-quotes', { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    return data;
  } catch (error) {
    throw new Error(`Impossible de rafraîchir: ${error.message}`);
  }
}

// ============================================================================
// 🎨 UI HELPERS
// ============================================================================

/**
 * Formate un prix avec devise
 * @param {number} price - Prix (ex: 185.25)
 * @param {string} currency - Devise (ex: "EUR")
 * @returns {string} - Formaté (ex: "185,25 EUR")
 */
function formatPrice(price, currency = 'EUR') {
  if (typeof price !== 'number' || !Number.isFinite(price)) return '—';

  // Locale français pour la virgule
  const formatted = price.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return `${formatted} ${currency}`;
}

/**
 * Formate une date "il y a X minutes"
 * @param {string} isoString - Date ISO (ex: "2026-04-19T10:30:00.000Z")
 * @returns {string} - Formaté (ex: "il y a 5 minutes")
 */
function formatTimeAgo(isoString) {
  if (!isoString) return '—';

  try {
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'à l\'instant';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `il y a ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  } catch {
    return '—';
  }
}

/**
 * Montre un message d'erreur temporaire
 * @param {string} message - Message à afficher
 * @param {number} duration - Durée en ms (default: 5000)
 */
function showNotification(message, type = 'error', duration = 5000) {
  // Créer l'élément
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.textContent = message;

  // Ajouter au DOM
  document.body.appendChild(notif);

  // Animation d'entrée
  setTimeout(() => notif.classList.add('show'), 10);

  // Disparition
  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 300);
  }, duration);
}

/**
 * Affiche un indicateur de chargement sur un bouton
 * @param {HTMLElement} button - Le bouton
 * @param {boolean} isLoading - true pour montrer le loading
 * @param {string} originalText - Texte original du bouton
 */
function setButtonLoading(button, isLoading, originalText = '🔄 Rafraîchir') {
  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.innerHTML = '⏳ Chargement...';
    button.classList.add('loading');
  } else {
    button.disabled = false;
    button.textContent = originalText;
    button.classList.remove('loading');
  }
}

// ============================================================================
// 🔄 POSITION & ACCOUNT REFRESH
// ============================================================================

/**
 * Met à jour l'affichage d'une position après un fetch de prix
 * @param {HTMLElement} positionRow - La ligne <tr> de la position
 * @param {object} quoteData - Les données du cours
 */
function updatePositionDisplay(positionRow, quoteData) {
  if (!positionRow) return;

  // Mettre à jour le prix
  const priceCell = positionRow.querySelector('[data-field="current_price"]');
  if (priceCell && quoteData) {
    priceCell.textContent = formatPrice(quoteData.price, quoteData.currency);
    priceCell.title = `Source: ${quoteData.apiSource || 'unknown'}\nFetched: ${quoteData.timestamp}`;
  }

  // Mettre à jour le timestamp
  const timeCell = positionRow.querySelector('[data-field="last_updated"]');
  if (timeCell) {
    timeCell.textContent = formatTimeAgo(quoteData.timestamp);
    timeCell.title = new Date(quoteData.timestamp).toLocaleString('fr-FR');
  }

  // Ajouter un indicateur visuel
  positionRow.classList.add('updated');
  setTimeout(() => positionRow.classList.remove('updated'), 1000);
}

/**
 * Initialise les boutons de rafraîchissement
 * Cette fonction doit être appelée après que le DOM soit chargé
 */
function initRefreshButtons() {
  // Bouton global "Rafraîchir tout"
  const globalRefreshBtn = document.getElementById('refreshAllQuotesBtn');
  if (globalRefreshBtn) {
    globalRefreshBtn.addEventListener('click', async () => {
      setButtonLoading(globalRefreshBtn, true);

      try {
        const result = await refreshAllQuotes();

        // Recharger les données pour afficher les prix mis à jour
        if (typeof loadFinancialAccounts === 'function') {
          await loadFinancialAccounts();
        }

        showNotification(
          `✅ ${result.refreshed} position(s) mises à jour, ${result.failed} erreur(s)`,
          'success',
          4000
        );
      } catch (error) {
        showNotification(`❌ ${error.message}`, 'error');
      } finally {
        setButtonLoading(globalRefreshBtn, false);
      }
    });
  }

  // Boutons par compte (si implémentés)
  document.querySelectorAll('[data-refresh-account]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const accountId = btn.dataset.refreshAccount;
      setButtonLoading(btn, true);

      try {
        const result = await refreshAllQuotes(); // Pour simplifier, rafraîchit tout
        await loadFinancialAccounts(); // Recharger
        showNotification(`✅ Mise à jour complète`, 'success', 3000);
      } catch (error) {
        showNotification(`❌ ${error.message}`, 'error');
      } finally {
        setButtonLoading(btn, false);
      }
    });
  });
}

/**
 * Pré-remplit les taux des livrets dans les formulaires
 */
async function initLivretRates() {
  try {
    const rates = await fetchLivretRates();

    // Chercher tous les inputs de taux (ex: input[data-rate-field="livret_a"])
    document.querySelectorAll('[data-rate-field]').forEach(input => {
      const fieldType = input.dataset.rateField;
      const rate = rates.rates[fieldType];

      if (rate !== null && rate !== undefined) {
        const percent = (rate * 100).toFixed(2);
        input.value = percent;
        input.dataset.officialRate = percent;

        // Ajouter une info bulle
        const label = input.previousElementSibling || input.parentElement;
        if (label) {
          label.title = `Taux officiel: ${percent}%\nDernier update: ${rates.lastUpdate}`;
        }
      }
    });

    // Afficher la note de mise à jour si elle existe
    const rateNote = document.getElementById('rateNote');
    if (rateNote) {
      rateNote.textContent = `✓ Taux à jour (${rates.lastUpdate})`;
      rateNote.style.color = '#22c55e';
    }
  } catch (error) {
    console.warn('Impossible de récupérer les taux des livrets:', error);
    // Pas d'erreur critique, l'utilisateur peut saisir manuellement
  }
}

// ============================================================================
// 🚀 EXPORT
// ============================================================================

// Exporter les fonctions (utilisable globalement dans le dashboard)
if (typeof window !== 'undefined') {
  window.apiClient = {
    fetchQuote,
    fetchQuotesBatch,
    fetchLivretRates,
    refreshAllQuotes,
    formatPrice,
    formatTimeAgo,
    showNotification,
    setButtonLoading,
    updatePositionDisplay,
    initRefreshButtons,
    initLivretRates
  };
}
