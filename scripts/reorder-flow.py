from pathlib import Path
import re
p=Path(__file__).resolve().parents[1]/'dist/index.html'
s=p.read_text()
if 'id="step-review-sheet"' in s:
    print('Six-step flow is already in place.');raise SystemExit(0)
steps=[('fabric','Tissu'),('style','Veste'),('trousers','Pantalon'),('vest','Gilet'),('finish','Finitions'),('review','Récapitulatif')]
nav='<nav class="tabs" role="tablist" aria-label="Étapes de personnalisation">\n'+ '\n'.join(f'<button role="tab" id="tab-{key}" aria-controls="panel-{key}" aria-selected="{str(i==0).lower()}" tabindex="{0 if i==0 else -1}" data-tab="{key}"><span>{i+1:02d}</span>{label}</button>' for i,(key,label) in enumerate(steps))+'\n</nav>'
s=re.sub(r'<nav class="tabs".*?</nav>',nav,s,flags=re.S)
s=s.replace('<div class="panel-content">','<p class="flow-progress" id="flow-progress" aria-live="polite">Étape 1 sur 6 · Tissu</p><div class="panel-content">',1)
sections={m.group(1):m.group(2) for m in re.finditer(r'<section id="panel-(style|fabric|finish|catalog)"[^>]*>(.*?)</section>',s,re.S)}
def clean_next(text):return re.sub(r'<button class="next-step".*?</button>','',text,flags=re.S)
style=clean_next(sections['style'])+'<div class="flow-detail-title"><h2>Construction et détails</h2><p>Retrouvez ici toutes les variantes de la veste.</p></div><div id="step-coat-options"></div>'
fabric=clean_next(sections['fabric'])
# Material is the starting point; color and motif follow it.
color=re.search(r'<div class="section-title"><h2>La couleur</h2>.*?<div class="color-grid".*?</div>',fabric,re.S).group(0)
material=re.search(r'<div class="section-title second"><h2>La matière</h2>.*?<p class="selection-description" id="fabric-description">.*?</p>',fabric,re.S).group(0)
fabric=fabric.replace(color,'',1).replace(material,'',1)
fabric=material.replace('class="section-title second"','class="section-title"',1)+color.replace('class="section-title"','class="section-title second"',1)+fabric
finish=clean_next(sections['finish'])
recap=re.search(r'<div class="recap">.*?</div>',finish,re.S).group(0)
share=re.search(r'<button class="secondary-action" id="copy-link">.*?</button>',finish,re.S).group(0)
finish=finish.replace(recap,'').replace(share,'')+'<div class="flow-detail-title"><h2>Doublure et broderie</h2><p>Choisissez les références, puis ajoutez vos inscriptions.</p></div><div id="step-finish-options"></div><div id="step-finish-fields"></div>'
trousers='<div class="flow-detail-title"><h2>Votre pantalon</h2><p>Pinces et poches, puis ceinture et ajustement de taille.</p></div><div id="step-trouser-options"></div>'
vest='<div class="flow-detail-title"><h2>Avec ou sans gilet ?</h2><p>Le gilet est facultatif. Activez-le pour composer un trois pièces.</p></div><div id="step-vest-toggle"></div><div id="vest-step-options"><div id="step-vest-options"></div></div><p class="subtle-note" id="vest-skip-note">Sans gilet : vous pouvez passer directement aux finitions.</p>'
review='<div class="flow-detail-title"><h2>Votre composition</h2><p>Relisez vos choix et téléchargez votre fiche pour le tailleur.</p></div>'+recap+'<div id="step-review-sheet"></div><div id="step-review-notes"></div><div id="step-review-export"></div>'+share
contents={'fabric':fabric,'style':style,'trousers':trousers,'vest':vest,'finish':finish,'review':review}
panels=[]
for i,(key,label) in enumerate(steps):
    controls='<div class="flow-navigation">'
    if i:controls+=f'<button class="flow-back" data-next="{steps[i-1][0]}">← {steps[i-1][1]}</button>'
    if i<len(steps)-1:controls+=f'<button class="flow-next" data-next="{steps[i+1][0]}">{steps[i+1][1]} <span aria-hidden="true">→</span></button>'
    controls+='</div>'
    panels.append(f'<section id="panel-{key}" role="tabpanel" aria-labelledby="tab-{key}" tabindex="0"'+(' hidden' if i else '')+'>'+contents[key]+controls+'</section>')
# Keep the reference mount point until its nodes are distributed to the steps.
panels.append('<section id="panel-catalog" aria-label="Références du catalogue" hidden>'+sections['catalog']+'</section>')
start=s.index('<div class="panel-content">');end=s.index('<div class="panel-footer">',start)
s=s[:start]+'<div class="panel-content">'+'\n'.join(panels)+'</div>\n'+s[end:]
p.write_text(s)
print('Reordered the six steps: material, jacket, trousers, optional vest, finishes, review.')
