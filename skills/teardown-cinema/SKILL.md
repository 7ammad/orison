---
name: teardown-cinema
description: The panel-free version of teardown. Turn one complex GPT Image concept into a real 3D film and an interactive 3D website, with no HUD, labels, charts or explanatory text anywhere. Use when someone wants to bring an image to life, make a cinematic 3D clip or short movie from code, a "living" picture, a 3D film with no text, a 3D hero or scroll experience built from an image, or says the teardown output has too much text on it. Use teardown instead when the point is explaining how a machine works.
---

# Teardown Cinema

Same engine as `teardown` (three.js code, one clock, frame-by-frame capture, code-made score), opposite purpose. Teardown explains, so it has panels. Cinema shows, so it has nothing on screen except the world. Working example, every file: `example/orison` in this skill (the 30-second film *Orison* and its interactive page).

Needs the `teardown` skill beside this one for `node_modules` (three, esbuild, playwright), `sims/capture.mjs` and `sfx/`. Capture does not need Playwright's own Chromium: set `CHROMIUM` to the installed Chrome. If that download stalls, Chrome works.

## The method, in order

1. **One master image.** Generate a complex picture with any strong image model. With the Codex app: `codex exec --skip-git-repo-check -s workspace-write -C <dir> - < prompt.txt`. The prompt leaves your machine, so keep confidential content out of it. Ask for something with structure you can name: a dome, ribs, rings, ribbons. Codex does not report which image model it used.
2. **Texture plates from the master.** Attach it with `-i master.png` and generate flat, front-on, evenly lit plates: glass panel, metal tracery on pure black, silk, a planet on black, a ring cross-section, a creature from above. Black is what you cut away. These plates are why the result keeps the painting's detail. Generate one at a time.
3. **Measure the master, then rebuild it.** Read proportions off the image in pixels and turn them into world units before writing geometry. Nearly every early mistake here was a proportion nobody measured.
4. **One input drives the body.** Pick the creature's or machine's beat, write it in JS and GLSL, and pose every part from it in the vertex shader. Nothing is keyframed. See `shared/kin.js`, `shared/glsl.js`.
5. **Shots, not a fly-through.** A list of shots, each a pure function of time inside it, with hard cuts and a grade per shot. Cuts are what make it a film. See `orison-film/shots.js`.
6. **Compare with the master every pass.** Render the hero frame beside the image and write down what differs. Fix, repeat.
7. **Score in code on the same timeline** with teardown's `sfx/`. See `score.py`.
8. **The page is the same world with a different hand on the camera.** Scroll picks a point on one path, a click is a beat, a drag looks around. See `orison-live/`.

## Layout

```
my-film/
  brief/            master image and prompts
  assets/           plates, as .jpg (inlined into the page)
  shared/           the world: kin.js, glsl.js, sky.js, creature.js, world.js
  my-film-film/     main.js, shots.js, timeline.json
  my-film-live/     main.js, path.js, audio.js, body.html, style.css
  score.py
```

## Commands

Run from the film's folder. `SKILL_DIR` is this skill, `T` is the sibling `teardown` skill. In Windows PowerShell 5.1 use `npx.cmd` and `npm.cmd` and no `&&`.

```
node "$SKILL_DIR/build.mjs" ./my-film-film ./my-film-live
export CHROMIUM="C:/Program Files/Google/Chrome/Application/chrome.exe"    # capture can use the installed Chrome

# one frame, or a sheet, at a chosen quality: --config points at {"samples": N}
node "$T/sims/capture.mjs" my-film-film --size 1920x1080 --dpr 1 --config s.json --still 12.5 --out frame.png
node "$T/sims/capture.mjs" my-film-film --size 1920x1080 --dpr 1 --config s.json --stills 3,8,12,18,23,29 --cols 3 --out sheet.png

# the whole film
node "$T/sims/capture.mjs" my-film-film --size 1920x1080 --dpr 1 --fps 24 --crf 15 --config s.json --out silent.mp4
python "$T/run_sfx.py" score.py
ffmpeg -i silent.mp4 -i teardown-out/my-score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart film.mp4
```

`--stills` tiles through a palette, so sheets show false banding. Judge colour and banding on the full frames beside them.

## What `kit/cinema.js` gives you

`new Cinema({canvas, samples, fps, shutter, msaa})`, then `cine.frame(t, draw, look)`.

A film frame is the average of N sub-frames. Each sub-frame moves the time inside the shutter (true motion blur), the camera on the lens disc with the focus plane held (true depth of field, through transparent layers too), and a sub-pixel offset (anti-aliasing). Dithered ray marching converges with it. Post runs once on the averaged HDR image: bloom, anamorphic streak, light shafts toward a point, ACES, grade, grain, vignette. `samples: 1` is the same pipeline for live pages.

Numbers from a laptop with an integrated Radeon 780M, at 1920x1080: 32 samples per frame took 2.3 seconds a frame including the encode: 27 minutes for 30 seconds of film at 24 fps. A draft at 960x480 and 4 samples took 41 seconds for the whole film, so use drafts freely. The live page ran 37 to 51 fps across its whole scroll at 1600x900, and higher in spot readings with nothing else running. Check `gpu:` in capture's output; a software renderer means the GPU flags did not take.

## Rules that decided whether it worked

- **No text in the frame. No labels, numbers, title cards or captions.** The picture carries it.
- **Bundle exactly one three.js.** `build.mjs` forces it. A second copy near the film (a project's own `node_modules`) fails quietly: the reflection environment loses its blur levels and metal goes dark.
- **Lay the render beside the master at the same size and list what differs.** Proportions first, then colour. Measure positions in pixels and convert them to directions. Most of the likeness on *Orison* came from those passes.
- **Keep depth of field shallow only for small things.** Heavy blur on a giant makes it read as a miniature. The film's lens radii are 0.012 to 0.03 units on a 26-unit creature.
- **Time and lens samples must not share a sequence.** If they do, blur traces visible arcs. Golden-angle for the lens, Halton base 5 for time.
- **Never `pow()` a value that can go negative.** D3D returns NaN, and one NaN pixel spreads through bloom as black rectangles. Write `x*x`. `max(1.-ndv,0.)`, not `1.-ndv`. The kit also sanitises its inputs.
- **Reversed `smoothstep(a, b, x)` with `a > b` returns 0 on Windows.** Write `1.-smoothstep(b,a,x)`.
- **Mirrored plates on a narrowing surface:** map with Mercator so cells stay round, and mirror only the plate's large cells. The fine ones turn to confetti up close.
- **Panels in line with the light must be clearer, not brighter.** Otherwise the thing inside a glass body never reads.
- **A dark opening needs something alive in it.** A dim glow through fog carries it until the first beat.
- **Live clouds:** half resolution with a running average; march denser near the camera. Clouds are soft, so nothing is lost.
- **The first second of a live page is shader compilation.** Compile before the first frame and show one small pulse meanwhile, no loading text.

## Live page rules

Everything from teardown's live rules applies (quality tiers, warm the shaders). Also: open on the master image and dissolve into the 3D once the shaders are ready; tiers go back up when frames recover, not only down; no labels on the page; an accessible name on the canvas and on any button; a click target of at least 44 px; sound starts only after the first gesture; the body settles after a beat instead of climbing forever; quality steps down by measured frame rate without asking.

## Review

You cannot watch video, but you can read frames. Sheet of every shot first, full frames for what the sheet flags, then `--stills every:0.2 --from A --to B` across a transition. Read a one-frame-per-second sheet of the final encode: that shows what the encoder wrote. Measure the score with `ffmpeg -af ebur128=peak=true`. A person still has to watch the film and hear the score once; say so when reporting.

For a host that adds its own document skeleton, such as a Claude Artifact, build with `FRAGMENT=1` and set the name with `PAGE_TITLE`: it also writes `<name>.fragment.html`.
