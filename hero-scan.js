/* Scroll-driven "engineering scan" over the hero truck photo.
   All coordinates are in the photo's own pixel space (1672×941), measured from images/truck-film-first-frame.webp. */
(() => {
  'use strict';
  const W = 1672, H = 941;
  const A = [290, 200], B = [968, 154], C = [968, 558], D = [290, 496], E = [1186, 189];
  const hL = D[1] - A[1], hR = C[1] - B[1];
  const lerp = (a, b, t) => a + (b - a) * t;
  // Perspective-correct x for a point at fraction u along the box side (0 = rear, 1 = front).
  const px = u => { const w0 = (1 - u) * hL, w1 = u * hR; return (w0 * A[0] + w1 * B[0]) / (w0 + w1); };
  const yAt = (p, q, x) => lerp(p[1], q[1], (x - p[0]) / (q[0] - p[0]));
  const seam = f => [[A[0], A[1] + f * hL], [B[0], B[1] + f * hR]];
  const pt = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  const line = (p, q, cls) => `<line class="${cls}" x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/>`;

  function wires() {
    // Hidden far side of the box: front depth vector B→E, shortened at the rear by the perspective ratio.
    const dF = [E[0] - B[0], E[1] - B[1]], k = hL / hR, dR = [dF[0] * k, dF[1] * k];
    const A2 = [A[0] + dR[0], A[1] + dR[1]], D2 = [D[0] + dR[0], D[1] + dR[1]], C2 = [C[0] + dF[0], C[1] + dF[1]];
    let s = `<polyline class="w w-far" points="${[A2, E].map(pt).join(' ')}"/><polyline class="w w-far" points="${[A2, D2, C2, E].map(pt).join(' ')}"/>`;
    s += line(A, A2, 'w w-far') + line(D, D2, 'w w-far') + line(C, C2, 'w w-far');
    s += `<polygon class="w w-edge" points="${[A, B, C, D].map(pt).join(' ')}"/>`;
    s += `<polyline class="w w-edge" points="${[B, E, [E[0], 212]].map(pt).join(' ')}"/>`;
    const rails = [0.325, 0.568].map(seam);
    for (let i = 1; i < 10; i++) {
      const x = px(i / 10), top = [x, yAt(A, B, x)], bot = [x, yAt(D, C, x)];
      s += line(top, bot, 'w w-stud');
      s += line(bot, [x, bot[1] + 16], 'w w-member');
      [top, ...rails.map(([p, q]) => [x, yAt(p, q, x)])].forEach(r => { s += `<circle class="rivet" cx="${r[0].toFixed(1)}" cy="${r[1].toFixed(1)}" r="2"/>`; });
    }
    rails.forEach(([p, q]) => { s += line(p, q, 'w w-rail'); });
    const [fp, fq] = seam(0.946); s += line(fp, fq, 'w w-floor');
    const joints = [A, B, C, D, E, ...[0.325, 0.568].flatMap(f => seam(f))];
    joints.forEach((p, i) => { s += `<circle class="joint" style="--d:${(i * .37 % 1.6).toFixed(2)}s" cx="${p[0]}" cy="${p[1].toFixed(1)}" r="5"/>`; });
    // Deterministic particle field inside the box face.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) {
      const u = rnd(), v = rnd(), x = px(u), y = lerp(yAt(A, B, x), yAt(D, C, x), v);
      s += `<circle class="dust" style="--d:${(rnd() * 3).toFixed(2)}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.2 + rnd() * 1.8).toFixed(1)}"/>`;
    }
    return s;
  }

  function dims() {
    const off = 44, a = [A[0], A[1] - off], b = [B[0], B[1] - off];
    let s = line([A[0], A[1] - 8], [a[0], a[1] - 10], 'dim-ext') + line([B[0], B[1] - 8], [b[0], b[1] - 10], 'dim-ext');
    s += `<path class="dim" pathLength="1" d="M${pt(a)} L${pt(b)}"/>`;
    s += line([a[0], a[1] - 9], [a[0], a[1] + 9], 'dim-tick') + line([b[0], b[1] - 9], [b[0], b[1] + 9], 'dim-tick');
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI, mid = [lerp(a[0], b[0], .5), lerp(a[1], b[1], .5) - 14];
    s += `<text class="dim-label" transform="translate(${pt(mid)}) rotate(${ang.toFixed(2)})">LENGTH / 車廂長度</text>`;
    const hx = 238;
    s += line([A[0] - 10, A[1]], [hx - 10, A[1]], 'dim-ext') + line([D[0] - 10, D[1]], [hx - 10, D[1]], 'dim-ext');
    s += `<path class="dim" pathLength="1" d="M${hx},${A[1]} L${hx},${D[1]}"/>`;
    s += line([hx - 9, A[1]], [hx + 9, A[1]], 'dim-tick') + line([hx - 9, D[1]], [hx + 9, D[1]], 'dim-tick');
    s += `<text class="dim-label" transform="translate(${hx - 16},${lerp(A[1], D[1], .5)}) rotate(-90)">HEIGHT / 高度</text>`;
    return s;
  }

  const boxClip = [A, B, E, [E[0], 212], [985, 212], [985, C[1]], C, D]
    .map(p => `${(p[0] / W * 100).toFixed(2)}% ${(p[1] / H * 100).toFixed(2)}%`).join(',');

  window.createWingkoHeroScan = (root) => {
    const frame = root.querySelector('.truck-frame');
    if (!frame) return null;
    root.querySelector('.hero-wires').innerHTML = wires();
    root.querySelector('.hero-dims').innerHTML = dims();
    root.querySelector('.xray-box').style.clipPath = `polygon(${boxClip})`;
    const clamp = v => Math.max(0, Math.min(1, v));
    const range = (p, a, b) => clamp((p - a) / (b - a));
    const smooth = t => t * t * (3 - 2 * t);
    let unit = 1;
    const measure = () => { unit = W / Math.max(1, frame.getBoundingClientRect().width / (parseFloat(frame.dataset.push) || 1)); root.style.setProperty('--u', unit.toFixed(3)); };
    addEventListener('resize', measure, { passive: true });
    measure();

    return {
      render(p) {
        const push = 1 + .04 * smooth(range(p, 0, .12)) + .26 * smooth(range(p, .36, .56)) - .30 * smooth(range(p, .64, .84));
        const scan = smooth(range(p, .12, .34));
        const beam = range(p, .11, .14) * (1 - range(p, .32, .36));
        const xray = 1 - smooth(range(p, .64, .80));
        const dim = smooth(range(p, .36, .52));
        frame.dataset.push = push.toFixed(4);
        frame.style.transform = `translate(-50%,-50%) scale(${push.toFixed(4)})`;
        root.style.setProperty('--scan-x', scan > 0 ? ((.14 + .74 * scan) * 100).toFixed(2) + '%' : '0%');
        root.style.setProperty('--beam', beam.toFixed(3));
        root.style.setProperty('--xray', xray.toFixed(3));
        root.style.setProperty('--dims', (dim * xray).toFixed(3));
      }
    };
  };
})();
