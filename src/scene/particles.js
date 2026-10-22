import * as THREE from 'three';

/** Dust motes in the sunbeam by day, fireflies by night. */
export class Dust {
  constructor(count, sprite) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5.2;
      pos[i * 3 + 1] = Math.random() * 2.4 + 0.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3.4;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      time: { value: 0 },
      night: { value: 0 },
      motion: { value: 1 },
      scale: { value: 1 },
      sprite: { value: sprite },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float time, night, motion, scale;
        varying float vAlpha;
        varying float vNight;
        void main() {
          float t = time * motion;
          vec3 p = position;
          p.x += sin(t * (0.10 + seed * 0.12) + seed * 40.0) * (0.25 + night * 0.35);
          p.y += sin(t * (0.13 + seed * 0.1) + seed * 17.0) * (0.18 + night * 0.25) + t * 0.015 * (1.0 - night);
          p.y = mod(p.y, 2.6) + 0.05;
          p.z += cos(t * (0.09 + seed * 0.1) + seed * 23.0) * (0.2 + night * 0.3);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = mix(0.018 + seed * 0.022, 0.05 + seed * 0.05, night);
          gl_PointSize = size * scale / -mv.z;
          float blink = mix(1.0, smoothstep(0.2, 1.0, sin(t * (1.2 + seed * 2.0) + seed * 60.0) * 0.5 + 0.5), night);
          vAlpha = mix(0.12 + seed * 0.22, 0.95, night) * blink;
          vNight = night;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D sprite;
        varying float vAlpha;
        varying float vNight;
        void main() {
          vec4 s = texture2D(sprite, gl_PointCoord);
          vec3 day = vec3(1.0, 0.95, 0.82);
          vec3 fly = vec3(1.0, 0.86, 0.38);
          gl_FragColor = vec4(mix(day, fly, vNight) * s.rgb, s.a * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(time, night, motion) {
    this.uniforms.time.value = time;
    this.uniforms.night.value = night;
    this.uniforms.motion.value = motion ? 1 : 0;
  }
}

/** Confetti and gold coins: short physics bursts. */
export class Burst {
  constructor() {
    this.group = new THREE.Group();
    const N = 140;
    this.confetti = this.#system(
      new THREE.PlaneGeometry(0.045, 0.026),
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.15 }),
      N,
    );
    this.coins = this.#system(
      new THREE.CylinderGeometry(0.04, 0.04, 0.008, 18),
      new THREE.MeshStandardMaterial({ color: 0xf2b632, metalness: 0.2, roughness: 0.35, emissive: 0x9a6200, emissiveIntensity: 0.55 }),
      48,
    );
  }

  #system(geo, mat, n) {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    const parts = Array.from({ length: n }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, zero);
    if (geo.type === 'PlaneGeometry') {
      const palette = [0xf6c343, 0x1f4dd8, 0xc94a30, 0x2f8a84, 0xd9667e, 0x7d5bbf, 0x6f8f3a].map((c) => new THREE.Color(c));
      for (let i = 0; i < n; i++) mesh.setColorAt(i, palette[i % palette.length]);
    }
    this.group.add(mesh);
    return { mesh, parts, next: 0 };
  }

  spawn(kind, origin, count = 60) {
    const sys = kind === 'coins' ? this.coins : this.confetti;
    for (let i = 0; i < count; i++) {
      const pt = sys.parts[sys.next];
      sys.next = (sys.next + 1) % sys.parts.length;
      pt.life = 1.6 + Math.random() * 1.2;
      pt.p.copy(origin);
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'coins' ? 0.6 + Math.random() * 0.8 : 0.5 + Math.random() * 1.4;
      pt.v.set(Math.cos(a) * sp * 0.6, 2.2 + Math.random() * 1.6, Math.sin(a) * sp * 0.6);
      pt.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      pt.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    }
  }

  update(dt) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const zero = new THREE.Vector3(0, 0, 0);
    for (const sys of [this.confetti, this.coins]) {
      let live = false;
      sys.parts.forEach((pt, i) => {
        if (pt.life <= 0) return;
        live = true;
        pt.life -= dt;
        const drag = sys === this.confetti ? 1.8 : 0.4;
        pt.v.y -= 5.2 * dt;
        pt.v.multiplyScalar(Math.exp(-drag * dt));
        pt.p.addScaledVector(pt.v, dt);
        if (pt.p.y < 0.07) { pt.p.y = 0.07; pt.v.set(0, 0, 0); pt.w.multiplyScalar(0.9); }
        pt.r.x += pt.w.x * dt; pt.r.y += pt.w.y * dt; pt.r.z += pt.w.z * dt;
        q.setFromEuler(pt.r);
        const s = pt.life <= 0 ? zero : pt.life < 0.4 ? one.clone().multiplyScalar(pt.life / 0.4) : one;
        m.compose(pt.p, q, s);
        sys.mesh.setMatrixAt(i, m);
      });
      if (live) sys.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
