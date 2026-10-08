/* Scroll-driven 3D truck: real photo → solid model → structure scan → cargo-body explode → reassembly → real photo.
   Camera and proportions are aligned to images/truck-film-first-frame.webp.
   The model is a procedural reconstruction from basic shapes (no CAD or purchased model); it matches the photo's
   proportions and pose, not its exact surface detail.
   Truck frame: metres, ground y = 0, +X = front of the truck, +Z = the side facing the camera, X = 0 at the cab-side of the box. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (p, a, b) => clamp((p - a) / (b - a));
const smooth = t => t * t * (3 - 2 * t);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const bump = t => Math.pow(Math.sin(Math.PI * clamp(t)), 2);
const win = (p, a, b, f = .03) => smooth(range(p, a, a + f)) * (1 - smooth(range(p, b - f, b)));

/* Photo-solved camera (truck frame) and the photo's own aspect ratio. */
const PHOTO = { w: 1672, h: 941, fov: 23.9, pos: [9.478, 2.667, 12.308], target: [-1.228, 1.738, 1.2] };

/* Measured truck dimensions. */
const BOX = { x0: -7.96, x1: -0.20, y0: 1.386, y1: 3.686 }, BL = BOX.x1 - BOX.x0, BH = BOX.y1 - BOX.y0;
const BXC = (BOX.x0 + BOX.x1) / 2, BYC = (BOX.y0 + BOX.y1) / 2;
const FRONT_X = .79, REAR_X = -5.71, WR = .51;

export function createHero3D({ stage, canvas, labelsRoot, frameEl }) {
  const mobile = matchMedia('(max-width: 900px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, premultipliedAlpha: true, powerPreference: mobile ? 'low-power' : 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = .75;
  const camera = new THREE.PerspectiveCamera(PHOTO.fov, PHOTO.w / PHOTO.h, 0.5, 200);
  // Studio lighting close to the photo: soft key from front-left above, cool rim from behind.
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(10, 14, 12); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9d4ec, 1.1); rim.position.set(-14, 8, -9); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xdfe8ef, 0x0b0e11, .35));

  /* ---------- materials ----------
     'solid' surfaces stay opaque once the model is visible; 'skin' panels of the cargo body
     turn translucent during the structure scan so the frame behind them can be read. */
  const solids = [], skins = [];
  const mat = (o, kind = 'solid') => {
    const m = o.clearcoat ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o);
    // Solid parts are opaque; the whole canvas is faded in CSS, so the cab never turns see-through.
    m.transparent = kind === 'skin'; m.opacity = 1;
    // Push faces back slightly so structure lines drawn on their edges pass the depth test.
    m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1;
    m.userData.emI = o.emissiveIntensity ?? 0;
    (kind === 'skin' ? skins : solids).push(m); return m;
  };
  const M = {
    skin: mat({ color: 0xc9cfd3, metalness: .62, roughness: .34 }, 'skin'),
    skinDark: mat({ color: 0x8f989d, metalness: .62, roughness: .4 }, 'skin'),
    frame: mat({ color: 0x9aa3a8, metalness: .7, roughness: .45 }),
    paint: mat({ color: 0xe6e9eb, metalness: .2, roughness: .28, clearcoat: .8, clearcoatRoughness: .2 }),
    steel: mat({ color: 0x24292d, metalness: .65, roughness: .55 }),
    tire: mat({ color: 0x121416, metalness: 0, roughness: .9 }),
    rim: mat({ color: 0xc4cacd, metalness: .9, roughness: .25 }),
    glass: mat({ color: 0x2e404b, metalness: .35, roughness: .07, clearcoat: 1, clearcoatRoughness: .05 }),
    trim: mat({ color: 0x17191b, metalness: .3, roughness: .5 }),
    gal: mat({ color: 0xa6adb1, metalness: .7, roughness: .55 }),
    card: mat({ color: 0xb5a685, metalness: 0, roughness: .85 }),
    lightW: mat({ color: 0xf4f8fb, emissive: 0xcfe6ff, emissiveIntensity: .35, metalness: .1, roughness: .15 }),
    lightR: mat({ color: 0xb3221c, emissive: 0xff2a1c, emissiveIntensity: .3, metalness: .1, roughness: .3 }),
    lightA: mat({ color: 0xc77a12, emissive: 0xff8a00, emissiveIntensity: .25, metalness: .1, roughness: .3 })
  };
  // Structure lines: depth-tested so solid parts in front hide them; no additive glow.
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(.62, .82, 1.0), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });

  /* ---------- geometry helpers ---------- */
  let LINES = false; // only the cargo body's structure gets technical lines
  const edgeCache = new Map();
  const boxEdges = (w, h, d) => { const k = [w, h, d].map(v => v.toFixed(3)).join(); let g = edgeCache.get(k); if (!g) { g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)); edgeCache.set(k, g); } return g; };
  const box = (g, m, [w, h, d], [x, y, z], r = 0, rot) => {
    const radius = Math.max(0, Math.min(r, Math.min(w, h, d) / 2 - .002));
    const mesh = new THREE.Mesh(radius > 0 ? new RoundedBoxGeometry(w, h, d, 4, radius) : new THREE.BoxGeometry(w, h, d), m);
    if (LINES) mesh.add(new THREE.LineSegments(boxEdges(w, h, d), lineMat));
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    g.add(mesh); return mesh;
  };
  const cyl = (g, m, r, len, [x, y, z], axis = 'y', seg = 32, r2 = r) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, seg), m);
    mesh.position.set(x, y, z);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2; if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    g.add(mesh); return mesh;
  };
  function curvedPanel(g, m, shape, depth, { bevel = .025, bow = 0, curve = 24 } = {}) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: curve });
    geo.translate(0, 0, -depth / 2);
    const warp = (x, z) => x + bow * Math.max(0, 1 - Math.pow(z / (depth / 2 + bevel), 2)) * smooth(clamp((x - .9) / 1.3));
    const attr = geo.attributes.position;
    for (let i = 0; i < attr.count; i++) attr.setX(i, warp(attr.getX(i), attr.getZ(i)));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m); g.add(mesh); return mesh;
  }
  function roundedPolygon(points, r = .07) {
    const shape = new THREE.Shape();
    points.forEach((p, i) => {
      const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
      const la = Math.hypot(prev[0] - p[0], prev[1] - p[1]), lb = Math.hypot(next[0] - p[0], next[1] - p[1]);
      const a = Math.min(r, la * .3), b = Math.min(r, lb * .3);
      const q = [p[0] + (prev[0] - p[0]) * a / la, p[1] + (prev[1] - p[1]) * a / la];
      if (i === 0) shape.moveTo(...q); else shape.lineTo(...q);
      shape.quadraticCurveTo(...p, p[0] + (next[0] - p[0]) * b / lb, p[1] + (next[1] - p[1]) * b / lb);
    });
    shape.closePath(); return shape;
  }

  /* headlight flare sprites */
  const flareTexture = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    const r = x.createRadialGradient(128, 32, 0, 128, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(200,228,255,.8)'); r.addColorStop(1, 'rgba(120,170,230,0)'); x.fillStyle = r; x.fillRect(0, 0, 256, 64);
    const h = x.createLinearGradient(0, 0, 256, 0); h.addColorStop(0, 'rgba(150,200,255,0)'); h.addColorStop(.5, 'rgba(230,242,255,.95)'); h.addColorStop(1, 'rgba(150,200,255,0)'); x.fillStyle = h; x.fillRect(0, 30, 256, 4); return new THREE.CanvasTexture(c); };
  const flares = [], flareMat = new THREE.SpriteMaterial({ map: flareTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });

  /* ---------- parts ----------
     Cab, chassis and wheels stay where they are. Only the cargo body comes apart, in ten pieces. */
  const root = new THREE.Group(); scene.add(root);
  const parts = [];
  const tmpBox = new THREE.Box3(), tmpC = new THREE.Vector3();
  function part(name, build, dir = [0, 0, 0], rot = [0, 0, 0], delay = 0, opts = {}) {
    const g = new THREE.Group(); g.name = name; build(g);
    let c;
    if (opts.pivot) c = new THREE.Vector3(...opts.pivot); else { tmpBox.setFromObject(g); tmpBox.getCenter(tmpC); c = tmpC.clone(); }
    g.children.forEach(ch => ch.position.sub(c)); g.position.copy(c);
    root.add(g);
    const p = { name, g, base: c.clone(), dir: new THREE.Vector3(...dir), rot: new THREE.Vector3(...rot), delay };
    parts.push(p); return p;
  }
  const P = {};

  // ---- Fixed: chassis, cab, drivetrain, wheels ----
  part('chassis', g => {
    [-1, 1].forEach(s => box(g, M.steel, [9.7, .2, .11], [-3.0, .93, s * .56]));
    for (let i = 0; i < 10; i++) box(g, M.steel, [.1, .12, 2.1], [-7.7 + i * .78, 1.24, 0]);
    box(g, M.gal, [4.41, .11, .06], [-2.285, .6, 1.0], .02); [-4.4, -2.3, -.3].forEach(x => box(g, M.gal, [.06, .55, .05], [x, .82, 1.0]));
    box(g, M.gal, [2.27, .11, .06], [-1.215, .84, 1.0], .02);
    cyl(g, M.steel, .25, 1.0, [-3.07, .87, .98], 'x', 32); box(g, M.trim, [.05, .55, .5], [-3.4, .87, .98]); box(g, M.trim, [.05, .55, .5], [-2.75, .87, .98]);
    box(g, M.steel, [1.0, .55, .75], [1.3, .85, 0], .06);
    cyl(g, M.steel, .17, .8, [.4, .8, 0], 'x'); cyl(g, M.gal, .05, 6.0, [-2.6, .78, 0], 'x'); cyl(g, M.gal, .07, 3.5, [-.8, .65, .32], 'x');
    cyl(g, M.steel, .09, 2.1, [REAR_X, .5, 0], 'z'); box(g, M.steel, [.42, .36, .42], [REAR_X, .5, 0], .08);
    cyl(g, M.steel, .08, 2.0, [FRONT_X, .52, 0], 'z');
    [[REAR_X, .85], [REAR_X, -.85], [FRONT_X, .8], [FRONT_X, -.8]].forEach(([x, z]) => box(g, M.steel, [1.3, .06, .12], [x, .68, z]));
  });

  // Cab shell: one continuous pressed profile with a curved wheel opening.
  const cabProfile = new THREE.Shape();
  cabProfile.moveTo(.30, .86); cabProfile.lineTo(.32, 2.56);
  cabProfile.bezierCurveTo(.32, 2.80, .43, 2.88, .64, 2.89);
  cabProfile.bezierCurveTo(1.02, 2.92, 1.56, 2.94, 1.76, 2.87);
  cabProfile.bezierCurveTo(1.88, 2.82, 1.93, 2.67, 1.96, 2.51);
  cabProfile.bezierCurveTo(2.03, 2.22, 2.14, 1.99, 2.17, 1.72);
  cabProfile.bezierCurveTo(2.20, 1.47, 2.19, 1.14, 2.12, .94);
  cabProfile.quadraticCurveTo(2.10, .86, 1.98, .86); cabProfile.lineTo(1.46, .86);
  cabProfile.bezierCurveTo(1.43, 1.14, 1.18, 1.30, .80, 1.30);
  cabProfile.bezierCurveTo(.46, 1.30, .33, 1.10, .30, .86); cabProfile.closePath();
  const deflectorProfile = new THREE.Shape();
  deflectorProfile.moveTo(.38, 2.87); deflectorProfile.lineTo(.39, 3.27);
  deflectorProfile.bezierCurveTo(.39, 3.42, .47, 3.49, .64, 3.47);
  deflectorProfile.bezierCurveTo(1.14, 3.44, 1.59, 3.13, 1.85, 2.93);
  deflectorProfile.quadraticCurveTo(1.88, 2.88, 1.75, 2.86);
  deflectorProfile.lineTo(.38, 2.87); deflectorProfile.closePath();
  P.cab = part('cab', g => {
    curvedPanel(g, M.paint, cabProfile, 1.92, { bevel: .07, bow: .075, curve: 32 });
    curvedPanel(g, M.paint, deflectorProfile, 1.4, { bevel: .06, bow: .05, curve: 32 });
    // Windshield bowed across its width and raked into rounded A-pillars, with a dark surround.
    const ws = curvedPanel(g, M.glass, roundedPolygon([[-.82, -.36], [.82, -.36], [.78, .36], [-.78, .36]], .12), .02, { bevel: 0 });
    const frameWs = curvedPanel(g, M.trim, roundedPolygon([[-.87, -.4], [.87, -.4], [.83, .4], [-.83, .4]], .14), .012, { bevel: 0 });
    [[ws, .006], [frameWs, -.004]].forEach(([mesh, lift]) => {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { const u = pos.getX(i), v = pos.getY(i), d = pos.getZ(i); pos.setXYZ(i, 2.135 - v * .25 + .055 * (1 - (u / .88) ** 2) + d + lift, 2.35 + v, u); }
      mesh.geometry.computeVertexNormals();
    });
    [-1, 1].forEach(s => {
      curvedPanel(g, M.glass, roundedPolygon([[.63, 1.87], [1.82, 1.76], [1.74, 2.62], [.63, 2.67]], .12), .02, { bevel: 0 }).position.z = s * 1.04;
      const door = new THREE.Shape(); door.moveTo(.54, 1.85); door.lineTo(1.80, 1.73);
      door.quadraticCurveTo(1.95, 1.65, 1.92, 1.46); door.lineTo(1.85, .94); door.lineTo(1.50, .94);
      door.bezierCurveTo(1.40, 1.22, 1.16, 1.33, .80, 1.33); door.quadraticCurveTo(.58, 1.33, .54, 1.14); door.closePath();
      curvedPanel(g, M.paint, door, .03, { bevel: .008 }).position.z = s * 1.05;
      box(g, M.trim, [.2, .06, .05], [.79, 1.66, s * 1.085], .025);
      // Wheel-arch liner: a dark half-ring that gives the opening depth.
      const arch = new THREE.Mesh(new THREE.TorusGeometry(.62, .05, 10, 40, Math.PI), M.trim);
      arch.position.set(FRONT_X + .02, WR + .02, s * 1.02); g.add(arch);
      // Mirror: arm, bracket and a rounded head.
      cyl(g, M.trim, .018, .42, [1.74, 2.42, s * 1.27], 'z', 12);
      cyl(g, M.trim, .018, .5, [1.74, 2.2, s * 1.47], 'y', 12);
      box(g, M.trim, [.11, .56, .24], [1.76, 2.33, s * 1.56], .05);
      box(g, M.glass, [.02, .48, .18], [1.82, 2.33, s * 1.56], .02);
      box(g, M.steel, [.5, .06, .25], [.9, .78, s * 1.13], .02);
      // Headlamp: dark housing, clear lens; indicator below.
      box(g, M.trim, [.07, .32, .46], [2.15, 1.4, s * .72], .05);
      const lens = box(g, M.lightW, [.04, .24, .38], [2.18, 1.4, s * .72], .04);
      const sp = new THREE.Sprite(flareMat); lens.add(sp); flares.push(sp);
      box(g, M.lightA, [.04, .09, .2], [2.16, 1.05, s * .95], .02);
    });
    box(g, M.trim, [.05, .5, 1.1], [2.19, 1.4, 0], .03);
    for (let i = 0; i < 4; i++) box(g, M.gal, [.02, .025, 1.0], [2.215, 1.22 + i * .12, 0]);
    box(g, M.steel, [.3, .42, 2.12], [2.06, .95, 0], .1);
    [-.3, .3].forEach((z, i) => box(g, M.trim, [.02, .03, .75], [2.08 + i * .02, 2.2, z], 0, [.9, 0, -.5]));
  });

  // Wheels: revolved tyre with shoulders, dished steel rim, hub and nuts.
  const tyreProfile = [[.30, -.13], [.39, -.16], [.46, -.145], [.50, -.105], [WR, -.055], [WR, .055], [.50, .105], [.46, .145], [.39, .16], [.30, .13]].map(([a, b]) => new THREE.Vector2(a, b));
  const tyreGeo = new THREE.LatheGeometry(new THREE.SplineCurve(tyreProfile).getPoints(40), mobile ? 48 : 72);
  const rimGeo = new THREE.LatheGeometry([[.06, .17], [.12, .175], [.2, .15], [.27, .12], [.31, .16], [.315, .17], [.315, -.17], [.06, -.17]].map(([a, b]) => new THREE.Vector2(a, b)), mobile ? 32 : 48);
  part('wheels', g => {
    [[FRONT_X, .84], [FRONT_X, -.84], [REAR_X, .84], [REAR_X, -.84], [REAR_X, .47], [REAR_X, -.47]].forEach(([x, z]) => {
      const t = new THREE.Mesh(tyreGeo, M.tire); t.rotation.x = Math.PI / 2; t.position.set(x, WR, z); g.add(t);
      const r = new THREE.Mesh(rimGeo, M.rim); r.rotation.x = Math.sign(z) * Math.PI / 2; r.position.set(x, WR, z); g.add(r);
      cyl(g, M.steel, .09, .05, [x, WR, z + Math.sign(z) * .17], 'z', 24, .07);
      for (let b = 0; b < 8; b++) { const a = b * Math.PI / 4; cyl(g, M.gal, .022, .03, [x + Math.cos(a) * .19, WR + Math.sin(a) * .19, z + Math.sign(z) * .17], 'z', 10); }
    });
  });

  // ---- Cargo body: the only part that comes apart ----
  LINES = true;
  P.frame = part('frame', g => {
    [-1, 1].forEach(s => {
      // Far-side studs stay unlined so the scan reads as one clear frame, not a tangle.
      LINES = s === 1;
      for (let i = 0; i < 8; i++) box(g, M.frame, [.06, BH, .05], [BOX.x0 + .4 + i * 1.02, BYC, s * 1.12]);
      LINES = true;
      box(g, M.frame, [BL + .2, .13, .14], [BXC, 3.76, s * 1.18]);
      box(g, M.frame, [BL + .2, .12, .14], [BXC, 1.4, s * 1.18]);
      [BOX.x0 - .06, BOX.x1 + .12].forEach(x => box(g, M.frame, [.15, BH + .2, .15], [x, BYC + .05, s * 1.18], .03));
      LINES = false;
      box(g, M.lightR, [.07, .36, .12], [-8.06, 3.5, s * 1.1], .02);
      [-6.4, -3.6, -1.0].forEach(x => box(g, M.lightA, [.1, .06, .12], [x, 1.32, s * 1.22], .02));
      LINES = true;
    });
    for (let i = 0; i < 7; i++) box(g, M.frame, [.07, .07, 2.3], [BOX.x0 + .5 + i * 1.2, 3.74, 0]);
  }, [0, .25, 0], [0, 0, 0], .1);
  P.roof = part('roof', g => box(g, M.skin, [BL + .3, .06, 2.5], [BXC, 3.83, 0]), [0, 2.0, 0], [0, 0, .02], 0);
  [-1, 1].forEach(s => {
    const w = part('wall', g => {
      box(g, M.skin, [BL, BH, .05], [BXC, BYC, s * 1.175]);
      [3.02, 2.35].forEach(y => box(g, M.skinDark, [BL, .05, .03], [BXC, y, s * 1.2]));
      box(g, M.skinDark, [.05, BH, .03], [BOX.x0 + BL * .43, BYC, s * 1.2]);
    }, [0, .15, s * 2.5], [s * .03, 0, 0], .04);
    if (s === 1) P.wall = w;
  });
  part('front-wall', g => box(g, M.skin, [.05, BH, 2.35], [-.24, BYC, 0]), [0, 1.3, 0], [0, 0, 0], .08);
  [-1, 1].forEach(s => part('door', g => {
    box(g, M.skin, [.07, BH, 1.18], [-7.99, BYC, s * .6]);
    box(g, M.skinDark, [.05, .05, 1.1], [-8.04, 2.35, s * .6]); box(g, M.skinDark, [.05, .05, 1.1], [-8.04, 3.02, s * .6]);
    LINES = false; [1.75, 2.53, 3.3].forEach(y => box(g, M.trim, [.08, .22, .06], [-8.04, y, s * 1.12], .02)); box(g, M.trim, [.06, .45, .05], [-8.05, BYC, s * .1], .02); LINES = true;
  }, [-1.2, 0, s * .6], [0, s * 1.1, 0], .06, { pivot: [-7.99, BYC, s * 1.19] }));
  P.floor = part('floor', g => box(g, M.frame, [BL + .1, .1, 2.4], [BXC, BOX.y0 - .05, 0]), [0, -.55, 0], [0, 0, 0], .1);
  P.lift = part('tail-lift', g => {
    box(g, M.gal, [.07, 1.5, 2.15], [-8.34, 2.2, 0]); box(g, M.frame, [.4, .12, 2.1], [-8.2, 1.32, 0]);
    [-1, 1].forEach(s => { box(g, M.steel, [.1, 1.9, .1], [-8.25, 2.25, s * 1.12]); });
  }, [-2.1, -.2, 0], [0, 0, .22], .1);
  LINES = false;
  part('shelving', g => {
    [-1, 1].forEach(s => {
      [1.9, 2.4, 2.9, 3.4].forEach(y => box(g, M.gal, [6.7, .03, .42], [-4.15, y, s * .9]));
      for (let i = 0; i < 5; i++) [-1, 1].forEach(t => box(g, M.gal, [.04, 2.1, .04], [-7.5 + i * 1.675, 2.65, s * .9 + t * .19]));
      [1.9, 2.4, 2.9].forEach((y, li) => { for (let b = 0; b < 4; b++) { const w = .34 + ((b * 7 + li * 3) % 5) * .05, hh = .22 + ((b + li) % 3) * .07; box(g, M.card, [w, hh, .34], [-7.0 + b * 1.75, y + .015 + hh / 2, s * .9]); } });
    });
  }, [0, .55, 0], [0, 0, 0], .14);

  /* ---------- floor and soft contact shadow ---------- */
  const fa = document.createElement('canvas'); fa.width = fa.height = 256;
  { const c = fa.getContext('2d'), g = c.createRadialGradient(128, 128, 20, 128, 128, 126); g.addColorStop(0, '#fff'); g.addColorStop(.5, '#9a9a9a'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x080b0e, metalness: .1, roughness: .8, envMap: scene.environment, envMapIntensity: .06, transparent: true, alphaMap: new THREE.CanvasTexture(fa), depthWrite: false });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(-3.4, -.005, 0); floor.renderOrder = -1; scene.add(floor);
  const sh = document.createElement('canvas'); sh.width = sh.height = 256;
  { const c = sh.getContext('2d'), g = c.createRadialGradient(128, 128, 8, 128, 128, 126); g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(.55, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(-3.0, .006, 0); scene.add(shadow);

  /* ---------- labels: at most two per stage ---------- */
  const labels = [];
  const wv = new THREE.Vector3();
  const anchor = (p, lx, ly, lz) => () => { p.g.updateWorldMatrix(true, false); return wv.set(lx, ly, lz).applyMatrix4(p.g.matrixWorld); };
  function addLabel(zh, en, desc, get, from, to, second = false) {
    const el = document.createElement('div'); el.className = 'c3d r' + (second ? ' second' : '');
    el.innerHTML = `<i></i><span><b>${zh}</b><small>${en}</small><em>${desc}</em></span>`;
    labelsRoot.appendChild(el); labels.push({ el, get, from, to });
  }
  addLabel('廂骨', 'FRAME', '支撐外板的骨架', anchor(P.frame, -2.0, .4, 1.15), .205, .325);
  addLabel('頂板', 'ROOF', '車廂頂部板材', anchor(P.roof, 1.8, 0, .6), .375, .49);
  addLabel('側板', 'SIDE WALL', '外板配內骨架', anchor(P.wall, -2.6, .5, 0), .375, .49, true);
  addLabel('尾板', 'TAIL LIFT', '方便上落重貨', anchor(P.lift, 0, .3, .6), .49, .595);
  addLabel('地板', 'FLOOR', '承托貨物受力', anchor(P.floor, -1.5, 0, 1.0), .49, .595, true);

  /* ---------- rendering ---------- */
  const composer = mobile ? null : new EffectComposer(renderer);
  let bloom = null;
  if (composer) {
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, .5, .9);
    composer.addPass(bloom); composer.addPass(new OutputPass());
  }

  let W = 0, H = 0, fx = 0, fy = 0, fw = 0, fh = 0;
  const dprCap = mobile ? 1.25 : 1.6;
  function resize() {
    const sr = stage.getBoundingClientRect(), w = Math.max(2, Math.round(sr.width)), h = Math.max(2, Math.round(sr.height));
    let ox = 0, oy = 0, frw = w, frh = w * PHOTO.h / PHOTO.w;
    if (frameEl) { const fr = frameEl.getBoundingClientRect(); frw = fr.width; frh = fr.height; ox = sr.left - fr.left; oy = sr.top - fr.top; }
    if (w === W && h === H && ox === fx && oy === fy && frw === fw && frh === fh) return;
    W = w; H = h; fx = ox; fy = oy; fw = frw; fh = frh;
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); }
    camera.aspect = PHOTO.w / PHOTO.h;
    camera.setViewOffset(frw, frh, ox, oy, w, h); camera.updateProjectionMatrix();
  }

  const T0 = new THREE.Vector3(...PHOTO.target), C0 = new THREE.Vector3(...PHOTO.pos);
  const off0 = C0.clone().sub(T0), D0 = off0.length(), AZ0 = Math.atan2(off0.x, off0.z), EL0 = Math.asin(off0.y / D0);
  const hl = new THREE.Vector3(), target = new THREE.Vector3();
  let override = null;

  function timeline(p) {
    if (override) return override;
    const f1 = bump(range(p, .05, .118)), f2 = bump(range(p, .83, .925)) * .8;
    const w = smooth(range(p, .10, .20)) * (1 - smooth(range(p, .80, .90)));            // model visible
    const photo = 1 - smooth(range(p, .115, .205)) + smooth(range(p, .805, .895));     // real photo
    const scan = smooth(range(p, .20, .28)) * (1 - smooth(range(p, .66, .78)));        // structure lines
    const skin = 1 - .82 * smooth(range(p, .20, .28)) + .42 * smooth(range(p, .32, .42)) + .4 * smooth(range(p, .64, .76));
    const r = smooth(range(p, .30, .46)) * (1 - smooth(range(p, .58, .74)));          // cargo body apart
    const cam = smooth(range(p, .17, .44)) * (1 - smooth(range(p, .58, .84)));         // camera move, back to the photo pose
    return { photo: clamp(photo), flash: clamp(f1 + f2), w, scan, skin: clamp(skin), r, cam };
  }

  function draw(p) {
    resize();
    const s = timeline(p);
    for (const m of solids) if (m.emissive) m.emissiveIntensity = m.userData.emI * (1 + s.flash * 6);
    const so = s.skin;
    for (const m of skins) { m.opacity = so; m.depthWrite = so > .98; m.visible = so > .002; }
    lineMat.opacity = s.scan * (.8 - .3 * s.r);
    flareMat.opacity = clamp(s.flash * 1.15);
    flares.forEach(f => f.scale.set(lerp(.7, 5.6, s.flash), lerp(.22, 1.6, s.flash), 1));
    shadow.material.opacity = .6; floorMat.opacity = 1;
    for (const q of parts) {
      const local = ease(clamp((s.r - q.delay) / (1 - q.delay)));
      q.g.position.set(q.base.x + q.dir.x * local, q.base.y + q.dir.y * local, q.base.z + q.dir.z * local);
      q.g.rotation.set(q.rot.x * local, q.rot.y * local, q.rot.z * local);
    }
    // Camera: starts on the photo's pose, makes one slow move and returns to the same pose.
    const e = s.cam;
    const az = AZ0 + .3 * e, el = EL0 + .15 * e, dist = D0 * lerp(1, mobile ? 1.35 : 1.6, e);
    target.set(lerp(T0.x, -3.4, e), lerp(T0.y, 2.6, e), T0.z * (1 - e));
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(target);
    // On narrow screens zoom in only while the photo is hidden, then return to the aligned framing.
    const zoomTo = mobile && W < H ? 1.45 : 1;
    camera.zoom = lerp(1, zoomTo, e); camera.updateProjectionMatrix();
    root.updateMatrixWorld(true);
    if (composer && s.flash > .01) { bloom.strength = s.flash * 1.1; composer.render(); } else renderer.render(scene, camera);
    labels.forEach(l => {
      const v = l.get().clone().project(camera);
      const x = (v.x * .5 + .5) * W, y = (-v.y * .5 + .5) * H;
      l.el.classList.toggle('l', x > W * .55); l.el.classList.toggle('r', x <= W * .55);
      l.el.style.opacity = v.z < 1 ? win(p, l.from, l.to).toFixed(3) : 0;
      l.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    });
    flares[0].getWorldPosition(hl); const a = hl.clone(); flares[1].getWorldPosition(hl); a.add(hl).multiplyScalar(.5); a.project(camera);
    return { model: s.w, photo: s.photo, bg: s.w, flash: s.flash, fx: (a.x * .5 + .5) * 100, fy: (-a.y * .5 + .5) * 100 };
  }

  return {
    render: p => draw(p),
    setOverride: o => { override = o; },
    resize
  };
}
