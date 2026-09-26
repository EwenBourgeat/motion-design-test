// Rendu image par image de src/index.html → MP4 (sans Remotion / HyperFrames).
//
//   node scripts/render.mjs --stills 0.4,3.2,7     → out/stills/*.png
//   node scripts/render.mjs --preview              → out/preview.mp4 (540×960, sans flou)
//   node scripts/render.mjs                        → out/intendant-meta-20s.mp4 (+ version muette)
//
// Flou de mouvement : chaque frame = moyenne de N sous-frames réparties sur un
// obturateur à 180° (tmix ffmpeg). Grain & timings déterministes via window.seek(t).

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'out');
const BUILD = path.join(ROOT, 'build');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(BUILD, { recursive: true });

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const FPS = 30;
const DUR = 20;
const PREVIEW = flag('--preview');
const SUB = PREVIEW ? 1 : parseInt(opt('--sub', '8'), 10); // sous-frames par frame
const SHUTTER = 0.5; // 180°
const WORKERS = parseInt(opt('--workers', '4'), 10);
const SCALE = PREVIEW ? 0.5 : 1;
const FRAMES = parseInt(opt('--frames', String(FPS * DUR)), 10);

const FFMPEG = process.env.FFMPEG || execFileSync('python3', ['-c', 'import imageio_ffmpeg as f;print(f.get_ffmpeg_exe())']).toString().trim();

// ───── serveur statique minimal (polices en same-origin)
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(SRC, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(SRC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars', '--disable-gpu-vsync'],
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: SCALE });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(URL_);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const cdp = await page.context().newCDPSession(page);
  const shot = async (fmt = 'png') => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: fmt, optimizeForSpeed: true, ...(fmt === 'jpeg' ? { quality: 92 } : {}) });
    return Buffer.from(data, 'base64');
  };
  const seek = (t, f) => page.evaluate(([t, f]) => { window.seek(t, f); return new Promise((r) => requestAnimationFrame(() => r())); }, [t, f]);
  return { page, shot, seek };
}

const t0 = Date.now();

// ───── cues pour le design sonore
{
  const { page } = await openPage();
  const T = await page.evaluate(() => window.__T);
  fs.writeFileSync(path.join(BUILD, 'cues.json'), JSON.stringify(T, null, 2));
  await page.close();
}

if (opt('--stills')) {
  const dir = path.join(OUT, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const { shot, seek } = await openPage();
  for (const s of opt('--stills').split(',')) {
    const t = parseFloat(s);
    await seek(t, Math.round(t * FPS));
    fs.writeFileSync(path.join(dir, `t${t.toFixed(2).padStart(5, '0')}.png`), await shot());
  }
  console.log(`stills → ${dir}`);
  await browser.close(); server.close();
  process.exit(0);
}

// ───── rendu en segments parallèles
const per = Math.ceil(FRAMES / WORKERS);
const segs = [];
for (let w = 0; w < WORKERS; w++) {
  const a = w * per, b = Math.min(FRAMES, a + per);
  if (a < b) segs.push({ w, a, b, file: path.join(BUILD, `seg${w}.mkv`) });
}

let done = 0;
const total = FRAMES * SUB;
const progress = setInterval(() => {
  const el = (Date.now() - t0) / 1000;
  process.stdout.write(`\r${done}/${total} sous-frames · ${el.toFixed(0)} s`);
}, 2000);

async function renderSeg(seg) {
  const { shot, seek } = await openPage();
  const vf = SUB > 1
    ? `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${FPS}*TB)`
    : `setpts=N/(${FPS}*TB)`;
  const ff = spawn(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
    '-vf', vf, '-r', String(FPS),
    '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'bgr0', seg.file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));
  for (let f = seg.a; f < seg.b; f++) {
    for (let k = 0; k < SUB; k++) {
      const off = SUB > 1 ? (((k + 0.5) / SUB) - 0.5) * SHUTTER / FPS : 0;
      await seek(f / FPS + off, f);
      const buf = await shot(PREVIEW ? 'jpeg' : 'png');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      done++;
    }
  }
  ff.stdin.end();
  await closed;
}

const ENCODE_ONLY = flag('--encode-only') && segs.every((sg) => fs.existsSync(sg.file));
if (!ENCODE_ONLY) await Promise.all(segs.map(renderSeg));
clearInterval(progress);
console.log(`\nimages : ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
server.close();

// ───── assemblage + encodage final (H.264 High, BT.709, AAC)
const list = path.join(BUILD, 'list.txt');
fs.writeFileSync(list, segs.map((s) => `file '${s.file}'`).join('\n'));
const vcodec = [
  '-c:v', 'libx264', '-preset', PREVIEW ? 'veryfast' : 'slow', '-crf', PREVIEW ? '23' : '17',
  '-maxrate', '22M', '-bufsize', '44M',
  '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-r', String(FPS), '-g', String(FPS), '-movflags', '+faststart',
];
const audio = path.join(BUILD, 'audio.wav');
const name = PREVIEW ? 'preview' : 'intendant-meta-20s';
const withAudio = fs.existsSync(audio) && !flag('--no-audio');
const main = path.join(OUT, `${name}.mp4`);
execFileSync(FFMPEG, [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  ...(withAudio ? ['-i', audio] : []),
  ...vcodec,
  ...(withAudio ? ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest'] : []),
  main,
], { stdio: 'inherit' });
console.log(`→ ${main}`);
if (!PREVIEW && withAudio) {
  const mute = path.join(OUT, `${name}-muet.mp4`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', main, '-an', '-c:v', 'copy', '-movflags', '+faststart', mute], { stdio: 'inherit' });
  console.log(`→ ${mute}`);
}
console.log(`total : ${((Date.now() - t0) / 1000).toFixed(0)} s`);
