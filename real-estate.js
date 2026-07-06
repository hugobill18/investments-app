// real-estate.js — Simulateur d'opportunité d'investissement locatif.
//
// À partir d'une annonce (Leboncoin, PAP, SeLoger…), l'utilisateur saisit
// prix, loyer estimé (ou réel si déjà loué) et charges ; le simulateur calcule :
//   - les frais de notaire (ancien ~7,5% / neuf ~2,5%),
//   - le financement : par défaut le prêt est pris sur la durée MAXIMALE
//     possible pour l'emprunteur (25 ans plafonné par la règle « la banque
//     ne prête plus au-delà de 70 ans »),
//   - la fiscalité des loyers (micro-foncier / réel / micro-BIC / réel BIC)
//     avec la TMI réelle du foyer,
//   - rendements brut / net / net-net et cashflow mensuel,
//   - une projection année par année (valeur, capital restant dû, équité,
//     cashflow cumulé, enrichissement net).

const SOCIAL_CHARGES_RATE = 0.172;
const NOTAIRE_ANCIEN = 0.075;
const NOTAIRE_NEUF   = 0.025;
const MAX_LOAN_YEARS = 25;
const MAX_AGE_AT_END = 70;   // âge limite de fin de prêt

// Mensualité d'un prêt amortissable classique.
function monthlyPayment(principal, annualRatePct, months) {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return principal * r / (1 - Math.pow(1 + r, -months));
}

// Durée maximale d'emprunt selon l'âge : min(25 ans, 70 - âge).
function maxLoanYears(borrowerAge) {
  const age = Number(borrowerAge);
  if (!Number.isFinite(age) || age <= 0) return MAX_LOAN_YEARS;
  return Math.max(0, Math.min(MAX_LOAN_YEARS, MAX_AGE_AT_END - Math.floor(age)));
}

// Base imposable annuelle des loyers selon le régime.
function taxableRentBase(regime, annualRent, deductibleCharges, interestYear1) {
  switch (regime) {
    case 'micro_foncier': return Math.max(0, annualRent * 0.70);          // abattement 30%
    case 'micro_bic':     return Math.max(0, annualRent * 0.50);          // abattement 50%
    case 'reel_foncier':
    case 'reel_bic':      return Math.max(0, annualRent - deductibleCharges - interestYear1);
    default:              return 0;
  }
}

// Simulation complète d'une opportunité.
//   input : { price, isNew, works, rentMonthly, propertyTaxAnnual,
//             condoChargesAnnual, mgmtFeesPct, vacancyPct, insurancePnoAnnual,
//             apport, borrowerAge, loanRatePct, loanInsurancePct,
//             loanYears (optionnel : sinon durée max), regime,
//             appreciationPct, rentIndexationPct }
//   ctx   : { tmi } (décimal, ex. 0.30)
// Nombre fini ou valeur par défaut (Number(undefined) = NaN, non capté par ??)
function numOr(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function simulateOpportunity(input, ctx = {}) {
  const price       = Math.max(0, numOr(input.price, 0));
  const isNew       = !!input.isNew;
  const works       = Math.max(0, numOr(input.works, 0));
  const rentMonthly = Math.max(0, numOr(input.rentMonthly, 0));
  const taxFonciere = Math.max(0, numOr(input.propertyTaxAnnual, 0));
  const condo       = Math.max(0, numOr(input.condoChargesAnnual, 0));
  const mgmtPct     = Math.min(15, Math.max(0, numOr(input.mgmtFeesPct, 0)));
  const vacancyPct  = Math.min(30, Math.max(0, numOr(input.vacancyPct, 5)));
  const pno         = Math.max(0, numOr(input.insurancePnoAnnual, 0));
  const apport      = Math.max(0, numOr(input.apport, 0));
  const age         = numOr(input.borrowerAge, 35) || 35;
  const loanRate    = Math.min(15, Math.max(0, numOr(input.loanRatePct, 3.5)));
  const loanInsPct  = Math.min(2, Math.max(0, numOr(input.loanInsurancePct, 0.34)));
  const regime      = String(input.regime || 'micro_foncier');
  const apprecPct   = Math.min(10, Math.max(-5, numOr(input.appreciationPct, 1)));
  const rentIdxPct  = Math.min(5, Math.max(0, numOr(input.rentIndexationPct, 1)));
  const tmi         = Math.min(0.45, Math.max(0, numOr(ctx.tmi, 0.30)));

  // --- Coût total du projet ---
  const notaryRate  = isNew ? NOTAIRE_NEUF : NOTAIRE_ANCIEN;
  const notaryFees  = price * notaryRate;
  const totalCost   = price + notaryFees + works;

  // --- Financement : durée la plus longue possible par défaut ---
  const maxYears  = maxLoanYears(age);
  let loanYears   = Number(input.loanYears);
  if (!Number.isFinite(loanYears) || loanYears <= 0) loanYears = maxYears;
  loanYears = Math.max(0, Math.min(maxYears, Math.floor(loanYears)));

  const borrowed  = Math.max(0, totalCost - apport);
  const months    = loanYears * 12;
  const payment   = monthlyPayment(borrowed, loanRate, months);
  const insurance = borrowed * (loanInsPct / 100) / 12;   // assurance sur capital initial
  const monthlyLoanCost = payment + insurance;

  if (borrowed > 0 && loanYears === 0) {
    return { error: `Emprunt impossible : l'âge de l'emprunteur (${age} ans) dépasse la limite bancaire (fin de prêt à ${MAX_AGE_AT_END} ans). Augmentez l'apport.` };
  }

  // --- Revenus et charges annuelles (année 1) ---
  const grossRentAnnual     = rentMonthly * 12;
  const effectiveRentAnnual = grossRentAnnual * (1 - vacancyPct / 100);
  const mgmtFeesAnnual      = effectiveRentAnnual * (mgmtPct / 100);
  const operatingCosts      = taxFonciere + condo + pno + mgmtFeesAnnual;

  // Intérêts payés la 1re année (approximation : capital initial × taux)
  const interestYear1 = borrowed * (loanRate / 100);
  const deductible    = taxFonciere + condo + pno + mgmtFeesAnnual
                      + insurance * 12 + (Number(input.deductibleOther) || 0);

  const taxBase   = taxableRentBase(regime, effectiveRentAnnual, deductible, interestYear1);
  const taxAnnual = taxBase * (tmi + SOCIAL_CHARGES_RATE);

  // --- Indicateurs ---
  const grossYieldPct  = totalCost > 0 ? (grossRentAnnual / totalCost) * 100 : 0;
  const netYieldPct    = totalCost > 0 ? ((effectiveRentAnnual - operatingCosts) / totalCost) * 100 : 0;
  const netNetYieldPct = totalCost > 0 ? ((effectiveRentAnnual - operatingCosts - taxAnnual) / totalCost) * 100 : 0;

  const annualCashflow  = effectiveRentAnnual - operatingCosts - taxAnnual - monthlyLoanCost * 12;
  const monthlyCashflow = annualCashflow / 12;

  // --- Projection année par année ---
  const horizon = Math.max(loanYears, 20);
  const series = [];
  let remaining = borrowed;
  let value = price + works;   // les frais de notaire ne se retrouvent pas dans la valeur
  let rent = effectiveRentAnnual;
  let cumulativeCashflow = 0;
  const r = loanRate / 100 / 12;

  for (let y = 1; y <= horizon; y++) {
    // Amortissement mensuel agrégé sur l'année
    let interestPaid = 0;
    for (let m = 0; m < 12 && remaining > 0; m++) {
      const interest = remaining * r;
      const principalPart = Math.min(remaining, payment - interest);
      interestPaid += interest;
      remaining -= principalPart;
    }
    remaining = Math.max(0, remaining);

    value *= 1 + apprecPct / 100;
    if (y > 1) rent *= 1 + rentIdxPct / 100;

    const loanCostThisYear = (remaining > 0 || y <= loanYears) ? monthlyLoanCost * 12 : 0;
    const base = taxableRentBase(regime, rent, deductible, interestPaid);
    const tax  = base * (tmi + SOCIAL_CHARGES_RATE);
    const cf   = rent - operatingCosts - tax - loanCostThisYear;
    cumulativeCashflow += cf;

    series.push({
      year: y,
      propertyValue: Math.round(value),
      remainingDebt: Math.round(remaining),
      equity: Math.round(value - remaining),
      annualCashflow: Math.round(cf),
      cumulativeCashflow: Math.round(cumulativeCashflow),
      netEnrichment: Math.round(value - remaining + cumulativeCashflow - apport)
    });
  }

  return {
    inputs: { price, isNew, works, rentMonthly, apport, borrowerAge: age, regime,
              loanRatePct: loanRate, vacancyPct, appreciationPct: apprecPct },
    acquisition: {
      notaryFees: Math.round(notaryFees),
      notaryRatePct: notaryRate * 100,
      totalCost: Math.round(totalCost)
    },
    financing: {
      borrowed: Math.round(borrowed),
      loanYears,
      maxLoanYears: maxYears,
      monthlyPayment: Math.round(payment * 100) / 100,
      monthlyInsurance: Math.round(insurance * 100) / 100,
      totalMonthly: Math.round(monthlyLoanCost * 100) / 100,
      totalInterest: Math.round(payment * months - borrowed),
      endAge: Math.floor(age) + loanYears
    },
    fiscal: {
      regime,
      tmiPct: Math.round(tmi * 100),
      taxableBase: Math.round(taxBase),
      taxAnnual: Math.round(taxAnnual)
    },
    performance: {
      grossYieldPct:  Math.round(grossYieldPct * 100) / 100,
      netYieldPct:    Math.round(netYieldPct * 100) / 100,
      netNetYieldPct: Math.round(netNetYieldPct * 100) / 100,
      annualCashflow: Math.round(annualCashflow),
      monthlyCashflow: Math.round(monthlyCashflow)
    },
    series
  };
}

module.exports = { simulateOpportunity, maxLoanYears, monthlyPayment, MAX_AGE_AT_END, MAX_LOAN_YEARS };
