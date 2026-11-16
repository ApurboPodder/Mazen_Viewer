const fs = require('node:fs/promises');
const path = require('node:path');
const rhino3dm = require('rhino3dm');

const OUT = path.resolve(__dirname, '..', 'MAZEN-Eyewear-Organic.3dm');
const tau = Math.PI * 2;

async function main() {
  const r = await rhino3dm();
  const file = new r.File3dm();
  file.applicationName = 'MAZEN Viewer';
  file.applicationDetails = 'Approximate eyewear model built from a single product reference image.';
  const layers = {};
  const layerDefs = [
    ['Sculpted warm ivory frame', { r: 191, g: 180, b: 151, a: 255 }],
    ['Smoked lenses', { r: 31, g: 29, b: 26, a: 255 }],
    ['Frame hinge details', { r: 142, g: 132, b: 108, a: 255 }]
  ];
  for (const [name, color] of layerDefs) {
    const layer = new r.Layer();
    layer.name = name;
    layer.color = color;
    layers[name] = file.layers().add(layer);
  }

  function addMesh(name, layerName, vertices, faces) {
    const mesh = new r.Mesh();
    const vl = mesh.vertices();
    for (const p of vertices) vl.add(p[0], p[1], p[2]);
    const fl = mesh.faces();
    for (const f of faces) {
      if (f.length === 3) fl.addTriFace(f[0], f[1], f[2]);
      else fl.addQuadFace(f[0], f[1], f[2], f[3]);
    }
    mesh.compact();
    const attr = new r.ObjectAttributes();
    attr.name = name;
    attr.layerIndex = layers[layerName];
    file.objects().addMesh(mesh, attr);
  }

  function sweepTube(name, layerName, points, radius, sides = 8, taper = null) {
    const verts = [], faces = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      let t = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]];
      const tl = Math.hypot(...t) || 1; t = t.map(v => v / tl);
      let n = Math.abs(t[2]) < 0.88 ? [-t[1], t[0], 0] : [0, -t[2], t[1]];
      const nl = Math.hypot(...n) || 1; n = n.map(v => v / nl);
      const b = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
      const u = i / (points.length - 1);
      const rr = radius * (taper ? taper(u) : 1);
      for (let j = 0; j < sides; j++) {
        const a = tau * j / sides;
        verts.push([p[0] + rr * (n[0] * Math.cos(a) + b[0] * Math.sin(a)), p[1] + rr * (n[1] * Math.cos(a) + b[1] * Math.sin(a)), p[2] + rr * (n[2] * Math.cos(a) + b[2] * Math.sin(a))]);
      }
    }
    for (let i = 0; i < points.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides;
      faces.push([a, b, b + sides, a + sides]);
    }
    faces.push(Array.from({ length: sides }, (_, j) => sides - 1 - j));
    const end = (points.length - 1) * sides;
    faces.push(Array.from({ length: sides }, (_, j) => end + j));
    addMesh(name, layerName, verts, faces);
  }

  function ellipseOutline(cx, rx, rz, count, y, offset = 0) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = tau * i / count;
      const x = cx + (rx + offset) * Math.cos(a);
      const z = (rz + offset) * Math.sin(a) - 1.5 * Math.cos(a) ** 2;
      out.push([x, y, z]);
    }
    return out;
  }

  function frameRing(cx, name) {
    const n = 64, outerFront = ellipseOutline(cx, 28.5, 25, n, -4.0, 3.0);
    const innerFront = ellipseOutline(cx, 28.5, 25, n, -4.0, -2.7);
    const outerBack = ellipseOutline(cx, 28.5, 25, n, 2.0, 3.0);
    const innerBack = ellipseOutline(cx, 28.5, 25, n, 2.0, -2.7);
    const verts = [...outerFront, ...innerFront, ...outerBack, ...innerBack];
    const faces = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([i, j, n + j, n + i]);
      faces.push([2 * n + i, 3 * n + i, 3 * n + j, 2 * n + j]);
      faces.push([i, 2 * n + i, 2 * n + j, j]);
      faces.push([n + i, n + j, 3 * n + j, 3 * n + i]);
    }
    addMesh(name, 'Sculpted warm ivory frame', verts, faces);
  }

  function lens(cx, name) {
    const n = 64, rings = 12, verts = [], faces = [];
    const y0 = -0.2, y1 = 0.9;
    for (const y of [y0, y1]) {
      verts.push([cx, y, -1.5]);
      for (let ring = 1; ring <= rings; ring++) {
        const s = ring / rings;
        for (let j = 0; j < n; j++) {
          const a = tau * j / n;
          verts.push([cx + 26.0 * s * Math.cos(a), y, -1.5 + 22.2 * s * Math.sin(a) - 1.2 * Math.cos(a) ** 2 * s]);
        }
      }
    }
    const layerSize = 1 + rings * n;
    for (let side = 0; side < 2; side++) {
      const base = side * layerSize;
      for (let j = 0; j < n; j++) faces.push([base, base + 1 + j, base + 1 + (j + 1) % n]);
      for (let k = 0; k < rings - 1; k++) {
        const inner = base + 1 + k * n, outer = inner + n;
        for (let j = 0; j < n; j++) faces.push([inner + j, outer + j, outer + (j + 1) % n, inner + (j + 1) % n]);
      }
    }
    for (let j = 0; j < n; j++) {
      const edge0 = 1 + (rings - 1) * n + j, edge1 = 1 + (rings - 1) * n + (j + 1) % n;
      faces.push([edge0, edge1, layerSize + edge1, layerSize + edge0]);
    }
    addMesh(name, 'Smoked lenses', verts, faces);
  }

  // Rounded, slightly cat-eye lens rims and deep smoked inserts.
  frameRing(-31.5, 'Left sculpted eye rim');
  frameRing(31.5, 'Right sculpted eye rim');
  lens(-31.5, 'Left smoked lens');
  lens(31.5, 'Right smoked lens');

  // Substantial arched bridge and central nose pads.
  const bridge = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    bridge.push([-6 + 12 * t, -4.2 - 1.2 * Math.sin(Math.PI * t), 1 + 5.0 * Math.sin(Math.PI * t)]);
  }
  sweepTube('Sculpted arched bridge', 'Sculpted warm ivory frame', bridge, 3.4, 12);
  for (const sign of [-1, 1]) {
    const pad = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pad.push([sign * (7.5 + 1.0 * Math.sin(Math.PI * t)), -1.5 - 2.3 * t, -15 + 3.0 * t]);
    }
    sweepTube(`${sign < 0 ? 'Left' : 'Right'} nose support`, 'Sculpted warm ivory frame', pad, 1.45, 8, u => 1 - 0.35 * u);
  }

  // Hinge blocks and two tapered temples with branching openwork webs.
  for (const sign of [-1, 1]) {
    const x0 = sign * 63;
    const hinge = [[x0, -1, 1], [x0 + sign * 2, 2, 1], [x0 + sign * 2, 8, 1], [x0, 10, 1]];
    sweepTube(`${sign < 0 ? 'Left' : 'Right'} temple hinge`, 'Frame hinge details', hinge, 3.0, 10);
    const main = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      main.push([sign * (63 + 5 * t), 5 + 104 * t, 0.5 + 10 * Math.sin(Math.PI * t * 0.72) - 8 * Math.max(0, t - 0.73)]);
    }
    sweepTube(`${sign < 0 ? 'Left' : 'Right'} sweeping temple`, 'Sculpted warm ivory frame', main, 3.0, 10, u => 1 - 0.48 * u);
    for (let branch = 0; branch < 4; branch++) {
      const start = 0.08 + branch * 0.16;
      const end = Math.min(0.98, start + 0.34);
      const rail = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12, t = start + (end - start) * u;
        const spread = (branch % 2 === 0 ? -1 : 1) * Math.sin(Math.PI * u) * (2 + branch * 0.4);
        rail.push([sign * (63 + 5 * t + spread), 5 + 104 * t, 0.5 + 10 * Math.sin(Math.PI * t * 0.72) - 8 * Math.max(0, t - 0.73) + (branch - 1.5) * 4.2 * Math.sin(Math.PI * u)]);
      }
      sweepTube(`${sign < 0 ? 'Left' : 'Right'} openwork branch ${branch + 1}`, 'Sculpted warm ivory frame', rail, 1.65, 7, u => 0.95 - 0.25 * Math.sin(Math.PI * u));
    }
  }

  const bytes = file.toByteArray();
  await fs.writeFile(OUT, Buffer.from(bytes));
  file.destroy();
  console.log(`Wrote ${OUT} (${bytes.length} bytes)`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
