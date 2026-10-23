import * as THREE from 'three';

const CARDBOARD = new THREE.Color(0xdcc69c);
const backOut = (v) => 1 + 2.4 * (v - 1) ** 3 + 1.4 * (v - 1) ** 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (v) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
/** One-shot progress: 0 is idle; once started it runs 0 → 1 and stops back at 0. */
const tick1 = (p, step) => (p > 0 && p + step < 1 ? p + step : 0);

/** Shared look for every paper cut-out: painted front, plain cardboard back. */
function cutoutMaterial(texture) {
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: 0xffffff,
    emissiveIntensity: 0.38,
    roughness: 0.92,
    metalness: 0,
    alphaTest: 0.5,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.cardboard = { value: CARDBOARD };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 cardboard;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = cardboard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (!gl_FrontFacing) totalEmissiveRadiance *= 0.25;');
  };
  mat.customProgramCacheKey = () => 'cutout';
  return mat;
}

const tabMaterial = new THREE.MeshStandardMaterial({ color: 0xf1e3c4, roughness: 0.95, side: THREE.DoubleSide });

/**
 * One pop-up element. It hinges on its bottom edge: flat on the page at rise 0,
 * standing (slightly leaning back) at rise 1.
 */
export class PopLayer {
  constructor(def, art, order) {
    this.def = def;
    this.art = art;
    this.id = def.id ?? def.art;
    this.order = order;
    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    this.hinge = new THREE.Group();
    this.root.add(this.hinge);

    const h = def.h;
    const w = h * art.aspect;
    const lift = def.lift ?? 0;
    this.size = { w, h, lift };
    this.tab = null;

    const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2 + lift, 0);
    this.material = cutoutMaterial(art.texture);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.layer = this;
    this.hinge.add(this.mesh);

    if (lift > 0.02) {
      const tw = Math.min(0.06, w * 0.18);
      const tab = new THREE.Mesh(new THREE.PlaneGeometry(tw, lift + 0.02).translate(0, (lift + 0.02) / 2, -0.002), tabMaterial);
      tab.castShadow = true;
      this.hinge.add(tab);
      this.tab = tab;
    }

    this.rise = 0;
    this.hover = 0;
    this.hoverTarget = 0;
    this.hop = 0;          // 0…1 one-shot jump
    this.gone = false;     // collected critters leave for good
    this.enter = 1;        // 0 → 1: a fresh pop-up when a casting candidate steps on stage
    this.leaving = 0;
    this.flight = 0;       // one-shot: a clicked balloon floats away and grows back
    this.wave = 0;         // one-shot: a clicked boat rolls on the waves
    this.spin = 0;         // one-shot: a clicked road sign turns round
    this.swing = 0;        // sun / cloud: drift up or down, in opposite directions
    this.swingTarget = 0;
    this.phase = Math.random() * Math.PI * 2;
  }

  get interactive() { return !!(this.def.action || this.def.critter) && !this.gone; }

  hit(uv) { return this.art.hit(uv.x, uv.y); }

  update(dt, time, rise, matrix, { motion, glow }) {
    this.rise = rise;
    // Folded layers stay visible: they lie flat on the page like a real pop-up book.
    this.root.visible = !(this.gone && this.leaving >= 1);
    if (!this.root.visible) return;
    this.root.matrix.copy(matrix);
    this.root.matrixWorldNeedsUpdate = true;

    // Clicked one-shots run before the grow-in, so a balloon that has floated away
    // grows back from its start position in the same frame it resets.
    const wasFlying = this.flight > 0;
    this.flight = tick1(this.flight, dt / 1.8);
    if (wasFlying && this.flight === 0) this.enter = 0;
    this.wave = tick1(this.wave, dt / 1.6);
    this.spin = tick1(this.spin, dt / 2.4);

    this.hover += (this.hoverTarget - this.hover) * Math.min(1, dt * 10);
    if (this.enter < 1) {
      this.enter = Math.min(1, this.enter + dt * 2.2);
      rise *= Math.max(0, backOut(this.enter));
    }
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 1.1);
    if (this.gone && this.leaving < 1) this.leaving = Math.min(1, this.leaving + dt * 1.6);

    const lean = this.def.lean ?? 0.08;
    let angle = -(Math.PI / 2) * (1 - rise) - lean * rise;
    if (motion) {
      if (this.def.sway) angle += Math.sin(time * 1.3 + this.phase) * this.def.sway * rise;
      angle += Math.sin(time * 9 + this.phase) * 0.035 * this.hover * rise;
    }
    this.hinge.rotation.x = angle;

    // Swing: the sun and the cloud drift in opposite directions; the sun's tab follows it.
    this.swing += (this.swingTarget - this.swing) * Math.min(1, dt * 3.5);
    this.mesh.position.y = this.swing;
    if (this.tab) this.tab.scale.y = (this.size.lift + this.swing + 0.02) / (this.size.lift + 0.02);
    // Boat rolls on the waves; the road sign turns round three times.
    this.mesh.rotation.z = this.wave > 0 ? Math.sin(this.wave * Math.PI * 4) * 0.2 * Math.sin(this.wave * Math.PI) : 0;
    this.mesh.rotation.y = this.spin > 0 ? easeInOut(this.spin) * Math.PI * 6 : 0;

    // Hop: a little jump straight up (the horse being lifted, the chest bouncing …)
    const jump = this.hop > 0 ? Math.sin((1 - this.hop) * Math.PI) * (this.def.hopHeight ?? 0.35) : 0;
    const leave = this.leaving > 0 ? Math.sin(this.leaving * Math.PI * 0.5) * 0.9 : 0;
    // Balloon: floats up while it shrinks away.
    const f = this.flight;
    const flyUp = f > 0 ? f * f * 1.1 : 0;
    const flyScale = f > 0 ? 1 - clamp01((f - 0.4) / 0.6) ** 2 : 1;
    this.hinge.position.y = jump + leave + flyUp;
    const s = this.gone ? 1 - this.leaving : 1;
    this.hinge.scale.setScalar(Math.max(0.001, s * flyScale * (1 + this.hover * 0.04)));
    this.material.emissiveIntensity = glow + this.hover * 0.25;
  }
}

/** A 3D map pin that rises with its spread and bobs above the yellow house. */
export class PinLayer {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    this.hinge = new THREE.Group();
    this.root.add(this.hinge);
    const red = new THREE.MeshStandardMaterial({ color: 0xc94a30, roughness: 0.35, emissive: 0x5a1205, emissiveIntensity: 0.4 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(def.h * 0.32, 24, 16), red);
    head.position.y = def.h * 0.68;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(def.h * 0.24, def.h * 0.62, 20).rotateX(Math.PI), red);
    tip.position.y = def.h * 0.31;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(def.h * 0.11, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.4 }));
    dot.position.set(0, def.h * 0.7, def.h * 0.24);
    this.pin = new THREE.Group();
    this.pin.add(head, tip, dot);
    for (const m of [head, tip]) m.castShadow = true;
    this.hinge.add(this.pin);
    this.rise = 0;
  }

  get interactive() { return false; }

  update(dt, time, rise, matrix, { motion }) {
    this.rise = rise;
    this.root.visible = rise > 0.02;
    if (!this.root.visible) return;
    this.root.matrix.copy(matrix);
    this.root.matrixWorldNeedsUpdate = true;
    const bob = motion ? Math.sin(time * 2.4) * 0.04 : 0;
    this.pin.position.y = (this.def.lift ?? 0) * rise + bob * rise;
    this.pin.rotation.y = motion ? time * 0.8 : 0;
    this.pin.scale.setScalar(Math.max(0.001, rise));
  }
}
