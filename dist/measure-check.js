// Plausibility model for the eight body measurements of the fitting guide.
//
// The measurements of an adult man are modelled as one multivariate normal distribution (centimetres).
// Every entered value is compared with what the other entered values predict for it: the conditional
// mean and standard deviation of a Gaussian, i.e. a linear regression on the other measurements. The
// gap, in standard deviations, is the surprise z. A wrong value also distorts the predictions made for
// its neighbours, so values are judged one at a time: the most surprising one is set aside, the rest is
// judged again without it.
//
// For a suspect value the model then tries the usual ways a tape reading goes wrong (inches, a half
// measurement, a slipped digit, two fields swapped) and keeps the explanation that makes the whole set
// most ordinary again.
//
// The parameters below are estimates from published adult male anthropometry (US Army ANSUR II orders of
// magnitude), adapted to tailor's measurements. They are not fitted on this shop's customers: replace
// MEAN, SD and CORRELATION once enough verified orders exist.

export const KEYS = ['stature','poitrine','taille','bassin','epaules','manche','dos','entrejambe'];
const MEAN = {stature:176, poitrine:104, taille:92, bassin:102, epaules:46, manche:63, dos:46, entrejambe:80};
const SD = {stature:7, poitrine:8.5, taille:11, bassin:7.5, epaules:2.6, manche:3, dos:2.8, entrejambe:4.5};
const CORRELATION = [
  ['stature','poitrine',.25],['stature','taille',.2],['stature','bassin',.35],['stature','epaules',.4],
  ['stature','manche',.75],['stature','dos',.6],['stature','entrejambe',.82],
  ['poitrine','taille',.85],['poitrine','bassin',.78],['poitrine','epaules',.6],['poitrine','manche',.2],
  ['poitrine','dos',.3],['poitrine','entrejambe',0],
  ['taille','bassin',.85],['taille','epaules',.45],['taille','manche',.15],['taille','dos',.25],['taille','entrejambe',-.05],
  ['bassin','epaules',.5],['bassin','manche',.3],['bassin','dos',.3],['bassin','entrejambe',.15],
  ['epaules','manche',.35],['epaules','dos',.35],['epaules','entrejambe',.3],
  ['manche','dos',.4],['manche','entrejambe',.7],['dos','entrejambe',.35]
];
// A reading is never exact: tape tension, posture and rounding add about a centimetre of their own.
const READING_SD = 1;
export const THRESHOLD = {check:3, error:4.2};

const index = Object.fromEntries(KEYS.map((key, i) => [key, i]));
export const COVARIANCE = KEYS.map((a, i) => KEYS.map((b, j) => i === j ? SD[a] ** 2 + READING_SD ** 2 : 0));
for (const [a, b, r] of CORRELATION) COVARIANCE[index[a]][index[b]] = COVARIANCE[index[b]][index[a]] = r * SD[a] * SD[b];
export const MODEL = {MEAN, SD};

// Solves A x = b for a small symmetric positive definite matrix (Gauss-Jordan with partial pivoting).
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// What the other measurements predict for `key`: {mean, sd}. With nothing else entered, the population.
export function predict(key, values) {
  const i = index[key], others = KEYS.filter(k => k !== key && Number.isFinite(values[k])).map(k => index[k]);
  if (!others.length) return {mean: MEAN[key], sd: Math.sqrt(COVARIANCE[i][i])};
  const S = others.map(a => others.map(b => COVARIANCE[a][b]));
  const cross = others.map(a => COVARIANCE[i][a]);
  const weights = solve(S, cross);
  let mean = MEAN[key], variance = COVARIANCE[i][i];
  others.forEach((a, n) => { mean += weights[n] * (values[KEYS[a]] - MEAN[KEYS[a]]); variance -= weights[n] * cross[n]; });
  return {mean, sd: Math.sqrt(Math.max(variance, .25))};
}
const surprise = (key, values) => { const p = predict(key, values); return (values[key] - p.mean) / p.sd; };

// How unusual the whole set is: the largest remaining surprise once the given keys are set aside.
function worst(values, without = []) {
  const kept = Object.fromEntries(Object.entries(values).filter(([k]) => !without.includes(k)));
  let best = {key: null, z: 0};
  for (const key of Object.keys(kept)) { const z = surprise(key, kept); if (Math.abs(z) > Math.abs(best.z)) best = {key, z}; }
  return best;
}

const CIRCUMFERENCES = ['poitrine','taille','bassin'];
// Ways a reading goes wrong, as a function giving the value the client probably meant.
function explanations(key, x, values) {
  const list = [
    {kind: 'inches', value: x * 2.54},
    {kind: 'tenfold', value: x * 10},
    {kind: 'tenth', value: x / 10},
    {kind: 'ten-more', value: x + 10},
    {kind: 'ten-less', value: x - 10}
  ];
  if (CIRCUMFERENCES.includes(key) || key === 'epaules') list.push({kind: 'half', value: x * 2});
  if (key === 'stature' && x < 100) list.push({kind: 'missing-hundred', value: x + 100});
  if (x >= 10 && x < 100 && Number.isInteger(x)) {
    const swapped = (x % 10) * 10 + Math.floor(x / 10);
    if (swapped !== x && swapped >= 10) list.push({kind: 'digits', value: swapped});
  }
  for (const other of Object.keys(values)) if (other !== key) list.push({kind: 'swap', with: other, value: values[other]});
  return list;
}

const round = v => Math.round(v * 10) / 10;

// values: {key: centimetres}. Returns the alerts, most surprising first, and nothing for a plausible set.
export function checkMeasurements(input = {}) {
  const values = {};
  for (const key of KEYS) { const v = Number(input[key]); if (Number.isFinite(v) && v > 0) values[key] = v; }
  const alerts = [], aside = [];
  // Every value given in inches: each one is far too small on its own, and all agree once converted.
  const keys = Object.keys(values);
  if (keys.length >= 3) {
    const converted = Object.fromEntries(keys.map(k => [k, values[k] * 2.54]));
    const low = keys.every(k => (values[k] - MEAN[k]) / SD[k] < -4);
    if (low && Math.abs(worst(converted).z) < THRESHOLD.check) {
      return {alerts: keys.map(key => ({key, level: 'error', z: round((values[key] - MEAN[key]) / SD[key]),
        expected: [round(MEAN[key] - 2 * SD[key]), round(MEAN[key] + 2 * SD[key])], suggestion: {kind: 'inches', value: round(converted[key])}})), allInches: true};
    }
  }
  // 1. set the surprising values aside, the most surprising first
  const flagged = [];
  for (let pass = 0; pass < keys.length; pass++) {
    const {key, z} = worst(values, aside);
    if (!key || Math.abs(z) < THRESHOLD.check) break;
    flagged.push({key, z}); aside.push(key);
  }
  // 2. judge and explain each of them against the values that were not flagged
  const sound = Object.fromEntries(Object.entries(values).filter(([k]) => !aside.includes(k)));
  const explained = new Set();
  for (const {key, z} of flagged) {
    if (explained.has(key)) continue;
    const p = predict(key, sound);
    let suggestion = null, calm = Infinity;
    for (const e of explanations(key, values[key], values)) {
      if (e.kind === 'swap' && !aside.includes(e.with)) continue; // a swap puts two values in the wrong place
      const trial = {...sound, [key]: e.value};
      let left = Math.abs(surprise(key, trial));
      if (e.kind === 'swap') left = Math.max(left, Math.abs(surprise(e.with, {...sound, [e.with]: values[key]})));
      if (left < calm) { calm = left; suggestion = {...e, value: round(e.value)}; }
    }
    if (calm > 2.2) suggestion = null;
    const gap = sound && Object.keys(sound).length ? (values[key] - p.mean) / p.sd : z;
    alerts.push({key, level: Math.abs(gap) >= THRESHOLD.error ? 'error' : 'check', z: round(gap),
      expected: [round(p.mean - 2 * p.sd), round(p.mean + 2 * p.sd)], suggestion});
    if (suggestion?.kind === 'swap') explained.add(suggestion.with);
  }
  return {alerts, allInches: false};
}

const LABEL = {stature:'stature', poitrine:'tour de poitrine', taille:'tour de taille', bassin:'tour de bassin',
  epaules:'carrure dos', manche:'longueur de manche', dos:'longueur de dos', entrejambe:'entrejambe'};
const number = v => String(v).replace('.', ',');

// One short sentence for the client, in French.
export function describeAlert(alert) {
  const [low, high] = alert.expected, s = alert.suggestion;
  const range = `D’après vos autres mesures, on attend entre ${number(Math.round(low))} et ${number(Math.round(high))} cm.`;
  if (!s) return `${alert.level === 'error' ? 'Cette valeur paraît erronée' : 'Valeur inhabituelle, à vérifier'}. ${range}`;
  const hint = {
    inches: `Mesure prise en pouces ? Cela ferait ${number(s.value)} cm.`,
    half: `Demi-tour mesuré à plat ? Le tour complet ferait ${number(s.value)} cm.`,
    tenfold: `Virgule mal placée ? Vouliez-vous dire ${number(s.value)} cm ?`,
    tenth: `Virgule mal placée ? Vouliez-vous dire ${number(s.value)} cm ?`,
    'ten-more': `Dizaine mal lue sur le ruban ? Vouliez-vous dire ${number(s.value)} cm ?`,
    'ten-less': `Dizaine mal lue sur le ruban ? Vouliez-vous dire ${number(s.value)} cm ?`,
    'missing-hundred': `Vouliez-vous dire ${number(s.value)} cm ?`,
    digits: `Chiffres inversés ? Vouliez-vous dire ${number(s.value)} cm ?`,
    swap: `Cette valeur ressemble à votre ${LABEL[s.with]} : les deux cases sont peut-être inversées.`
  }[s.kind];
  return `${hint} ${range}`;
}
