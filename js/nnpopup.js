// Popup "AI nhìn ảnh thế nào" (mở từ bước 4): mô phỏng đúng cách mạng CNN nhìn ảnh.
// Ảnh → các bộ lọc nét (lớp 1, tích chập thật) → các bộ lọc ghép mảng (lớp 2) → bộ phận → kết luận.
import { S, h, imgUrl, loadImg } from "./state.js";
import { byKey } from "./config.js";
import { paintBox } from "./lightbox.js";
import { sfx, confetti } from "./fx.js";

let timers = [];
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); timers = []; };

/** các bộ phận đã đánh dấu tay trên từng ảnh minh hoạ (toạ độ 0..1 theo ảnh gốc; r = bán kính theo bề ngang ảnh) */
const PARTS_BY_FILE = {
  "dog_0.jpg": [
    { n: "Tai", x: 0.711, y: 0.141, c: "#f59e0b", s: "r", r: 0.055 },
    { n: "Mắt", x: 0.672, y: 0.31, c: "#8b5cf6", s: "r", r: 0.032 },
    { n: "Mũi", x: 0.653, y: 0.459, c: "#ef4444", s: "b", r: 0.042 },
    { n: "Lông cổ", x: 0.74, y: 0.39, c: "#0284c7", s: "r", r: 0.055 },
    { n: "Thân", x: 0.36, y: 0.61, c: "#0d9488", s: "r", r: 0.13 },
    { n: "Chân", x: 0.664, y: 0.859, c: "#059669", s: "l", r: 0.055 },
    { n: "Đuôi", x: 0.19, y: 0.824, c: "#db2777", s: "r", r: 0.07 },
  ],
  "bird_0.jpg": [
    { n: "Mỏ", x: 0.40, y: 0.275, c: "#f59e0b", s: "l", r: 0.075 },
    { n: "Mắt", x: 0.48, y: 0.262, c: "#8b5cf6", s: "t", r: 0.04 },
    { n: "Cánh", x: 0.645, y: 0.378, c: "#ef4444", s: "r", r: 0.075 },
    { n: "Lông thân", x: 0.70, y: 0.50, c: "#0284c7", s: "l", r: 0.09 },
    { n: "Chân", x: 0.578, y: 0.63, c: "#059669", s: "r", r: 0.075 },
    { n: "Đuôi", x: 0.845, y: 0.744, c: "#db2777", s: "l", r: 0.085 },
  ],
};
const DEMO_FILES = Object.keys(PARTS_BY_FILE);

let demo = null;
async function demoItem() {
  if (demo) return demo;
  const pool = S.pool || [];
  const it = DEMO_FILES.map((f) => pool.find((x) => x.file === f)).find(Boolean) || pool.find((x) => x.box && x.box[2] * x.box[3] > 0.2 && x.box[2] * x.box[3] < 0.6) || pool[0];
  demo = { it, im: await loadImg(imgUrl(it.file)) };
  return demo;
}

/** lớp 1: các bộ lọc 3×3 (kernel thật, trượt khắp ảnh) */
const FILTERS1 = [
  { n: "Nét ngang", k: [-1, -2, -1, 0, 0, 0, 1, 2, 1] },
  { n: "Nét dọc", k: [-1, 0, 1, -2, 0, 2, -1, 0, 1] },
  { n: "Nét chéo", k: [0, 1, 2, -1, 0, 1, -2, -1, 0] },
  { n: "Điểm nổi bật", k: [0, -1, 0, -1, 4, -1, 0, -1, 0] },
];
/** lớp 2: ghép các nét lại thành mảng */
const FILTERS2 = [{ n: "Viền vật" }, { n: "Chỗ nhiều nét" }, { n: "Mảng sáng" }, { n: "Mảng tối" }];

const STAGES = [
  { n: "Ảnh", e: "📸", cap: "AI nhận vào <b>một bức ảnh</b>. Nó chưa biết gì trong đó cả." },
  { n: "Bộ lọc 1", e: "🔍", cap: "<b>Lớp 1: các bộ lọc tìm nét.</b> Mỗi bộ lọc là một <b>ô nhỏ 3×3</b> trượt khắp ảnh và chỉ bắt <b>một loại nét</b>: ngang, dọc, chéo, hay điểm nổi bật. Nét nào khớp thì sáng lên." },
  { n: "Bộ lọc 2", e: "🧩", cap: "<b>Lớp 2: ghép các nét thành mảng.</b> Lấy kết quả của lớp 1 gom lại: <b>viền vật</b>, chỗ <b>nhiều nét</b> (lông), <b>mảng sáng</b>, <b>mảng tối</b>." },
  { n: "Ghép mảnh", e: "🧱", cap: "" },
  { n: "Kết luận", e: "✅", cap: "" },
];

/* ---------- xử lý ảnh thật (giữ nguyên tỉ lệ ảnh) ---------- */
const N = 64;
/** kích thước giữ tỉ lệ, cạnh dài = m */
const dims = (im, m) => { const a = im.naturalHeight / im.naturalWidth; return a <= 1 ? [m, Math.max(8, Math.round(m * a))] : [Math.max(8, Math.round(m / a)), m]; };
function gray(im) {
  const [W, H] = dims(im, N), c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, L = new Float32Array(W * H), R = new Float32Array(W * H), G = new Float32Array(W * H), B = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { R[i] = d[i * 4]; G[i] = d[i * 4 + 1]; B[i] = d[i * 4 + 2]; L[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i]; }
  return { W, H, L, R, G, B };
}
function conv(src, k, W, H) {
  const out = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let s = 0; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) s += src[(y + j - 1) * W + x + i - 1] * k[j * 3 + i];
    out[y * W + x] = Math.abs(s);
  }
  return out;
}
function blur(src, r, W, H) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const yy = y + j, xx = x + i; if (yy >= 0 && yy < H && xx >= 0 && xx < W) { s += src[yy * W + xx]; n++; } }
    out[y * W + x] = s / n;
  }
  return out;
}
const norm = (a, pct = 0.985) => { const s = [...a].sort((p, q) => p - q), m = s[Math.floor(s.length * pct)] || 1; return a.map((v) => Math.min(1, v / (m || 1))); };
/** vẽ bản đồ 0..1 lên canvas: nền trắng → màu đậm (canvas có đúng tỉ lệ ảnh) */
function paintMap(cv, map, W, H, color) {
  const t = document.createElement("canvas"); t.width = W; t.height = H; const x = t.getContext("2d"), o = x.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = map[i]; for (let c = 0; c < 3; c++) o.data[i * 4 + c] = 255 - v * (255 - color[c]); o.data[i * 4 + 3] = 255; }
  x.putImageData(o, 0, 0); const sc = 128 / Math.max(W, H); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
  const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, cv.width, cv.height);
}
/** ảnh toàn bộ nét (Sobel ngang + dọc) ở độ phân giải cao, nét xanh trên nền trắng */
function edgeCanvas(im, M = 200, out = 400) {
  const [W, H] = dims(im, M), c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, L0 = new Float32Array(W * H), E = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L0[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const L = blur(L0, 1, W, H); // làm mịn nhẹ để cỏ, nền nhiễu không lấn át nét chính
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1] - L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1];
    const gy = L[i + W - 1] + 2 * L[i + W] + L[i + W + 1] - L[i - W - 1] - 2 * L[i - W] - L[i - W + 1];
    E[i] = Math.hypot(gx, gy);
  }
  const m = norm(E, 0.95), o = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = Math.min(1, Math.pow(m[i], 1.6) * 1.2); o.data[i * 4] = 255 - v * 252; o.data[i * 4 + 1] = 255 - v * 150; o.data[i * 4 + 2] = 255 - v * 94; o.data[i * 4 + 3] = 255; }
  g.putImageData(o, 0, 0);
  const [BW, BH] = dims(im, out), big = document.createElement("canvas"); big.width = BW; big.height = BH; const bg = big.getContext("2d"); bg.imageSmoothingQuality = "high"; bg.drawImage(c, 0, 0, BW, BH);
  return big;
}
/** ô kernel 3×3 minh hoạ (xanh = cộng, đỏ = trừ) */
function kernelIcon(k) {
  return h("div", { class: "kn" }, ...k.map((v) => h("i", { style: `background:${v > 0 ? `rgba(2,132,199,${0.2 + Math.abs(v) * 0.25})` : v < 0 ? `rgba(239,68,68,${0.2 + Math.abs(v) * 0.25})` : "#e2e8f0"}` }, v > 0 ? "+" + v : String(v))));
}

function scene() {
  const tiles = STAGES.map((st, i) => {
    const t = h("div", { class: "st-pane" });
    if (i === 1 || i === 2) {
      const list = i === 1 ? FILTERS1 : FILTERS2;
      t.append(h("div", { class: "fl-grid" }, ...list.map((f) => h("div", { class: "fl-cell" }, h("div", { class: "fl-cv" }, h("canvas", { width: 128, height: 96 }), f.k ? kernelIcon(f.k) : null, h("span", { class: "fl-n" }, f.n))))));
    } else t.append(h("div", { class: "ly-cv" }, h("canvas", { width: 120, height: 90 })));
    return t;
  });
  const rail = h("div", { class: "st-rail" }, ...STAGES.map((st, i) => h("button", { class: "st-step", onclick: () => { sfx.blip(); clearTimers(); lit(i); } }, h("span", { class: "st-n" }, String(i + 1)), h("span", { class: "st-t" }, `${st.e} ${st.n}`))));
  const cap = h("div", { class: "ly-cap" });
  const replay = h("button", { class: "btn", onclick: () => { sfx.go(); run(); } }, "↻ Chạy lại");
  const root = h("div", { class: "nn-page" },
    h("div", { class: "st-body" }, rail, h("div", { class: "st-stage" }, ...tiles), cap),
    h("div", { class: "ly-foot" }, replay, h("span", { class: "ly-tip" }, "💡 Lớp 1–2 là phép tính thật trên ảnh; phần ghép mảnh là hình minh hoạ. Khi huấn luyện, AI tự học ra các bộ lọc, không ai viết tay.")));
  const steps = [...rail.children];
  let info = null, boomed = false, partCap = null;
  const setCap = (html) => { cap.replaceChildren(h("div", { html })); };
  function lit(i) {
    tiles.forEach((t, k) => t.classList.toggle("on", k === i));
    steps.forEach((t, k) => { t.classList.toggle("on", k === i); t.classList.toggle("past", k < i); });
    if (i === 4 && info) {
      const c = byKey(info.cls);
      setCap(`<b>Kết luận!</b> Từ các bộ phận, AI chốt: đây là <b>${c.emoji} ${c.vi}</b>, chắc <b>92%</b>. Đúng hay sai sẽ được đo bằng con số <b>loss</b>.`);
      if (!boomed) { boomed = true; confetti({ count: 70, y: 0.35 }); sfx.correct?.(); }
    } else if (i === 3) partCap ? cap.replaceChildren(partCap) : setCap("<b>Ghép mảnh!</b> Các mảng ở lớp 2 được ghép lại thành <b>từng bộ phận</b>, rồi thành <b>cả con vật</b>.");
    else setCap(STAGES[i].cap);
  }
  let cur = 0;
  // mỗi bước dừng một lúc; các bước có nhiều thứ để xem dừng lâu hơn
  function run() {
    clearTimers(); cur = 0; lit(0); sfx.tick();
    const dwell = [2200, 6000, 6000, 8500], next = () => {
      if (cur < 4) later(() => { cur++; lit(cur); sfx.tick(); next(); }, dwell[cur]);
      else later(run, 6000);
    };
    next();
  }
  demoItem().then(({ it, im }) => {
    info = it;
    const { W, H, L, R, G, B } = gray(im), asp = im.naturalHeight / im.naturalWidth;
    const f1 = FILTERS1.map((f) => norm(conv(L, f.k, W, H)));
    // lớp 1
    const c1 = tiles[1].querySelectorAll("canvas");
    f1.forEach((m, k) => paintMap(c1[k], m, W, H, k === 3 ? [217, 119, 6] : [3, 105, 161]));
    // lớp 2: gom kết quả lớp 1
    const edge = f1[0].map((v, i) => Math.max(v, f1[1][i], f1[2][i]));
    const outline = edge.map((v) => (v > 0.55 ? 1 : v * 0.3));
    const dense = norm(blur(edge, 3, W, H), 0.99);
    const bright = norm(L.map((v, i) => Math.max(0, v - 90 + (R[i] - B[i]) * 0.3)), 0.995);
    const dark = norm(blur(L.map((v) => 255 - v), 2, W, H), 0.995);
    const c2 = tiles[2].querySelectorAll("canvas");
    paintMap(c2[0], outline, W, H, [3, 105, 161]); paintMap(c2[1], dense, W, H, [124, 58, 237]); paintMap(c2[2], bright, W, H, [217, 119, 6]); paintMap(c2[3], dark, W, H, [51, 65, 85]);
    const parts = PARTS_BY_FILE[it.file];
    // ảnh gốc (giữ tỉ lệ), ô ghép mảnh, ô kết luận
    const sizeTo = (cv, m) => { const [w, hh] = dims(im, m); cv.width = w; cv.height = hh; return cv.getContext("2d"); };
    const cs = [tiles[0], tiles[3], tiles[4]].map((t) => t.querySelector("canvas"));
    sizeTo(cs[0], 360).drawImage(im, 0, 0, cs[0].width, cs[0].height);
    const cvBox = tiles[3].querySelector(".ly-cv");
    if (parts) {
      const ed = edgeCanvas(im), ph = document.createElement("canvas"); ph.width = ed.width; ph.height = ed.height; ph.getContext("2d").drawImage(im, 0, 0, ph.width, ph.height);
      cs[1].width = ed.width; cs[1].height = ed.height; cs[1].getContext("2d").drawImage(ed, 0, 0);
      // đổi toạ độ theo ảnh → toạ độ trong khung vuông (ảnh nằm giữa, giữ tỉ lệ)
      const pos = (pt) => (asp <= 1 ? [pt.x, 0.5 + (pt.y - 0.5) * asp] : [0.5 + (pt.x - 0.5) / asp, pt.y]);
      const rw = (pt) => pt.r * 200 * (asp <= 1 ? 1 : 1 / asp);
      cs[1].classList.add("faint");
      // ảnh thật hiện dần sau khi mảnh cuối vào chỗ: ghép xong thành cả con vật
      const total = parts.length * 0.55 + 0.9, full = h("canvas", { class: "ph-fade", width: ph.width, height: ph.height, style: `--td:${total}s` });
      full.getContext("2d").drawImage(ph, 0, 0); cvBox.append(full);
      const rnd = (i) => Math.sin(i * 12.9898 + 4.1) * 43758.5453 % 1;
      parts.forEach((pt, k) => {
        const [px, py] = pos(pt), wp = Math.max(rw(pt) * 0.95, 13);
        // mảnh ghép = lát ảnh thật quanh bộ phận
        const sz = (wp / 100) * (asp <= 1 ? 1 : asp) * ph.width, sx = Math.max(0, Math.min(ph.width - sz, pt.x * ph.width - sz / 2)), sy = Math.max(0, Math.min(ph.height - sz, pt.y * ph.height - sz / 2));
        const pc = h("canvas", { width: 96, height: 96 }); pc.getContext("2d").drawImage(ph, sx, sy, sz, sz, 0, 0, 96, 96);
        const place = `left:${px * 100}%;top:${py * 100}%;width:${wp}%;--c:${pt.c}`;
        cvBox.append(h("span", { class: "pz-slot", style: place }));
        cvBox.append(h("div", { class: "pz", style: `${place};--d:${k * 0.55}s;--fx:${Math.round(rnd(k + 1) * 150)}px;--fy:${Math.round(rnd(k + 9) * 110)}px;--fr:${Math.round(rnd(k + 5) * 50)}deg` },
          h("div", { class: "pz-in" }, pc, h("em", { class: "pz-n" }, `${k + 1}. ${pt.n}`))));
      });
      const what = byKey(it.cls).vi.toLowerCase();
      partCap = h("div", { html: `<b>Ghép mảnh!</b> Từ các mảng ở lớp 2, AI tìm ra từng <b>mảnh bộ phận</b>. Các mảnh <b>khớp vào đúng chỗ</b> thì thành cả con ${what}: ${parts.map((pt, k) => `<b>${k + 1}</b> ${pt.n.toLowerCase()}`).join(", ")}.` });
    } else {
      const g = sizeTo(cs[1], 400); g.drawImage(im, 0, 0, cs[1].width, cs[1].height); paintBox(g, it.box, cs[1].width, cs[1].height, "#f59e0b", "", { lw: 4, halo: true });
    }
    const g4 = sizeTo(cs[2], 360), c = byKey(it.cls);
    g4.drawImage(im, 0, 0, cs[2].width, cs[2].height); paintBox(g4, it.box, cs[2].width, cs[2].height, c.color, `${c.emoji} ${c.vi} 92%`, { lw: 3, halo: true });
    if (cur === 3) lit(3);
    run();
  });
  lit(0);
  return root;
}

/** info: { vi, sub, init } — onClose được gọi khi popup đóng. */
export function nnPopup(info, onClose) {
  const el = h("div", { class: "lightbox nn-pop", onclick: (e) => e.target === el && close() },
    h("div", { class: "nn-card" }, h("button", { class: "nn-x", onclick: () => close(), title: "Đóng" }, "✕"),
      h("h3", {}, "🧠 AI nhìn một bức ảnh như thế nào?"),
      h("p", { class: "nn-sub", html: "AI nhìn ảnh bằng <b>mạng CNN</b>: nhiều <b>bộ lọc</b> nhỏ trượt khắp ảnh, lớp sau ghép kết quả của lớp trước. Bấm từng bước bên trái để xem." }),
      scene()));
  const onKey = (e) => e.key === "Escape" && close();
  function close() { clearTimers(); document.removeEventListener("keydown", onKey); el.remove(); onClose?.(); }
  document.addEventListener("keydown", onKey);
  document.body.append(el); sfx.blip();
}
