# QUOIN — Diwali pre-launch teaser

20.000 s · 1080×1920 (9:16) · 30 fps · H.264 yuv420p · AAC 48 kHz stereo · −14.1 LUFS

`quoin_diwali_teaser.mp4` is the deliverable. Everything in this folder
regenerates it from scratch; there is no binary project file and no
timeline app in the loop.

## How it was made

No stock footage and no AI video/image/audio generation was used — both
generation backends available in the session were out of credit. The film
is therefore **rendered procedurally**: every scene is a GLSL fragment
shader drawn into a WebGL2 canvas by headless Chromium, with typography
and the logo composited over it as live DOM/SVG, then encoded with ffmpeg.

That turned out to be the right constraint. It means the logo is true
vector geometry (never resampled), the type is pixel-crisp and
spell-checked, the timings land on exact frames, and the whole thing is
re-renderable after any edit.

## Files

    film/index.html     stage, type styles, the QUOIN lockup as inline SVG
    film/film.js        the director: cut list, per-scene state, post chain
    film/shaders.js     GLSL for all five scenes + bloom/grade/grain
    film/structure.js   the Scene 3 wireframe model and its projection
    film/overlay.js     typography timeline and the mask-driven logo reveal
    film/engine.js      WebGL2 helper: FBOs, passes, uniform arrays
    render.js           renders 600 PNG frames (render_resume.js resumes)
    score.py            the score and sound design, synthesised in numpy
    build.sh            ffmpeg: loudness, encode, scene cuts, poster

## Re-rendering

    python3 score.py                 # -> audio/score.wav
    node render.js                   # -> frames/f00000.png … f00599.png
    bash build.sh                    # -> out/quoin_diwali_teaser.mp4

To preview single moments without a full render:

    node preview.js 13.5,15.2 /tmp/x

## Where the timing lives

`film/film.js` holds the cut list (`SCENES`); `film/overlay.js` holds every
text in/out time. The bass drop in `score.py` is pinned to **13.45 s**,
which is the frame the light sweep crosses the centre of the mark — if you
move the reveal, move that constant with it.

## Colour

Taken from the app's own tokens in `src/app/globals.css`, not invented:
espresso `#2a160a`, burnt sienna `#a85a2a`, terracotta `#d95d24` (the mark,
exactly as `public/icon.svg` draws it), cream `#f5ede1`. Type is Fraunces
(display) and IBM Plex Sans — the two faces `src/app/layout.tsx` loads.

Gold (`--quoin-pro #b08b45`) is deliberately absent: globals.css reserves it
for Quoin Pro "and nothing else, ever". The warm amber in the film is
firelight, not a brand colour.
