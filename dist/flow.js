export const STEPS=['fabric','style','trousers','vest','finish','mesures','review'];
export const STEP_LABELS=['Tissu','Veste','Pantalon','Gilet','Finitions','Mesures','Récapitulatif'];
export const CATEGORY_TARGETS={coat:'step-coat-options',trousers:'step-trouser-options',vest:'step-vest-options',finish:'step-finish-options'};
export function mountFlow(getConfig){
  const $=id=>document.getElementById(id);
  for(const section of Array.from($('catalog-groups').children)){
    const target=CATEGORY_TARGETS[section.dataset.category];
    if(target){section.hidden=false;$(target).append(section);}
  }
  $('step-vest-toggle').append($('catalog-vestEnabled').closest('label'));
  const fields=$('catalog-liningReference').closest('.catalog-fields');
  $('step-finish-fields').append(fields);
  const notes=$('catalog-customNotes'),notesLabel=document.querySelector('label[for="catalog-customNotes"]');
  $('step-review-notes').append(notesLabel,notes);
  const sheet=$('catalog-recap').closest('.catalog-sheet');sheet.open=true;$('step-review-sheet').append(sheet);
  $('step-review-export').append($('catalog-export-txt').closest('.catalog-export'));
  function refresh(){
    const enabled=getConfig().tailoring?.vestEnabled===true;
    $('vest-step-options').hidden=!enabled;
    $('vest-skip-note').hidden=enabled;
  }
  refresh();return {refresh};
}
