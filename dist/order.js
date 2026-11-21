// The order form of the last step: contact details, then the whole composition is sent to the workshop.
export function mountOrder(getConfig){
  const form=document.getElementById('order-form');if(!form)return;
  const status=document.getElementById('order-status'),button=form.querySelector('button[type=submit]');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity()||button.disabled)return;
    button.disabled=true;status.dataset.state='';status.textContent='Envoi de votre commande…';
    const field=name=>form.elements[name].value.trim();
    let preview='';
    try{preview=document.getElementById('suit').toDataURL('image/jpeg',.82);}catch{}
    try{
      const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({customer:{name:field('name'),email:field('email'),phone:field('phone'),note:field('note')},website:field('website'),config:getConfig(),preview})});
      const answer=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(answer.error||'La commande n’a pas pu être envoyée. Réessayez dans un instant.');
      form.hidden=true;status.dataset.state='done';
      status.textContent=`Commande ${answer.id} bien reçue. Nous vous écrivons à ${field('email')} pour confirmer les détails et le règlement.`;
    }catch(error){
      status.dataset.state='error';status.textContent=error.message;button.disabled=false;
    }
  });
}
