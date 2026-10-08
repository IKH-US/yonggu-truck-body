/* Scroll-driven 3D truck: real photo → glowing wireframe → exploded parts → reassembled → real photo.
   Camera and proportions are aligned to images/truck-film-first-frame.webp.
   Curved bodywork is an illustrative reconstruction from that image, not a measured CAD model.
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
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Photo-solved camera (truck frame) and the photo's own aspect ratio. */
const PHOTO = { w: 1672, h: 941, fov: 23.9, pos: [9.478, 2.667, 12.308], target: [-1.228, 1.738, 1.2] };

/* Measured truck dimensions. */
const BOX = { x0: -7.96, x1: -0.20, y0: 1.386, y1: 3.686 }, BL = BOX.x1 - BOX.x0, BH = BOX.y1 - BOX.y0;
const BXC = (BOX.x0 + BOX.x1) / 2, BYC = (BOX.y0 + BOX.y1) / 2;
const FRONT_X = .79, REAR_X = -5.71, WR = .51;

export function createHero3D({ stage, canvas, labelsRoot, frameEl }) {
  const rnd = mulberry32(20260930);
  const mobile = matchMedia('(max-width: 900px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  const camera = new THREE.PerspectiveCamera(PHOTO.fov, PHOTO.w / PHOTO.h, 0.5, 200);
  const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(9, 14, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(0x58e0ff, .8); rim.position.set(-12, 7, -10); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xa9c4d8, .35); fill.position.set(-6, 3, 12); scene.add(fill);

  /* ---------- materials ---------- */
  const solids = [];
  const mat = (o, ghost = .1) => {
    const m = (o.clearcoat ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o));
    m.userData = { ghost, col: new THREE.Color(o.color), em: new THREE.Color(o.emissive || 0x000000), emI: o.emissiveIntensity ?? 1 };
    m.transparent = true; m.depthWrite = false;
    solids.push(m); return m;
  };
  const M = {
    alu: mat({ color: 0xd3dadc, metalness: .55, roughness: .33 }),
    aluDark: mat({ color: 0x9aa4a7, metalness: .6, roughness: .4 }),
    paint: mat({ color: 0xe4e8ea, metalness: .25, roughness: .3, clearcoat: .7, clearcoatRoughness: .25 }),
    steel: mat({ color: 0x2a3033, metalness: .7, roughness: .5 }),
    tire: mat({ color: 0x14181a, metalness: .05, roughness: .92 }, .14),
    rim: mat({ color: 0xbfc6ca, metalness: .92, roughness: .28 }),
    glass: mat({ color: 0x0c1a1d, metalness: .9, roughness: .08 }, .07),
    gal: mat({ color: 0xa2acaf, metalness: .7, roughness: .6 }),
    card: mat({ color: 0xb9ab8c, metalness: 0, roughness: .85 }),
    dark: mat({ color: 0x101416, metalness: .4, roughness: .55 }),
    lightW: mat({ color: 0xffffff, emissive: 0xbfeaff, emissiveIntensity: 1.2, metalness: 0, roughness: .2 }, .2),
    lightR: mat({ color: 0xff3b30, emissive: 0xff2a1c, emissiveIntensity: 1.1, metalness: 0, roughness: .3 }, .2),
    lightA: mat({ color: 0xffa11a, emissive: 0xff8a00, emissiveIntensity: .9, metalness: 0, roughness: .3 }, .2)
  };
  const GHOST_COL = new THREE.Color(0x15293a), GHOST_EM = new THREE.Color(0x183e58);
  const lineMat = (c, blending = THREE.AdditiveBlending) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0, blending, depthWrite: false, toneMapped: false });
  const wireMat = lineMat(new THREE.Color(.72, 1.45, 2.45));
  const accentMat = lineMat(new THREE.Color(.95, 1.9, .38));
  const boundsMat = lineMat(new THREE.Color(.42, .7, 1.05));
  const gridMat = lineMat(new THREE.Color(.3, .5, .75));

  /* ---------- geometry helpers ---------- */
  const edgeCache = new Map();
  const boxEdges = (w, h, d) => { const k = [w, h, d].map(v => v.toFixed(3)).join(); let g = edgeCache.get(k); if (!g) { g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)); edgeCache.set(k, g); } return g; };
  const withEdges = (mesh, edgesGeo, lm = wireMat) => { mesh.add(new THREE.LineSegments(edgesGeo, lm)); return mesh; };
  // Draw manufactured contours, never the triangulation of a curved surface.
  const contour = (parent, points, closed = false) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const line = closed ? new THREE.LineLoop(geometry, wireMat) : new THREE.Line(geometry, wireMat);
    parent.add(line); return line;
  };
  const roundRect = (w, h, r) => {
    const points = [];
    [[w/2-r,h/2-r,0],[-w/2+r,h/2-r,90],[-w/2+r,-h/2+r,180],[w/2-r,-h/2+r,270]].forEach(([x,y,deg]) => {
      for(let i=0;i<=10;i++){const a=(deg+i*9)*Math.PI/180;points.push([x+r*Math.cos(a),y+r*Math.sin(a)]);}
    });
    return points;
  };
  function roundedContours(mesh,w,h,d,r) {
    // These six paths follow the actual flat-face/fillet boundaries of RoundedBoxGeometry.
    for(const side of [-1,1]) {
      contour(mesh,roundRect(w,h,r).map(([x,y])=>[x,y,side*(d/2-r)]),true);
      contour(mesh,roundRect(w,d,r).map(([x,z])=>[x,side*(h/2-r),z]),true);
      contour(mesh,roundRect(d,h,r).map(([z,y])=>[side*(w/2-r),y,z]),true);
    }
  }
  const box = (g, m, [w, h, d], [x, y, z], r = 0, rot) => {
    const radius = Math.max(0, Math.min(r, Math.min(w,h,d)/2-.002));
    const geo = radius > 0 ? new RoundedBoxGeometry(w,h,d,5,radius) : new THREE.BoxGeometry(w,h,d);
    const mesh = new THREE.Mesh(geo,m);
    if(radius>0) roundedContours(mesh,w,h,d,radius); else withEdges(mesh,boxEdges(w,h,d));
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    g.add(mesh); return mesh;
  };
  const cyl = (g, m, r, len, [x, y, z], axis = 'y', seg = 64) => {
    seg = Math.max(64,seg);
    const geo = new THREE.CylinderGeometry(r, r, len, seg);
    const mesh = new THREE.Mesh(geo,m);
    [-1,1].forEach(side=>contour(mesh,Array.from({length:64},(_,i)=>{const a=i*Math.PI/32;return [r*Math.cos(a),side*len/2,r*Math.sin(a)];}),true));
    mesh.position.set(x, y, z);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2; if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    g.add(mesh); return mesh;
  };
  const quad = (g, m, p0, p1, p2, p3) => {
    const geo = new THREE.BufferGeometry(); const v = [...p0, ...p1, ...p2, ...p0, ...p2, ...p3];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals();
    const mm = m.clone(); mm.side = THREE.DoubleSide; mm.userData = m.userData; mm.transparent = true; mm.depthWrite = false; solids.push(mm);
    const mesh = new THREE.Mesh(geo, mm);
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p1, ...p2, ...p2, ...p3, ...p3, ...p0], 3));
    mesh.add(new THREE.LineSegments(eg, wireMat)); g.add(mesh); return mesh;
  };
  const extrude = (g, m, pts, depth, bevel = .05) => {
    const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
    geo.translate(0, 0, -depth / 2);
    const mesh = withEdges(new THREE.Mesh(geo, m), new THREE.EdgesGeometry(geo, 35)); g.add(mesh); return mesh;
  };
  function curvedPanel(g,m,shape,depth,{bevel=.025,bow=0}={}) {
    const geo = new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:6,curveSegments:24});
    geo.translate(0,0,-depth/2);
    const warp=(x,z)=>x+bow*Math.max(0,1-Math.pow(z/(depth/2+bevel),2))*smooth(clamp((x-.9)/1.3));
    const attr=geo.attributes.position;
    for(let i=0;i<attr.count;i++)attr.setX(i,warp(attr.getX(i),attr.getZ(i)));
    geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,m);g.add(mesh);
    const pts=shape.getPoints(28);
    [-1,1].forEach(side=>{const z=side*depth/2;contour(mesh,pts.map(p=>[warp(p.x,z),p.y,z]),true);});
    // A few cross-body seams show the curved front without exposing tessellation edges.
    if(depth>.5) [0,.25,.5,.75].forEach(f=>{
      const p=shape.getPoint(f);
      contour(mesh,Array.from({length:33},(_,i)=>{const z=depth*(i/32-.5);return [warp(p.x,z),p.y,z];}));
    });
    return mesh;
  }
  function roundedPolygon(points,r=.07) {
    const shape=new THREE.Shape();
    points.forEach((p,i)=>{
      const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
      const a=Math.min(r,Math.hypot(prev[0]-p[0],prev[1]-p[1])*.3),b=Math.min(r,Math.hypot(next[0]-p[0],next[1]-p[1])*.3);
      const la=Math.hypot(prev[0]-p[0],prev[1]-p[1]),lb=Math.hypot(next[0]-p[0],next[1]-p[1]);
      const q=[p[0]+(prev[0]-p[0])*a/la,p[1]+(prev[1]-p[1])*a/la];
      if(i===0)shape.moveTo(...q);else shape.lineTo(...q);
      shape.quadraticCurveTo(...p,p[0]+(next[0]-p[0])*b/lb,p[1]+(next[1]-p[1])*b/lb);
    });
    shape.closePath();return shape;
  }

  /* headlight flare sprites */
  const flareTexture = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    const r = x.createRadialGradient(128, 32, 0, 128, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(150,225,255,.8)'); r.addColorStop(1, 'rgba(60,160,255,0)'); x.fillStyle = r; x.fillRect(0, 0, 256, 64);
    const h = x.createLinearGradient(0, 0, 256, 0); h.addColorStop(0, 'rgba(90,190,255,0)'); h.addColorStop(.5, 'rgba(210,245,255,.95)'); h.addColorStop(1, 'rgba(90,190,255,0)'); x.fillStyle = h; x.fillRect(0, 30, 256, 4); return new THREE.CanvasTexture(c); };
  const flares = [], flareMat = new THREE.SpriteMaterial({ map: flareTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });

  /* ---------- parts ---------- */
  const root = new THREE.Group(); scene.add(root);
  const parts = [];
  const tmpBox = new THREE.Box3(), tmpC = new THREE.Vector3();
  const SPREAD = 1.3;
  function part(name, build, dir, rot = [0, 0, 0], delay = 0, opts = {}) {
    const g = new THREE.Group(); g.name = name; build(g);
    let c;
    if (opts.pivot) c = new THREE.Vector3(...opts.pivot); else { tmpBox.setFromObject(g); tmpBox.getCenter(tmpC); c = tmpC.clone(); }
    g.children.forEach(ch => ch.position.sub(c)); g.position.copy(c);
    root.add(g);
    const p = { name, g, base: c.clone(), dir: new THREE.Vector3(...dir).multiplyScalar(opts.raw ? 1 : SPREAD), rot: new THREE.Vector3(...rot), delay, phase: rnd() * 6.28, amp: opts.amp ?? .05 };
    parts.push(p); return p;
  }
  const P = {}; const reg = (k, p) => (P[k] = p, p);

  // Chassis & underbody
  [-1, 1].forEach(s => part('rail', g => box(g, M.steel, [9.7, .2, .11], [-3.0, .93, s * .56]), [0, -1.6, s * .7], [0, 0, 0], .15));
  for (let i = 0; i < 10; i++) part('xm', g => box(g, M.steel, [.1, .12, 2.1], [-7.7 + i * .78, 1.24, 0]), [(i - 5) * .16, -1.2 - (i % 3) * .2, 0], [0, 0, .12 * (i % 2 ? 1 : -1)], .05 + i * .01);
  reg('floor', part('floor', g => box(g, M.alu, [BL + .1, .1, 2.4], [BXC, BOX.y0 - .05, 0]), [0, -.7, 0], [0, 0, 0], .2));
  // Under-run guards, fuel tank
  part('bar-low', g => { box(g, M.aluDark, [4.41, .11, .06], [-2.285, .6, 1.0]); [-4.4, -2.3, -.3].forEach(x => box(g, M.aluDark, [.06, .55, .05], [x, .82, 1.0])); }, [0, -1.0, 1.7], [0, 0, 0], .1);
  part('bar-up', g => box(g, M.aluDark, [2.27, .11, .06], [-1.215, .84, 1.0]), [0, -.6, 1.9], [0, 0, 0], .12);
  part('fuel-tank', g => { cyl(g, M.steel, .25, 1.0, [-3.07, .87, .98], 'x', 20); box(g, M.dark, [.05, .55, .5], [-3.4, .87, .98]); box(g, M.dark, [.05, .55, .5], [-2.75, .87, .98]); }, [.3, -1.3, 1.9], [.3, 0, 0], .13);

  // Cargo box: walls, frame, roof
  [-1, 1].forEach(s => {
    const wall = part('wall', g => {
      box(g, M.alu, [BL, BH, .05], [BXC, BYC, s * 1.175]);
      [3.02, 2.35].forEach(y => box(g, M.aluDark, [BL, .05, .03], [BXC, y, s * 1.2]));
      [BOX.x0 + BL * .43].forEach(x => box(g, M.aluDark, [.05, BH, .03], [x, BYC, s * 1.2]));
    }, [0, .3, s * 3.4], [s * .05, 0, 0], 0);
    if (s === 1) reg('wall', wall);
    part('studs', g => { for (let i = 0; i < 8; i++) box(g, M.gal, [.06, BH, .05], [BOX.x0 + .4 + i * 1.02, BYC, s * 1.12]); }, [0, .2, s * 2.0], [0, 0, 0], .08);
    part('rail-top', g => box(g, M.aluDark, [BL + .2, .13, .14], [BXC, 3.76, s * 1.18]), [0, 1.9, s * 1.6], [0, 0, s * .1], .12);
    part('rail-bot', g => box(g, M.aluDark, [BL + .2, .12, .14], [BXC, 1.4, s * 1.18]), [0, -.5, s * 1.9], [0, 0, 0], .14);
    [BOX.x0 - .06, BOX.x1 + .12].forEach((x, i) => part('post', g => box(g, M.aluDark, [.15, BH + .2, .15], [x, BYC + .05, s * 1.18], .05), [i ? 1.6 : -1.6, .4, s * 1.7], [0, 0, 0], .1));
  });
  reg('roof', part('roof', g => box(g, M.alu, [BL + .3, .06, 2.5], [BXC, 3.83, 0]), [0, 2.3, 0], [.05, .09, .04], .02));
  for (let i = 0; i < 7; i++) part('bow', g => box(g, M.gal, [.07, .07, 2.3], [BOX.x0 + .5 + i * 1.2, 3.74, 0]), [(i - 3) * .4, 1.7 + (i % 2) * .3, 0], [0, .08 * (i - 3), 0], .1 + i * .015);
  part('front-wall', g => box(g, M.alu, [.05, BH, 2.35], [-.24, BYC, 0]), [-.6, 1.2, 0], [0, 0, .12], .14);
  // Rear doors (swing around their hinges)
  [-1, 1].forEach(s => {
    const hinge = [-7.99, BYC, s * 1.19];
    part('door', g => {
      box(g, M.alu, [.07, BH, 1.18], [-7.99, BYC, s * .6]);
      box(g, M.aluDark, [.05, .05, 1.1], [-8.04, 2.35, s * .6]); box(g, M.aluDark, [.05, .05, 1.1], [-8.04, 3.02, s * .6]);
      box(g, M.dark, [.06, .45, .05], [-8.05, BYC, s * .1]);
    }, [-2.4, .3, s * 2.0], [0, s * 1.25, 0], .04, { pivot: hinge, amp: .03 });
  });
  // Tail lift
  reg('lift', part('lift-plate', g => { box(g, M.gal, [.07, 1.5, 2.15], [-8.34, 2.2, 0]); box(g, M.aluDark, [.4, .12, 2.1], [-8.2, 1.32, 0]); }, [-2.6, -.4, 0], [0, 0, .3], .1));
  [-1, 1].forEach(s => {
    part('lift-post', g => box(g, M.steel, [.1, 1.9, .1], [-8.25, 2.25, s * 1.12]), [-1.6, -.7, s * .9], [0, 0, .4], .1);
    part('lift-cyl', g => cyl(g, M.gal, .045, 1.2, [-8.22, 1.9, s * .75], 'y'), [-1.3, -1.1, s * .5], [0, 0, -.6], .1);
  });
  // Shelving & cargo
  const shelfYs = [1.9, 2.4, 2.9, 3.4];
  [-1, 1].forEach(s => {
    const sh = part('shelf', g => {
      shelfYs.forEach(y => box(g, M.gal, [6.7, .03, .42], [-4.15, y, s * .9]));
      for (let i = 0; i < 5; i++) [-1, 1].forEach(t => box(g, M.gal, [.04, 2.1, .04], [-7.5 + i * 1.675, 2.65, s * .9 + t * .19]));
    }, [0, .1, s * .6], [0, 0, 0], .06, { amp: .04 });
    if (s === 1) reg('shelf', sh);
    shelfYs.slice(0, 3).forEach((y, li) => { for (let b = 0; b < 4; b++) {
      const w = .34 + rnd() * .24, h = .22 + rnd() * .2, d = .3 + rnd() * .08, x = -7.0 + b * 1.75 + (rnd() - .5) * .2;
      part('cargo', g => box(g, M.card, [w, h, d], [x, y + .015 + h / 2, s * .9]), [(rnd() - .5) * 2.0, .7 + rnd() * 1.0, s * (.5 + rnd() * 1.0)], [rnd() - .5, rnd() - .5, rnd() - .5], .15 + rnd() * .2, { amp: .09 });
    } });
  });

  // Continuous pressed-metal cab profile, including a real curved wheel opening.
  const cabProfile=new THREE.Shape();
  cabProfile.moveTo(.30,.86);cabProfile.lineTo(.32,2.56);
  cabProfile.bezierCurveTo(.32,2.80,.43,2.88,.64,2.89);
  cabProfile.bezierCurveTo(1.02,2.92,1.56,2.94,1.76,2.87);
  cabProfile.bezierCurveTo(1.88,2.82,1.93,2.67,1.96,2.51);
  cabProfile.bezierCurveTo(2.03,2.22,2.14,1.99,2.17,1.72);
  cabProfile.bezierCurveTo(2.20,1.47,2.19,1.14,2.12,.94);
  cabProfile.quadraticCurveTo(2.10,.86,1.98,.86);cabProfile.lineTo(1.40,.86);
  cabProfile.bezierCurveTo(1.37,1.09,1.16,1.22,.81,1.22);
  cabProfile.bezierCurveTo(.50,1.22,.33,1.08,.30,.86);cabProfile.closePath();
  reg('cab', part('cab', g => curvedPanel(g,M.paint,cabProfile,1.92,{bevel:.045,bow:.075}), [2.2, 1.8, 0], [0, 0, -.1], .12));
  const deflectorProfile=new THREE.Shape();
  deflectorProfile.moveTo(.38,2.87);deflectorProfile.lineTo(.39,3.27);
  deflectorProfile.bezierCurveTo(.39,3.42,.47,3.49,.64,3.47);
  deflectorProfile.bezierCurveTo(1.14,3.44,1.59,3.13,1.85,2.93);
  deflectorProfile.quadraticCurveTo(1.88,2.88,1.75,2.86);
  deflectorProfile.lineTo(.38,2.87);deflectorProfile.closePath();
  part('deflector', g => curvedPanel(g,M.paint,deflectorProfile,1.4,{bevel:.055,bow:.05}), [.4, 2.9, 0], [0, 0, -.2], .16);
  part('windshield', g => {
    const shape=roundedPolygon([[-.82,-.36],[.82,-.36],[.78,.36],[-.78,.36]],.11);
    const mesh=curvedPanel(g,M.glass,shape,.025,{bevel:0});
    // Bow the glazing across its width and rake it into the rounded A pillars.
    mesh.traverse(o=>{if(!o.geometry)return;const p=o.geometry.attributes.position;
      for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i),d=p.getZ(i);p.setXYZ(i,2.12-v*.25+.055*(1-(u/.84)**2)+d,2.35+v,u);}
      o.geometry.computeVertexNormals();
    });
  }, [3.0, 2.6, 0], [0, 0, -.2], .14);
  [-1, 1].forEach(s => {
    part('side-window', g => {
      const mesh=curvedPanel(g,M.glass,roundedPolygon([[.63,1.87],[1.82,1.76],[1.74,2.62],[.63,2.67]],.12),.025,{bevel:0});
      mesh.position.z=s*1.035;
    }, [.5, .6, s * 2.5], [0, 0, 0], .1);
    part('door-lower', g => {
      const shape=new THREE.Shape();shape.moveTo(.54,1.85);shape.lineTo(1.80,1.73);
      shape.quadraticCurveTo(1.95,1.65,1.92,1.46);shape.lineTo(1.85,.94);shape.lineTo(1.44,.94);
      shape.bezierCurveTo(1.34,1.20,1.14,1.27,.80,1.27);shape.quadraticCurveTo(.58,1.27,.54,1.14);shape.closePath();
      curvedPanel(g,M.paint,shape,.03,{bevel:.006}).position.z=s*1.05;
      box(g,M.dark,[.2,.065,.05],[.79,1.66,s*1.085],.022);
      // Wheel-arch lip follows the tyre rather than outlining a rectangle over it.
      contour(g,Array.from({length:49},(_,i)=>{const a=.15+(Math.PI-.3)*i/48;return [FRONT_X+.64*Math.cos(a),WR+.64*Math.sin(a),s*1.073];}));
    }, [.7, .35, s * 2.9], [0, s * .12, 0], .08);
    part('mirror', g => { box(g, M.dark, [.05, .05, .5], [1.75, 2.4, s * 1.28]); box(g, M.dark, [.1, .58, .22], [1.75, 2.35, s * 1.56], .03); }, [1.8, .8, s * 2.3], [0, 0, 0], .13);
    part('step', g => box(g, M.steel, [.5, .06, .25], [.9, .78, s * 1.13]), [.3, -1.2, s * 1.6], [0, 0, 0], .14);
    part('headlight', g => { const h = box(g, M.lightW, [.06, .28, .42], [2.17, 1.4, s * .72], .02); const sp = new THREE.Sprite(flareMat); sp.userData.isFlare = true; h.add(sp); flares.push(sp); }, [3.4, .5, s * .8], [0, s * .3, 0], .1, { amp: .04 });
    part('signal', g => box(g, M.lightA, [.05, .1, .2], [2.15, 1.05, s * .95], .01), [2.9, .1, s * 1.8], [0, 0, 0], .16, { amp: .06 });
  });
  part('grille', g => box(g, M.dark, [.05, .5, 1.1], [2.19, 1.4, 0], .01), [3.3, .4, 0], [0, 0, 0], .1);
  part('bumper', g => box(g, M.steel, [.3, .42, 2.12], [2.06, .95, 0], .08), [2.9, -.5, 0], [0, 0, 0], .12);
  [-.3, .3].forEach((z, i) => part('wiper', g => box(g, M.dark, [.02, .03, .75], [2.08 + i * .02, 2.2, z], 0, [.9, 0, -.5]), [2.4, 3.0 + i * .3, z * 2], [.4, 0, .5], .18, { amp: .07 }));
  // Drivetrain
  part('engine', g => { box(g, M.steel, [1.0, .55, .75], [1.3, .85, 0], .06); [1.0, 1.2, 1.4, 1.6].forEach(x => cyl(g, M.gal, .1, .28, [x, 1.22, 0])); }, [1.9, -.8, 0], [0, 0, .15], .1);
  part('gearbox', g => cyl(g, M.steel, .17, .8, [.4, .8, 0], 'x'), [.4, -1.3, 0], [0, .2, 0], .12);
  part('driveshaft', g => cyl(g, M.gal, .05, 6.0, [-2.6, .78, 0], 'x'), [-.4, -1.6, 0], [0, .3, 0], .1);
  part('exhaust', g => cyl(g, M.gal, .07, 3.5, [-.8, .65, .32], 'x'), [.5, -1.4, 1.0], [0, .25, 0], .14);
  part('rear-axle', g => { cyl(g, M.steel, .09, 2.1, [REAR_X, .5, 0], 'z'); box(g, M.steel, [.42, .36, .42], [REAR_X, .5, 0], .08); }, [0, -1.5, 0], [0, 0, 0], .1);
  part('front-axle', g => cyl(g, M.steel, .08, 2.0, [FRONT_X, .52, 0], 'z'), [1.3, -1.3, 0], [0, 0, 0], .1);
  [[REAR_X, .85], [REAR_X, -.85], [FRONT_X, .8], [FRONT_X, -.8]].forEach(([x, z]) => part('spring', g => box(g, M.steel, [1.3, .06, .12], [x, .68, z]), [0, -1.1, z > 0 ? .6 : -.6], [0, 0, 0], .12));
  // Wheels
  [[FRONT_X, .84, 1], [FRONT_X, -.84, 1], [REAR_X, .84, 1], [REAR_X, -.84, 1], [REAR_X, .47, .6], [REAR_X, -.47, .6]].forEach(([x, z, k], i) => {
    part('wheel', g => {
      // Revolved tyre shoulder and rounded bead: smooth silhouette at any camera angle.
      const profile=[new THREE.Vector2(.30,-.13),new THREE.Vector2(.39,-.16),new THREE.Vector2(.46,-.145),new THREE.Vector2(.50,-.105),new THREE.Vector2(WR,-.055),new THREE.Vector2(WR,.055),new THREE.Vector2(.50,.105),new THREE.Vector2(.46,.145),new THREE.Vector2(.39,.16),new THREE.Vector2(.30,.13)];
      const path=new THREE.SplineCurve(profile);
      const tireGeo=new THREE.LatheGeometry(path.getPoints(40),96);
      const tire=new THREE.Mesh(tireGeo,M.tire);tire.rotation.x=Math.PI/2;tire.position.set(x,WR,z);g.add(tire);
      const ring=(radius,offset)=>contour(g,Array.from({length:96},(_,i)=>{const a=i*Math.PI/48;return [x+radius*Math.cos(a),WR+radius*Math.sin(a),z+offset];}),true);
      ring(WR,0);[-1,1].forEach(side=>{ring(.46,side*.145);ring(.32,side*.163);});
      cyl(g,M.rim,.31,.30,[x,WR,z],'z');cyl(g,M.steel,.105,.34,[x,WR,z],'z');
      for(let b=0;b<8;b++) {
        const a=b*Math.PI/4;
        const lug=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,.025,12),M.gal);
        lug.rotation.x=Math.PI/2;lug.position.set(x+Math.cos(a)*.20,WR+Math.sin(a)*.20,z+Math.sign(z)*.17);g.add(lug);
        // Circular ventilation apertures belong on the visible rim face only.
        const cx=x+Math.cos(a)*.245,cy=WR+Math.sin(a)*.245;
        contour(g,Array.from({length:24},(_,j)=>{const t=j*Math.PI/12;return [cx+.037*Math.cos(t),cy+.037*Math.sin(t),z+Math.sign(z)*.166];}),true);
      }
    }, [(x > 0 ? 1.2 : -.8), -.05, Math.sign(z) * (2.5 * k)], [0, 0, Math.sign(z) * 1.6], .1 + i * .015, { amp: .05 });
  });

  // Small hardware at its real position, then flung outward
  const centre = new THREE.Vector3(-3.4, 2.0, 0);
  const smalls = [];
  const addSmall = (mk, x, y, z) => smalls.push([mk, x, y, z]);
  [-1, 1].forEach(s => {
    [1.75, 2.53, 3.3].forEach(y => addSmall(g => box(g, M.dark, [.08, .22, .06], [-8.04, y, s * 1.2], .01), -8.04, y, s * 1.2));
    addSmall(g => box(g, M.lightR, [.07, .36, .12], [-8.06, 3.5, s * 1.1], .015), -8.06, 3.5, s * 1.1);
    [-6.4, -3.6, -1.0].forEach(x => addSmall(g => box(g, M.lightA, [.1, .06, .12], [x, 1.32, s * 1.22], .01), x, 1.32, s * 1.22));
    addSmall(g => box(g, M.lightA, [.08, .05, .1], [-.2, 3.8, s * .8], .01), -.2, 3.8, s * .8);
  });
  for (let i = 0; i < 12; i++) { const x = -7.8 + rnd() * 7.4, y = 1.5 + rnd() * 2.1, z = (rnd() > .5 ? 1 : -1) * 1.25; addSmall(g => cyl(g, M.gal, .03, .12, [x, y, z], 'z', 10), x, y, z); }
  for (let i = 0; i < 8; i++) { const x = -7.4 + rnd() * 6.4, z = (rnd() - .5) * 1.9; addSmall(g => box(g, M.steel, [.16, .1, .13], [x, 1.14, z], .01), x, 1.14, z); }
  smalls.forEach(([mk, x, y, z]) => {
    const d = new THREE.Vector3(x, y, z).sub(centre); d.y += .8; d.normalize().multiplyScalar(1.6 + rnd() * 2.6);
    part('small', g => mk(g), [d.x, d.y, d.z], [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2], rnd() * .3, { amp: .1, raw: true });
  });

  /* ---------- floor, shadow, bounds ---------- */
  const fa = document.createElement('canvas'); fa.width = fa.height = 256;
  { const c = fa.getContext('2d'), g = c.createRadialGradient(128, 128, 20, 128, 128, 126); g.addColorStop(0, '#fff'); g.addColorStop(.5, '#9a9a9a'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x070a0e, metalness: 0, roughness: 1, envMap: scene.environment, envMapIntensity: .05, transparent: true, alphaMap: new THREE.CanvasTexture(fa), depthWrite: false });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(34, 72), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(-3.4, -.005, 0); floor.renderOrder = -1; scene.add(floor);
  const sh = document.createElement('canvas'); sh.width = sh.height = 256;
  { const c = sh.getContext('2d'), g = c.createRadialGradient(128, 128, 8, 128, 128, 126); g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(.6, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(-3.0, .006, 0); scene.add(shadow);

  const B = { x0: -12.0, x1: 5.6, y0: 0, y1: 6.4, z0: -4.8, z1: 4.8 };
  const bounds = new THREE.Group(); scene.add(bounds);
  {
    const v = [], c = [[B.x0, B.y0, B.z0], [B.x1, B.y0, B.z0], [B.x1, B.y0, B.z1], [B.x0, B.y0, B.z1], [B.x0, B.y1, B.z0], [B.x1, B.y1, B.z0], [B.x1, B.y1, B.z1], [B.x0, B.y1, B.z1]];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => v.push(...c[a], ...c[b]));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); bounds.add(new THREE.LineSegments(g, boundsMat));
    const gv = [], step = 1.0;
    for (let x = B.x0; x <= B.x1 + .01; x += step) gv.push(x, 0, B.z0, x, 0, B.z1, x, 0, B.z0, x, B.y1, B.z0);
    for (let z = B.z0; z <= B.z1 + .01; z += step) gv.push(B.x0, 0, z, B.x1, 0, z, B.x0, 0, z, B.x0, B.y1, z);
    for (let y = 0; y <= B.y1 + .01; y += step) gv.push(B.x0, y, B.z0, B.x1, y, B.z0, B.x0, y, B.z0, B.x0, y, B.z1);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3)); bounds.add(new THREE.LineSegments(gg, gridMat));
    const tk = [];
    for (let x = B.x0; x <= B.x1 + .01; x += .5) tk.push(x, 0, B.z1, x, 0, B.z1 + (Math.round((x - B.x0) / .5) % 5 === 0 ? .4 : .2));
    for (let y = 0; y <= B.y1 + .01; y += .5) tk.push(B.x1, y, B.z1, B.x1 + (Math.round(y / .5) % 5 === 0 ? .4 : .2), y, B.z1 + (Math.round(y / .5) % 5 === 0 ? .4 : .2));
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tk, 3)); bounds.add(new THREE.LineSegments(tg, accentMat));
  }

  /* ---------- callouts & dimension labels (DOM) ---------- */
  const labels = [];
  const LABEL_DESC = {
    'ROOF': '頂部板材及骨架',
    'SIDE WALL': '外板配內骨架',
    'TAIL LIFT': '方便上落重貨',
    'SHELVING': '按貨物分層',
    'CAB': '配合車架尺寸',
    'FLOOR': '承托貨物受力'
  };
  function addLabel(en, zh, side, get, cls = '') {
    const el = document.createElement('div'); el.className = 'c3d ' + cls + ' ' + side; el.innerHTML = `<i></i><span><b>${zh}</b><small>${en}</small>${LABEL_DESC[en] ? `<em>${LABEL_DESC[en]}</em>` : ''}</span>`;
    labelsRoot.appendChild(el); labels.push({ el, get });
  }
  const wv = new THREE.Vector3();
  const anchor = (p, lx, ly, lz) => () => { p.g.updateWorldMatrix(true, false); return wv.set(lx, ly, lz).applyMatrix4(p.g.matrixWorld); };
  addLabel('ROOF', '頂板', 'r', anchor(P.roof, 2.2, 0, .5));
  addLabel('SIDE WALL', '側板', 'r', anchor(P.wall, -3.0, .9, 0));
  addLabel('TAIL LIFT', '尾板', 'l', anchor(P.lift, 0, .3, .8));
  addLabel('SHELVING', '貨架', 'l', anchor(P.shelf, 2.4, .5, 0));
  addLabel('CAB', '駕駛室', 'r', anchor(P.cab, .3, .8, .9));
  addLabel('FLOOR', '地板', 'r', anchor(P.floor, 0, 0, .8));

  /* ---------- composer ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .5, .55, 1.4);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  let W = 0, H = 0, fx = 0, fy = 0, fw = 0, fh = 0, lastP = 0;
  const dprCap = mobile ? 1.15 : 1.5;
  function resize() {
    const sr = stage.getBoundingClientRect(), w = Math.max(2, Math.round(sr.width)), h = Math.max(2, Math.round(sr.height));
    let ox = 0, oy = 0, frw = w, frh = w * PHOTO.h / PHOTO.w;
    if (frameEl) { const fr = frameEl.getBoundingClientRect(); frw = fr.width; frh = fr.height; ox = sr.left - fr.left; oy = sr.top - fr.top; }
    if (w === W && h === H && ox === fx && oy === fy && frw === fw && frh === fh) return;
    W = w; H = h; fx = ox; fy = oy; fw = frw; fh = frh;
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h);
    camera.aspect = PHOTO.w / PHOTO.h;
    camera.setViewOffset(frw, frh, ox, oy, w, h); camera.updateProjectionMatrix();
  }

  const T0 = new THREE.Vector3(...PHOTO.target), C0 = new THREE.Vector3(...PHOTO.pos);
  const off0 = C0.clone().sub(T0), D0 = off0.length(), AZ0 = Math.atan2(off0.x, off0.z), EL0 = Math.asin(off0.y / D0);
  const hl = new THREE.Vector3(), target = new THREE.Vector3();
  let timeOverride = null, override = null;

  function timeline(p) {
    if (override) return override;
    const f1 = bump(range(p, .05, .118)), f2 = bump(range(p, .83, .925)) * .8;
    const w = smooth(range(p, .10, .22)) * (1 - smooth(range(p, .78, .90)));
    const photo = 1 - smooth(range(p, .115, .215)) + smooth(range(p, .795, .895));
    const r = range(p, .17, .43) - range(p, .585, .835);
    const dm = smooth(range(p, .30, .40)) * (1 - smooth(range(p, .60, .68)));
    // Tuned 2026-10-07: less bloom and thinner lines, more translucent body fill, faint bounds grid.
    return { photo: clamp(photo), flash: clamp(f1 + f2), w, r: clamp(r), dm, ghostK: 2.6, wireK: .5, bloomK: .42, boundsK: .25 };
  }

  function draw(p, t) {
    lastP = p; resize();
    const s = timeline(p), time = (timeOverride ?? t);
    for (const m of solids) {
      const u = m.userData, op = s.w * u.ghost * (s.ghostK ?? 1);
      m.opacity = op; m.visible = op > .002;
      m.color.lerpColors(u.col, GHOST_COL, .9);
      m.emissive.lerpColors(u.em, GHOST_EM, .6); m.emissiveIntensity = u.emI * (1 + s.flash * 5);
    }
    wireMat.opacity = clamp(s.w * .6 * (s.wireK ?? 1)); accentMat.opacity = clamp(s.w * s.dm + s.w * .12); boundsMat.opacity = s.dm * .85 * (s.boundsK ?? 1); gridMat.opacity = s.dm * .5 * (s.boundsK ?? 1);
    flareMat.opacity = clamp(s.flash * 1.15);
    flares.forEach(f => f.scale.set(lerp(.7, 5.6, s.flash), lerp(.22, 1.6, s.flash), 1));
    shadow.material.opacity = s.w * .5; floorMat.opacity = s.w;
    for (const q of parts) {
      const local = ease(clamp((s.r - q.delay * .45) / (1 - q.delay * .45)));
      const fl = Math.sin(time * .9 + q.phase) * q.amp * local;
      q.g.position.set(q.base.x + q.dir.x * local, q.base.y + q.dir.y * local + fl, q.base.z + q.dir.z * local);
      q.g.rotation.set(q.rot.x * local + fl * .25, q.rot.y * local + Math.cos(time * .6 + q.phase) * .06 * local, q.rot.z * local);
    }
    // camera: starts exactly on the photo's pose and returns to it
    const e = smooth(s.r);
    const az = AZ0 + .42 * smooth(range(p, .2, .55)) - .42 * smooth(range(p, .55, .9)) + Math.sin(time * .25) * .02 * e;
    const el = EL0 + .2 * e, dist = D0 * lerp(1, 1.95, e);
    target.set(lerp(T0.x, -3.4, e), lerp(T0.y, 3.0, e), T0.z * (1 - e));
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(target);
    bloom.strength = (.3 + s.w * .3) * (s.bloomK ?? 1) + s.flash * 1.3; bloom.radius = .55; bloom.threshold = 1.4;
    root.updateMatrixWorld(true);
    composer.render();
    const vis = clamp(range(p, .34, .40) * (1 - range(p, .60, .66)));
    labels.forEach(l => {
      const v = l.get().clone().project(camera);
      const x = (v.x * .5 + .5) * W, y = (-v.y * .5 + .5) * H;
      l.el.classList.toggle('l', x < W * .5); l.el.style.opacity = v.z < 1 ? vis.toFixed(3) : 0; l.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    });
    flares[0].getWorldPosition(hl); const a = hl.clone(); flares[1].getWorldPosition(hl); a.add(hl).multiplyScalar(.5); a.project(camera);
    return { photo: s.photo, bg: s.w, flash: s.flash, fx: (a.x * .5 + .5) * 100, fy: (-a.y * .5 + .5) * 100 };
  }

  let raf = 0, visible = true;
  function loop(t) { raf = 0; if (visible && !document.hidden && !window.__heroInstant) { if (timeline(lastP).r > .03) draw(lastP, t * .001); raf = requestAnimationFrame(loop); } }
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); });
  io.observe(stage);
  raf = requestAnimationFrame(loop);

  return {
    render: p => draw(p, performance.now() * .001),
    setTime: t => { timeOverride = t; },
    setOverride: o => { override = o; },
    resize
  };
}
