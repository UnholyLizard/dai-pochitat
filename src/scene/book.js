import * as THREE from 'three';

// Book dimensions in world units. One page is W wide (away from the spine) and H deep.
export const W = 1.5;
export const H = 2.0;
export const T = 0.05;    // page block thickness
export const CT = 0.035;  // cover board thickness
export const OV = 0.06;   // cover overhang
const SHEET_LIFT = 0.002;
const SEG = 48;

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

/** How much the turning page bends: outer edge leads while lifting, trails while landing. */
const curlFor = (theta) => 0.75 * Math.sin(2 * theta);

/** Point and angle along a curled page at distance s from the spine (pivot-local, 2D). */
function curlAt(theta, s, out) {
  const c = curlFor(theta);
  const steps = Math.max(2, Math.ceil((s / W) * 24));
  const ds = s / steps;
  let x = 0, y = 0;
  for (let i = 0; i < steps; i++) {
    const a = theta + c * (((i + 0.5) * ds) / W) ** 2;
    x += Math.cos(a) * ds;
    y += Math.sin(a) * ds;
  }
  out.x = x; out.y = y; out.a = theta + c * (s / W) ** 2;
  return out;
}

export class Book {
  /**
   * @param {object} t textures: front/back cover sets ({ color, mask }) and the page-edge stripes
   */
  constructor(t) {
    this.group = new THREE.Group();
    this.theta = 0;

    const paper = new THREE.MeshStandardMaterial({ color: 0xf6eedc, roughness: 0.95 });
    const edge = new THREE.MeshStandardMaterial({ map: t.edge, roughness: 0.95 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1f3fae, roughness: 0.82 });
    const blockMats = [edge, edge, paper, paper, edge, edge];

    const makeHalf = (side) => {
      const sign = side === 'L' ? -1 : 1;
      const pivot = new THREE.Group();
      pivot.position.y = T;

      const block = new THREE.Mesh(new THREE.BoxGeometry(W, T, H), blockMats);
      block.position.set(sign * W / 2, -T / 2, 0);
      block.castShadow = block.receiveShadow = true;

      const page = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 }),
      );
      page.position.set(sign * W / 2, 0.0005, 0);
      page.receiveShadow = true;

      const board = new THREE.Mesh(new THREE.BoxGeometry(W + OV, CT, H + OV * 2), cloth);
      board.position.set(sign * (W + OV) / 2, -T - CT / 2, 0);
      board.castShadow = board.receiveShadow = true;

      // Cover art sits on the outside face of the board (facing down while the book is open).
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(W + OV, H + OV * 2).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({
          map: (side === 'L' ? t.front : t.back).color,
          roughness: 0.82,
          // No environment map: the foil gets its shine from a warm emissive mask instead.
          emissive: 0xc8962e,
          emissiveMap: (side === 'L' ? t.front : t.back).mask,
          emissiveIntensity: 0.5,
        }),
      );
      art.position.set(sign * (W + OV) / 2, -T - CT - 0.0015, 0);
      // Read upright when the half is flipped closed onto the other one.
      art.rotation.y = Math.PI;
      art.castShadow = false;
      art.receiveShadow = true;

      pivot.add(block, page, board, art);
      this.group.add(pivot);
      return { pivot, page, art };
    };

    this.left = makeHalf('L');
    this.right = makeHalf('R');

    // Spine: only visible while the book is (nearly) closed.
    const spineLen = 2 * T + 2 * CT;
    this.spine = new THREE.Mesh(
      new THREE.BoxGeometry(CT, spineLen, H + OV * 2).translate(-CT / 2, spineLen / 2, 0),
      cloth,
    );
    this.spine.position.y = -CT;
    this.spine.castShadow = true;
    this.group.add(this.spine);

    // The page that turns. Its geometry is re-bent every frame while it moves.
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((SEG + 1) * 2 * 3);
    const uv = new Float32Array((SEG + 1) * 2 * 2);
    const idx = [];
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      uv.set([u, 1, u, 0], i * 4);
      if (i < SEG) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.sheetGeo = geo;
    this.sheetFront = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.96, side: THREE.FrontSide }));
    this.sheetBack = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.96, side: THREE.BackSide }));
    for (const m of [this.sheetFront, this.sheetBack]) { m.castShadow = true; m.receiveShadow = true; }
    this.sheet = new THREE.Group();
    this.sheet.position.y = T + SHEET_LIFT;
    this.sheet.add(this.sheetFront, this.sheetBack);
    this.sheet.visible = false;
    this.group.add(this.sheet);
    this.#bend(0);
  }

  /** Front cover angle (0 open … −π closed) and back cover angle (0 open … π closed). */
  setCovers(front, back) {
    this.left.pivot.rotation.z = front;
    this.right.pivot.rotation.z = back;
    const closedFront = -front / Math.PI;
    const closedBack = back / Math.PI;
    if (closedBack > closedFront) {
      this.spine.scale.x = -1;
      this.spine.rotation.z = -(Math.PI / 2) * (1 - closedBack);
    } else {
      this.spine.scale.x = 1;
      this.spine.rotation.z = (Math.PI / 2) * (1 - closedFront);
    }
    this.spine.visible = Math.max(closedFront, closedBack) > 0.02;
  }

  setPages(left, right) {
    this.#setMap(this.left.page.material, left);
    this.#setMap(this.right.page.material, right);
  }

  /** theta: 0 (lying on the right) … π (landed on the left). null hides the sheet. */
  setSheet(theta, front, back) {
    if (theta === null) { this.sheet.visible = false; return; }
    this.sheet.visible = true;
    this.#setMap(this.sheetFront.material, front);
    this.#setMap(this.sheetBack.material, back);
    if (theta !== this.theta) this.#bend(theta);
  }

  #setMap(material, tex) {
    const map = tex ?? null;
    if (material.map === map) return;
    const hadMap = !!material.map;
    material.map = map;
    if (hadMap !== !!map) material.needsUpdate = true;
  }

  #bend(theta) {
    this.theta = theta;
    const pos = this.sheetGeo.attributes.position.array;
    const c = curlFor(theta);
    const ds = W / SEG;
    let x = 0, y = 0;
    for (let i = 0; i <= SEG; i++) {
      pos.set([x, y, -H / 2, x, y, H / 2], i * 6);
      const a = theta + c * (((i + 0.5) * ds) / W) ** 2;
      x += Math.cos(a) * ds;
      y += Math.sin(a) * ds;
    }
    this.sheetGeo.attributes.position.needsUpdate = true;
    this.sheetGeo.computeVertexNormals();
    this.sheetGeo.computeBoundingSphere();
  }

  /**
   * Where a pop-up anchored at (s, z) on a given host surface currently is,
   * as a matrix in book-group space. Hosts: L, R (static halves), SF/SB (turning sheet front/back).
   */
  frame(host, s, z, offset, out) {
    const p = _x.set(0, 0, 0);
    if (host === 'L' || host === 'R') {
      const ang = (host === 'L' ? this.left : this.right).pivot.rotation.z;
      const sx = host === 'L' ? -s : s;
      const c = Math.cos(ang), si = Math.sin(ang);
      _y.set(-si, c, 0);                       // surface normal
      _z.set(c, si, 0);                        // along the page
      p.set(sx * c, T + sx * si, z).addScaledVector(_y, offset);
    } else {
      const pt = curlAt(this.theta, s, { x: 0, y: 0, a: 0 });
      const ca = Math.cos(pt.a), sa = Math.sin(pt.a);
      const back = host === 'SB';
      _z.set(ca, sa, 0).multiplyScalar(back ? -1 : 1);       // tangent (mirrored on the back)
      _y.set(-sa, ca, 0).multiplyScalar(back ? -1 : 1);      // normal of the visible face
      p.set(pt.x, T + SHEET_LIFT + pt.y, z).addScaledVector(_y, offset + (back ? 0.001 : 0));
    }
    const zAxis = new THREE.Vector3().crossVectors(_z, _y);
    _m.makeBasis(_z, _y, zAxis).setPosition(p);
    return out.copy(_m);
  }
}
