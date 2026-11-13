// Bước 4 — Huấn luyện (MÔ PHỎNG trực quan). Kết quả phụ thuộc vào lựa chọn của học sinh
// và chất lượng nhãn ở bước 1–2. Bước 5 dùng mô hình YOLO11n đã được huấn luyện sẵn trên COCO.
import { S, $, h, imgUrl, loadImg, sleep, rng, labelQuality } from "../state.js";
import { paintBox } from "../lightbox.js";
import { classes, byKey, SHOW_SIM_NOTE } from "../config.js";
import * as yolo from "../yolo.js";
import { sfx, confetti, toast } from "../fx.js";

const MODELS = {
  n: { vi: "Nano", sub: "2,6 triệu tham số", base: 0.8, slow: 1, speed: 1 },
  s: { vi: "Small", sub: "9,4 triệu", base: 0.86, slow: 1.15, speed: 2.6 },
  m: { vi: "Medium", sub: "20 triệu", base: 0.89, slow: 1.35, speed: 6.5 },
};
const INITS = { pre: { vi: "Từ AI đã biết nhìn", sub: "học tiếp" }, scratch: { vi: "Từ con số 0", sub: "chưa biết gì" } };
const EPOCHS = [10, 25, 50];
const opt = { model: "n", init: "pre", ep: 25, aug: true };
let ctx, running = false, imgCache = new Map(), inited = false;

function seg(el, items, key) {
  el.innerHTML = "";
  for (const [k, v] of items) {
    el.append(h("button", { class: `segb ${opt[key] === k ? "on" : ""}`, onclick: () => { if (running) return; opt[key] = k; sfx.blip(); renderOpts(); } },
      h("b", {}, v.vi ?? String(v)), v.sub ? h("span", {}, v.sub) : null));
  }
}
function renderOpts() {
  seg($("#tr-init"), Object.entries(INITS), "init");
  seg($("#tr-ep"), EPOCHS.map((e) => [e, { vi: String(e) }]), "ep");
  seg($("#tr-aug"), [[true, { vi: "Bật" }], [false, { vi: "Tắt" }]], "aug");
}

async function img(f) { if (!imgCache.has(f)) imgCache.set(f, await loadImg(imgUrl(f))); return imgCache.get(f); }

/** bản đồ đặc trưng "thật": lớp 1 = cạnh (Sobel), lớp 2 = cạnh thô, lớp 3 = vùng con vật */
function featureMaps(im, it, p) {
  const cs = document.querySelectorAll("#tr-phases .fm");
  const S0 = 56, t = document.createElement("canvas"); t.width = t.height = S0;
  const g = t.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0, S0, S0);
  const d = g.getImageData(0, 0, S0, S0).data, gray = new Float32Array(S0 * S0);
  for (let i = 0; i < S0 * S0; i++) gray[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  const edge = new Float32Array(S0 * S0);
  for (let y = 1; y < S0 - 1; y++) for (let x = 1; x < S0 - 1; x++) {
    const i = y * S0 + x;
    const gx = gray[i - S0 + 1] + 2 * gray[i + 1] + gray[i + S0 + 1] - gray[i - S0 - 1] - 2 * gray[i - 1] - gray[i + S0 - 1];
    const gy = gray[i + S0 - 1] + 2 * gray[i + S0] + gray[i + S0 + 1] - gray[i - S0 - 1] - 2 * gray[i - S0] - gray[i - S0 + 1];
    edge[i] = Math.min(255, Math.hypot(gx, gy) / 3);
  }
  const paint = (c, f, color) => {
    const x = c.getContext("2d"), o = x.createImageData(S0, S0);
    for (let i = 0; i < S0 * S0; i++) { const v = f(i); o.data[i * 4] = color[0] * v; o.data[i * 4 + 1] = color[1] * v; o.data[i * 4 + 2] = color[2] * v; o.data[i * 4 + 3] = 255; }
    x.putImageData(o, 0, 0);
  };
  paint(cs[0], (i) => edge[i] / 255, [255, 255, 255]);
  const B = 8; // thô hơn
  paint(cs[1], (i) => { const x = Math.floor((i % S0) / B) * B, y = Math.floor(i / S0 / B) * B; let s = 0; for (let a = 0; a < B; a++) for (let b = 0; b < B; b++) s += edge[(y + a) * S0 + x + b] || 0; return Math.min(1, s / (B * B * 90)); }, [56, 189, 248]);
  const [bx, by, bw, bh] = it.box;
  paint(cs[2], (i) => { const x = (i % S0) / S0, y = Math.floor(i / S0) / S0; const inside = x >= bx && x <= bx + bw && y >= by && y <= by + bh; const dx = (x - (bx + bw / 2)) / (bw / 2 + 0.01), dy = (y - (by + bh / 2)) / (bh / 2 + 0.01); const v = Math.max(0, 1 - Math.hypot(dx, dy) * 0.8); return Math.min(1, (inside ? v : v * 0.3) * p + 0.12 * (1 - p) * ((i * 7919) % 13) / 13); }, [251, 191, 36]);
}

// ---------- băng chuyền ảnh ----------
const TH = 30, GAP = 3, COL = TH + GAP, BATCH = 16, ROWS = 2, GATE_X = 56; // mỗi lô 16 ảnh = 8 cột × 2 hàng
const BCOLS = BATCH / ROWS;
const belt = { files: [], spot: null };
function trainItems() {
  const t = (S.trainFiles || []).map((f) => S.pool.find((x) => x.file === f)).filter(Boolean);
  return t.length ? t : S.pool;
}
async function buildBelt() {
  const items = trainItems(), track = $("#tr-belt");
  // ảnh được soi: ảnh NẰM NGANG, con vật cỡ vừa (cho to, dễ nhìn); đặt ở lô đầu để lô 1 là lúc AI đoán
  let spot = null;
  for (const it of items.filter((x) => x.box[2] * x.box[3] > 0.15 && x.box[2] * x.box[3] < 0.55).slice(0, 12)) {
    const im = await img(it.file);
    if (im.naturalWidth / im.naturalHeight >= 1.3) { spot = it; break; }
  }
  spot = spot || items[0];
  belt.files = [spot, ...items.filter((x) => x !== spot)];
  belt.spot = spot;
  track.innerHTML = "";
  // 2 vòng ảnh nối nhau: hết epoch này là thấy ảnh của epoch sau đang chờ
  for (const it of [...belt.files, ...belt.files]) {
    track.append(h("div", { class: `bt-th ${it === spot ? "spot" : ""}` }, h("img", { src: imgUrl(it.file), loading: "lazy" })));
  }
  moveBelt(0, false);
  $("#tr-beltinfo").innerHTML = `Mỗi lượt AI xem <b>${BATCH} ảnh</b> (1 lô) · 1 epoch = xem hết <b>${items.length} ảnh học</b> · <span class="spot-key">🔍</span> ảnh được soi`;
}
function moveBelt(batch, animate, ms = 300) {
  const tr = $("#tr-belt");
  tr.style.transition = animate ? `transform ${ms}ms cubic-bezier(.5,0,.3,1)` : "none";
  tr.style.transform = `translateX(${GATE_X - batch * BCOLS * COL}px)`;
}
function markBatch(batch, acc, r) {
  const ths = $("#tr-belt").children;
  for (let i = batch * BATCH; i < Math.min((batch + 1) * BATCH, belt.files.length); i++) {
    ths[i].classList.remove("ok", "bad"); ths[i].classList.add(r() < acc ? "ok" : "bad");
  }
}
const clearMarks = () => [...$("#tr-belt").children].forEach((t) => t.classList.remove("ok", "bad"));

// ---------- soi 1 ảnh: đoán → so đáp án → tự sửa ----------
let spotIm = null, guess = null;
const lerp = (a, b, t) => a + (b - a) * t;
function spotSize() {
  const area = $("#tr-spotarea"), cv = $("#tr-spot");
  const k = Math.min(area.clientWidth / spotIm.naturalWidth, area.clientHeight / spotIm.naturalHeight);
  cv.width = Math.max(10, Math.round(spotIm.naturalWidth * k)); cv.height = Math.max(10, Math.round(spotIm.naturalHeight * k));
}
/** phase: 0 chưa học / xong, 1 đoán, 2 so đáp án, 3 tự sửa */
function drawSpot(phase, g0 = guess) {
  const cv = $("#tr-spot"); if (!spotIm) return;
  spotSize();
  const W = cv.width, H = cv.height, g = cv.getContext("2d"), it = belt.spot, c = byKey(it.cls);
  g.drawImage(spotIm, 0, 0, W, H);
  if (phase !== 1) paintBox(g, it.box, W, H, "#34d399", `Đáp án: ${c.emoji} ${c.vi}`, { dashed: true, bottom: true, lw: 2.5 });
  if (!g0) return;
  const pc = byKey(g0.cls), bx = [g0.x, g0.y, g0.w, g0.h];
  if (phase === 2) { // vạch nối 4 góc: thấy rõ khung đoán lệch bao nhiêu
    const [x, y, w, hh] = it.box;
    g.save(); g.strokeStyle = "#ef4444"; g.lineWidth = 1.6; g.setLineDash([3, 3]);
    [[g0.x, g0.y, x, y], [g0.x + g0.w, g0.y, x + w, y], [g0.x, g0.y + g0.h, x, y + hh], [g0.x + g0.w, g0.y + g0.h, x + w, y + hh]]
      .forEach(([a, b, c2, d]) => { g.beginPath(); g.moveTo(a * W, b * H); g.lineTo(c2 * W, d * H); g.stroke(); });
    g.restore();
  }
  paintBox(g, bx, W, H, g0.cls === it.cls ? pc.color : "#ef4444", `AI đoán: ${pc.emoji} ${pc.vi} ${Math.round(g0.conf * 100)}%`, { lw: 3, halo: true, fill: phase === 3 ? 0.12 : 0 });
}
function setPhase(p, cap) {
  document.querySelectorAll("#tr-phases .ph").forEach((el) => el.classList.toggle("act", +el.dataset.p === p));
  if (cap != null) $("#tr-cap").innerHTML = cap;
}
function knobs(on) {
  const k = $("#tr-knobs"), g = k.getContext("2d");
  for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) {
    const v = on ? Math.random() : 0.15;
    g.fillStyle = `hsl(${260 - v * 120} 80% ${30 + v * 40}%)`; g.fillRect(i * 4, j * 4, 3.4, 3.4);
  }
}
const iouB = (a, b) => yolo.iou({ x: a[0], y: a[1], w: a[2], h: a[3] }, { x: b[0], y: b[1], w: b[2], h: b[3] });

// ---------- biểu đồ ----------
function chart(canvas, series, { ymax = 1, ymin = 0, xmax = 10, fmt = (v) => v.toFixed(2) } = {}) {
  const W = (canvas.width = canvas.clientWidth * devicePixelRatio), H = (canvas.height = canvas.clientHeight * devicePixelRatio);
  const g = canvas.getContext("2d"); g.clearRect(0, 0, W, H);
  const p = 30 * devicePixelRatio, X = (x) => p + (x / xmax) * (W - p * 1.4), Y = (y) => H - p * 0.8 - ((y - ymin) / (ymax - ymin)) * (H - p * 1.4);
  g.strokeStyle = "rgba(100,116,139,.22)"; g.lineWidth = 1; g.font = `${10 * devicePixelRatio}px system-ui`; g.fillStyle = "#6b7280";
  for (let i = 0; i <= 4; i++) { const v = ymin + ((ymax - ymin) * i) / 4; g.beginPath(); g.moveTo(p, Y(v)); g.lineTo(W - p * 0.4, Y(v)); g.stroke(); g.fillText(fmt(v), 2, Y(v) + 3); }
  g.fillText("epoch " + xmax, W - p * 2.1, H - 4);
  let lx = p;
  g.font = `bold ${11 * devicePixelRatio}px system-ui`;
  for (const s of series) {
    if (!s.data.length) continue;
    g.strokeStyle = s.color; g.lineWidth = 2.5 * devicePixelRatio; g.setLineDash(s.dash ? [6, 5] : []);
    g.beginPath(); s.data.forEach((v, i) => (i ? g.lineTo(X(i + 1), Y(v)) : g.moveTo(X(i + 1), Y(v)))); g.stroke();
    const last = s.data[s.data.length - 1];
    // chú thích ở góc trên
    g.beginPath(); g.moveTo(lx, 8 * devicePixelRatio); g.lineTo(lx + 18 * devicePixelRatio, 8 * devicePixelRatio); g.stroke();
    g.setLineDash([]); g.fillStyle = s.color;
    const t = `${s.name}: ${fmt(last)}`;
    g.fillText(t, lx + 24 * devicePixelRatio, 12 * devicePixelRatio);
    lx += g.measureText(t).width + 44 * devicePixelRatio;
    g.beginPath(); g.arc(X(s.data.length), Y(last), 3.5 * devicePixelRatio, 0, 7); g.fill();
  }
  g.setLineDash([]);
}

// ---------- mô phỏng ----------
function simulate() {
  const m = MODELS[opt.model], q = labelQuality();
  const r = rng(Date.now() % 100000);
  const pre = opt.init === "pre";
  const tau = (pre ? 5 : 26) * m.slow;
  const cap = m.base * (pre ? 1 : 0.32) * (opt.aug ? 1 : 0.9) * (0.62 + 0.38 * q.q);
  const E = opt.ep, out = { box: [], cls: [], vbox: [], map: [] };
  for (let e = 1; e <= E; e++) {
    const prog = 1 - Math.exp(-e / tau);
    const over = !opt.aug && e > 14 ? (e - 14) * 0.0045 : 0;
    const n = () => (r() - 0.5) * 0.04;
    const tb = 2.3 - (pre ? 1.55 : 1.0) * prog - (opt.aug ? 0 : 0.25 * prog) + n();
    const tc = 3.6 - (pre ? 3.0 : 1.9) * prog - (opt.aug ? 0 : 0.45 * prog) + n();
    const vb = 2.35 - (pre ? 1.4 : 0.8) * prog + over * 22 + n();
    out.box.push(Math.max(0.3, tb)); out.cls.push(Math.max(0.2, tc)); out.vbox.push(Math.max(0.35, vb));
    out.map.push(Math.max(0.005, Math.min(0.99, cap * prog - over + n() * 0.6)));
  }
  const final = out.map[E - 1];
  out.perClass = classes().map((c) => ({ c, ap: Math.max(0.01, Math.min(0.99, final + (r() - 0.5) * 0.18)) }));
  out.final = final; out.q = q; out.over = !opt.aug && E > 20; out.tau = tau;
  return out;
}

function predictBox(it, p, r) {
  const [x, y, w, hh] = it.box, j = (1 - p) * 0.35;
  const nx = x + (r() - 0.5) * j, ny = y + (r() - 0.5) * j, nw = Math.max(0.05, w * (1 + (r() - 0.5) * j * 2)), nh = Math.max(0.05, hh * (1 + (r() - 0.5) * j * 2));
  const ok = r() < 0.25 + 0.75 * p;
  const cls = ok ? it.cls : classes()[Math.floor(r() * classes().length)].key;
  return { x: nx, y: ny, w: nw, h: nh, cls, conf: Math.min(0.98, 0.12 + 0.82 * p + (r() - 0.5) * 0.08) };
}

function drawVal(canvas, im, preds) {
  const W = canvas.width, H = canvas.height, g = canvas.getContext("2d");
  g.drawImage(im, 0, 0, W, H);
  g.font = "bold 12px system-ui"; g.lineWidth = 2.5;
  for (const b of preds) {
    const c = byKey(b.cls);
    g.globalAlpha = Math.max(0.35, b.conf);
    g.strokeStyle = c.color; g.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H);
    const t = `${c.emoji} ${Math.round(b.conf * 100)}%`, tw = g.measureText(t).width + 8;
    g.fillStyle = c.color; g.fillRect(b.x * W, Math.max(0, b.y * H - 17), tw, 17);
    g.fillStyle = "#0b1220"; g.fillText(t, b.x * W + 4, Math.max(12, b.y * H - 4));
    g.globalAlpha = 1;
  }
}

async function run() {
  if (running) return;
  running = true; $("#tr-go").disabled = true; $("#tr-result").innerHTML = ""; sfx.go();
  const sim = simulate(), E = opt.ep, m = MODELS[opt.model];
  const vals = (S.valFiles?.length ? S.valFiles : S.pool.map((x) => x.file)).slice(0, 4).map((f) => S.pool.find((x) => x.file === f)).filter(Boolean);
  while (vals.length < 4) vals.push(S.pool[vals.length]);
  const vgrid = $("#tr-val"); vgrid.innerHTML = "";
  const vcs = vals.map(() => { const c = h("canvas"); c.width = 220; c.height = 165; vgrid.append(c); return c; });
  const ims = await Promise.all(vals.map((v) => img(v.file)));
  vals.forEach((vv, i) => drawVal(vcs[i], ims[i], []));
  await buildBelt();
  spotIm = await img(belt.spot.file);
  const it = belt.spot, gt = it.box, nb = Math.ceil(belt.files.length / BATCH), r = rng(11);
  const tc = byKey(it.cls), cls = classes();
  // khung đoán ban đầu: "học từ số 0" thì đoán bừa, "AI đã biết nhìn" thì đã gần đúng
  const pre = opt.init === "pre";
  guess = pre ? { x: gt[0] + 0.1, y: Math.max(0, gt[1] - 0.08), w: gt[2] * 0.75, h: gt[3] * 1.1 }
    : { x: 0.05 + r() * 0.5, y: 0.05 + r() * 0.4, w: 0.2 + r() * 0.25, h: 0.2 + r() * 0.3 };
  const wrongCls = () => { const o = cls.filter((c) => c.key !== it.cls); return o[Math.floor(r() * o.length)].key; };
  const fast = Math.min(1100 * m.slow, 32000 / E);
  for (let e = 1; e <= E; e++) {
    // 2 epoch đầu chiếu chậm để kịp đọc, sau đó chạy nhanh
    const dur = e === 1 ? 7500 : e === 2 ? 3800 : fast, bd = dur / nb;
    const p = Math.min(1, sim.map[e - 1] / 0.85), acc = 0.15 + 0.8 * p;
    clearMarks(); moveBelt(0, false);
    // AI đoán trên ảnh đang soi: khung tiến dần về đáp án, tên đúng dần
    const ok = e > 1 && r() < 0.15 + 0.85 * p;
    const cur = { x: guess.x, y: guess.y, w: guess.w, h: guess.h, cls: ok ? it.cls : wrongCls(), conf: Math.min(0.97, 0.12 + 0.82 * p) };
    const v = iouB([cur.x, cur.y, cur.w, cur.h], gt);
    const px = Math.round(Math.hypot(cur.x + cur.w / 2 - gt[0] - gt[2] / 2, cur.y + cur.h / 2 - gt[1] - gt[3] / 2) * spotIm.naturalWidth);
    const loss = ((1 - v) * 1.6 + (ok ? 0.1 : 1.3) * (1 - p * 0.5)).toFixed(2);
    const gc = byKey(cur.cls);
    featureMaps(spotIm, it, Math.max(0.15, p));
    const half = Math.ceil(nb / 2);
    for (let b = 0; b < nb && running; b++) {
      $("#tr-epoch").textContent = `· epoch ${e}/${E}`;
      $("#tr-beltinfo").innerHTML = `<b>Epoch ${e}/${E}</b> · lô ${b + 1}/${nb} · đã xem <b>${Math.min((b + 1) * BATCH, belt.files.length)}/${belt.files.length}</b> ảnh · đoán đúng ~<b>${Math.round(acc * 100)}%</b>`;
      if (b > 0) moveBelt(b, true, Math.min(450, bd * 0.4));
      // ảnh đang soi nằm ở lô 1: lô 1 = đoán, các lô giữa = so đáp án, nửa sau = tự sửa
      if (b === 0) {
        guess = cur; drawSpot(1); knobs(false);
        setPhase(1, `AI nhìn ảnh qua nhiều lớp (nét → hình dạng → bộ phận) rồi <b>đoán</b>: đây là <b>${gc.emoji} ${gc.vi}</b> (chắc ${Math.round(cur.conf * 100)}%), nằm trong khung ${ok ? "màu" : "đỏ"}.`);
      } else if (b < half) {
        drawSpot(2);
        setPhase(2, `<b>So với đáp án</b> ${tc.emoji} ${tc.vi}: khung lệch <b>${px}px</b> (khớp ${Math.round(v * 100)}%) · ${ok ? '<b class="okc">đúng tên ✓</b>' : `<b class="badc">sai tên ✗</b> (đoán ${gc.vi})`} → <b>loss</b> (mức sai) của ảnh này = <b>${loss}</b>`);
      } else if (b === half) {
        setPhase(3, `<b>Tự sửa</b>: chỉnh <b>${MODELS[opt.model].sub.split(" ")[0]} triệu con số</b> bên trong theo hướng làm loss nhỏ đi, để lần sau khung sát hơn${ok ? "" : " và gọi đúng tên"}.`);
        // khung trượt dần về phía đáp án
        // học từ số 0: mỗi lần chỉ nhích một chút và còn chệch nhiều; AI đã biết nhìn thì sửa nhanh
        const step = pre ? 0.2 + 0.45 * p : 0.04 + 0.2 * p, noise = (1 - p) * (pre ? 0.05 : 0.12);
        const tgt = { x: lerp(cur.x, gt[0], step) + (r() - 0.5) * noise, y: lerp(cur.y, gt[1], step) + (r() - 0.5) * noise, w: lerp(cur.w, gt[2], step), h: lerp(cur.h, gt[3], step) };
        const t0 = performance.now(), T = Math.max(250, bd * (nb - b) * 0.8);
        (function anim() {
          const k = Math.min(1, (performance.now() - t0) / T), ease = 1 - (1 - k) ** 3;
          drawSpot(3, { ...cur, x: lerp(cur.x, tgt.x, ease), y: lerp(cur.y, tgt.y, ease), w: lerp(cur.w, tgt.w, ease), h: lerp(cur.h, tgt.h, ease) });
          knobs(true);
          if (k < 1) requestAnimationFrame(anim);
        })();
        guess = { ...cur, ...tgt };
        sfx.tick();
      }
      await sleep(bd * 0.5);
      markBatch(b, acc, r);
      await sleep(bd * 0.5);
    }
    // cập nhật số liệu
    chart($("#tr-loss"), [
      { name: "train loss", color: "#0284c7", data: sim.box.slice(0, e) },
      { name: "val loss", color: "#db2777", data: sim.vbox.slice(0, e), dash: true },
    ], { ymax: 2.6, ymin: 0, xmax: E });
    chart($("#tr-map"), [{ name: "mAP50", color: "#059669", data: sim.map.slice(0, e) }], { ymax: 1, xmax: E, fmt: (x) => Math.round(x * 100) + "%" });
    vals.forEach((vv, i) => drawVal(vcs[i], ims[i], p < 0.15 ? [predictBox(vv, p, r), predictBox(vv, p, r)] : [predictBox(vv, p, r)]));
    if (!opt.aug && e === 22) ctx.status("⚠ val loss (mức sai trên ảnh kiểm tra) đang tăng trở lại: AI bắt đầu học vẹt!");
  }
  const fv = iouB([guess.x, guess.y, guess.w, guess.h], gt), fok = guess.cls === it.cls;
  setPhase(0, fv >= 0.7 && fok
    ? `Xong ${E} epoch! Trên ảnh đang soi, khung đoán đã đi từ chỗ lệch tới <b>sát đáp án</b> (khớp ${Math.round(fv * 100)}%) và gọi đúng tên. Mỗi epoch AI làm 3 việc này với <b>tất cả ${belt.files.length} ảnh học</b>.`
    : `Xong ${E} epoch nhưng AI vẫn ${fok ? "" : "<b>gọi sai tên</b> và "}khung chỉ khớp <b>${Math.round(fv * 100)}%</b>: ${pre ? "cần học thêm epoch" : "học từ con số 0 với ít ảnh thì tiến bộ rất chậm"}. Thử đổi lựa chọn rồi huấn luyện lại!`);
  drawSpot(3);
  finish(sim);
  running = false; $("#tr-go").disabled = false; $("#tr-go").textContent = "↻ Huấn luyện lại";
}

function finish(sim) {
  const pct = Math.round(sim.final * 100), m = MODELS[opt.model];
  const ms = (S.yoloMs || 120) * m.speed;
  const run = { ...opt, map: sim.final, ms, n: S.runs.length + 1 };
  S.runs.push(run);
  if (!S.best || run.map > S.best.map) S.best = run;
  const grade = pct >= 75 ? ["🏆", "Xuất sắc"] : pct >= 60 ? ["🥈", "Khá tốt"] : pct >= 35 ? ["🥉", "Tạm được"] : ["😵", "Chưa dùng được"];
  const tips = [];
  if (opt.init === "scratch") tips.push("🧊 <b>Học từ con số 0</b> với vài chục ảnh là quá ít! Muốn vậy phải có hàng trăm nghìn ảnh. Kỹ sư thường cho AI <b>học tiếp từ một AI đã biết nhìn</b>.");
  if (!opt.aug && opt.ep > 20) tips.push("🦜 <b>Học vẹt</b>: đường val loss (mức sai trên ảnh kiểm tra, nét đứt) đi lên lại, vì AI thuộc lòng ảnh đã học chứ không hiểu.");
  if (opt.ep === 10) tips.push("⏱ <b>Học chưa đủ</b>: 10 vòng hơi ít, đường điểm vẫn còn đang đi lên.");
  if (sim.q.q < 0.75) tips.push(`🏷 Nhãn và khung bạn làm ở bước 1–2 chưa chuẩn (${Math.round(sim.q.q * 100)}%) nên kéo điểm xuống: <b>dạy sai thì AI học sai</b>.`);
  if (!tips.length) tips.push("✨ Lựa chọn rất chuẩn: học tiếp từ AI có sẵn, có tăng cường dữ liệu, đủ số vòng.");
  $("#tr-result").innerHTML = `<div class="result">
    <div class="res-top"><div class="res-g">${grade[0]}</div><div><div class="res-n">${pct}%</div><div class="muted">mAP50 (điểm của AI) · ${grade[1]}</div></div></div>
    <div class="ap">${sim.perClass.map(({ c, ap }) => `<div class="bar"><span class="bl">${c.emoji} ${c.vi}</span><span class="bt"><i style="width:${ap * 100}%;background:${c.color}"></i></span><span class="bv">${Math.round(ap * 100)}%</span></div>`).join("")}</div>
    <div class="tips">${tips.map((t) => `<p>${t}</p>`).join("")}</div>
    ${SHOW_SIM_NOTE ? `<div class="muted small">ⓘ Đây là mô phỏng. Huấn luyện thật mất nhiều giờ trên máy tính mạnh. Bước sau dùng AI đã được huấn luyện sẵn.</div>` : ""}
  </div>`;
  renderHist();
  if (pct >= 60) { sfx.win(); confetti({ count: 120 }); } else sfx.fail();
  if (S.runs.length === 1) toast("💡", "Thử thách", "Đổi 1 lựa chọn rồi huấn luyện lại để so sánh!");
  ctx.complete(S.runs.length >= 2 ? "Bạn đã so sánh các lựa chọn. Đi tiếp để dùng AI thật!" : "Huấn luyện xong! Có thể thử lựa chọn khác hoặc đi tiếp.");
}

function renderHist() {
  if (S.runs.length < 1) return;
  $("#tr-hist").hidden = false;
  const best = S.best;
  // lần mới nhất lên đầu để luôn thấy ngay mà không phải cuộn
  $("#tr-table").innerHTML = `<tr><th>Lần</th><th>Bắt đầu từ</th><th>Vòng</th><th>Tăng cường</th><th>Điểm</th></tr>` +
    [...S.runs].reverse().map((r) => `<tr class="${r === best ? "best" : ""}"><td>${r.n}${r === best ? " 👑" : ""}</td><td>${r.init === "pre" ? "AI có sẵn" : "Số 0"}</td><td>${r.ep}</td><td>${r.aug ? "Bật" : "Tắt"}</td><td><b>${Math.round(r.map * 100)}%</b></td></tr>`).join("");
}

export default {
  id: "train", icon: "🧠", title: "Huấn luyện AI",
  blurb: "Cùng xem AI học và tiến bộ",
  hint: "Bấm ▶ Huấn luyện. Sau đó thử đổi một lựa chọn để so sánh!",
  guide: { title: "Bước 4: Huấn luyện AI", text: "Mỗi <b>vòng học</b>, AI xem hết ảnh, đoán, so với đáp án rồi <b>tự sửa</b> để bớt sai. Cứ bấm <b>▶ Huấn luyện</b> trước. Sau đó thử đổi một lựa chọn (ví dụ <b>Từ con số 0</b>) rồi huấn luyện lại xem chuyện gì xảy ra!" },
  enter(c) {
    ctx = c;
    if (!inited) {
      inited = true;
      opt.aug = Object.values(S.prep.augs).some(Boolean);
      $("#tr-go").onclick = run;
      document.querySelectorAll("#tr-phases .fm").forEach((c) => { c.width = c.height = 56; });
      window.addEventListener("resize", () => { if (!$("#s-train").hidden && !running) drawSpot(guess ? 3 : 0); });
      chart($("#tr-loss"), [], { ymax: 2.6, xmax: opt.ep }); chart($("#tr-map"), [], { xmax: opt.ep, fmt: (v) => Math.round(v * 100) + "%" });
      // đo tốc độ thật của YOLO11n trên máy để hiển thị
      yolo.load().then(async () => { const im = await img(S.pool[0].file); const r = await yolo.detect(im, { classIds: [16] }); S.yoloMs = r.ms; }).catch(() => {});
    }
    renderOpts();
    if (!running) {
      guess = null;
      buildBelt().then(() => img(belt.spot.file)).then((im) => {
        spotIm = im; drawSpot(0); knobs(false);
        setPhase(0, `Bấm <b>▶ Huấn luyện</b>: băng chuyền đưa từng lô ảnh vào AI. Ảnh <span class="spot-key">🔍</span> này được soi kỹ: AI <b>đoán</b> → <b>so đáp án</b> → <b>tự sửa</b>, lặp lại qua từng epoch.`);
      });
    }
  },
};
