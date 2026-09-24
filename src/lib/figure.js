import { readTokens } from './theme';

// Exported figures: a caption (title, the two authors, legend), the chart
// body, and a source line. Everything is described as a list of primitives so
// the same layout renders to a PNG (canvas) or an SVG.

const PAD = 36;
const SCALE = 2;

// An off-screen element carrying the light theme, so exports never inherit
// dark mode. Charts that need real DOM (Chart.js, vis-network) render inside.
export function lightStage(width, height) {
  const stage = document.createElement('div');
  stage.className = 'theme-light';
  Object.assign(stage.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
  });
  document.body.appendChild(stage);
  return { stage, tokens: readTokens(stage), remove: () => stage.remove() };
}

export function lightTokens() {
  const { tokens, remove } = lightStage(1, 1);
  remove();
  return tokens;
}

const family = (stack) => stack || 'sans-serif';
const fontString = (text) =>
  `${text.weight || 400} ${text.size}px ${family(text.font)}`;

let measurer;
function measure(text) {
  measurer = measurer || document.createElement('canvas').getContext('2d');
  measurer.font = fontString(text);
  return measurer.measureText(text.text).width;
}

const today = () =>
  new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

// Lays out the caption around a body of bodyWidth × bodyHeight and returns
// the primitives plus the body's origin.
export function frame({
  tokens: t,
  title,
  authors,
  legend = [],
  bodyWidth,
  bodyHeight,
}) {
  const prims = [];
  const width = bodyWidth + PAD * 2;
  const sans = t.sans;
  let y = PAD + 22;
  prims.push({
    type: 'text',
    x: PAD,
    y,
    text: title,
    size: 24,
    weight: 600,
    font: t.serif,
    fill: t.ink,
  });
  y += 26;
  prims.push({
    type: 'runs',
    x: PAD,
    y,
    size: 15,
    font: sans,
    runs: [
      { text: authors[0], fill: t.a, weight: 600 },
      { text: '  vs  ', fill: t.ink3 },
      { text: authors[1], fill: t.b, weight: 600 },
    ],
  });
  if (legend.length) {
    y += 28;
    prims.push({
      type: 'legend',
      x: PAD,
      y,
      size: 13,
      font: sans,
      fill: t.ink2,
      items: legend,
    });
  }
  y += 22;
  const body = { x: PAD, y };
  y += bodyHeight + 30;
  prims.push({
    type: 'rect',
    x: PAD,
    y: y - 16,
    w: bodyWidth,
    h: 1,
    fill: t.rule,
  });
  prims.push({
    type: 'text',
    x: PAD,
    y: y + 2,
    size: 12,
    font: sans,
    fill: t.ink3,
    text: `Data: OpenAlex · Made with SciPair, scipair.github.io · ${today()}`,
  });
  const height = y + PAD - 10;
  return {
    width,
    height,
    body,
    prims: [
      { type: 'rect', x: 0, y: 0, w: width, h: height, fill: t.surface },
      ...prims,
    ],
  };
}

function legendLayout(prim) {
  let x = prim.x;
  return prim.items.map((item) => {
    const at = x;
    x += 16 + measure({ ...prim, text: item.label }) + 20;
    return { ...item, x: at };
  });
}

function runsLayout(prim) {
  let x = prim.x;
  return prim.runs.map((run) => {
    const at = x;
    x += measure({ ...prim, ...run });
    return { ...run, x: at };
  });
}

export function toCanvas({ width, height, prims }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * SCALE);
  canvas.height = Math.round(height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';
  const text = (item, x, y, fill, align = 'left') => {
    ctx.font = fontString(item);
    ctx.fillStyle = fill;
    ctx.textAlign = align;
    ctx.fillText(item.text, x, y);
  };
  prims.forEach((p) => {
    if (p.type === 'rect') {
      ctx.fillStyle = p.fill;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    } else if (p.type === 'text') {
      text(p, p.x, p.y, p.fill, p.align);
    } else if (p.type === 'runs') {
      runsLayout(p).forEach((run) =>
        text({ ...p, ...run }, run.x, p.y, run.fill),
      );
    } else if (p.type === 'legend') {
      legendLayout(p).forEach((item) => {
        const [left, right] = item.colors || [item.color, item.color];
        ctx.fillStyle = left;
        ctx.fillRect(item.x, p.y - 9, 5, 10);
        ctx.fillStyle = right;
        ctx.fillRect(item.x + 5, p.y - 9, 5, 10);
        text({ ...p, text: item.label }, item.x + 16, p.y, p.fill);
      });
    } else if (p.type === 'image') {
      ctx.drawImage(p.image, p.x, p.y, p.w, p.h);
    }
  });
  return canvas;
}

const escape = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const svgFont = (p, run = {}) =>
  `font-family="${escape(family(p.font))}" font-size="${p.size}" font-weight="${run.weight || p.weight || 400}"`;

const r = (value) => Math.round(value * 10) / 10;

export function toSvg({ width, height, prims }) {
  const anchor = { left: 'start', center: 'middle', right: 'end' };
  const body = prims
    .map((p) => {
      if (p.type === 'rect')
        return `<rect x="${r(p.x)}" y="${r(p.y)}" width="${r(p.w)}" height="${r(p.h)}" fill="${p.fill}"/>`;
      if (p.type === 'text')
        return `<text x="${r(p.x)}" y="${r(p.y)}" ${svgFont(p)} fill="${p.fill}" text-anchor="${anchor[p.align || 'left']}">${escape(p.text)}</text>`;
      if (p.type === 'runs')
        return runsLayout(p)
          .map(
            (run) =>
              `<text x="${r(run.x)}" y="${r(p.y)}" ${svgFont(p, run)} fill="${run.fill}" xml:space="preserve">${escape(run.text)}</text>`,
          )
          .join('');
      if (p.type === 'legend')
        return legendLayout(p)
          .map(
            (item) =>
              (item.colors || [item.color, item.color])
                .map(
                  (fill, half) =>
                    `<rect x="${r(item.x + half * 5)}" y="${r(p.y - 9)}" width="5" height="10" fill="${fill}"/>`,
                )
                .join('') +
              `<text x="${r(item.x + 16)}" y="${r(p.y)}" ${svgFont(p)} fill="${p.fill}">${escape(item.label)}</text>`,
          )
          .join('');
      return '';
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  ${body}\n</svg>\n`;
}

const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const figureName = (names, title, ext) =>
  `scipair-${slug(names.join(' '))}-${slug(title)}.${ext}`;

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: filename,
  });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function savePng(figure, filename) {
  const canvas = toCanvas(figure);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  save(blob, filename);
}

export function saveSvg(figure, filename) {
  save(new Blob([toSvg(figure)], { type: 'image/svg+xml' }), filename);
}

// Canvas text only uses web fonts that have finished loading.
export async function fontsReady(tokens) {
  if (!document.fonts?.load) return;
  const first = (stack) => (stack || '').split(',')[0];
  await Promise.all([
    document.fonts.load(`600 24px ${first(tokens.serif)}`),
    document.fonts.load(`400 13px ${first(tokens.sans)}`),
    document.fonts.load(`600 13px ${first(tokens.sans)}`),
  ]).catch(() => {});
}
