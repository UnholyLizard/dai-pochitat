// Contact sheet of rendered frames. usage: node sheet.cjs <framesDir> <out.jpg> [--from F] [--to F] [--step N] [--cols C] [--width W] [--pad 5]
//   frames are f00000.jpg (stage) or f0000.jpg (footage); tiles frames from, from+step, … up to `to`
const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const dir = process.argv[2], out = process.argv[3];
const files = fs.readdirSync(dir).filter((f) => /^f\d+\.jpg$/.test(f)).sort();
const pad = files[0].length - 5;
const last = +files[files.length - 1].slice(1, -4);
const from = +arg('from', 0), to = Math.min(+arg('to', last), last), step = +arg('step', 60), cols = +arg('cols', 6), width = +arg('width', 320);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));
let n = 0;
for (let f = from; f <= to; f += step) { const src = path.join(dir, `f${String(f).padStart(pad, '0')}.jpg`); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, `s${String(n++).padStart(4, '0')}.jpg`)); }
let FF = path.join(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'); if (!fs.existsSync(FF)) FF = FF.slice(0, -4);
execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(tmp, 's%04d.jpg'), '-vf', `scale=${width}:-1,tile=${cols}x${Math.ceil(n / cols)}:padding=4:color=0x2b1b12`, '-frames:v', '1', '-q:v', '4', out]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${n} frames (${from}..${to} step ${step}) -> ${out}`);
