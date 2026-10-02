// Design reveal: the one-time Horde-theme popup, the burn transition (fire
// canvas), and the Admin theme switcher in User Settings.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

document.querySelectorAll('#settingsDesignRow .design-switcher-option').forEach((/** @type {HTMLElement} */ btn) => {
  btn.addEventListener('click', () => setDesignTheme(btn.dataset.designTheme));
});
const designRevealRetestBtn = document.getElementById('designRevealRetestBtn');
if (designRevealRetestBtn){
  designRevealRetestBtn.addEventListener('click', () => {
    els.characterModal.classList.add('hidden'); // out of the way so the reveal popup isn't hidden behind it
    retestDesignReveal();
  });
}

// ---------------------------------------------------------------------
// Design reveal — one-time "unlock the new (dark Horde) design" popup +
// burn transition, plus a manual switcher in User Settings to flip back
// and forth afterward. The CSS side (html.theme-horde's palette, the
// modal/overlay's own look, the wipe/ember keyframes, the switcher's
// segmented-control look) lives near :root and near .design-reveal-modal
// /.design-burn-overlay/.design-switcher in css/main.css; this is
// the show/hide timing, the two localStorage keys, spawning the ember
// particles along the burn line as it moves, and the switcher's click
// handling.
//
// Two separate localStorage flags, deliberately not one:
//  - DESIGN_REVEAL_KEY: "has this browser ever unlocked/seen the new
//    design" — purely gates whether the one-time popup nags again. Once
//    set, it's never cleared by switching themes back to classic.
//  - DESIGN_THEME_KEY: "which theme is active right now" ('horde' or
//    'classic') — what the no-flash <script> at the very top of <head>
//    reads to decide whether to add .theme-horde before first paint, and
//    what setDesignTheme() below flips when the User Settings switcher
//    is used. Switching back to classic there does NOT re-arm the popup.
//
// Rolled out to everyone as of 2026-10-01 — initDesignReveal() no longer
// checks currentRole, so every visitor gets the one-time popup the first
// time they open the page (still per-browser, via DESIGN_REVEAL_KEY).
// The manual theme SWITCHER in User Settings stays Admin-only on
// purpose though (see applyAccessControl()'s designRow toggle) — Members
// and Officers get the new design via the popup and that's it, no
// ongoing back-and-forth switcher for them; only an Admin can still
// flip back to Classic to compare, or re-trigger the popup to demo it.
//
// initDesignReveal() is called from renderAll() (so it re-checks once
// currentRole actually resolves after login) as well as once eagerly
// from bootstrap() — designRevealChecked makes repeat calls a cheap
// no-op once it has either shown the popup or confirmed there's nothing
// to show. Independent of Firebase/Discord being configured at all —
// safe to run even on the setup-only screens, though of course
// currentRole can only ever resolve to 'admin' once login works.
// ---------------------------------------------------------------------
const DESIGN_REVEAL_KEY = 'guild-loot-design-revealed';
const DESIGN_THEME_KEY = 'guild-loot-design-theme';
const DESIGN_BURN_DURATION_MS = 2400;
let designRevealChecked = false;
let designRevealModalWired = false;

// Attaches the popup's own click handling exactly once, ever — separate
// from initDesignReveal()'s "should this auto-show right now" decision
// below, so the admin "Popup + Burn erneut testen" button in User
// Settings (see retestDesignReveal()) can pop the same modal open on
// demand, as many times as wanted, without stacking up duplicate click
// listeners on okBtn (which would fire the burn N times at once).
function wireDesignRevealModal(){
  if (designRevealModalWired) return;
  const modal = document.getElementById('designRevealModal');
  const okBtn = document.getElementById('designRevealOkBtn');
  if (!modal || !okBtn) return; // markup missing for some reason — fail quiet
  designRevealModalWired = true;

  okBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    startDesignBurn();
  });
  // Clicking the dark backdrop (not the card itself) just closes the
  // prompt without unlocking anything — on a first-time auto-show it'll
  // ask again next visit, same as never having clicked "Okay" at all; on
  // an admin test-trigger it just closes it, nothing to undo.
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

function initDesignReveal(){
  wireDesignRevealModal();
  if (designRevealChecked) return;
  const modal = document.getElementById('designRevealModal');
  if (!modal) return;

  let alreadyRevealed = false;
  try{ alreadyRevealed = localStorage.getItem(DESIGN_REVEAL_KEY) === '1'; }catch(e){}
  if (alreadyRevealed){ designRevealChecked = true; return; } // nothing to prompt — already unlocked

  designRevealChecked = true;
  modal.classList.remove('hidden');
}

// Admin-only "run it again" button in User Settings (#designRevealRetestBtn,
// wired below alongside the theme switcher) — pops the exact same modal
// open on demand, regardless of whether it's already been unlocked, so
// an admin can watch the popup → burn → Horde-reveal sequence as many
// times as they want while deciding if they like it. Doesn't touch
// either localStorage key — it's just a replay, not a re-unlock (though
// clicking "Okay" on it does re-set them, same as any other Okay click,
// which is harmless since they'd already be set to the same values).
function retestDesignReveal(){
  wireDesignRevealModal();
  const modal = document.getElementById('designRevealModal');
  if (modal) modal.classList.remove('hidden');
}

// Builds the 37-step black → red → orange → yellow → white (→ faint
// blue at the very tip, echoing the hottest part of a real flame)
// intensity ramp used by the fire canvas below. Index 0 is fully
// transparent so "cold" pixels vanish instead of painting flat black
// squares; low-mid indices carry partial alpha too, which is what
// gives the rising edge of the fire its smoky, dissipating look rather
// than a hard silhouette.
function buildFirePalette(){
  const lerp = (a, b, t) => a + (b - a) * t;
  const palette = [];
  for (let i = 0; i <= 36; i++){
    const t = i / 36;
    let r, g, b, a;
    if (i === 0){ r = 12; g = 7; b = 8; a = 0; }
    else if (t < 0.22){ const k = t / 0.22; r = lerp(24,110,k); g = lerp(10,22,k); b = lerp(10,15,k); a = lerp(30,150,k); }
    else if (t < 0.46){ const k = (t - 0.22) / 0.24; r = lerp(110,221,k); g = lerp(22,80,k); b = lerp(15,28,k); a = lerp(150,225,k); }
    else if (t < 0.68){ const k = (t - 0.46) / 0.22; r = lerp(221,255,k); g = lerp(80,168,k); b = lerp(28,64,k); a = lerp(225,250,k); }
    else if (t < 0.88){ const k = (t - 0.68) / 0.20; r = 255; g = lerp(168,244,k); b = lerp(64,196,k); a = 255; }
    else { const k = (t - 0.88) / 0.12; r = lerp(255,218,k); g = lerp(244,236,k); b = lerp(196,255,k); a = 255; }
    palette.push([r | 0, g | 0, b | 0, a | 0]);
  }
  return palette;
}
let __firePalette = null;

// Drives the actual "sea of flames" — a tiny (W×H internal pixels)
// fire simulation, the classic technique behind old demoscene/DOOM-
// style campfire effects: the bottom row is reseeded with randomized
// high intensity every frame (the "fuel"), and every pixel above
// inherits a nearby-below pixel's intensity minus a small random decay,
// which makes heat appear to rise, flicker and drift sideways on its
// own without any hand-authored shapes or keyframes at all — the
// turbulence is emergent, which is why it looks like real fire instead
// of a row of icons. Rendered at low internal resolution and then
// scaled up to full width via the canvas's own (smoothed) CSS sizing,
// which turns the blocky simulation into soft, organic-looking tongues.
// Returns {stop} so the caller can tear down the rAF loop and remove
// the canvas once the burn finishes.
function startFireCanvas(container, edgeEl, burnStart, durationMs){
  const W = 160, H = 92;
  const canvas = document.createElement('canvas');
  canvas.className = 'design-burn-fire-canvas';
  canvas.width = W;
  canvas.height = H;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx){ canvas.remove(); return { stop(){} }; }

  if (!__firePalette) __firePalette = buildFirePalette();
  const palette = __firePalette;
  const fire = new Uint8ClampedArray(W * H);
  const imgData = ctx.createImageData(W, H);

  function reseedBase(){
    for (let x = 0; x < W; x++){
      fire[(H - 1) * W + x] = Math.random() < 0.72 ? 36 : 24 + Math.floor(Math.random() * 11);
    }
  }
  reseedBase();

  function step(){
    // Walking y from 1 upward and writing to row (y-1) while reading
    // row y is what lets this run as a single forward pass with no
    // second buffer: row y is only ever read as a *source* before it
    // later becomes a *destination* once y increments past it.
    for (let y = 1; y < H; y++){
      const rowOffset = y * W;
      for (let x = 0; x < W; x++){
        const decay = (Math.random() * 2.6) | 0;
        const spread = ((Math.random() * 3) | 0) - 1;
        const srcX = x + spread < 0 ? 0 : (x + spread >= W ? W - 1 : x + spread);
        const srcVal = fire[rowOffset + srcX];
        const dstIdx = (y - 1) * W + x;
        fire[dstIdx] = srcVal > decay ? srcVal - decay : 0;
      }
    }
    reseedBase();
  }

  function render(){
    const data = imgData.data;
    for (let i = 0; i < W * H; i++){
      const c = palette[fire[i]];
      const o = i * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3];
    }
    ctx.putImageData(imgData, 0, 0);
  }

  let rafId = null;
  let stopped = false;
  function frame(){
    if (stopped) return;
    // Track the ACTUAL on-screen position of .design-burn-edge rather
    // than recomputing progress from elapsed time independently — the
    // edge's own CSS animation runs on a cubic-bezier easing curve, not
    // linear time, so a separately time-based calculation here would
    // drift out of sync with it (the fire band visibly detached from
    // the glowing edge line). Reading its live rect guarantees the two
    // always line up, however the easing is tuned later.
    if (edgeEl){
      const edgeRect = edgeEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      canvas.style.top = (edgeRect.top + edgeRect.height / 2 - containerRect.top) + 'px';
    } else {
      const progress = Math.min(1, (performance.now() - burnStart) / durationMs);
      canvas.style.top = (progress * 100) + '%';
    }
    step();
    render();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  return {
    stop(){
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.remove();
    }
  };
}

function startDesignBurn(){
  const overlay = document.getElementById('designBurnOverlay');
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const markUnlocked = () => {
    try{
      localStorage.setItem(DESIGN_REVEAL_KEY, '1');
      localStorage.setItem(DESIGN_THEME_KEY, 'horde');
    }catch(e){}
    updateDesignSwitcherUI();
  };

  if (!overlay){
    // No overlay markup somehow — still honor the unlock, just instantly.
    document.documentElement.classList.add('theme-horde');
    markUnlocked();
    return;
  }

  // The new theme goes on right away, hidden under the still-opaque
  // overlay — by the time the burn wipe has eaten through, the page
  // underneath is already the one it reveals.
  document.documentElement.classList.add('theme-horde');
  overlay.classList.add('burning');

  let emberInterval = null;
  let fireCanvas = null;
  if (!reduceMotion){
    const emberLayer = overlay.querySelector('.design-burn-embers');
    const start = performance.now();
    emberInterval = setInterval(() => {
      if (!emberLayer) return;
      const progress = Math.min(1, (performance.now() - start) / DESIGN_BURN_DURATION_MS);
      // A couple of embers per tick, scattered along the current burn
      // line — matches .design-burn-edge's own top:X% position.
      for (let i = 0; i < 2; i++){
        const ember = document.createElement('div');
        ember.className = 'design-burn-ember';
        ember.style.left = (Math.random() * 100) + '%';
        ember.style.top = (progress * 100) + '%';
        ember.addEventListener('animationend', () => ember.remove());
        emberLayer.appendChild(ember);
      }
    }, 70);

    // The flame wall itself — a real per-pixel fire simulation running
    // on a <canvas>, not discrete DOM shapes (see the long comment on
    // .design-burn-flames in the CSS for why — a finite number of
    // independently-animated flame divs always read as "icons", never
    // as actual fire). startFireCanvas() owns its own render loop and
    // tracks the edge element's live position every frame (see its own
    // comment for why not time-based); it returns a stop() function we
    // call during cleanup below.
    const flameLayer = overlay.querySelector('.design-burn-flames');
    const edgeEl = overlay.querySelector('.design-burn-edge');
    fireCanvas = flameLayer ? startFireCanvas(flameLayer, edgeEl, start, DESIGN_BURN_DURATION_MS) : null;

    // Slow, heavily-blurred smoke puffs drifting up off the flame line
    // — see .design-burn-smoke-puff for why this is what separates
    // "wildfire" from a clean fireplace flame.
    const smokeLayer = overlay.querySelector('.design-burn-smoke');
    let smokeInterval = null;
    smokeInterval = setInterval(() => {
      if (!smokeLayer) return;
      const progress = Math.min(1, (performance.now() - start) / DESIGN_BURN_DURATION_MS);
      const topPct = progress * 100;
      const puff = document.createElement('div');
      puff.className = 'design-burn-smoke-puff';
      const sizePx = 60 + Math.random() * 90;
      puff.style.left = (Math.random() * 100) + '%';
      puff.style.top = topPct + '%';
      puff.style.width = sizePx + 'px';
      puff.style.height = sizePx + 'px';
      puff.style.marginLeft = (-sizePx / 2) + 'px';
      puff.style.marginTop = (-sizePx / 2) + 'px';
      puff.style.filter = 'blur(' + (6 + Math.random() * 5) + 'px)';
      puff.addEventListener('animationend', () => puff.remove());
      smokeLayer.appendChild(puff);
    }, 220);
    // Stashed on the overlay element itself (rather than a third
    // top-level `let`) purely so the cleanup block below has one place
    // to look regardless of which branch created it.
    /** @type {any} */ (overlay).__designBurnSmokeInterval = smokeInterval;
  }

  setTimeout(() => {
    if (emberInterval) clearInterval(emberInterval);
    if (fireCanvas) fireCanvas.stop();
    const smokeIntervalId = /** @type {any} */ (overlay).__designBurnSmokeInterval;
    if (smokeIntervalId) clearInterval(smokeIntervalId);
    overlay.classList.remove('burning');
    overlay.querySelectorAll('.design-burn-ember').forEach(el => el.remove());
    overlay.querySelectorAll('.design-burn-smoke-puff').forEach(el => el.remove());
    markUnlocked();
  }, reduceMotion ? 0 : DESIGN_BURN_DURATION_MS + 150);
}

// Manual switcher in User Settings (admin-only for now — see
// applyAccessControl()). Instant, no burn animation — that's reserved
// for the first-time reveal; this is a deliberate settings change, not a
// surprise. Also counts as "seen it" so the popup never nags someone who
// only ever used the switcher without going through the burn.
function setDesignTheme(theme){
  const horde = theme === 'horde';
  document.documentElement.classList.toggle('theme-horde', horde);
  try{
    localStorage.setItem(DESIGN_THEME_KEY, horde ? 'horde' : 'classic');
    localStorage.setItem(DESIGN_REVEAL_KEY, '1');
  }catch(e){}
  designRevealChecked = true;
  const modal = document.getElementById('designRevealModal');
  if (modal) modal.classList.add('hidden');
  updateDesignSwitcherUI();
}

function updateDesignSwitcherUI(){
  const row = document.getElementById('settingsDesignRow');
  if (!row) return;
  const horde = document.documentElement.classList.contains('theme-horde');
  row.querySelectorAll('.design-switcher-option').forEach((/** @type {HTMLElement} */ btn) => {
    btn.classList.toggle('active', btn.dataset.designTheme === (horde ? 'horde' : 'classic'));
  });
}
