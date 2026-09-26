/*  L'Intendant — Conciergerie Toulouse · Meta Ad 20s (1080×1920)
 *
 *  Moteur maison : chaque propriété visuelle est une fonction pure du temps t.
 *  window.seek(t, frame) pose la frame ; scripts/render.mjs capture et encode.
 */
(() => {
  'use strict';

  // ───────────────────────── utils ─────────────────────────
  const $ = (s) => document.querySelector(s);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    lin: (x) => x,
    inQuad: (x) => x * x,
    outQuad: (x) => 1 - (1 - x) * (1 - x),
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    inQuart: (x) => x * x * x * x,
    inOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
    outQuint: (x) => 1 - Math.pow(1 - x, 5),
    inExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inOutExpo: (x) =>
      x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
    outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  };
  // ressort amorti analytique : 0 → 1 avec dépassement
  const spring = (dt, freq = 3.2, damp = 0.5) => {
    if (dt <= 0) return 0;
    const w = 2 * Math.PI * freq, z = damp, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + ((z * w) / wd) * Math.sin(wd * dt));
  };
  const tw = (t, a, b, from, to, ease = E.outExpo) => lerp(from, to, ease(P(t, a, b)));
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };

  const tf = (el, x = 0, y = 0, s = 1, r = 0, sx = null, sy = null, unit = 'px') => {
    el.style.transform =
      `translate3d(${x.toFixed(3)}${unit},${y.toFixed(3)}${unit},0) rotate(${r.toFixed(3)}deg) scale(${(sx ?? s).toFixed(4)},${(sy ?? s).toFixed(4)})`;
  };
  const op = (el, o) => { el.style.opacity = clamp(o).toFixed(4); };
  const show = (el, on) => { el.style.visibility = on ? 'visible' : 'hidden'; };

  // Ajuste la taille de police pour atteindre une largeur donnée (texte non découpé)
  const fitWidth = (el, width, max = 1e9) => {
    el.style.fontSize = '100px';
    const w = el.getBoundingClientRect().width;
    const fs = Math.min(max, (100 * width) / w);
    el.style.fontSize = fs + 'px';
    return fs;
  };

  // Découpe en caractères en conservant le crénage (mesuré paire par paire, en em)
  const split = (el) => {
    const chars = [...el.textContent];
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:0;top:0;';
    el.appendChild(probe);
    const w = (s) => { probe.textContent = s; return probe.getBoundingClientRect().width; };
    const single = chars.map(w);
    const kern = chars.map((c, i) => (i < chars.length - 1 ? w(c + chars[i + 1]) - single[i] - single[i + 1] : 0));
    el.removeChild(probe);
    el.textContent = '';
    return chars.map((c, i) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c === ' ' ? ' ' : c;
      if (Math.abs(kern[i]) > 0.01) s.style.marginRight = (kern[i] / fs).toFixed(4) + 'em';
      el.appendChild(s);
      return s;
    });
  };

  // Révélation lettre à lettre dans un masque ; sortie optionnelle vers le haut
  const rise = (chars, t, t0, o = {}) => {
    const { stagger = 0.02, dur = 0.62, from = 112, rot = 0, sq = 0, out = null, outStagger = 0.012, outDur = 0.3, ease = E.outExpo } = o;
    const n = chars.length;
    chars.forEach((c, i) => {
      const p = ease(P(t, t0 + i * stagger, t0 + i * stagger + dur));
      let y = (1 - p) * from, r = (1 - p) * rot, syv = 1 + (1 - p) * sq;
      if (out !== null) {
        const q = E.inCubic(P(t, out + i * outStagger, out + i * outStagger + outDur));
        y -= q * 118;
      }
      const gone = t < t0 + i * stagger || (out !== null && t > out + i * outStagger + outDur);
      c.style.visibility = gone ? 'hidden' : 'visible';
      if (!gone) c.style.transform = `translate3d(0,${y.toFixed(3)}%,0) rotate(${r.toFixed(3)}deg) scale(1,${syv.toFixed(4)})`;
    });
    return n;
  };

  // ───────────────────────── timeline ─────────────────────────
  // Grille à 120 BPM : 1 temps = 0,5 s. Les coupes tombent sur les temps.
  const T = {
    cards: [-0.16, 0.22, 0.46, 0.7, 0.92, 1.12, 1.3, 1.47, 1.63, 1.78, 1.92, 2.05, 2.17],
    s1a: -0.1, s1b: 0.16, s1out: 2.56,
    w12: [2.62, 3.0],
    occ: 2.94,
    cyc: [3.25, 3.5, 3.75, 4.0, 4.25, 4.5, 4.75],
    perc: 5.5,
    w23: [6.2, 6.36], s3in: [6.3, 6.5],
    st: [6.5, 8.0, 9.5, 11.0],
    s4in: [12.26, 12.5], s4fg: 13.6,
    s5in: [14.76, 15.06],
    est: 15.0, grat: 15.22, sous: 15.72, sub: 16.36, lock: 17.0, tap: 18.1,
    end: 20.0,
  };
  window.__T = T;

  // ───────────────────────── contenu ─────────────────────────
  const ICON = {
    key: '<circle cx="8" cy="15.5" r="4.2"/><path d="M11 12.5l8.5-8.5M16.5 7l2.8 2.8M14 9.5l2.2 2.2"/>',
    clean: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6.2 6.2l2.6 2.6M15.2 15.2l2.6 2.6M17.8 6.2l-2.6 2.6M8.8 15.2l-2.6 2.6"/>',
    star: '<path d="M12 3.6l2.55 5.2 5.75.84-4.16 4.05.98 5.72L12 16.72 6.88 19.4l.98-5.72L3.7 9.63l5.75-.84z"/>',
    chat: '<path d="M4.5 5.5h15v10.5H10l-5.5 4z"/>',
    cal: '<rect x="3.8" y="5.2" width="16.4" height="15" rx="2.4"/><path d="M3.8 10h16.4M8.2 3.2v4M15.8 3.2v4"/>',
    drop: '<path d="M12 3.8c3.4 4.3 5.8 7.4 5.8 10.3a5.8 5.8 0 0 1-11.6 0c0-2.9 2.4-6 5.8-10.3z"/>',
    alert: '<path d="M12 4.2l8.6 15.2H3.4z"/><path d="M12 10v4.2M12 16.9v.2"/>',
    x: '<circle cx="12" cy="12" r="8.2"/><path d="M9 9l6 6M15 9l-6 6"/>',
  };
  const icon = (k) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  const STAR = 'M12 2.4l2.83 5.74 6.33.92-4.58 4.47 1.08 6.3L12 16.85l-5.66 2.98 1.08-6.3L2.84 9.06l6.33-.92z';
  const miniStars = (n) =>
    `<span class="stars">${[0, 1, 2, 3, 4]
      .map((i) => `<svg viewBox="0 0 24 24"><path d="${STAR}" fill="${i < n ? '#E09F3E' : 'none'}" stroke="#E09F3E" stroke-width="1.6" stroke-linejoin="round"/></svg>`)
      .join('')}</span>`;

  const CARDS = [
    { tag: 'Voyageur', time: '23:47', msg: 'Bonsoir… on ne trouve pas la boîte à clés.', icon: 'key', c: '', x: 106, y: 690, r: -2.5 },
    { tag: 'Ménage', time: '00:12', msg: 'Désolée, je ne pourrai pas venir demain.', icon: 'clean', c: 'brick', x: 150, y: 905, r: 2.8 },
    { tag: 'Airbnb', time: '06:58', msg: 'Nouvel avis publié ' + miniStars(3), icon: 'star', c: 'honey', x: 66, y: 1096, r: -3.6 },
    { tag: 'Voyageur', time: '07:31', msg: 'Il n’y a plus de serviettes propres&nbsp;?', icon: 'chat', c: '', x: 172, y: 792, r: 4.6 },
    { tag: 'Booking', time: '08:05', msg: 'Nouvelle réservation — arrivée à 14&nbsp;h.', icon: 'cal', c: 'cherry', x: 58, y: 984, r: -5.2 },
    { tag: 'Voyageur', time: '08:42', msg: 'L’eau chaude ne marche plus.', icon: 'drop', c: 'brick', x: 184, y: 668, r: 5.4 },
    { tag: 'Abritel', time: '09:10', msg: '3 messages non lus.', icon: 'chat', c: '', x: 40, y: 1210, r: -7 },
    { tag: 'Voyageur', time: '09:26', msg: 'On peut arriver à 11&nbsp;h plutôt&nbsp;?', icon: 'chat', c: '', x: 140, y: 862, r: -8.2 },
    { tag: 'Ménage', time: '10:03', msg: 'Il manque des draps pour ce soir.', icon: 'alert', c: 'brick', x: 96, y: 700, r: 6.8 },
    { tag: 'Booking', time: '10:40', msg: 'Annulation de dernière minute.', icon: 'x', c: 'cherry', x: 190, y: 1062, r: 9.4 },
    { tag: 'Voyageur', time: '11:15', msg: 'Le code du portail ne marche pas.', icon: 'key', c: '', x: 30, y: 800, r: -9.5 },
    { tag: 'Airbnb', time: '11:58', msg: 'Répondez sous 1&nbsp;h pour garder votre statut.', icon: 'alert', c: 'honey', x: 166, y: 1300, r: 7.4 },
    { tag: 'Voyageur', time: '12:31', msg: 'On est devant la porte. Vous êtes où&nbsp;?', icon: 'chat', c: 'brick', x: 96, y: 930, r: -4.2 },
  ];

  const CYC = ['de l’annonce.', 'des voyageurs.', 'du ménage.', 'du linge.', 'des check-in.', 'des prix.', 'de tout.'];

  const HOODS = [
    'Capitole', 'Saint-Cyprien', 'Les Carmes', 'Saint-Étienne', 'Jean Jaurès', 'Compans', 'Les Chalets', 'Saint-Michel',
    'Côte Pavée', 'Rangueil', 'Minimes', 'Borderouge', 'Purpan', 'Croix-Daurade', 'Blagnac', 'Colomiers',
    'Tournefeuille', 'Brax', 'Léguevin', 'Pibrac', 'Capitole', 'Saint-Cyprien', 'Les Carmes', 'Saint-Michel',
  ];

  const CAPTIONS = [
    ['de revenus potentiels', 'vs une location à l’année'],
    ['de revenus', 'vs une gestion en autonomie'],
    ['de taux d’occupation', 'moyen par bien'],
    ['de note moyenne', 'laissée par les voyageurs'],
  ];

  // ───────────────────────── refs ─────────────────────────
  const R = {};

  function init() {
    // ——— S1
    R.s1 = $('#s1'); R.s1cam = $('#s1cam');
    fitWidth($('#s1b'), 928);
    R.s1a = split($('#s1a'));
    R.s1b = split($('#s1b'));
    R.s1b[R.s1b.length - 1].classList.add('q');
    R.cards = CARDS.map((d) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div class="ic ${d.c}">${icon(d.icon)}</div><div class="ct"><div class="meta"><span>${d.tag}</span><span class="time">${d.time}<i class="unread"></i></span></div><div class="msg">${d.msg}</div></div>`;
      $('#cards').appendChild(el);
      return el;
    });

    // ——— S2
    R.s2 = $('#s2'); R.s2cam = $('#s2cam');
    R.s2label = $('#s2label');
    fitWidth($('#s2occ'), 928);
    R.occ = split($('#s2occ'));
    // items qui défilent : même taille pour tous, le dernier plus grand
    const cyc = $('#cyc');
    R.cyc = CYC.map((txt, i) => {
      const el = document.createElement('div');
      el.className = 't-serif it' + (i === CYC.length - 1 ? ' final' : '');
      el.textContent = txt;
      cyc.appendChild(el);
      return el;
    });
    let maxW = 0;
    R.cyc.slice(0, -1).forEach((el) => { el.style.fontSize = '100px'; maxW = Math.max(maxW, el.getBoundingClientRect().width); });
    const cycFs = Math.min(200, (100 * 920) / maxW);
    R.cyc.slice(0, -1).forEach((el) => { el.style.fontSize = cycFs + 'px'; el.style.top = (236 - cycFs * 1.0) + 'px'; });
    const fin = R.cyc[R.cyc.length - 1];
    fin.style.fontSize = '236px'; fin.style.top = '0px';
    R.rule = $('#s2rule');
    fitWidth($('#s2perc'), 900);
    R.perc = split($('#s2perc'));
    R.hl = $('#s2hl');
    const tick = 'Diffusion <i>✱</i> Airbnb <i>·</i> Booking.com <i>·</i> Abritel <i>·</i> Expedia <i>·</i> Google <i>✱</i>';
    $('#tickin').innerHTML = `<span>${tick}</span><span>${tick}</span><span>${tick}</span>`;
    R.tick = $('#tickin'); R.tickerBox = $('#ticker');
    R.tickW = R.tick.firstElementChild.getBoundingClientRect().width + 44;

    // ——— S3
    R.s3 = $('#s3'); R.s3cam = $('#s3cam');
    R.s3label = $('#s3label'); R.s3idx = $('#s3idx');
    R.idxd = $('#idxd');
    R.idxd.style.display = 'inline-block';
    buildNumber();
    buildCaptions();
    buildViz();

    // ——— S4
    R.s4 = $('#s4'); R.s4cam = $('#s4cam'); R.wall = $('#wall'); R.s4label = $('#s4label');
    R.rows = HOODS.map((h) => {
      const el = document.createElement('div');
      el.className = 'row';
      el.innerHTML = `${h}<span class="fill">${h}</span>`;
      R.wall.appendChild(el);
      return { el, fill: el.querySelector('.fill') };
    });
    fitWidth($('#s4a'), 928);
    R.s4a = split($('#s4a'));
    const s4b = $('#s4b'); s4b.textContent = 'toulousaine.';
    fitWidth(s4b, 920, 230);
    R.s4b = split(s4b);
    R.badge = $('#gbadge');
    R.gstars = [0, 1, 2, 3, 4].map(() => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.innerHTML = `<path d="${STAR}" fill="#E09F3E"/>`;
      $('.g-stars').appendChild(s);
      return s;
    });

    // ——— S5
    R.s5 = $('#s5'); R.s5cam = $('#s5cam');
    R.wmname = split($('#wmname'));
    R.wmsub = $('#wmsub');
    fitWidth($('#est'), 928);
    R.est = split($('#est'));
    fitWidth($('#grat'), 900, 262);
    R.grat = split($('#grat'));
    // "SOUS [48 H.]" : même corps, largeur totale ~ 928
    const sous = $('#sous'), h48 = $('#h48');
    sous.style.fontSize = h48.style.fontSize = '100px';
    const wRow = sous.getBoundingClientRect().width + h48.getBoundingClientRect().width;
    const fsRow = Math.min(150, ((928 - 26 - 44) * 100) / wRow);
    sous.style.fontSize = h48.style.fontSize = fsRow + 'px';
    R.sous = split(sous); R.h48 = split(h48);
    R.h48box = $('#h48box');
    R.sub1 = $('#sub1'); R.sub2 = $('#sub2');
    R.contact = $('#contact'); R.btn = $('#btn'); R.btnring = $('#btnring'); R.btnarr = $('#btnarr'); R.btntxt = $('#btntxt');

    // ——— transitions + finition
    R.w12 = $('#w12'); R.w23a = $('#w23a'); R.w34 = $('#w34'); R.w45 = $('#w45');
    R.grain = $('#grain'); R.vig = $('#vignette');
    buildGrain();
    layoutS5();
    document.querySelectorAll('.mask').forEach((m) => {
      const c = m.querySelector('.t-caps, .t-serif, .subline, .ln');
      if (c) m.style.fontSize = getComputedStyle(c).fontSize;
    });
  }

  // ───────── S3 : compteur à rouleaux ─────────
  const F = 500; // corps de base des chiffres (px), mis à l'échelle par état
  function buildNumber() {
    const num = $('#num');
    const g = document.createElement('div');
    g.id = 'numg';
    g.style.cssText = 'position:absolute;left:0;bottom:0;width:10px;height:10px;transform-origin:0 100%;';
    num.appendChild(g);
    R.numg = g;

    const probe = document.createElement('span');
    probe.className = 'g';
    probe.style.cssText = `position:absolute;visibility:hidden;font-size:${F}px;white-space:pre;`;
    g.appendChild(probe);
    const mw = (s, fs = F) => { probe.style.fontSize = fs + 'px'; probe.textContent = s; return probe.getBoundingClientRect().width; };
    const dW = mw('0'), cW = mw(','), SYM = 0.44 * F, pW = mw('%', SYM), sW = mw('/5', SYM);
    g.removeChild(probe);

    // métriques verticales via canvas
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `900 ${F}px Archivo`;
    const m0 = ctx.measureText('0');
    const A = m0.fontBoundingBoxAscent, D = m0.fontBoundingBoxDescent;
    const baseTop = (F - (A + D)) / 2 + A; // baseline depuis le haut d'une boîte line-height:1
    const digitH = m0.actualBoundingBoxAscent;
    const bft = baseTop / F;
    R.metrics = { dW, cW, pW, sW, baseTop, digitH, bft };

    const mkCol = () => {
      const c = document.createElement('div');
      c.className = 'g col';
      const top = baseTop - digitH - 0.035 * F, bot = F - baseTop - 0.02 * F;
      c.style.cssText = `font-size:${F}px;width:${dW}px;height:${F}px;clip-path:inset(${top}px -0.1em ${bot}px -0.1em);`;
      const a = document.createElement('span'), b = document.createElement('span');
      [a, b].forEach((s) => { s.style.cssText = `position:absolute;left:0;top:0;width:100%;height:${F}px;line-height:${F}px;text-align:center;`; c.appendChild(s); });
      g.appendChild(c);
      return { el: c, a, b };
    };
    R.d1 = mkCol(); R.d2 = mkCol(); R.d3 = mkCol();

    const mkGlyph = (txt, fs, cls = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'g ' + cls;
      const bottom = (F - fs) * (1 - bft);
      wrap.style.cssText = `font-size:${fs}px;height:${fs}px;line-height:${fs}px;bottom:${bottom}px;clip-path:inset(-0.2em -0.2em 0 -0.2em);`;
      const inner = document.createElement('span');
      inner.style.cssText = 'display:inline-block;';
      inner.textContent = txt;
      wrap.appendChild(inner);
      g.appendChild(wrap);
      return { el: wrap, in: inner };
    };
    R.comma = mkGlyph(',', F);
    R.pct = mkGlyph('%', SYM, 'sym');
    R.sl5 = mkGlyph('/5', SYM, 'sym');

    // croix × / + (SVG maîtrisé : rotation parfaite autour du centre optique des chiffres)
    const xW = 0.6 * F, L = 0.5 * F, th = 0.15 * F;
    const cy = baseTop - digitH / 2;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cross');
    svg.setAttribute('width', xW); svg.setAttribute('height', F);
    svg.setAttribute('viewBox', `0 0 ${xW} ${F}`);
    const cx = xW / 2;
    svg.innerHTML =
      `<g id="xg" style="transform-origin:${cx}px ${cy}px"><rect x="${cx - L / 2}" y="${cy - th / 2}" width="${L}" height="${th}" rx="${th * 0.12}" fill="#FFF3B0"/>` +
      `<rect x="${cx - th / 2}" y="${cy - L / 2}" width="${th}" height="${L}" rx="${th * 0.12}" fill="#FFF3B0"/></g>`;
    g.appendChild(svg);
    R.cross = svg; R.xg = svg.querySelector('#xg');

    // positions par état (unités de base)
    const gx = 0.03 * F, gp = 0.035 * F, gs = 0.02 * F;
    const S = {
      A: { cross: 0, d1: xW + gx, w: xW + gx + dW },
      B: { cross: 0, d1: xW + gx, d2: xW + gx + dW, pct: xW + gx + 2 * dW + gp, w: xW + gx + 2 * dW + gp + pW },
      C: { cross: -xW * 0.6, d1: 0, d2: dW, pct: 2 * dW + gp, w: 2 * dW + gp + pW },
      D: { d1: 0, comma: dW, d2: dW + cW, d3: 2 * dW + cW, sl5: 3 * dW + cW + gs, pct: 3 * dW + cW + gs, w: 3 * dW + cW + gs + sW },
    };
    const MAXW = 930;
    S.A.s = Math.min(MAXW / S.A.w, 1.16);
    S.B.s = Math.min(MAXW / S.B.w, 1.0);
    S.C.s = Math.min(MAXW / S.C.w, 1.02);
    S.D.s = Math.min(MAXW / S.D.w, 0.9);
    R.NS = S;
  }

  function buildCaptions() {
    const box = $('#caps3');
    R.caps = CAPTIONS.map((lines) => {
      const cap = document.createElement('div');
      cap.className = 'cap';
      const lns = lines.map((l) => {
        const m = document.createElement('div');
        m.className = 'mask';
        m.style.clipPath = 'inset(-0.1em -0.4em -0.24em -0.4em)';
        const d = document.createElement('div');
        d.className = 'ln';
        d.innerHTML = l;
        m.appendChild(d);
        cap.appendChild(m);
        return d;
      });
      box.appendChild(cap);
      return lns;
    });
  }

  function buildViz() {
    const v = $('#viz');
    const mk = (cls, css, html = '') => { const e = document.createElement('div'); e.className = cls; e.style.cssText = css; e.innerHTML = html; v.appendChild(e); return e; };
    // barres (états A & B)
    R.lblA1 = mk('barlbl', 'top:0;', 'Location à l’année <span class="v">×1</span>');
    R.lblA2 = mk('barlbl', 'top:70px;', 'Courte durée · L’Intendant <span class="v">×3</span>');
    R.lblB1 = mk('barlbl', 'top:0;', 'Gestion en autonomie');
    R.lblB2 = mk('barlbl', 'top:70px;', 'Avec L’Intendant <span class="v">+25&nbsp;%</span>');
    R.bar1 = mk('bar', 'top:32px;width:920px;background:rgba(255,243,176,0.38);');
    R.bar2 = mk('bar', 'top:102px;width:920px;background:#E09F3E;');
    // calendrier (état C) : 30 nuits, 27 réservées
    R.lblC1 = mk('barlbl', 'top:0;', 'Nuits réservées');
    R.lblC2 = mk('barlbl', 'top:0;left:auto;right:0;', '<span class="v" id="ccount">00</span>&thinsp;/&thinsp;30');
    R.ccount = R.lblC2.querySelector('#ccount');
    const EMPTY = new Set([6, 17, 25]);
    R.cells = [];
    let k = 0;
    for (let i = 0; i < 30; i++) {
      const c = mk('cell', `left:${i * 30.8}px;`);
      const f = document.createElement('div'); f.className = 'f'; c.appendChild(f);
      R.cells.push({ el: c, f, full: !EMPTY.has(i), order: EMPTY.has(i) ? -1 : k++ });
    }
    // étoiles (état D)
    R.lblD1 = mk('barlbl', 'top:0;', 'Avis voyageurs');
    R.stars = [0, 1, 2, 3, 4].map((i) => {
      const s = mk('star', `left:${i * 132}px;top:34px;width:108px;height:108px;`);
      s.innerHTML =
        `<svg viewBox="0 0 24 24" width="108" height="108"><defs><clipPath id="sc${i}"><rect x="0" y="0" width="0" height="24"/></clipPath></defs>` +
        `<path d="${STAR}" fill="none" stroke="rgba(255,243,176,0.45)" stroke-width="0.9" stroke-linejoin="round"/>` +
        `<path d="${STAR}" fill="#E09F3E" clip-path="url(#sc${i})"/></svg>`;
      return { el: s, clip: s.querySelector('rect') };
    });
  }

  // ───────── grain filmique (texture fixe, décalée par frame) ─────────
  function buildGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const img = x.createImageData(256, 256);
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (rnd() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    R.grain.style.backgroundImage = `url(${c.toDataURL()})`;
    R.grain.style.backgroundSize = '256px 256px';
  }

  function layoutS5() { /* positions fixées en CSS ; hook pour ajustements */ }

  // ═════════════════════════ SCÈNES ═════════════════════════

  // ——— S1 · HOOK
  function s1(t) {
    const on = t < T.w12[1] + 0.02;
    show(R.s1, on);
    if (!on) return;

    // caméra : push-in lent + tremblement qui monte avec la surcharge
    const push = 1 + 0.07 * E.inOutCubic(P(t, -0.2, 2.8));
    let kick = 0;
    T.cards.forEach((tc) => { const d = t - tc; if (d > 0 && d < 0.5) kick += 0.012 * Math.exp(-d * 9) * Math.sin(d * 30); });
    const amp = 7 * E.inCubic(P(t, 1.2, 2.55));
    const sx = amp * vnoise(t * 19), sy = amp * vnoise(t * 19 + 40), sr = amp * 0.1 * vnoise(t * 13 + 7);
    tf(R.s1cam, sx, sy, push + kick, sr);

    // titre
    rise(R.s1a, t, T.s1a, { stagger: 0.022, dur: 0.7, from: 125, rot: 6, out: T.s1out, outStagger: 0.008 });
    rise(R.s1b, t, T.s1b, { stagger: 0.028, dur: 0.6, from: 112, sq: 0.35, out: T.s1out + 0.04, outStagger: 0.01 });

    // notifications
    const n = R.cards.length;
    R.cards.forEach((el, i) => {
      const d = CARDS[i], t0 = T.cards[i], dt = t - t0;
      if (dt < 0) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = 'visible';
      const sp = spring(dt, 3.4, 0.52);
      const s = lerp(1.22, 1, sp);
      const y = d.y + lerp(-70, 0, sp);
      const r = d.r + lerp(i % 2 ? 10 : -10, 0, sp);
      let x = d.x, rr = r, yy = y, o = clamp(dt / 0.07);
      // balayage vers la droite (le plus récent part en premier)
      const ex = T.s1out + 0.06 + (n - 1 - i) * 0.014;
      const q = E.inCubic(P(t, ex, ex + 0.34));
      x += q * 1500; rr += q * 26; yy -= q * 160 * (0.5 + hash(i) * 0.8);
      tf(el, x, yy, s, rr);
      op(el, o);
    });
  }

  // ——— transition S1 → S2 : volet oblique + bande brique d'attaque
  function w12(t) {
    const on = t > T.w12[0] - 0.05 && t < T.w12[1] + 0.02;
    show(R.w12, on);
    const edge = (p) => lerp(-420, 1560, p);
    const slant = 320;
    const e1 = edge(E.inOutQuart(P(t, T.w12[0], T.w12[1] - 0.06)));
    const e2 = edge(E.inOutQuart(P(t, T.w12[0] + 0.06, T.w12[1])));
    R.w12.style.clipPath = `polygon(0 0, ${e1}px 0, ${e1 - slant}px 1920px, 0 1920px)`;
    return `polygon(0 0, ${e2}px 0, ${e2 - slant}px 1920px, 0 1920px)`;
  }

  // ——— S2 · RELIEF
  function s2(t, clip) {
    const on = t > T.w12[0] && t < T.s3in[1] + 0.02;
    show(R.s2, on);
    if (!on) return;
    R.s2.style.clipPath = t < T.w12[1] ? clip : 'none';

    const zoom = 1 + 0.035 * E.outCubic(P(t, T.occ, T.w23[1]));
    const punch = t > T.cyc[6] ? 0.018 * Math.exp(-(t - T.cyc[6]) * 7) * Math.cos((t - T.cyc[6]) * 24) : 0;
    tf(R.s2cam, 0, 0, zoom + punch);

    // label
    const lp = E.outExpo(P(t, T.occ + 0.05, T.occ + 0.7));
    tf(R.s2label, lerp(-40, 0, lp), 0); op(R.s2label, lp);

    rise(R.occ, t, T.occ, { stagger: 0.02, dur: 0.55, from: 110, sq: 0.4 });

    // défilement des services : bobine qui pousse (jamais deux mots superposés)
    const PITCH = 300;
    let reel = 0;
    T.cyc.forEach((c, k) => {
      const last = k === T.cyc.length - 1;
      reel += last ? clamp(spring(t - c, 2.4, 0.62), 0, 1.2) : E.outExpo(P(t, c, c + 0.2));
    });
    R.cyc.forEach((el, i) => {
      const y = (i + 1 - reel) * PITCH;
      const vis = y > -PITCH && y < PITCH;
      el.style.visibility = vis ? 'visible' : 'hidden';
      if (vis) tf(el, 0, y, i === R.cyc.length - 1 ? lerp(1.06, 1, E.outExpo(P(t, T.cyc[i], T.cyc[i] + 0.5))) : 1);
    });

    // filet + "VOUS PERCEVEZ."
    tf(R.rule, 0, 0, 1, 0, E.outExpo(P(t, T.perc - 0.2, T.perc + 0.45)), 1);
    rise(R.perc, t, T.perc, { stagger: 0.018, dur: 0.55, from: 112, sq: 0.3, out: T.w23[0] - 0.16, outStagger: 0.006, outDur: 0.18 });
    tf(R.hl, 0, 0, 1, 0, E.outExpo(P(t, T.perc + 0.14, T.perc + 0.7)), 1);

    // bandeau plateformes
    const tk = E.outExpo(P(t, T.occ + 0.3, T.occ + 1.0));
    op(R.tickerBox, tk);
    tf(R.tick, -((t - T.occ) * 150) % R.tickW, 0);
  }

  // ——— transition S2 → S3 : le surligneur miel envahit l'écran
  function w23(t) {
    const on = t > T.w23[0] && t < T.s3in[1] + 0.02;
    show(R.w23a, on);
    if (!on) return;
    const r = R.hl.getBoundingClientRect();
    const p = E.inOutExpo(P(t, T.w23[0], T.w23[1]));
    const top = lerp(r.top, 0, p), left = lerp(r.left, 0, p), right = lerp(1080 - r.right, 0, p), bottom = lerp(1920 - r.bottom, 0, p);
    R.w23a.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
  }

  // ——— S3 · PREUVES
  const setCol = (col, pos) => {
    const i = Math.floor(pos), f = pos - i;
    const dg = (k) => (k < 0 ? '' : String(((k % 10) + 10) % 10));
    const a = dg(i), b = dg(i + 1);
    if (col.a.textContent !== a) col.a.textContent = a;
    if (col.b.textContent !== b) col.b.textContent = b;
    col.a.style.transform = `translate3d(0,${(-f * F).toFixed(2)}px,0)`;
    col.b.style.transform = `translate3d(0,${((1 - f) * F).toFixed(2)}px,0)`;
  };

  function s3(t) {
    const on = t > T.s3in[0] && t < T.s4in[1] + 0.02;
    show(R.s3, on);
    if (!on) return;
    const [tA, tB, tC, tD] = T.st;
    R.s3.style.clipPath = t < T.s3in[1] ? `inset(${lerp(100, 0, E.inOutExpo(P(t, T.s3in[0], T.s3in[1])))}% 0 0 0)` : 'none';

    // caméra : dérive + petit coup à chaque changement de chiffre
    let kick = 0;
    T.st.forEach((ts) => { const d = t - ts; if (d > 0) kick += 0.008 * Math.exp(-d * 7) * Math.cos(d * 13); });
    tf(R.s3cam, 0, lerp(10, -10, P(t, tA, 12.5)), 1 + 0.03 * P(t, tA, 12.5) + kick);

    const lp = E.outExpo(P(t, tA, tA + 0.7));
    tf(R.s3label, lerp(-40, 0, lp), 0); op(R.s3label, lp);
    op(R.s3idx, lp);
    const k = t < tB ? 0 : t < tC ? 1 : t < tD ? 2 : 3;
    const ktime = T.st[k];
    R.idxd.textContent = '0' + (k + 1);
    tf(R.idxd, 0, lerp(100, 0, E.outExpo(P(t, ktime, ktime + 0.35))), 1, 0, null, null, '%');

    // ——— compteur
    const S = R.NS;
    const D = 0.6;
    const eB = E.outQuart(P(t, tB, tB + D)), eC = E.outQuart(P(t, tC, tC + D)), eD = E.outQuart(P(t, tD, tD + D));
    const seq = (a, b, c, d) => lerp(lerp(lerp(a, b, eB), c, eC), d, eD);

    const eA = E.outExpo(P(t, tA, tA + 0.8));
    const sc = seq(S.A.s, S.B.s, S.C.s, S.D.s) * lerp(1.04, 1, eA);
    tf(R.numg, 0, 0, sc);

    // croix : × apparaît en tournant, pivote en +, puis s'efface
    const xin = spring(t - tA, 2.4, 0.55);
    const xrot = lerp(-135, 45, E.outExpo(P(t, tA, tA + 0.9))) + 135 * E.outBack(P(t, tB, tB + 0.6), 1.4) + 90 * E.inCubic(P(t, tC, tC + 0.3));
    const xs = clamp(xin, 0, 1.2) * (1 - E.inCubic(P(t, tC, tC + 0.28)));
    R.xg.style.transform = `rotate(${xrot}deg) scale(${Math.max(0, xs)})`;
    tf(R.cross, seq(S.A.cross, S.B.cross, S.C.cross, S.C.cross), 0);
    R.cross.style.visibility = t < tC + 0.3 ? 'visible' : 'hidden';

    // chiffres (rouleaux) : 3 → 25 → 90 → 4,82
    const p1 = lerp(-1, 13, E.outExpo(P(t, tA, tA + 0.62))) + 9 * eB + 7 * eC + 5 * eD; // 3→12(2)→19(9)→24(4)
    setCol(R.d1, p1);
    tf(R.d1.el, seq(S.A.d1, S.B.d1, S.C.d1, S.D.d1), 0);
    const p2 = -1 + 16 * eB + 5 * eC + 8 * eD; // blanc→15(5)→20(0)→28(8)
    setCol(R.d2, p2);
    tf(R.d2.el, seq(S.B.d2, S.B.d2, S.C.d2, S.D.d2), 0);
    R.d2.el.style.visibility = t >= tB ? 'visible' : 'hidden';
    const p3 = -1 + 13 * eD; // blanc→12(2)
    setCol(R.d3, p3);
    tf(R.d3.el, S.D.d3, 0);
    R.d3.el.style.visibility = t >= tD ? 'visible' : 'hidden';

    // virgule, %, /5
    tf(R.comma.el, S.D.comma, 0);
    tf(R.comma.in, 0, lerp(110, 0, E.outExpo(P(t, tD + 0.08, tD + 0.6))), 1, 0, null, null, '%');
    R.comma.el.style.visibility = t >= tD ? 'visible' : 'hidden';

    const pctIn = E.outExpo(P(t, tB + 0.1, tB + 0.7)), pctOut = E.inQuad(P(t, tD - 0.04, tD + 0.1));
    tf(R.pct.el, seq(S.B.pct, S.B.pct, S.C.pct, S.D.pct), 0);
    tf(R.pct.in, 0, lerp(110, 0, pctIn) + 110 * pctOut, 1, 0, null, null, '%');
    R.pct.el.style.visibility = t >= tB && t < tD + 0.1 ? 'visible' : 'hidden';

    tf(R.sl5.el, S.D.sl5, 0);
    tf(R.sl5.in, 0, lerp(110, 0, E.outExpo(P(t, tD + 0.16, tD + 0.72))), 1, 0, null, null, '%');
    R.sl5.el.style.visibility = t >= tD ? 'visible' : 'hidden';

    // ——— légendes
    R.caps.forEach((lns, i) => {
      const tin = T.st[i] + 0.1, tout = T.st[i + 1] === undefined ? undefined : T.st[i + 1] - 0.1;
      lns.forEach((ln, j) => {
        let y = lerp(108, 0, E.outExpo(P(t, tin + j * 0.06, tin + j * 0.06 + 0.7)));
        if (tout !== undefined) y -= 115 * E.inQuad(P(t, tout + j * 0.025, tout + j * 0.025 + 0.14));
        tf(ln, 0, y, 1, 0, null, null, '%');
        ln.parentElement.style.visibility = t >= tin + j * 0.06 && (tout === undefined || t < tout + j * 0.025 + 0.14) ? 'visible' : 'hidden';
      });
    });

    // ——— data-viz
    const fadeAB = 1 - E.outQuad(P(t, tC - 0.04, tC + 0.1));
    const a1 = E.outExpo(P(t, tA + 0.18, tA + 0.6)) * (1 - E.outQuad(P(t, tB - 0.04, tB + 0.1)));
    const a2 = E.outExpo(P(t, tB + 0.12, tB + 0.5)) * fadeAB;
    [R.lblA1, R.lblA2].forEach((e, i) => { op(e, a1); tf(e, lerp(-30, 0, E.outExpo(P(t, tA + 0.18 + i * 0.1, tA + 0.8))), lerp(0, -14, E.outExpo(P(t, tB, tB + 0.25)))); });
    [R.lblB1, R.lblB2].forEach((e, i) => { op(e, a2); tf(e, 0, lerp(14, 0, E.outExpo(P(t, tB + 0.05 + i * 0.05, tB + 0.5)))); });
    const b1 = lerp(0, 1 / 3, E.outExpo(P(t, tA + 0.25, tA + 1.0))) + (0.8 - 1 / 3) * E.outExpo(P(t, tB + 0.1, tB + 0.9));
    const b2 = E.outExpo(P(t, tA + 0.35, tA + 1.25));
    const bh = fadeAB;
    tf(R.bar1, 0, 0, 1, 0, b1, bh); tf(R.bar2, 0, 0, 1, 0, b2, bh);
    R.bar1.style.visibility = R.bar2.style.visibility = t < tC + 0.22 ? 'visible' : 'hidden';

    // calendrier
    const cOn = t >= tC && t < tD + 0.2;
    const cIn = E.outExpo(P(t, tC + 0.05, tC + 0.5)), cOut = E.outQuad(P(t, tD - 0.04, tD + 0.08));
    op(R.lblC1, cIn * (1 - cOut)); op(R.lblC2, cIn * (1 - cOut));
    tf(R.lblC1, 0, lerp(14, 0, cIn)); tf(R.lblC2, 0, lerp(14, 0, cIn));
    let filled = 0;
    R.cells.forEach((c, i) => {
      c.el.style.visibility = cOn ? 'visible' : 'hidden';
      if (!cOn) return;
      const sy = E.outExpo(P(t, tC + 0.04 + i * 0.006, tC + 0.44 + i * 0.006)) * (1 - E.inQuad(P(t, tD - 0.04 + i * 0.002, tD + 0.08 + i * 0.002)));
      tf(c.el, 0, 0, 1, 0, 1, sy);
      if (c.full) {
        const tf0 = tC + 0.2 + c.order * 0.02;
        const fp = E.outExpo(P(t, tf0, tf0 + 0.22));
        if (t >= tf0) filled++;
        tf(c.f, 0, 0, 1, 0, 1, fp);
      } else tf(c.f, 0, 0, 1, 0, 1, 0);
    });
    R.ccount.textContent = String(filled).padStart(2, '0');

    // étoiles
    const sOn = t >= tD;
    op(R.lblD1, E.outExpo(P(t, tD + 0.14, tD + 0.54)));
    tf(R.lblD1, 0, lerp(14, 0, E.outExpo(P(t, tD + 0.14, tD + 0.54))));
    const FILL = [1, 1, 1, 1, 0.82];
    R.stars.forEach((s, i) => {
      s.el.style.visibility = sOn ? 'visible' : 'hidden';
      if (!sOn) return;
      const sp = clamp(spring(t - (tD + 0.14 + i * 0.06), 3, 0.5), 0, 1.3);
      tf(s.el, 0, 0, sp, lerp(-40, 0, clamp(sp)));
      const fp = E.outCubic(P(t, tD + 0.3 + i * 0.09, tD + 0.55 + i * 0.09));
      s.clip.setAttribute('width', (24 * FILL[i] * fp).toFixed(3));
    });
  }

  // ——— S4 · LOCAL
  function s4(t) {
    const on = t > T.s4in[0] - 0.05 && t < T.s5in[1] + 0.02;
    show(R.s4, on); show(R.w34, t > T.s4in[0] - 0.05 && t < T.s4in[1] + 0.02);
    if (!on) return;

    // volet oblique montant + bande miel d'attaque
    const edge = (p) => lerp(2250, -330, p);
    const e1 = edge(E.inOutQuart(P(t, T.s4in[0] - 0.05, T.s4in[1] - 0.05)));
    const e2 = edge(E.inOutQuart(P(t, T.s4in[0], T.s4in[1])));
    R.w34.style.clipPath = `polygon(0 ${e1}px, 1080px ${e1 - 260}px, 1080px 1920px, 0 1920px)`;
    R.s4.style.clipPath = t < T.s4in[1] ? `polygon(0 ${e2}px, 1080px ${e2 - 260}px, 1080px 1920px, 0 1920px)` : 'none';

    // mur des quartiers
    const RH = 158, CENTER = 800;
    const scroll = lerp(-60, -1900, E.outQuart(P(t, T.s4in[0] - 0.1, T.s4fg + 0.2))) - (t - T.s4in[0]) * 40;
    const dim = E.outCubic(P(t, T.s4fg - 0.05, T.s4fg + 0.4));
    R.rows.forEach((r, i) => {
      const y = i * RH + scroll;
      if (y < -RH || y > 1920) { r.el.style.visibility = 'hidden'; return; }
      r.el.style.visibility = 'visible';
      tf(r.el, 0, y);
      const d = Math.abs(y + RH / 2 - CENTER) / RH;
      op(r.fill, clamp(1.15 - d * 1.3) * (1 - dim));
    });
    op(R.wall, lerp(1, 0.16, dim));

    const lp = E.outExpo(P(t, T.s4in[1] - 0.1, T.s4in[1] + 0.5));
    tf(R.s4label, lerp(-40, 0, lp), 0); op(R.s4label, lp);

    tf(R.s4cam, 0, 0, 1 + 0.03 * P(t, T.s4fg, 15.0));
    rise(R.s4a, t, T.s4fg, { stagger: 0.02, dur: 0.55, from: 112, sq: 0.35 });
    rise(R.s4b, t, T.s4fg + 0.12, { stagger: 0.02, dur: 0.7, from: 125, rot: 6 });
    const bp = spring(t - (T.s4fg + 0.36), 3, 0.55);
    tf(R.badge, 0, lerp(40, 0, clamp(bp)), lerp(0.6, 1, bp));
    op(R.badge, E.outExpo(P(t, T.s4fg + 0.36, T.s4fg + 0.6)));
    R.gstars.forEach((s, i) => {
      const sp = spring(t - (T.s4fg + 0.5 + i * 0.05), 3.4, 0.45);
      s.style.transform = `scale(${Math.max(0, sp).toFixed(4)}) rotate(${lerp(-60, 0, clamp(sp))}deg)`;
    });
  }

  // ——— S5 · OFFRE + CTA
  function s5(t) {
    const on = t > T.s5in[0];
    show(R.s5, on);
    if (!on) return;
    const p = E.inOutExpo(P(t, T.s5in[0], T.s5in[1]));
    R.s5.style.clipPath = t < T.s5in[1] ? `circle(${lerp(0, 1150, p)}px at 540px 900px)` : 'none';

    tf(R.s5cam, 0, 0, 1 + 0.025 * E.outCubic(P(t, T.est, T.end)));

    rise(R.est, t, T.est, { stagger: 0.022, dur: 0.6, from: 112, sq: 0.35 });
    rise(R.grat, t, T.grat, { stagger: 0.03, dur: 0.8, from: 125, rot: 8 });
    rise(R.sous, t, T.sous, { stagger: 0.025, dur: 0.55, from: 112, sq: 0.3 });
    R.h48box.style.setProperty('--hb', E.outExpo(P(t, T.sous + 0.1, T.sous + 0.6)).toFixed(4));
    rise(R.h48, t, T.sous + 0.14, { stagger: 0.03, dur: 0.55, from: 112, sq: 0.3 });

    [R.sub1, R.sub2].forEach((el, i) => {
      el.style.visibility = t >= T.sub + i * 0.12 ? 'visible' : 'hidden';
      tf(el, 0, lerp(110, 0, E.outExpo(P(t, T.sub + i * 0.12, T.sub + i * 0.12 + 0.7))), 1, 0, null, null, '%');
    });

    // signature + bouton
    rise(R.wmname, t, T.lock, { stagger: 0.025, dur: 0.7, from: 125 });
    const wsp = E.outExpo(P(t, T.lock + 0.15, T.lock + 1.0));
    op(R.wmsub, wsp);
    R.wmsub.style.letterSpacing = lerp(0.7, 0.34, wsp).toFixed(4) + 'em';

    const bsp = spring(t - (T.lock + 0.12), 2.6, 0.6);
    const press = t > T.tap ? -0.045 * Math.exp(-(t - T.tap) * 6) * Math.cos((t - T.tap) * 14) * (t - T.tap < 0.04 ? (t - T.tap) / 0.04 : 1) : 0;
    tf(R.btn, 0, lerp(160, 0, clamp(bsp, 0, 1.2)), (1 + press) * lerp(0.9, 1, clamp(bsp)));
    op(R.btn, E.outExpo(P(t, T.lock + 0.12, T.lock + 0.4)));
    const ar = spring(t - (T.lock + 0.35), 3, 0.5);
    const nudge = 12 * Math.max(0, Math.sin((t - T.tap - 0.6) * Math.PI * 2)) * (t > T.tap + 0.6 ? 1 : 0) * Math.exp(-Math.max(0, t - T.tap - 0.6) * 0.35);
    tf(R.btnarr, nudge, 0, clamp(ar, 0, 1.3), lerp(-90, 0, clamp(ar)));
    const cp = E.outExpo(P(t, T.lock + 0.5, T.lock + 1.2));
    R.contact.style.opacity = (0.75 * cp).toFixed(3);
    tf(R.contact, 0, lerp(20, 0, cp));
    const rp = P(t, T.tap, T.tap + 0.7);
    R.btnring.style.opacity = (t > T.tap ? (1 - E.outCubic(rp)) * 0.9 : 0).toFixed(3);
    R.btnring.style.transform = `scale(${lerp(1, 1.14, E.outCubic(rp)).toFixed(4)}, ${lerp(1, 1.5, E.outCubic(rp)).toFixed(4)})`;
  }

  // ——— finition
  function finish(t, frame) {
    R.grain.style.backgroundPosition = `${Math.floor(hash(frame + 0.13) * 256)}px ${Math.floor(hash(frame + 7.7) * 256)}px`;
    const light = (t > T.w12[1] && t < T.s3in[1]) || t > T.s5in[1];
    R.vig.style.opacity = light ? '0.28' : '1';
    R.grain.style.opacity = light ? '0.06' : '0.085';
  }

  function update(t, frame) {
    s1(t);
    const clip2 = w12(t);
    s2(t, clip2);
    w23(t);
    s3(t);
    s4(t);
    s5(t);
    finish(t, frame);
  }

  window.seek = (t, frame) => update(t, frame ?? Math.round(t * 30));

  const boot = async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
    await document.fonts.ready;
    init();
    window.__ready = true;
    const q = new URLSearchParams(location.search);
    if (q.has('t')) window.seek(parseFloat(q.get('t')));
    else if (q.has('play')) {
      const t0 = performance.now();
      const loop = () => { const t = ((performance.now() - t0) / 1000) % T.end; window.seek(t); requestAnimationFrame(loop); };
      loop();
    } else window.seek(0);
  };
  boot();
})();
