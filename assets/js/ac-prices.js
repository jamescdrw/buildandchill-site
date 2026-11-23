/*
 * Air con price list used by the price calculator.
 * Copied from the Air Conditioning For You quote engine.
 * Edit the numbers here to change prices across the site.
 */
window.AC_PRICES = {
  minPrice: 1495,
  depositPercent: 20,

  // Supply and install, per kit range
  ranges: {
    budget:  { label: "Budget range",  firstUnit: 1495, extraUnit: 720,  outdoorMultiUplift: 320 },
    mid:     { label: "Mid-range",     firstUnit: 1795, extraUnit: 850,  outdoorMultiUplift: 450 },
    premium: { label: "Premium range", firstUnit: 2195, extraUnit: 1050, outdoorMultiUplift: 620 }
  },

  houses: {
    flat:     { label: "Flat or apartment",   factor: 0.98 },
    terrace:  { label: "Terraced house",      factor: 1.0 },
    semi:     { label: "Semi-detached house", factor: 1.04 },
    detached: { label: "Detached house",      factor: 1.1 },
    bungalow: { label: "Bungalow",            factor: 1.06 }
  },

  runs: {
    short:    { label: "Under 5m", add: 0 },
    medium:   { label: "5 to 12m", add: 145 },
    long:     { label: "12 to 20m", add: 320 },
    extended: { label: "Over 20m", add: 520 }
  },

  brands: {
    either:    { label: "Best price on the day", factor: 1.0 },
    fujitsu:   { label: "Fujitsu",   factor: 1.03 },
    samsung:   { label: "Samsung",   factor: 1.025 },
    panasonic: { label: "Panasonic", factor: 1.04 },
    daikin:    { label: "Daikin",    factor: 1.06 }
  },

  rooms: {
    small:  { label: "Up to 15 m²", kw: "2.5 kW",     factor: 1.0,  maxArea: 15 },
    medium: { label: "15 to 25 m²", kw: "3.5 kW",     factor: 1.08, maxArea: 25 },
    large:  { label: "25 to 40 m²", kw: "5.0 kW",     factor: 1.18, maxArea: 40 },
    xlarge: { label: "Over 40 m²",  kw: "6.0–7.0 kW", factor: 1.28, maxArea: Infinity }
  },

  // Higher ceilings mean more air to move, so the room is treated as larger
  ceilings: { standard: 1.0, high: 1.12, vaulted: 1.22 },

  // Local discount for these postcode areas
  localPostcodes: ["LE", "DE", "NG"],
  localDiscount: 0.03
};
