export const measurements = [
  ['stature','Stature','Debout, pieds nus, du sol au sommet du crâne.'],
  ['poitrine','Tour de poitrine','Passez le ruban sous les aisselles, sur la partie la plus forte du buste.'],
  ['taille','Tour de taille','Mesurez autour de la taille naturelle, le ventre relâché.'],
  ['bassin','Tour de bassin','Entourez les hanches à leur point le plus large.'],
  ['epaules','Carrure dos','D’une extrémité de l’épaule à l’autre en suivant le haut du dos.'],
  ['manche','Longueur de manche','Du point d’épaule au poignet, le bras légèrement fléchi.'],
  ['dos','Longueur de dos','De la base de la nuque à la taille naturelle.'],
  ['entrejambe','Entrejambe','Mesurez le long de la jambe, de l’entrejambe au bas souhaité.']
];
export function normalizeMeasurements(input = {}) {
  const result = {};
  for (const [key] of measurements) {
    const value = Number(input?.[key]);
    if (Number.isFinite(value) && value > 0 && value <= 300) result[key] = Math.round(value * 10) / 10;
  }
  return result;
}
const photoDescriptions = {
  stature: 'Modèle pieds nus, debout contre une toise, avec la butée posée sur le sommet de la tête.',
  poitrine: 'Ruban horizontal autour du buste, à la hauteur de la poitrine.',
  taille: 'Ruban à plat autour de la taille naturelle, au-dessus de la ceinture du pantalon.',
  bassin: 'Vue arrière de trois quarts, ruban posé autour de la partie la plus forte du bassin.',
  epaules: 'Vue de dos, ruban entre les pointes des deux épaules en suivant la courbe du haut du dos.',
  manche: 'Vue latérale, ruban de la pointe de l’épaule au poignet en suivant le bras.',
  dos: 'Ruban vertical au milieu du dos, de la base du col à la taille.',
  entrejambe: 'Ruban le long de la face intérieure de la jambe, de la couture d’entrejambe à la cheville.'
};
function createPhotoDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'measure-photo-dialog';
  dialog.setAttribute('aria-labelledby', 'measure-photo-title');
  dialog.innerHTML = `<header class="measure-photo-head"><h2 id="measure-photo-title"></h2>
    <button type="button" class="measure-photo-close" aria-label="Fermer la photo">×</button></header>
    <img width="378" height="506"><p></p>`;
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if(event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if(event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  document.body.append(dialog);
  return (key, label, hint, image) => {
    dialog.querySelector('h2').textContent = label;
    const fullPhoto = dialog.querySelector('img');
    fullPhoto.src = image.src; fullPhoto.alt = photoDescriptions[key];
    dialog.querySelector('p').textContent = hint;
    dialog.showModal();
  };
}
export function mountMeasurements(values, onChange) {
  const form = document.querySelector('#measure-fields');
  const openPhoto = createPhotoDialog();
  for (const [key, label, hint] of measurements) {
    const row = document.createElement('div');
    row.className = 'measure-card';
    const photo = document.createElement('button');
    photo.type = 'button'; photo.className = 'measure-card-photo';
    photo.setAttribute('aria-label', 'Agrandir la photo : ' + label);
    photo.setAttribute('aria-haspopup','dialog');
    const image = document.createElement('img');
    image.src = './assets/measurements/' + key + '.webp';
    image.width = 378; image.height = 506; image.loading = 'lazy'; image.decoding = 'async';
    image.alt = photoDescriptions[key];
    const plus = document.createElement('span');
    plus.setAttribute('aria-hidden', 'true'); plus.textContent = '+';
    photo.append(image, plus);
    photo.addEventListener('click', () => openPhoto(key, label, hint, image));
    const body = document.createElement('div'); body.className = 'measure-card-body';
    const title = document.createElement('label'); title.textContent = label;
    const detail = document.createElement('p'); detail.id = 'measure-help-' + key; detail.textContent = hint;
    const input = document.createElement('input');
    input.id = 'measure-value-' + key; title.htmlFor = input.id;
    input.setAttribute('aria-describedby', detail.id);
    input.setAttribute('aria-label', label + ', en centimètres');
    input.type = 'number'; input.min = '0.1'; input.max = '300'; input.step = '0.1';
    input.inputMode = 'decimal'; input.dataset.measure = key; input.value = values[key] ?? '';
    input.addEventListener('change', () => {
      if (!input.checkValidity()) { input.reportValidity(); return; }
      onChange(key, input.value);
    });
    const value = document.createElement('div'); value.className = 'measure-card-value';
    const unit = document.createElement('span'); unit.textContent = 'cm'; unit.setAttribute('aria-hidden', 'true');
    value.append(input, unit); body.append(title, detail, value);
    row.append(photo, body); form.append(row);
  }
}
