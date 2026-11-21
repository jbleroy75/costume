// Plausibility model for the body measurements of the fitting guide (eight tape readings and the weight).
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
// The parameters are fitted on the public ANSUR II survey (US Army, 2012): 4,082 men measured by trained
// staff (scripts/fit-measure-model.mjs). A client measuring himself is less exact than they were, so a
// reading error is added to each measurement. Soldiers are also fitter than the average client, so the
// thresholds are deliberately wide. Refit with verified orders once the shop has enough of them.

export const KEYS = ['stature','poitrine','taille','bassin','epaules','manche','dos','entrejambe','poids'];
const index = Object.fromEntries(KEYS.map((key, i) => [key, i]));
const MEAN = {stature:175.62, poitrine:105.87, taille:94.06, bassin:101.95, epaules:45.72, manche:59.31, dos:47.76, entrejambe:80.59, poids:85.52};
const SURVEY_COVARIANCE = [
  [46.99,14.83,15.92,17.85,7.68,16.97,10.17,27.35,45.71],
  [14.83,76.45,86.53,56.07,9.55,5.40,12.08,4.75,112.79],
  [15.92,86.53,124.78,75.02,9.08,4.87,17.69,2.83,141.10],
  [17.85,56.07,75.02,58.80,7.92,5.96,11.13,6.51,101.71],
  [7.68,9.55,9.08,7.92,4.44,3.09,2.20,4.19,17.64],
  [16.97,5.40,4.87,5.96,3.09,9.50,3.19,12.04,16.24],
  [10.17,12.08,17.69,11.13,2.20,3.19,7.69,3.98,23.57],
  [27.35,4.75,2.83,6.51,4.19,12.04,3.98,21.62,20.46],
  [45.71,112.79,141.10,101.71,17.64,16.24,23.57,20.46,202.23]
];
// Standard deviation of a self-taken reading (tape tension, posture, where exactly the tape sits).
const READING_SD = {stature:1, poitrine:2, taille:2.5, bassin:2, epaules:1.5, manche:2, dos:1.5, entrejambe:1.5, poids:1.5};
// Surprise, in standard deviations, that raises an alert. Measured on 2,041 surveyed men kept out of the
// fit, each given a simulated self-measurement error: about 2.5 % of correct sets raise an alert at 3.
export const THRESHOLD = {check:3, error:4.2};
const SD = {};
export const COVARIANCE = KEYS.map(() => new Array(KEYS.length).fill(0));
export const MODEL = {MEAN, SD, READING_SD};
// Installs a fit: population mean and covariance, reading errors, thresholds. Also used to refit and to test.
export function configure({mean = MEAN, covariance = SURVEY_COVARIANCE, reading = READING_SD, threshold} = {}) {
  KEYS.forEach((a, i) => {
    MEAN[a] = mean[a];
    KEYS.forEach((b, j) => { COVARIANCE[i][j] = covariance[i][j] + (i === j ? reading[a] ** 2 : 0); });
    SD[a] = Math.sqrt(COVARIANCE[i][i]);
  });
  if (threshold) Object.assign(THRESHOLD, threshold);
}
configure();

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
  if (key === 'poids') return [{kind: 'pounds', value: x * .4536}, {kind: 'tenfold', value: x * 10}, {kind: 'tenth', value: x / 10}];
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
  for (const other of Object.keys(values)) if (other !== key && other !== 'poids') list.push({kind: 'swap', with: other, value: values[other]});
  return list;
}

const round = v => Math.round(v * 10) / 10;

// values: {key: centimetres}. Returns the alerts, most surprising first, and nothing for a plausible set.
export function checkMeasurements(input = {}) {
  const values = {};
  for (const key of KEYS) { const v = Number(input[key]); if (Number.isFinite(v) && v > 0) values[key] = v; }
  const alerts = [], aside = [];
  // Every value given in inches: each one is far too small on its own, and all agree once converted.
  const keys = Object.keys(values), tape = keys.filter(k => k !== 'poids');
  if (tape.length >= 3) {
    const converted = Object.fromEntries(tape.map(k => [k, values[k] * 2.54]));
    const low = tape.every(k => (values[k] - MEAN[k]) / SD[k] < -4);
    if (low && Math.abs(worst(converted).z) < THRESHOLD.check) {
      return {alerts: tape.map(key => ({key, level: 'error', z: round((values[key] - MEAN[key]) / SD[key]),
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

const LABEL = {poids:'poids', stature:'stature', poitrine:'tour de poitrine', taille:'tour de taille', bassin:'tour de bassin',
  epaules:'carrure dos', manche:'longueur de manche', dos:'longueur de dos', entrejambe:'entrejambe'};
const number = v => String(v).replace('.', ',');

// One short sentence for the client, in French.
export function describeAlert(alert) {
  const [low, high] = alert.expected, s = alert.suggestion, unit = alert.key === 'poids' ? 'kg' : 'cm';
  const range = `D’après vos autres mesures, on attend entre ${number(Math.round(low))} et ${number(Math.round(high))} ${unit}.`;
  if (!s) return `${alert.level === 'error' ? 'Cette valeur paraît erronée' : 'Valeur inhabituelle, à vérifier'}. ${range}`;
  const hint = {
    pounds: `Poids donné en livres ? Cela ferait ${number(s.value)} kg.`,
    inches: `Mesure prise en pouces ? Cela ferait ${number(s.value)} cm.`,
    half: `Demi-tour mesuré à plat ? Le tour complet ferait ${number(s.value)} cm.`,
    tenfold: `Virgule mal placée ? Vouliez-vous dire ${number(s.value)} ${unit} ?`,
    tenth: `Virgule mal placée ? Vouliez-vous dire ${number(s.value)} ${unit} ?`,
    'ten-more': `Dizaine mal lue sur le ruban ? Vouliez-vous dire ${number(s.value)} cm ?`,
    'ten-less': `Dizaine mal lue sur le ruban ? Vouliez-vous dire ${number(s.value)} cm ?`,
    'missing-hundred': `Vouliez-vous dire ${number(s.value)} cm ?`,
    digits: `Chiffres inversés ? Vouliez-vous dire ${number(s.value)} cm ?`,
    swap: `Cette valeur ressemble à votre ${LABEL[s.with]} : les deux cases sont peut-être inversées.`
  }[s.kind];
  return `${hint} ${range}`;
}
