const looks = [
  {key:'droit', title:'Le droit · Bleu nuit', alt:'Costume droit bleu nuit porté sur une chemise blanche'},
  {key:'croise', title:'Le croisé · Bleu nuit', alt:'Costume croisé bleu nuit à revers en pointe'}
];
let current = 0;
for (const button of document.querySelectorAll('[data-slide]')) {
  button.addEventListener('click', () => {
    current = (current + Number(button.dataset.slide) + looks.length) % looks.length;
    const look = looks[current];
    document.querySelector('#mobile-photo').srcset = 'assets/' + look.key + '.webp';
    const photo = document.querySelector('#hero-photo');
    photo.src = 'assets/hero-' + look.key + '.webp';
    photo.alt = look.alt;
    document.querySelector('#look-number').textContent = 'SILHOUETTE 0' + (current + 1) + ' / 02';
    document.querySelector('#look-name').textContent = look.title;
    document.querySelector('#start').href = 'studio.html?modele=' + look.key;
  });
}
// Older shared compositions used the home page as their entry point.
if (new URLSearchParams(location.search).has('c')) location.replace('studio.html' + location.search);
