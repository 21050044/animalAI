// Sound (WebAudio synth, no files), confetti and toasts.

let ctx = null;
let muted = false;

export function initAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
}
export function toggleMute() { muted = !muted; return muted; }

function tone(freq, start, dur, { type = "sine", vol = 0.18, slide = 0 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  blip: () => tone(880, 0, 0.08, { type: "triangle", vol: 0.08 }),
  lock: () => { tone(660, 0, 0.08, { type: "square", vol: 0.05 }); tone(990, 0.07, 0.12, { type: "square", vol: 0.05 }); },
  whoosh: () => tone(200, 0, 0.35, { type: "sawtooth", vol: 0.05, slide: 4 }),
  reveal(rarity) {
    const chords = {
      common: [523, 659, 784],
      rare: [587, 740, 880, 1175],
      epic: [523, 659, 784, 1047, 1319],
      legendary: [523, 659, 784, 1047, 1319, 1568, 2093],
    }[rarity] || [523, 659, 784];
    chords.forEach((f, i) => tone(f, i * 0.07, 0.6, { type: "triangle", vol: 0.12 }));
    if (rarity === "legendary") chords.forEach((f, i) => tone(f * 2, 0.6 + i * 0.05, 0.5, { type: "sine", vol: 0.06 }));
  },
  badge: () => [784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, { type: "sine", vol: 0.12 })),
  tick: () => tone(440, 0, 0.12, { type: "square", vol: 0.06 }),
  go: () => tone(880, 0, 0.3, { type: "square", vol: 0.08 }),
  correct: () => { tone(1047, 0, 0.1, { type: "triangle", vol: 0.12 }); tone(1568, 0.08, 0.18, { type: "triangle", vol: 0.12 }); },
  fail: () => tone(220, 0, 0.3, { type: "sawtooth", vol: 0.06, slide: 0.6 }),
  win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.35, { type: "triangle", vol: 0.12 })),
  error: () => tone(180, 0, 0.25, { type: "square", vol: 0.06 }),
};

// ---------------- confetti ----------------
const cv = document.getElementById("confetti");
const cx = cv.getContext("2d");
let parts = [];
let raf = null;

export function confetti({ count = 140, colors = ["#22d3ee", "#8b5cf6", "#f472b6", "#a3e635", "#fbbf24"], y = 0.45 } = {}) {
  const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 12;
    parts.push({
      x: W / 2, y: H * y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6,
      r: 4 + Math.random() * 6, c: colors[i % colors.length], rot: Math.random() * 6, vr: Math.random() * 0.3 - 0.15, life: 1,
    });
  }
  if (!raf) step();
}
function step() {
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    p.vy += 0.35; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
    cx.save(); cx.globalAlpha = Math.max(0, p.life); cx.translate(p.x, p.y); cx.rotate(p.rot);
    cx.fillStyle = p.c; cx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); cx.restore();
  }
  raf = parts.length ? requestAnimationFrame(step) : null;
  if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
}

// ---------------- toasts ----------------
export function toast(icon, title, sub = "", kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<div class="ti">${icon}</div><div><div class="tt"></div><div class="ts"></div></div>`;
  el.querySelector(".tt").textContent = title;
  el.querySelector(".ts").textContent = sub;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 3800);
}
