// Stable, diff-friendly JSON for sequence files: short flat objects/arrays stay on one line
// (a camera key, a segment, a caption's line list), everything else is indented two spaces.
const WIDTH = 140;

function isFlat(v) {
  if (v === null || typeof v !== 'object') return true;
  return Object.values(v).every((x) => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((y) => y === null || typeof y !== 'object')));
}

function inline(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return v.length ? `[${v.map(inline).join(', ')}]` : '[]';
  const keys = Object.keys(v).filter((k) => v[k] !== undefined);
  return keys.length ? `{ ${keys.map((k) => `${JSON.stringify(k)}: ${inline(v[k])}`).join(', ')} }` : '{}';
}

function format(v, ind = '') {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const one = inline(v);
  if (isFlat(v) && ind.length + one.length <= WIDTH) return one;
  const next = ind + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[\n${v.map((x) => next + format(x, next)).join(',\n')}\n${ind}]`;
  }
  const keys = Object.keys(v).filter((k) => v[k] !== undefined);
  if (!keys.length) return '{}';
  return `{\n${keys.map((k) => `${next}${JSON.stringify(k)}: ${format(v[k], next)}`).join(',\n')}\n${ind}}`;
}

module.exports = { format: (v) => format(v) + '\n' };
