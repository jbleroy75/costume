"""Extract the supplied TAELSON reference cells and build a selectable catalog.
This does not edit the uploaded PDF. Page coordinates refer to the 14-page source.
"""
from pathlib import Path
from PIL import Image
import json,re,unicodedata,shutil

ROOT=Path(__file__).resolve().parents[1]
PAGES=Path('/workspace/scratch/af049406d271/taelson-pages')
OUT=ROOT/'dist/assets/taelson'
OUT.mkdir(parents=True,exist_ok=True)
groups=[]
def slug(text):
    return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode().lower()).strip('-')
def grid(cols,rows,x0,x1,y0,y1,pad=.008):
    return [(x0+c*(x1-x0)/cols+pad,y0+r*(y1-y0)/rows+pad,x0+(c+1)*(x1-x0)/cols-pad,y0+(r+1)*(y1-y0)/rows-pad) for r in range(rows) for c in range(cols)]
def add(key,category,title,page,labels,crops=None,default=0):
    options=[]
    im=Image.open(PAGES/('repaired12.png' if page==12 else f'page-{page:02d}.png')).convert('RGB')
    for i,item in enumerate(labels):
        obj={'id':slug(item[0]),'label':item[0],'original':item[1]} if isinstance(item,(list,tuple)) else {'id':slug(item),'label':item,'original':item}
        obj['page']=page
        if crops and i<len(crops) and crops[i]:
            x0,y0,x1,y1=crops[i];crop=im.crop((int(x0*im.width),int(y0*im.height),int(x1*im.width),int(y1*im.height)))
            crop.thumbnail((360,270))
            file=f'{key}-{obj["id"]}.webp';crop.save(OUT/file,'WEBP',quality=88)
            obj['image']=f'./assets/taelson/{file}'
        options.append(obj)
    groups.append({'id':key,'category':category,'title':title,'page':page,'default':options[default]['id'],'options':options})
    return groups[-1]

add('coatFront','coat','Fermeture de la veste',1,[
 ('Simple · 1 bouton','Single-Breasted 1-Button'),('Simple · 2 boutons','Single-Breasted 2-Button'),('3 roll 2','3 Roll 2'),('Simple · 3 boutons','Single-Breasted 3-Button'),('Croisée · 4 sur 2','Double-Breasted 4 On 2'),('Croisée · 6 sur 2','Double-Breasted 6 On 2'),('Croisée · 6 sur 3','Double-Breasted 6 On 3'),('Croisée · faux 2 sur 1','Double-Breasted False 2 On 1'),('Croisée · 2 sur 1','Double-Breasted 2 On 1'),('Croisée · 4 sur 1','Double-Breasted 4 On 1'),('Croisée · 6 sur 1','Double-Breasted 6 On 1')],grid(6,1,.06,.91,.17,.44)+grid(5,1,.12,.84,.54,.83),1)
add('coatLapel','coat','Forme des revers',2,[('Crantés','Notched Lapel'),('En pointe','Peaked Lapel'),('Pointe courbe','Curved Peaked'),('Grande pointe courbe','Large Curved Peaked'),('Col à patte','Tab Collar'),('Bouche de poisson','Fish-Mouth Lapel'),('Châle pointu','Pointed Shawl Lapel'),('Châle carré','Square Shawl Lapel'),('Châle diagonal','Diagonal Shawl Lapel'),('Châle arrondi étroit','Small Round Shawl Lapel'),('Châle arrondi moyen','Medium Round Shawl Lapel'),('Châle arrondi large','Large Round Shawl Lapel')],grid(6,2,.065,.94,.14,.675))
add('lapelWidth','coat','Largeur des revers',2,[('Adaptée à la morphologie','Tailored to your body shape'),('10,16 cm · 4 pouces','4 inches'),('11,43 cm · 4,5 pouces','4.5 inches'),('Largeur personnalisée','Custom width')])
add('buttonholePosition','coat','Position des boutonnières de revers',3,[('Aucune','No Lapel Buttonhole'),('Gauche · 1','Left Lapel Buttonhole'),('Gauche et droite · 1 chacune','Left & Right Lapel BH'),('Gauche · 2','Left Double BH'),('Gauche · 3','Left 3 Buttonholes'),('Droite · 3','Right 3 Buttonholes'),('Gauche 2 + droite 1','Left 2 + Right 1'),('Gauche 1 + droite 2','Left 1 + Right 2'),('Gauche 3 + droite 1','Left 3 + Right 1'),('Gauche 2 + droite 2','Left 2 + Right 2'),('Gauche 1 + droite 3','Left 1 + Right 3')],default=1)
add('buttonholeStyle','coat','Style de boutonnière',3,[('Décorative','Imitational'),('Fonctionnelle','Functional'),('Décorative arrondie','Imitational (round)')]+[(f'Milanaise ZM{i:03d}',f'Handmade Milanese Eyelet ZM{i:03d}') for i in range(1,13)],grid(3,1,.04,.655,.71,.86)+grid(3,4,.72,.99,.295,.915),1)
add('coatPockets','coat','Poches de veste',4,[('Passepoil simple','Single Welt Pocket'),('Passepoil double','Besom Pocket'),('Rabat droit','Flat Flap Pocket'),('Rabat incliné','Slanted Flat Flap Pocket'),('Rabat droit + poche ticket à rabat','Flat Flap + Ticket Pocket Flap'),('Rabat incliné + poche ticket à rabat','Slanted Flap + Ticket Pocket Flap'),('Rabat droit + poche ticket passepoilée','Flat Flap + Besom Ticket Pocket'),('Rabat incliné + poche ticket passepoilée','Slanted Flap + Besom Ticket Pocket'),('Passepoil simple + poche ticket','Single Welt Flat Pocket + Single Welt Ticket Pocket'),('Passepoil double + poche ticket','Besom Flat Pocket + Besom Ticket Pocket'),('Plaquées','Patch Pocket'),('Plaquées avec poche intérieure','Patch Pocket With Inner Pocket')],grid(4,3,.14,.94,.19,.94),2)
add('sleeveDesign','coat','Poignets de veste',5,[('4 boutons fonctionnels','Four Working Buttons'),('4 boutons décoratifs','Four Decorative Buttons'),('Poignet à revers fonctionnel','Gauntlet Cuff Functional')],grid(3,1,.12,.86,.245,.51))
add('sleeveAlignment','coat','Alignement des boutons de manche',5,[('Standard','Standard'),('Incliné','Slanted')])
add('sleeveSpacing','coat','Espacement des boutons de manche',5,[('Standard','Standard'),('Jointifs · kissing','Kissing buttons')])
add('coatVents','coat','Fentes au dos',5,[('Sans fente','No vent'),('Fente centrale','Center vent'),('Deux fentes latérales','Side vents'),('Fentes latérales avec patte','Side vents with strap')],grid(4,1,.08,.89,.655,.955),2)
add('lining','finish','Doublure',6,[('Unie · assortie au tissu','Free Solid Lining / Tailor To Match Fabric Color'),('Paisley','Free Paisley Lining'),('Imprimée','Exquisite Printed Linings'),('Bemberg · 100 % cupro','Luxury Bemberg (100% Cupro) Linings'),('Personnalisée','Custom Lining / Any image & design')],[(.025,.22,.465,.50),(.50,.22,.945,.50),(.025,.57,.465,.81),(.50,.57,.945,.81),None])
fontids=[1,2,3,4,5,6,8,10,12,15,23,103]
fontcrops=grid(1,4,.43,.61,.145,.70)+grid(1,4,.62,.79,.145,.70)+grid(1,4,.80,.98,.145,.70)
add('monogramFont','finish','Police de broderie',7,[(f'Police {i}',f'Embroidery Font {i}') for i in fontids],fontcrops)

classic=[('PC001','Argent poli',[175,179,181]),('DT833','Blanc',[226,226,215]),('KS9019-5','Noir',[22,23,24]),('KS9001-1','Ivoire',[221,221,202]),('KS9045-1','Beige',[164,158,141]),('DD-15','Bleu clair',[103,166,171]),('PC002','Or poli',[160,133,80]),('DT822','Ambre',[133,79,30]),('KS9043-1','Corne',[88, 62,36]),('KS9048-3','Rose marbré',[123,65,86]),('KS9018-1','Bois',[41, 34,23]),('DD-17','Violet',[103,45,155]),('PC003','Or mat',[216,196,132]),('DT839','Chocolat',[45,29, 20]),('KS9048-5','Bleu marbré',[28,41,74]),('DT828','Bleu nuit',[28, 35, 56]),('KZ6001-7','Bordeaux',[68,22,30]),('DD-10','Vert',[24,65,43]),('PC004','Emblème antique',[66,57,35]),('KS9044-1','Argent',[129,139,140]),('KS9048-2','Gris',[ 70,73, 74]),('KS9052-4','Marbre',[28,28,32]),('KF5010','Argent texturé',[160,160,156]),('DD-8','Jaune',[230,214,76]),('PC005','Emblème écusson',[199,190,135]),('KF5014','Emblème argent',[126,131,130]),('KF5015','Emblème or',[185,162,78]),('ZM5023','Emblème laurier',[41,40,29]),('DT817','Emblème or',[192,173, 60]),('DT849','Emblème doré',[191,163,70])]
pearl=[('WY-36','Blanc',[210,210,205]),('WY-15','Ivoire',[217,215,172]),('WY-31','Champagne',[193,167,117]),('WY-41','Grège',[158,151,128]),('DD-4','Pêche',[221,178,155]),('WY-45','Rose pâle',[219,181,189]),('WY-8','Rose',[216,159,163]),('WY-40','Lilas pâle',[198,175,193]),('WY-46','Lavande',[185,156,198]),('DD-17','Bleu glacier',[157,183,192]),('DD-10','Vert pâle',[163,197,137]),('WY-16','Bleu clair',[127,159,189]),('WY-51','Bleu azur',[20,112,169]),('WY-10','Turquoise',[42,184,142]),('WY-30','Jaune',[222,215,23]),('DD-7','Orange',[210,117,24]),('WY-44','Orange rouge',[193,73, 20]),('WY-12','Rouge',[195, 30,40]),('WY-33','Fuchsia',[190,35,115]),('DD-1','Bordeaux',[88,22,46]),('WY-14','Brun',[101, 60,29]),('DD-5','Ambre',[135,104,45]),('WY-11','Vert olive',[ 60,97,32]),('DD-13','Vert',[30,106,43]),('DD-12','Vert profond',[34,81,53]),('WY-1','Bleu marine',[21, 35,75]),('DD-15','Bleu royal',[32, 30,107]),('DD-20','Violet',[90,44,126]),('WY-52','Prune',[88,44,75])]
buttonlabels=[('Boutons actuels','Current preview buttons')]+[(f'{code} · {label}',f'{family} / {code}') for family,arr in [('Classique',classic),('Nacre',pearl)] for code,label,rgb in arr]+[('Assortis par le tailleur','Tailor to Match')]
cg=grid(6,5,.025,.495,.19,.93);pg=grid(6,5,.52,.975,.19,.93)[:29]
buttons=add('catalogButtons','finish','Boutons TAELSON',8,buttonlabels,[None]+cg+pg+[None])
for i,(family,arr) in enumerate([('Classique',classic),('Nacre',pearl)]):
    offset=1 if i==0 else 31
    for j,(code,label,rgb) in enumerate(arr):buttons['options'][offset+j].update({'code':code,'family':family,'rgb':rgb})

add('suspenderButtons','trousers','Boutons de bretelles',9,[('Oui','YES'),('Non','NO')],default=1)
add('waistGrip','trousers','Bande antiglisse',9,[('Oui','YES'),('Non','NO')],default=1)
add('waistAdjustment','trousers','Ajustement de la taille',9,[('Passants de ceinture','Belt loop'),('Pattes de serrage','Adjusters')],[(.29,.22,.48,.54),(.29,.61,.48,.88)])
add('waistExtension','trousers','Ceinture et prolongement',9,[('Prolongement pointu','Pointed extended'),('Prolongement arrondi','Round extended'),('Prolongement carré','Square extended'),('Taille haute · 2 boutons','High waisted 2 button'),('Prolongement carré long + passant','Long Square extended + loop'),('Pattes latérales multiperforées','Multi-hole side waist tabs'),('Ceinture croisée Gurkha','Gurkha cross-over waistband'),('Double patte napolitaine','Neapolitan Double Sword Waist Tabs')],grid(2,4,.52,.98,.20,.94))
add('trouserBackPockets','trousers','Poches arrière',10,[('Passepoil double + 2 boutons','Besom + 2 Buttons'),('Passepoil simple + 2 boutons','Single Welt + 2 Buttons'),('Droite · passepoil double','Right Besom Pocket'),('Droite · passepoil double sans bouton','Right Besom Pocket w/o Button'),('Gauche · passepoil double','Left Besom Pocket'),('Passepoil simple sans bouton','Single Welt w/o Button'),('Passepoil double sans bouton','Besom w/o Button'),('Rabat losange + 2 boutons','Diamond-shaped Flap + 2 Buttons')],grid(2,4,.055,.425,.24,.94))
add('trouserPleats','trousers','Pinces du pantalon',10,[('Sans pince','Regular'),('Une pince inversée','Single reverse pleat (sideseam)'),('Deux pinces inversées','Double reverse pleats (sideseam)')],grid(3,1,.46,.99,.23,.49))
add('trouserFrontPockets','trousers','Poches avant',10,[('Sans poche','No pocket'),('Poches inclinées','Slanted pocket'),('Poches dans la couture','Sideseam pocket'),('Passepoil simple dans la couture','Welt sideseam pocket'),('Passepoil double dans la couture','Besom sideseam pocket')],grid(5,1,.46,.99,.67,.95),1)
add('vestFront','vest','Fermeture et bas du gilet',11,[('Simple · 3 boutons · bas pointu','Peaked Hem Single-Breast 3 Buttons'),('Simple · 4 boutons · bas pointu','Peaked Hem Single-Breast 4 Buttons'),('Simple · 5 boutons · bas pointu','Peaked Hem Single-Breast 5 Buttons'),('Croisé · 6 boutons · bas pointu','Peaked Hem Double-Breast 6 Buttons (3x2)'),('Croisé · 6 boutons · bas droit','Straight Hem Double-Breast 6 Buttons (3x2)'),('Croisé · 8 boutons · bas droit','Straight Hem Double-Breast 8 Buttons (4x2)'),('Croisé · 4 boutons · bas en angle','Angled Peak Hem Double-Breast 4 Buttons (2x2)'),('Croisé asymétrique','Slanting Double-Breast'),('Encolure U · simple · 3 boutons','U-shaped Peak Hem Single-Breast 3 Buttons'),('Encolure U · simple · 5 boutons','U-shaped Peak Hem Single-Breast 5 Buttons'),('Encolure U · croisé · bas pointu','U-shaped Peak Hem Double-Breast 6 Buttons (3x2)'),('Encolure U · croisé · bas droit','U-shaped Flat Hem Double-Breast 6 Buttons (3x2)')],grid(6,2,.115,.925,.20,.95),2)
add('vestCollar','vest','Col et revers du gilet',12,[('Sans col','Classic Collarless'),('Revers crantés','Notched Lapel'),('Revers en pointe','Peak Lapel'),('Col châle','Shawl Collar'),('Châle effilé','Tapered Shawl'),('Châle arrondi moyen','Medium Round Shawl'),('Châle arrondi large','Large Round Shawl'),('Châle en angle','Angled Shawl'),('Châle carré','Square-cut Shawl')],grid(5,1,.04,.975,.185,.455)+grid(4,1,.13,.88,.58,.85))
add('vestPockets','vest','Poches du gilet',13,[('Bas · passepoil simple','Single Welt Lower Pocket'),('Bas · passepoil double','Besom Lower Pocket'),('Bas · passepoil simple incliné','Single Welt Slanted Lower Pocket'),('Bas · passepoil double incliné','Besom Slanted Lower Pocket'),('Bas · poches plaquées','Lower Patch Pocket'),('Bas · poches à rabat','Flat Flap Lower Pocket'),('Poitrine passepoil simple + bas double','Single Welt Chest + Besom Lower'),('Poitrine et bas passepoil double','Besom Chest + Besom Lower'),('Poitrine et bas passepoil simple','Single Welt Chest + Single Welt Lower'),('Poitrine passepoil simple + bas plaqué','Single Welt Chest + Lower Patch'),('Poitrine et bas plaqués','Chest Patch + Lower Patch'),('Sans poche','No Pocket')],grid(6,2,.02,.97,.20,.86))
add('vestBack','vest','Tissu du dos du gilet',14,[('Tissu extérieur','Outer Fabric'),('Doublure','Lining Fabric (Regular)')],grid(2,1,.06,.57,.31,.91),1)
add('vestBelt','vest','Patte au dos du gilet',14,[('Avec patte','With Belt'),('Sans patte','Without Belt')],grid(2,1,.62,.97,.31,.91))

for page in range(1,15):
    im=Image.open(PAGES/('repaired12.png' if page==12 else f'page-{page:02d}.png')).convert('RGB')
    im.save(OUT/f'page-{page:02d}.webp','WEBP',quality=88)
data={'source':{'name':'TAELSON — Trois pièces','pages':14},'groups':groups}
(ROOT/'dist/catalog-data.js').write_text('export const CATALOG = '+json.dumps(data,ensure_ascii=False,indent=2)+';\n')
print(json.dumps({'groups':len(groups),'choices':sum(len(g['options']) for g in groups),'thumbnails':sum('image' in o for g in groups for o in g['options'])}))
