// Data the stage needs besides itself: footage meta (per shot), the mosaic stills and the sequence.
// Shared by render.cjs (injects it into the page) and the editor server (serves it to the live preview).
const fs = require('fs');
const path = require('path');

const SP = path.resolve(__dirname, '..');
const DEFAULT_SEQ = path.join(SP, 'stage', 'sequence.json');

// per shot: frames (scrollY, mouse, button), cursor window, clicks, drags, viewport and measured data
function loadMeta(dir = path.join(SP, 'footage')) {
  const META = {};
  if (!fs.existsSync(dir)) return META;   // stage-only previews (title / end card) work before any capture
  for (const shot of fs.readdirSync(dir)) {
    const f = path.join(dir, shot, 'meta.json');
    if (fs.existsSync(f)) {
      const m = JSON.parse(fs.readFileSync(f, 'utf8'));
      META[shot] = { fps: m.fps || 60, frames: m.frames, cursor: m.cursor, clicks: m.clicks, drags: m.drags, vp: m.vp, data: m.data };
    }
  }
  return META;
}

// mosaic stills of a work (a stage folder: stage/, stage-instagram/, …), as URLs relative to its stage.html
function listMosaic(stageDir = path.join(SP, 'stage')) {
  const dir = path.join(stageDir, 'assets', 'mosaic');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => `assets/mosaic/${f}`) : [];
}

function loadSequence(file = DEFAULT_SEQ) {
  const seq = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!seq || typeof seq !== 'object' || !String(seq.format || '').startsWith('stage-sequence/')) {
    throw new Error(`${file}: not a stage sequence (expected "format": "stage-sequence/1")`);
  }
  return seq;
}

// the stage folder for a sequence: --stage wins, else the sequence's own folder if it holds a stage.html, else stage/
function stageDirFor(seqFile, explicit) {
  if (explicit) return path.resolve(explicit);
  const own = path.dirname(path.resolve(seqFile));
  return fs.existsSync(path.join(own, 'stage.html')) ? own : path.join(SP, 'stage');
}
// the canvas a sequence renders on ("canvas": { "w", "h" }; 1920×1080 when absent)
const canvasOf = (seq) => ({ w: (seq.canvas && +seq.canvas.w) || 1920, h: (seq.canvas && +seq.canvas.h) || 1080 });

module.exports = { SP, DEFAULT_SEQ, loadMeta, listMosaic, loadSequence, stageDirFor, canvasOf };
