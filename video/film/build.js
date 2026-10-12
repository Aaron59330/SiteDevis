/* Assemble le film : accélère les passages longs de chaque scène, recale les repères sonores, écrit timeline.js et la liste d'images.
   Usage : node build.js DOSSIER_FRAMES SORTIE_DIR   (SORTIE_DIR reçoit concat.txt et timeline.js) */
const fs = require('fs'), path = require('path');
const [src, out] = [process.argv[2], process.argv[3]];
const { frames, cues, marks } = JSON.parse(fs.readFileSync(path.join(src, 'timeline.json'), 'utf8'));
// durée visée par scène (secondes) : intro, puis chaque légende, puis l'outro
const TARGET = { intro: 4.6, '01': 5, '02': 4.6, '03': 12.5, '04': 9.5, '05': 4.2, '06': 8, '07': 6, '08': 5, '09': 5.6, outro: 6 };
const w0 = frames[0].wall, ts0 = frames[0].ts, end = frames[frames.length - 1].ts - ts0 + 0.5;
const vt = w => w - w0;
const bounds = [{ name: 'intro', t: 0 }, ...marks.map(m => ({ name: m.name === 'outro' ? 'outro' : m.name.slice(0, 2), t: vt(m.wall) }))];
bounds.push({ name: 'end', t: end });
const seg = []; let acc = 0;
for (let i = 0; i < bounds.length - 1; i++) {
  const len = bounds[i + 1].t - bounds[i].t, tg = TARGET[bounds[i].name] || len, f = Math.max(1, len / tg);
  seg.push({ a: bounds[i].t, b: bounds[i + 1].t, f, base: acc, name: bounds[i].name }); acc += len / f;
}
const T = v => { const s = seg.find(s => v < s.b) || seg[seg.length - 1]; return s.base + (Math.min(v, s.b) - s.a) / s.f; };
console.log(seg.map(s => `${s.name}: ${(s.b - s.a).toFixed(1)}s ÷${s.f.toFixed(2)}`).join(' | '), '=> total', acc.toFixed(1), 's');
let list = '';
frames.forEach((f, i) => { const a = T(f.ts - ts0), b = i + 1 < frames.length ? T(frames[i + 1].ts - ts0) : acc; list += `file '${path.join(src, 'f' + String(i).padStart(6, '0') + '.jpg')}'\nduration ${Math.max(0.001, b - a).toFixed(4)}\n`; });
list += `file '${path.join(src, 'f' + String(frames.length - 1).padStart(6, '0') + '.jpg')}'\n`;
fs.writeFileSync(path.join(out, 'concat.txt'), list);
const R = x => +T(vt(x)).toFixed(3), map = {};
for (const k of Object.keys(cues)) map[k] = cues[k].map(c => Array.isArray(c) ? [R(c[0]), R(c[1])] : R(c));
map.duration = Math.round(acc * 10) / 10 + 0.5;
fs.writeFileSync(path.join(out, 'timeline.js'), 'const CUES = ' + JSON.stringify(map, null, 1) + ';\n');
console.log('durée finale', map.duration);
