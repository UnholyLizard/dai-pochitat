import * as THREE from 'three';
import { Book, W, CT } from './book.js';
import { PopLayer, PinLayer } from './popup.js';
import { SPREADS } from './spreads.js';
import { loadArt, loadImage, setAnisotropy } from './art.js';
import { ensureFonts, pageTexture, repaintPage, coverTextures, repaintCovers, edgeTexture, contactShadowTexture, glowTexture, thoughtTexture } from './paper.js';
import { Dust, Burst } from './particles.js';
import { artUrl, viewport } from '../lib/core.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (v) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
const backOut = (v) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * (v - 1) ** 3 + c1 * (v - 1) ** 2; };
const LAST = SPREADS.length - 1; // 6: last content spread; past it the book closes onto the back cover
// Clicks that only play something inside the scene (no page turn, no critter).
const VISUAL = new Set(['float', 'wave', 'spin', 'seesaw', 'think']);
const THOUGHTS = ['thought.hmm', 'thought.interesting', 'thought.haha', 'thought.wow'];
const SWING = 0.14; // how far the sun and the cloud drift

/**
 * Pop-up for one layer on spread j, given the book position B.
 * Incoming layers stand up after the page has landed; outgoing ones fold before it lifts.
 */
function riseFor(B, j, delay = 0) {
  const d = B - j;
  if (d <= -1 || d >= 1) return 0;
  if (d <= 0) return backOut(clamp01((1 + d - 0.6 - delay * 0.6) / 0.28));
  return 1 - clamp01((d - delay * 0.15) / 0.35);
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {() => number} o.getTarget   scroll-derived book position 0…6
 * @param {() => {x:number,y:number,w:number,h:number}} o.getArea  where on screen the book should sit
 * @param {(key: string) => string} o.t
 * @param {(a: object) => void} o.onAction
 */
export async function createStage({ canvas, getTarget, getArea, getZoomArea, t, onAction, onBookRect, reducedMotion, night: startNight, isFound, isAllFound = () => false, candidate: startCandidate }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  const small = () => viewport().w < 860;

  // ── Light: afternoon sun through the window; a reading lamp at night ──
  const hemi = new THREE.HemisphereLight(0xfff1d6, 0xb48a5a, 1);
  const sun = new THREE.DirectionalLight(0xffe2b4, 2.3);
  sun.position.set(-3.4, 6.2, 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(small() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 2, far: 16 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 4;
  sun.shadow.camera.updateProjectionMatrix();
  const lamp = new THREE.SpotLight(0xffc888, 0, 16, 0.72, 0.65, 1.4);
  lamp.position.set(-2.2, 4.6, 2.6);
  lamp.target.position.set(0.4, 0.2, -0.2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.setScalar(1024);
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.025;
  scene.add(hemi, sun, lamp, lamp.target);

  // ── Ground: invisible shadow catcher + soft contact shadow ──
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(14, 10).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: 0x4a2a10, opacity: 0.2 }));
  catcher.position.y = -CT - 0.003;
  catcher.receiveShadow = true;
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  contact.position.y = -CT - 0.002;
  scene.add(catcher, contact);

  // ── The book ──
  await ensureFonts();
  const [house, olive, cypress] = await Promise.all(['house', 'olive', 'cypress'].map((id) => loadImage(artUrl(id))));
  const plate = { house, olive, cypress };
  const covers = coverTextures({ ...plate, t });
  const book = new Book({ front: covers.front, back: covers.back, edge: edgeTexture() });
  scene.add(book.group);

  const blank = { L: pageTexture({ half: 'L' }), R: pageTexture({ half: 'R' }) };
  const spreads = SPREADS.map((def, j) => ({ def, j, pages: null, flipped: null, ground: null, layers: [], ready: false }));

  const pageOpts = (j, half) => ({
    ground: spreads[j].ground,
    half,
    folio: String(half === 'L' ? 2 * j - 1 : 2 * j),
    foot: half === 'L' ? t(`page.${spreads[j].def.key}`) : '',
  });

  async function loadSpread(j) {
    const sp = spreads[j];
    if (!sp.def || sp.loading) return sp.loading;
    sp.loading = (async () => {
      sp.ground = await loadImage(artUrl(sp.def.ground));
      sp.pages = { L: pageTexture(pageOpts(j, 'L')), R: pageTexture(pageOpts(j, 'R')) };
      // The left page also has to be readable from underneath while it turns.
      sp.flipped = sp.pages.L.clone();
      sp.flipped.repeat.x = -1;
      sp.flipped.offset.x = 1;
      // Fetch every cut-out first; a layer joins the scene only once the whole spread is
      // ready (and the frame loop has positioned it), so nothing flashes at the book's centre.
      const arts = await Promise.all(sp.def.layers.map((def) => (def.pin ? null : loadArt(def.art))));
      sp.def.layers.forEach((def, order) => {
        const layer = def.pin ? new PinLayer(def) : new PopLayer(def, arts[order], order);
        layer.order = order;
        layer.root.visible = false;
        if (def.critter && isFound(def.critter) && !isAllFound()) { layer.gone = true; layer.leaving = 1; }
        sp.layers.push(layer);
        book.group.add(layer.root);
      });
      sp.ready = true;
    })();
    return sp.loading;
  }

  // ── Atmosphere ──
  const glow = glowTexture();
  const dust = new Dust(small() ? 90 : 170, glow);
  scene.add(dust.points);
  const burst = new Burst();
  scene.add(burst.group);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc77a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  lampGlow.scale.setScalar(1.1);
  const lampBulb = new THREE.PointLight(0xffb866, 0, 3, 1.6);
  scene.add(lampGlow, lampBulb);

  // ── State ──
  let B = getTarget();
  let nightMix = startNight ? 1 : 0;
  let nightTarget = nightMix;
  const parallax = new THREE.Vector2();
  const parallaxTarget = new THREE.Vector2();
  const target = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  const clock = new THREE.Timer();
  let hovered = null;
  let debugB = null;
  let candidate = startCandidate;
  const pointer = { ndc: new THREE.Vector2(), inside: false, dirty: false };
  const raycaster = new THREE.Raycaster();
  const thoughts = [];

  // Canvas size in CSS px: the large viewport, so the address bar sliding never resizes it.
  const size = { w: 0, h: 0 };
  function resize() {
    const { w, large: h } = viewport();
    if (w === size.w && h === size.h) return;
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(Math.min(devicePixelRatio, small() ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    dust.uniforms.scale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
  resize();
  addEventListener('resize', resize);

  // ── Magnifier: the book fills the screen, drag to move, pinch / wheel to zoom ──
  const zoom = { on: false, mix: 0, scale: 1, pan: new THREE.Vector2(), pointers: new Map(), pinch: 0, moved: 0, d: 8 };
  const zoomBy = (f) => { zoom.scale = Math.min(3.2, Math.max(1, zoom.scale * f)); };
  const tanV = () => Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const panBy = (dxPx, dyPx) => {
    const k = (2 * zoom.d * tanV()) / size.h; // world units per CSS pixel at the book
    zoom.pan.x = Math.min(1.9, Math.max(-1.9, zoom.pan.x - dxPx * k));
    zoom.pan.y = Math.min(1.4, Math.max(-1.4, zoom.pan.y - dyPx * k * 1.5));
  };
  const pinchDist = () => {
    const [a, b] = [...zoom.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!zoom.on) return;
    canvas.setPointerCapture(e.pointerId);
    zoom.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zoom.pointers.size === 1) zoom.moved = 0;
    if (zoom.pointers.size === 2) zoom.pinch = pinchDist();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = zoom.on && zoom.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    zoom.moved += Math.abs(dx) + Math.abs(dy);
    if (zoom.pointers.size >= 2) {
      const dist = pinchDist();
      if (zoom.pinch) zoomBy(dist / zoom.pinch);
      zoom.pinch = dist;
    } else panBy(dx, dy);
  });
  const release = (e) => {
    zoom.pointers.delete(e.pointerId);
    if (zoom.pointers.size < 2) zoom.pinch = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    if (!zoom.on) return;
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });

  function frameCamera(open) {
    const vw = size.w, vh = size.h;
    const n = getArea();
    const m = easeInOut(clamp01(zoom.mix));
    const z = m > 0 ? getZoomArea() : n;
    const a = { x: lerp(n.x, z.x, m), y: lerp(n.y, z.y, m), w: lerp(n.w, z.w, m), h: lerp(n.h, z.h, m) };
    const fitW = lerp(2.9, 3.42, open);
    const fitH = lerp(3.0, 2.55, open);
    const d = Math.max(fitW / (2 * tanV() * camera.aspect * (a.w / vw)), fitH / (2 * tanV() * (a.h / vh))) * 1.04 / lerp(1, zoom.scale, m);
    zoom.d = d;
    // Magnified on a tall phone screen, look down a little more so the pages fill the height.
    const portrait = a.h > a.w * 1.2;
    const elev = lerp(0.9, 0.6, open) + parallax.y * 0.035 + m * (portrait ? 0.3 : 0.1);
    const az = parallax.x * 0.07;
    target.set(zoom.pan.x * m, lerp(0.05, 0.5, open), lerp(0.05, 0.02, open) + zoom.pan.y * m);
    camera.position.set(
      target.x + Math.sin(az) * Math.cos(elev) * d,
      target.y + Math.sin(elev) * d,
      target.z + Math.cos(az) * Math.cos(elev) * d,
    );
    camera.lookAt(target);
    camera.setViewOffset(vw, vh, vw / 2 - (a.x + a.w / 2), vh / 2 - (a.y + a.h / 2), vw, vh);
  }

  // ── Picking ──
  function pick() {
    raycaster.setFromCamera(pointer.ndc, camera);
    const meshes = [];
    for (const sp of spreads) for (const l of sp.layers) if (l.mesh && l.root.visible && l.rise > 0.7) meshes.push(l.mesh);
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      const layer = hit.object.userData.layer;
      if (layer.hit(hit.uv)) return layer.interactive ? layer : null;
    }
    // The closed cover opens the book.
    if (B < 0.3 && raycaster.intersectObject(book.group, true).length) return 'cover';
    return null;
  }

  const setPointer = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pointer.dirty = true;
  };
  canvas.addEventListener('pointermove', (e) => { pointer.inside = true; setPointer(e); });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; pointer.dirty = true; });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    parallaxTarget.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });

  // ── Tilting the phone sways the book, like the mouse does on a computer ──
  let tiltBase = null;
  let tiltOn = false;
  const onTilt = (e) => {
    if (e.beta == null || e.gamma == null) return;
    const angle = screen.orientation?.angle ?? 0;
    let x = e.gamma, y = e.beta;
    if (angle === 90) { x = e.beta; y = -e.gamma; } else if (angle === 270 || angle === -90) { x = -e.beta; y = e.gamma; }
    tiltBase ??= { x, y };
    // Slowly re-centre, so however the phone is held becomes "straight".
    tiltBase.x += (x - tiltBase.x) * 0.006;
    tiltBase.y += (y - tiltBase.y) * 0.006;
    parallaxTarget.set(Math.max(-1, Math.min(1, (x - tiltBase.x) / 16)), Math.max(-1, Math.min(1, (y - tiltBase.y) / 16)));
  };
  const startTilt = () => {
    if (tiltOn) return;
    tiltOn = true;
    addEventListener('deviceorientation', onTilt);
  };
  const needsPermission = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (matchMedia('(pointer: coarse)').matches && typeof DeviceOrientationEvent !== 'undefined' && !needsPermission) startTilt();

  // ── Where the book is on screen (for the hint, the doodle and the magnifier button) ──
  const box = new THREE.Box3();
  const boxB = new THREE.Box3();
  const corner = new THREE.Vector3();
  let lastRect = '';
  function reportRect() {
    if (!onBookRect) return;
    box.setFromObject(book.left.pivot).union(boxB.setFromObject(book.right.pivot));
    let l = Infinity, r = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
      const x = ((corner.x + 1) / 2) * size.w, y = ((1 - corner.y) / 2) * size.h;
      l = Math.min(l, x); r = Math.max(r, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const key = `${Math.round(l)},${Math.round(r)},${Math.round(top)},${Math.round(bottom)},${zoom.on}`;
    if (key === lastRect) return;
    lastRect = key;
    onBookRect({ left: l, right: r, top, bottom, closed: B < 0.5, zoomed: zoom.on });
  }
  canvas.addEventListener('click', (e) => {
    // A drag around the magnified book is not a click on what's under the finger.
    if (zoom.on && zoom.moved > 8) { zoom.moved = 0; return; }
    setPointer(e);
    const hit = pick();
    if (!hit) return;
    if (hit === 'cover') return onAction({ type: 'open', x: e.clientX, y: e.clientY });
    const def = hit.def;
    if (def.critter) {
      if (!isAllFound()) {
        hit.gone = true;
        hit.hoverTarget = 0;
      } else {
        hit.hop = 0.8;
      }
      onAction({ type: 'critter', id: def.critter, x: e.clientX, y: e.clientY });
      return;
    }
    if (VISUAL.has(def.action)) return play(hit);
    if (def.action === 'horse' || def.action === 'librarian' || def.action === 'cake' || def.action === 'audition') hit.hop = 1;
    if (def.action === 'cake') burst.spawn('confetti', topOf(hit, 0.85), 90);
    if (def.action === 'librarian') burst.spawn('coins', topOf(hit, 0.35), 24);
    onAction({ type: def.action, id: def.candidate, x: e.clientX, y: e.clientY });
  });

  function topOf(layer, k = 1) {
    const v = new THREE.Vector3(0, layer.size.lift + layer.size.h * k, 0.02);
    return layer.mesh.localToWorld(v);
  }

  /** A click on a pop-up that does something of its own, without turning the page. */
  function play(layer) {
    const { action, pair } = layer.def;
    if (action === 'think') return think(layer);
    if (action === 'seesaw') {
      // Whichever one is clicked toggles; its partner always moves the opposite way.
      const dir = layer.swingTarget > 0 ? -1 : 1;
      layer.swingTarget = dir * SWING;
      const partner = findLayer(pair);
      if (partner) partner.swingTarget = -dir * SWING;
      return;
    }
    if (action === 'float' && !layer.flight) layer.flight = 1e-4;
    if (action === 'wave' && !layer.wave) layer.wave = 1e-4;
    if (action === 'spin' && !layer.spin) layer.spin = 1e-4;
  }

  /** A little thought cloud pops up above the pop-up and fades after a moment. */
  function think(layer) {
    for (const th of thoughts.splice(0)) disposeThought(th);
    const text = t(THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)]);
    const material = new THREE.SpriteMaterial({ map: thoughtTexture(text), transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(topOf(layer, 0.9)).add(new THREE.Vector3(0.2, 0.28, 0.1));
    scene.add(sprite);
    thoughts.push({ sprite, age: 0 });
  }

  function disposeThought(th) {
    scene.remove(th.sprite);
    th.sprite.material.map.dispose();
    th.sprite.material.dispose();
  }

  function findLayer(id) {
    for (const sp of spreads) for (const l of sp.layers) if (l.id === id) return l;
    return null;
  }

  // ── Frame ──
  function tick(_now, forcedDt) {
    clock.update();
    const dt = forcedDt ?? Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsed();
    const motion = !reducedMotion.matches;

    const goal = debugB ?? getTarget();
    B = motion ? B + (goal - B) * (1 - Math.exp(-dt * 5)) : goal;
    if (Math.abs(goal - B) < 1e-4) B = goal;
    parallax.lerp(motion ? parallaxTarget : parallax.set(0, 0), 1 - Math.exp(-dt * 3));
    nightMix += (nightTarget - nightMix) * (1 - Math.exp(-dt * 3));
    zoom.mix = motion ? zoom.mix + ((zoom.on ? 1 : 0) - zoom.mix) * (1 - Math.exp(-dt * 6)) : (zoom.on ? 1 : 0);

    // Covers and position of the whole book.
    const open = easeInOut(clamp01((B - 0.06) / 0.52));
    const close = easeInOut(clamp01((B - LAST - 0.3) / 0.52));
    book.setCovers(-Math.PI * (1 - open), Math.PI * close);
    book.group.position.x = -(W / 2) * (1 - open) + (W / 2) * close;
    // A closed book lies a little askew, like someone just put it down.
    book.group.rotation.y = lerp(0.2, 0, open) - lerp(0, 0.16, close);
    const openness = open * (1 - close);
    contact.position.x = book.group.position.x;
    contact.scale.set(lerp(2.2, 4.1, openness), 1, 2.9);
    contact.material.opacity = lerp(1, 0.55, nightMix);

    // Fetch spreads just before the reader gets there.
    for (let j = 2; j <= LAST; j++) if (B > j - 1.6 && !spreads[j].loading) loadSpread(j);

    // Which pages show, and the turning sheet.
    const k = Math.min(LAST, Math.max(1, Math.floor(B)));
    const f = B - Math.floor(B);
    const P = (j, side) => spreads[j]?.pages?.[side] ?? blank[side];
    let theta = null;
    if (B < 1) book.setPages(P(1, 'L'), P(1, 'R'));
    else if (B >= LAST) book.setPages(P(LAST, 'L'), P(LAST, 'R'));
    else if (f < 1e-4) book.setPages(P(k, 'L'), P(k, 'R'));
    else {
      theta = Math.PI * easeInOut(clamp01((f - 0.28) / 0.4));
      book.setPages(P(k, 'L'), P(k + 1, 'R'));
    }
    if (theta === null) book.setSheet(null);
    else book.setSheet(theta, P(k, 'R'), spreads[k + 1]?.flipped ?? blank.L);

    // Pop-ups.
    const glowAmt = lerp(0.36, 0.1, nightMix);
    const MIN_SCALE = 0.70;

    for (let j = 1; j <= LAST; j++) {
      const sp = spreads[j];
      if (!sp.ready) continue;
      const d = B - j;
      for (const layer of sp.layers) {
        const def = layer.def;
        let rise = riseFor(B, j, def.delay);
        let host = def.page;

        // Spread visibility:
        // Spread 1 is hidden only when the front cover is completely closed (B <= 0.04).
        // Spread LAST is hidden only when the back cover is completely closed (d >= 0.8).
        let show = (j === 1 ? d > -0.96 : d > -1) && (j === LAST ? d < 0.8 : d < 1) && (!def.candidate || def.candidate === candidate);
        if (d > 1e-4 && def.page === 'R' && j < LAST) { host = 'SF'; show &&= theta !== null && theta < Math.PI / 2; }
        if (d < -1e-4 && def.page === 'L' && j > 1) { host = 'SB'; show &&= theta !== null && theta > Math.PI / 2; }
        if (!show) rise = 0;

        let z = def.z;
        let scale = 1;

        if (j === 1 && d < 0) {
          // Spread 1: front cover opening / closing.
          // Size reduction/enlargement happens while the cover is turning (B: 0.06 → 0.58).
          // Once the book is open, popups stand up / fall down at 100% size.
          const openCover = clamp01((B - 0.06) / 0.52);
          const slipK = 1 - easeInOut(openCover);
          const tip = def.z - (def.h + (def.lift ?? 0));
          const maxSlip = tip < -1.04 ? -1.04 - tip + 0.06 : 0.2;
          z += maxSlip * slipK;
          scale = MIN_SCALE + (1.0 - MIN_SCALE) * (1 - slipK);
        } else if (j === LAST && d > 0.3) {
          // Spread LAST: back cover closing / opening.
          // Popups have already fallen flat at 100% size (d: 0 → 0.3).
          // While the back cover swings closed (d: 0.3 → 0.8), they reduce to 0.70 and slip in.
          const closeCover = easeInOut(clamp01((d - 0.3) / 0.5));
          const tip = def.z - (def.h + (def.lift ?? 0));
          const maxSlip = tip < -1.04 ? -1.04 - tip + 0.06 : 0.2;
          z += maxSlip * closeCover;
          scale = MIN_SCALE + (1.0 - MIN_SCALE) * (1 - closeCover);
        } else if (d > 0 && j < LAST) {
          // Outgoing spread during page turn (d: 0 → 1):
          // First (d: 0 → 0.28): popups fall flat at 100% size (scale = 1.0).
          // During sheet flip (d: 0.28 → 0.68): flat cutouts reduce in size from 1.0 to 0.70 and slip inward.
          // After sheet flip (d >= 0.68): rest at MIN_SCALE (0.70).
          const turnProgress = clamp01((d - 0.28) / 0.40);
          const slipK = easeInOut(turnProgress);
          const slipDir = def.z < 0 ? 1 : -1;
          const slipDist = Math.min(0.24, (def.h + (def.lift ?? 0)) * 0.18);
          z += slipDir * slipDist * slipK;
          scale = MIN_SCALE + (1.0 - MIN_SCALE) * (1 - slipK);
        } else if (d < 0 && j > 1) {
          // Incoming spread during page turn (1 + d: 0 → 1):
          // Before sheet flip (1 + d <= 0.28): rest at MIN_SCALE (0.70).
          // During sheet flip (1 + d: 0.28 → 0.68): flat cutouts enlarge in size from 0.70 to 1.0 and slip into place.
          // After sheet lands (1 + d >= 0.68): popups erect (stand up) into 3D at 100% size (scale = 1.0)!
          const turnProgress = clamp01((1 + d - 0.28) / 0.40);
          const slipK = 1 - easeInOut(turnProgress);
          const slipDir = def.z < 0 ? 1 : -1;
          const slipDist = Math.min(0.24, (def.h + (def.lift ?? 0)) * 0.18);
          z += slipDir * slipDist * slipK;
          scale = MIN_SCALE + (1.0 - MIN_SCALE) * (1 - slipK);
        }

        const offset = 0.001 + layer.order * 0.00008;
        book.frame(host, def.s, z, offset, tmpM);
        if (show) layer.update(dt, time, rise, tmpM, { motion, glow: glowAmt, scale });
        else layer.root.visible = false;
      }
    }

    // Lamp glow on the room spread at night.
    const lampLayer = findLayer('lamp');
    const roomVis = lampLayer?.root.visible ? lampLayer.rise : 0;
    if (lampLayer && roomVis > 0.01) {
      lampLayer.mesh.updateWorldMatrix(true, false);
      lampGlow.position.copy(topOf(lampLayer, 0.84));
    }
    lampGlow.material.opacity = nightMix * clamp01(roomVis) * 0.9;
    lampBulb.position.copy(lampGlow.position);
    lampBulb.intensity = nightMix * clamp01(roomVis) * 2.2;

    // Day ↔ night.
    sun.intensity = lerp(2.3, 0.08, nightMix);
    hemi.intensity = lerp(1.0, 0.22, nightMix);
    hemi.color.setRGB(lerp(1, 0.55, nightMix), lerp(0.945, 0.6, nightMix), lerp(0.84, 0.95, nightMix));
    lamp.intensity = lerp(0, 34, nightMix);
    catcher.material.opacity = lerp(0.2, 0.1, nightMix);

    dust.update(time, nightMix, motion);
    burst.update(dt);

    // Thought clouds: grow in, hang for a moment, fade out.
    for (let i = thoughts.length - 1; i >= 0; i--) {
      const th = thoughts[i];
      th.age += dt;
      const grow = backOut(clamp01(th.age / 0.45));
      th.sprite.scale.set(0.62 * grow, 0.3875 * grow, 1);
      th.sprite.material.opacity = 1 - clamp01((th.age - 1.8) / 0.5);
      if (motion) th.sprite.position.y += dt * 0.04;
      if (th.age > 2.3) { disposeThought(th); thoughts.splice(i, 1); }
    }

    // Hover.
    if (pointer.dirty) {
      pointer.dirty = false;
      const hit = pointer.inside ? pick() : null;
      if (hit !== hovered) {
        if (hovered && hovered !== 'cover') hovered.hoverTarget = 0;
        hovered = hit;
        if (hovered && hovered !== 'cover') hovered.hoverTarget = 1;
        canvas.parentElement.classList.toggle('is-pointer', !!hovered);
      }
    }

    frameCamera(openness);
    renderer.render(scene, camera);
    reportRect();
  }

  if (import.meta.env.DEV) {
    // Debug handle: __stage.step(90) advances 90 frames synchronously (handy in throttled tabs).
    window.__stage = { get B() { return B; }, spreads, book, camera, scene, renderer, step: (n = 60) => { for (let i = 0; i < n; i++) tick(0, 1 / 60); }, show: (b) => { debugB = b; B = b ?? B; } };
  }

  // Load the first spread before showing anything, the rest in the background.
  await loadSpread(1);
  // Upload textures one per idle slice instead of all inside the first frame.
  const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 16)));
  const first = [covers.front.color, covers.front.mask, spreads[1].pages.L, spreads[1].pages.R,
    ...spreads[1].layers.map((l) => l.material?.map).filter(Boolean)];
  for (const tex of first) { await idle(); renderer.initTexture(tex); }
  await renderer.compileAsync(scene, camera);
  renderer.setAnimationLoop(tick);

  // Engaged readers (anyone who scrolls) get the rest of the book fetched in order;
  // visitors who only glance at the cover don't pay for it.
  const preloadRest = async () => { for (let j = 2; j <= LAST; j++) await loadSpread(j); };
  if (scrollY > 0) preloadRest();
  else addEventListener('scroll', preloadRest, { once: true, passive: true });

  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : tick);
    if (!document.hidden) clock.reset();
  });

  return {
    setNight(on) { nightTarget = on ? 1 : 0; },
    /** Magnifier mode: the book fills the screen and can be dragged and zoomed. */
    setZoom(on) {
      zoom.on = on;
      zoom.pointers.clear();
      if (on) { zoom.scale = size.h > size.w * 1.2 ? 1.3 : 1.12; zoom.pan.set(0, 0); }
      canvas.style.touchAction = on ? 'none' : '';
    },
    zoomBy,
    panBy,
    /** iOS only lets a page read the gyroscope after asking, from a tap. */
    async enableTilt() {
      if (tiltOn || !matchMedia('(pointer: coarse)').matches) return;
      if (!needsPermission) return startTilt();
      try { if ((await DeviceOrientationEvent.requestPermission()) === 'granted') startTilt(); } catch { /* declined */ }
    },
    /** Put another casting candidate on the 3D stage; they pop up fresh. */
    setCandidate(id) {
      if (id === candidate) return;
      candidate = id;
      const layer = findLayer(`cand-${id}`);
      if (layer) { layer.enter = 0; layer.hop = 0.6; }
    },
    setLang() {
      repaintCovers(covers, { ...plate, t });
      for (const sp of spreads) {
        if (!sp.pages) continue;
        repaintPage(sp.pages.L, pageOpts(sp.j, 'L'));
        repaintPage(sp.pages.R, pageOpts(sp.j, 'R'));
        sp.flipped.needsUpdate = true;
      }
    },
    celebrate(kind) {
      const ginger = findLayer('ginger');
      if (kind === 'oracle' && ginger?.root.visible) {
        ginger.hop = 1;
        burst.spawn('coins', topOf(ginger, 0.35), 18);
      }
    },
    collect(id) {
      if (isAllFound()) {
        this.returnCritters();
        return;
      }
      for (const sp of spreads) for (const l of sp.layers) if (l.def?.critter === id) l.gone = true;
    },
    returnCritters() {
      for (const sp of spreads) {
        for (const l of sp.layers) {
          if (l.def?.critter) {
            l.gone = false;
            l.leaving = 0;
            l.enter = 0;
            l.hop = 0.8;
          }
        }
      }
    },
    reset() {
      for (const sp of spreads) {
        for (const l of sp.layers) {
          if (l.def?.critter) {
            l.gone = false;
            l.leaving = 0;
            l.enter = 1;
            l.hop = 0;
            l.root.visible = true;
          }
        }
      }
    },
  };
}
