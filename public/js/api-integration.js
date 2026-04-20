/**
 * api-integration.js — Intégration des APIs au dashboard
 *
 * Ce fichier gère :
 * 1. L'ajout du bouton "Rafraîchir les prix"
 * 2. La mise à jour des prix affichés
 * 3. Le pré-remplissage des taux des livrets
 * 4. Les notifications utilisateur
 */

// ============================================================================
// 🎯 PHASE 1 : INITIALISATION AU CHARGEMENT DU DASHBOARD
// ============================================================================

/**
 * Initialise toutes les fonctionnalités des APIs
 * À appeler après loadFinancialAccounts()
 */
async function initAPIIntegration() {
  console.log('🚀 Initialisation de l\'intégration APIs');

  // 1. Ajouter le bouton global de rafraîchissement
  addGlobalRefreshButton();

  // 2. Ajouter les boutons par compte
  addAccountRefreshButtons();

  // 3. Initialiser les taux des livrets dans les formulaires
  await apiClient.initLivretRates();

  // 4. Initialiser les listeners des boutons
  apiClient.initRefreshButtons();

  // 5. Charger les cotations initiales pour les positions avec ticker
  // (optionnel, peut être lent)
  // await loadInitialQuotes();

  console.log('✅ Intégration APIs initialisée');
}

// ============================================================================
// 🔘 BOUTONS DE RAFRAÎCHISSEMENT
// ============================================================================

/**
 * Ajoute un bouton global "Rafraîchir les prix" dans la barre supérieure
 */
function addGlobalRefreshButton() {
  // Vérifier si le bouton existe déjà
  if (document.getElementById('refreshAllQuotesBtn')) {
    return;
  }

  // Créer le bouton
  const btn = document.createElement('button');
  btn.id = 'refreshAllQuotesBtn';
  btn.className = 'refresh-button';
  btn.innerHTML = '🔄 Rafraîchir les prix';
  btn.title = 'Met à jour tous les prix des positions (depuis les APIs)';

  // Trouver l'endroit où l'ajouter (ex: dans le header ou avant la section financière)
  const financierSection = document.getElementById('view-financier');
  if (financierSection) {
    const header = financierSection.querySelector('.view-header') || financierSection;
    const existingBtn = header.querySelector('.refresh-button');

    if (!existingBtn) {
      // Créer une barre d'outils si elle n'existe pas
      let toolbar = header.querySelector('.view-toolbar');
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'view-toolbar';
        toolbar.style.cssText = 'display: flex; gap: 0.75rem; margin: 1rem 0;';
        header.appendChild(toolbar);
      }

      toolbar.appendChild(btn);
    }
  }
}

/**
 * Ajoute un bouton "Rafraîchir" pour chaque compte de portefeuille
 */
function addAccountRefreshButtons() {
  document.querySelectorAll('.account-card').forEach(card => {
    const accountId = card.dataset.accountId;
    if (!accountId) return;

    // Vérifier si c'est un portefeuille (doit avoir des positions)
    const posTable = card.querySelector('.positions-table');
    if (!posTable) return;

    // Vérifier si le bouton existe déjà
    if (card.querySelector('[data-refresh-account]')) {
      return;
    }

    // Créer le bouton
    const btn = document.createElement('button');
    btn.className = 'refresh-button';
    btn.setAttribute('data-refresh-account', accountId);
    btn.innerHTML = '⟳ Mise à jour';
    btn.style.fontSize = '0.85rem';
    btn.title = `Mise à jour des prix pour ce compte`;

    // Ajouter après le titre du compte
    const accountTitle = card.querySelector('h3') || card.querySelector('h4');
    if (accountTitle) {
      accountTitle.parentElement.insertBefore(btn, accountTitle.nextSibling);
    }
  });
}

// ============================================================================
// 💱 MISE À JOUR DES AFFICHAGES
// ============================================================================

/**
 * Met à jour les prix affichés d'une position dans la table
 * À appeler après un refresh des cotations
 */
function updatePositionPrices(positions) {
  positions.forEach(position => {
    const row = document.querySelector(`tr[data-pos-id="${position.id}"]`);
    if (!row) return;

    // Mettre à jour le prix
    const priceCell = row.querySelector('[data-field="current_price"]');
    if (priceCell && position.current_price) {
      priceCell.innerHTML = `<span class="position-price">
        <span>${apiClient.formatPrice(position.current_price, position.currency)}</span>
      </span>`;
    }

    // Mettre à jour le timestamp
    const timeCell = row.querySelector('[data-field="last_updated"]');
    if (timeCell && position.last_updated) {
      timeCell.innerHTML = `<span class="position-last-updated">
        ${apiClient.formatTimeAgo(position.last_updated)}
      </span>`;
      timeCell.title = new Date(position.last_updated).toLocaleString('fr-FR');
    }

    // Ajouter une animation
    row.classList.add('updated');
    setTimeout(() => row.classList.remove('updated'), 1000);
  });
}

// ============================================================================
// 🌐 INTÉGRATION AVEC LE FORMULAIRE D'AJOUT DE POSITION
// ============================================================================

/**
 * Enrichit le formulaire d'ajout de position avec la récupération automatique
 */
function enhancePositionForm() {
  const form = document.querySelector('form[data-form="add-position"]') || document.getElementById('positionForm');
  if (!form) return;

  const tickerInput = form.querySelector('[id="pos-ticker"]') || form.querySelector('[name="ticker"]');
  const priceInput = form.querySelector('[id="pos-price"]') || form.querySelector('[name="current_price"]');
  const currencyInput = form.querySelector('[id="pos-currency"]') || form.querySelector('[name="currency"]');
  const nameInput = form.querySelector('[id="pos-name"]') || form.querySelector('[name="name"]');

  if (!tickerInput || !priceInput) return;

  // Ajouter un bouton "Récupérer le prix" à côté du champ ticker
  let fetchBtn = tickerInput.nextElementSibling;
  if (!fetchBtn || !fetchBtn.classList.contains('fetch-price-btn')) {
    fetchBtn = document.createElement('button');
    fetchBtn.type = 'button';
    fetchBtn.className = 'fetch-price-btn';
    fetchBtn.innerHTML = '🔍 Récupérer le prix';
    fetchBtn.style.cssText = `
      padding: 0.5rem 1rem;
      margin-left: 0.5rem;
      background-color: var(--primary);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
    `;

    tickerInput.parentElement.insertBefore(fetchBtn, tickerInput.nextSibling);

    // Listener
    fetchBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const ticker = tickerInput.value.trim();
      if (!ticker) {
        apiClient.showNotification('Entrez un ticker', 'info');
        return;
      }

      apiClient.setButtonLoading(fetchBtn, true, '🔍 Récupérer le prix');

      try {
        const quote = await apiClient.fetchQuote(ticker);

        // Pré-remplir les champs
        priceInput.value = quote.price;
        if (currencyInput) currencyInput.value = quote.currency;
        if (nameInput && (!nameInput.value || nameInput.value === ticker)) {
          nameInput.value = quote.name;
        }

        apiClient.showNotification(
          `✅ ${quote.symbol}: ${apiClient.formatPrice(quote.price, quote.currency)}`,
          'success',
          3000
        );
      } catch (error) {
        apiClient.showNotification(`❌ ${error.message}`, 'error');
      } finally {
        apiClient.setButtonLoading(fetchBtn, false, '🔍 Récupérer le prix');
      }
    });
  }
}

// ============================================================================
// 🧩 HOOKS POUR LES FONCTIONS EXISTANTES
// ============================================================================

/**
 * À appeler après loadFinancialAccounts() pour mettre à jour les affichages
 */
function onFinancialAccountsLoaded(accounts) {
  // Mettre à jour les prix des positions
  accounts.forEach(account => {
    if (account.positions && Array.isArray(account.positions)) {
      updatePositionPrices(account.positions);
    }
  });

  // Réinitialiser les buttons (ils peuvent avoir changé après le reload)
  addAccountRefreshButtons();
  apiClient.initRefreshButtons();
}

// ============================================================================
// 🚀 EXPORT & SETUP
// ============================================================================

// Rendre disponible globalement
if (typeof window !== 'undefined') {
  window.apiIntegration = {
    init: initAPIIntegration,
    enhancePositionForm,
    updatePositionPrices,
    addGlobalRefreshButton,
    addAccountRefreshButtons,
    onFinancialAccountsLoaded
  };
}

// Auto-initialiser quand le DOM est prêt et que apiClient est disponible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof apiClient !== 'undefined') {
      // Attendre que le dashboard soit chargé
      setTimeout(() => initAPIIntegration(), 500);
    }
  });
} else {
  // DOM déjà prêt
  if (typeof apiClient !== 'undefined') {
    setTimeout(() => initAPIIntegration(), 500);
  }
}
