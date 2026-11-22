#!/usr/bin/env python3
"""Standardise the option illustrations in dist/assets/studio.

Every file ends up as a 480 x 480 WebP with one studio backdrop tone and one navy, so the cards of
different option groups read as a single series:

  1. canvas    letterboxed 480 x 320 plates lose their flat bands and are extended to a square with
               the plate's own plain cloth;
  2. backdrop  when the cream backdrop reaches the border, the picture is white-balanced so that the
               backdrop lands on BACKDROP (a global gain: the garment keeps its modelling);
  3. navy      the dark blue cloth is brought towards NAVY with a bounded gain limited to the
               shadows, so shirts, threads and backdrops are untouched.

Each standardised file is recorded with its hash in scripts/option-assets.json and never touched
again (re-encoding a lossy picture twice would only degrade it), so the script can be run again after
adding or replacing illustrations: only those are processed. --check lists them without writing.
Usage: python3 scripts/standardize-option-assets.py [--check]
"""
import glob, hashlib, json, os, re, sys
import numpy as np
from PIL import Image

SIZE = 480
BACKDROP = np.array([246.0, 239.0, 227.0])
NAVY = np.array([32.0, 36.0, 49.0])
TOLERANCE = 0.025          # relative backdrop gain below which a picture counts as conforming
NAVY_TOLERANCE = 0.10      # the same for the cloth (per channel, on values around 30 to 50)
NO_NAVY = ('catalogButtons',)  # button swatches come in every colour: only their backdrop is aligned
MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'option-assets.json')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'assets', 'studio')


def luminance(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def backdrop_mask(a):
    """Light, low-saturation, slightly warm pixels: the studio backdrop, not the neutral white shirt."""
    spread = a.max(2) - a.min(2)
    return (luminance(a) > 165) & (spread < 50) & (a[..., 0] - a[..., 2] > 5)


def navy_mask(a):
    return (luminance(a) < 75) & (a[..., 2] > a[..., 0] + 6)


def square(a):
    """Extend a letterboxed plate to a square using its own plain cloth, mirrored outwards."""
    h, w = a.shape[:2]
    if (w, h) == (SIZE, SIZE):
        return a, False
    flat = np.where(a.std(axis=1).max(axis=1) < 1.5)[0]          # rows of a single flat colour
    rows = [y for y in range(h) if y not in set(flat.tolist())]
    body = a[rows[0] + 4:rows[-1] - 7]                             # drop the shaded edges next to the bands
    motif = np.where((body[..., 0] > 120).any(axis=1))[0]          # rows crossed by the light thread
    top = body[:max(8, motif[0] - 18)] if len(motif) else body[:40]   # clear of the thread and its shadow
    bottom = body[min(len(body) - 8, motif[-1] + 18):] if len(motif) else body[-40:]
    need = SIZE - len(body)
    above, below = need // 2, need - need // 2

    def ping_pong(strip, count, upwards):
        out, k, forward = [], 0, True
        strip = strip[::-1] if upwards else strip
        # start by mirroring the rows next to the picture so the join is continuous
        order = list(range(len(strip)))
        order = order[::-1] if not upwards else order
        seq = []
        while len(seq) < count:
            seq += order[::-1] if forward else order
            forward = not forward
        picked = [strip[::-1][i] if upwards else strip[i] for i in seq[:count]]
        block = np.stack(picked)
        return block[::-1] if upwards else block

    return np.concatenate([ping_pong(top, above, True), body, ping_pong(bottom, below, False)]), True


def standardise(path, check=False):
    name = os.path.basename(path)[:-5]
    family = re.sub(r'-\d+$', '', name)
    image = Image.open(path).convert('RGB')
    a = np.asarray(image).astype(np.float64)
    notes = []

    a, resized = square(a)
    if resized:
        notes.append('carré')
    if a.shape[:2] != (SIZE, SIZE):
        a = np.asarray(Image.fromarray(a.astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float64)
        notes.append('redimensionné')

    # backdrop: only when it actually frames the picture
    mask = backdrop_mask(a)
    frame = np.ones(mask.shape, bool)
    frame[16:-16, 16:-16] = False
    if mask[frame].mean() > 0.10 and mask.sum() > 2000:
        gain = np.clip(BACKDROP / np.median(a[mask], axis=0), 0.88, 1.14)
        if np.abs(gain - 1).max() > TOLERANCE:
            a = np.clip(a * gain, 0, 255)
            notes.append('fond %+d %%' % round((gain.mean() - 1) * 100))

    # navy cloth, in the shadows only
    if family not in NO_NAVY:
        # the set of dark blue pixels moves a little as they are corrected: repeat until it settles,
        # and only start when the cloth is clearly off, so a second run finds nothing to do
        for step in range(6):
            mask = navy_mask(a)
            if mask.mean() <= 0.08:
                break
            median = np.maximum(np.median(a[mask], axis=0), 1)
            # mostly a change of depth, with a small change of hue: a free gain per channel would
            # tint the embroidery threads and bring out noise in the red of very blue cloths
            depth = np.clip(luminance(NAVY) / luminance(median), 0.85, 1.2)
            gain = np.clip(NAVY / median, depth * 0.93, depth * 1.07)
            if np.abs(gain - 1).max() <= (NAVY_TOLERANCE if step == 0 else 0.01) or step == 3:
                break
            t = np.clip((120 - luminance(a)) / 50, 0, 1)
            weight = (t * t * (3 - 2 * t))[..., None]
            a = np.clip(a * (1 + (gain - 1) * weight), 0, 255)
            if step == 0:
                notes.append('marine')

    if notes and not check:
        Image.fromarray(np.round(a).astype(np.uint8)).save(path, 'WEBP', quality=84, method=6)
    return name, notes


def digest(path):
    with open(path, 'rb') as handle:
        return hashlib.sha1(handle.read()).hexdigest()


def main():
    check = '--check' in sys.argv
    done = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    pending = 0
    for path in sorted(glob.glob(os.path.join(ROOT, '*.webp'))):
        key = os.path.basename(path)
        if done.get(key) == digest(path):
            continue
        pending += 1
        name, notes = standardise(path, check)
        print('%-26s %s' % (name, ', '.join(notes) or 'déjà conforme'))
        if not check:
            done[key] = digest(path)
    if not check:
        present = {os.path.basename(p) for p in glob.glob(os.path.join(ROOT, '*.webp'))}
        with open(MANIFEST, 'w') as handle:
            json.dump({k: done[k] for k in sorted(done) if k in present}, handle, indent=1)
            handle.write('\n')
    print('%d image(s) %s' % (pending, 'à normaliser' if check else 'traitée(s)'))
    return 1 if check and pending else 0


if __name__ == '__main__':
    sys.exit(main())
