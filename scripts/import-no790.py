"""Build the NO790 catalogue and web images from the supplier's original ZIP."""
import colorsys
import hashlib
import io
import json
from pathlib import Path
import re
import sys
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageOps

dist = Path(__file__).resolve().parents[1] / 'dist'
assets = dist / 'assets' / 'supplier'
records = []

def colour(rgb):
    hue, saturation, value = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    if saturation < .14:
        if value > .8:
            return 'Écru', 'Blancs'
        if value < .14:
            return 'Noir', 'Noirs'
        return ('Anthracite' if value < .3 else 'Gris'), 'Gris'
    if .53 < hue < .73:
        return ('Bleu marine' if value < .36 else 'Bleu'), 'Bleus'
    if .73 <= hue < .88:
        return 'Violet', 'Violets'
    if .88 <= hue or hue < .035:
        return 'Bordeaux', 'Rouges'
    if hue < .15:
        return 'Brun', 'Bruns'
    return 'Vert', 'Verts'

with ZipFile(sys.argv[1]) as archive:
    for path in sorted(archive.namelist()):
        ref = Path(path).stem
        if not re.fullmatch(r'790\d{4}', ref) or Path(path).suffix.lower() not in ('.jpg','.jpeg'):
            continue
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(archive.read(path)))).convert('RGB')
        w,h = im.size
        # The maker's gold reference is in the centre. Use the uninterrupted upper panel.
        cloth = im.crop((int(.08*w),int(.08*h),int(.92*w),int(.34*h)))
        tile = ImageOps.fit(cloth,(384,160),method=Image.Resampling.LANCZOS)
        tile.save(assets / (ref+'-weave.webp'),quality=95)
        preview = assets / (ref+'.jpg')
        im.thumbnail((720,900))
        im.save(preview,quality=87,optimize=True)
        pixels = np.asarray(tile).reshape(-1,3)
        base = np.median(pixels,axis=0).astype(int).tolist()
        name,family = colour(base)
        records.append(dict(id=ref,reference=ref,supplier='Drwoven',collection='NO790',colorName=name,colorFamily=family,
            pattern='pinstripe',patternLabel='Rayures',compositionCode='Non renseignée',weightValue=None,weightUnit=None,
            image='./assets/supplier/'+ref+'.jpg',baseRGB=base,stripeRGB=np.percentile(pixels,92,axis=0).astype(int).tolist(),
            scaleMillimeters=None,price=None,availability=None,previewOnly=True,imageSha256=hashlib.sha256(preview.read_bytes()).hexdigest()))
if not records or len({f['id'] for f in records}) != len(records):
    raise ValueError('Missing or duplicate NO790 references')
(dist/'no790.js').write_text('export const NO790 = '+json.dumps(records,ensure_ascii=False,indent=2)+';\n')
print(f'{len(records)} references imported')
