// Bước 4 — Huấn luyện (MÔ PHỎNG trực quan). Kết quả phụ thuộc vào lựa chọn của học sinh
// và chất lượng nhãn ở bước 1–2. Bước 5 dùng mô hình YOLO11n đã được huấn luyện sẵn trên COCO.
import { S, $, h, imgUrl, loadImg, sleep, rng, labelQuality } from "../state.js";
import { classes, byKey, SHOW_SIM_NOTE } from "../config.js";
import * as yolo from "../yolo.js";
import { sfx, confetti, toast } from "../fx.js";

const MODELS = {
  n: { vi: "Nano", sub: "2,6 triệu tham số", base: 0.8, slow: 1, speed: 1 },
  s: { vi: "Small", sub: "9,4 triệu", base: 0.86, slow: 1.15, speed: 2.6 },
  m: { vi: "Medium", sub: "20 triệu", base: 0.89, slow: 1.35, speed: 6.5 },
};
const INITS = { pre: { vi: "Từ YOLO đã học sẵn", sub: "transfer learning" }, scratch: { vi: "Từ con số 0", sub: "tay trắng" } };
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
  seg($("#tr-model"), Object.entries(MODELS), "model");
  seg($("#tr-init"), Object.entries(INITS), "init");
  seg($("#tr-ep"), EPOCHS.map((e) => [e, { vi: String(e) }]), "ep");
  seg($("#tr-aug"), [[true, { vi: "Bật" }], [false, { vi: "Tắt" }]], "aug");
}

// ---------- sơ đồ mạng ----------
function renderNet() {
  const el = $("#tr-net"); el.innerHTML = "";
  const blk = (id, icon, t, sub, extra) => h("div", { class: "nb", id }, h("div", { class: "nb-i" }, icon), h("div", {}, h("b", {}, t), h("div", { class: "muted small" }, sub)), extra || null);
  const fm = h("div", { class: "fmaps" }, ...[0, 1, 2].map((i) => { const c = h("canvas", { class: "fm" }); c.width = c.height = 56; c.dataset.i = i; return c; }));
  el.append(
    blk("nb-in", "🖼️", "Ảnh đầu vào", "lô 16 ảnh · 640×640"),
    h("div", { class: "nflow" }),
    blk("nb-bb", "👁️", "Backbone: “đôi mắt”", "nhìn nét → hình dạng → bộ phận", fm),
    h("div", { class: "nflow" }),
    blk("nb-nk", "🔗", "Neck", "ghép thông tin vật to + vật nhỏ"),
    h("div", { class: "nflow" }),
    blk("nb-hd", "🎯", "Head: dự đoán", "8.400 khung · mỗi khung chọn 1 lớp"),
    h("div", { class: "nflow" }),
    blk("nb-ls", "📏", "So với đáp án → sai số", "khung lệch bao nhiêu? đoán đúng lớp không?"),
    h("div", { class: "nback", id: "nb-back" }, "⟲ Lan truyền ngược: chỉnh ", h("b", { id: "nb-params" }, MODELS[opt.model].sub), " trọng số cho bớt sai"),
  );
}

async function img(f) { if (!imgCache.has(f)) imgCache.set(f, await loadImg(imgUrl(f))); return imgCache.get(f); }

/** bản đồ đặc trưng "thật": lớp 1 = cạnh (Sobel), lớp 2 = cạnh thô, lớp 3 = vùng con vật */
function featureMaps(im, it, p) {
  const cs = document.querySelectorAll("#tr-net .fm");
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

// ---------- biểu đồ ----------
function chart(canvas, series, { ymax = 1, ymin = 0, xmax = 10, fmt = (v) => v.toFixed(2) } = {}) {
  const W = (canvas.width = canvas.clientWidth * devicePixelRatio), H = (canvas.height = canvas.clientHeight * devicePixelRatio);
  const g = canvas.getContext("2d"); g.clearRect(0, 0, W, H);
  const p = 30 * devicePixelRatio, X = (x) => p + (x / xmax) * (W - p * 1.4), Y = (y) => H - p * 0.8 - ((y - ymin) / (ymax - ymin)) * (H - p * 1.4);
  g.strokeStyle = "rgba(148,163,184,.18)"; g.lineWidth = 1; g.font = `${10 * devicePixelRatio}px system-ui`; g.fillStyle = "#94a3b8";
  for (let i = 0; i <= 4; i++) { const v = ymin + ((ymax - ymin) * i) / 4; g.beginPath(); g.moveTo(p, Y(v)); g.lineTo(W - p * 0.4, Y(v)); g.stroke(); g.fillText(fmt(v), 2, Y(v) + 3); }
  g.fillText("vòng " + xmax, W - p * 1.8, H - 4);
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
  renderNet();
  const sim = simulate(), E = opt.ep, m = MODELS[opt.model];
  const log = $("#tr-log");
  log.innerHTML = "";
  const L = (s, cls = "") => { log.append(h("div", { class: cls }, s)); log.scrollTop = log.scrollHeight; };
  L(`$ yolo train model=yolo11${opt.model}${opt.init === "pre" ? ".pt" : ".yaml"} data=dong_vat.yaml epochs=${E} imgsz=640${opt.aug ? "" : " augment=False mosaic=0"}`, "cmd");
  L(`Dữ liệu: ${(S.trainFiles || []).length} ảnh huấn luyện, ${(S.valFiles || []).length} ảnh kiểm tra, ${classes().length} lớp`);
  L(opt.init === "pre" ? "Nạp trọng số đã học từ COCO (330.000 ảnh) ✓" : "Khởi tạo trọng số NGẪU NHIÊN (mô hình chưa biết gì)");
  L("   Vòng   box_loss   cls_loss   mAP50", "hd");
  const vals = (S.valFiles?.length ? S.valFiles : S.pool.map((x) => x.file)).slice(0, 4).map((f) => S.pool.find((x) => x.file === f)).filter(Boolean);
  while (vals.length < 4) vals.push(S.pool[vals.length]);
  const vgrid = $("#tr-val"); vgrid.innerHTML = "";
  const vcs = vals.map(() => { const c = h("canvas"); c.width = 220; c.height = 165; vgrid.append(c); return c; });
  const ims = await Promise.all(vals.map((v) => img(v.file)));
  const trainSet = S.pool;
  const dur = Math.min(1100 * m.slow, 32000 / E);
  const blocks = ["nb-in", "nb-bb", "nb-nk", "nb-hd", "nb-ls"];
  const r = rng(11);
  for (let e = 1; e <= E; e++) {
    $("#tr-epoch").textContent = `· vòng ${e}/${E}`;
    // lượt đi
    const it = trainSet[(e * 7) % trainSet.length];
    featureMaps(await img(it.file), it, sim.map[e - 1] / Math.max(0.3, sim.final));
    for (const b of blocks) { document.getElementById(b)?.classList.add("act"); await sleep(dur / 9); }
    $("#nb-back").classList.add("act"); sfx.tick();
    await sleep(dur / 4);
    blocks.forEach((b) => document.getElementById(b)?.classList.remove("act")); $("#nb-back").classList.remove("act");
    // cập nhật số liệu
    chart($("#tr-loss"), [
      { name: "huấn luyện", color: "#38bdf8", data: sim.box.slice(0, e) },
      { name: "kiểm tra", color: "#f472b6", data: sim.vbox.slice(0, e), dash: true },
    ], { ymax: 2.6, ymin: 0, xmax: E });
    chart($("#tr-map"), [{ name: "mAP50", color: "#34d399", data: sim.map.slice(0, e) }], { ymax: 1, xmax: E, fmt: (v) => Math.round(v * 100) + "%" });
    const p = Math.min(1, sim.map[e - 1] / 0.85);
    vals.forEach((v, i) => drawVal(vcs[i], ims[i], p < 0.15 ? [predictBox(v, p, r), predictBox(v, p, r)] : [predictBox(v, p, r)]));
    L(`${String(e).padStart(4)}/${E}    ${sim.box[e - 1].toFixed(3)}      ${sim.cls[e - 1].toFixed(3)}     ${sim.map[e - 1].toFixed(3)}`);
    if (!opt.aug && e === 22) L("⚠ Sai số trên ảnh KIỂM TRA đang tăng trở lại → mô hình bắt đầu học vẹt!", "warn");
  }
  L(`Đã lưu mô hình: runs/detect/train${S.runs.length + 1}/weights/best.pt ✓`, "ok");
  finish(sim);
  running = false; $("#tr-go").disabled = false; $("#tr-go").textContent = "↻ Huấn luyện lại (đổi cài đặt)";
}

function finish(sim) {
  const pct = Math.round(sim.final * 100), m = MODELS[opt.model];
  const ms = (S.yoloMs || 120) * m.speed;
  const run = { ...opt, map: sim.final, ms, n: S.runs.length + 1 };
  S.runs.push(run);
  if (!S.best || run.map > S.best.map) S.best = run;
  const grade = pct >= 75 ? ["🏆", "Xuất sắc"] : pct >= 60 ? ["🥈", "Khá tốt"] : pct >= 35 ? ["🥉", "Tạm được"] : ["😵", "Chưa dùng được"];
  const tips = [];
  if (opt.init === "scratch") tips.push("🧊 <b>Học từ con số 0</b> với vài chục ảnh là quá ít! YOLO thật cần hàng trăm nghìn ảnh. Kỹ sư dùng <b>transfer learning</b>: bắt đầu từ mô hình đã biết nhìn.");
  if (!opt.aug && opt.ep > 20) tips.push("🦜 <b>Học vẹt (overfitting)</b>: đường sai số kiểm tra (nét đứt) đi lên lại, vì AI thuộc lòng ảnh luyện tập chứ không hiểu.");
  if (opt.ep === 10) tips.push("⏱ <b>Học chưa đủ</b>: 10 vòng hơi ít, đường mAP vẫn còn đang đi lên.");
  if (opt.model === "m") tips.push(`🐢 Mô hình Medium chính xác hơn nhưng <b>chậm hơn ~${m.speed} lần</b>, khó chạy trên camera giá rẻ.`);
  if (sim.q.q < 0.75) tips.push(`🏷 Chất lượng nhãn của bạn (${Math.round(sim.q.q * 100)}%) kéo điểm xuống: <b>nhãn sai → AI sai</b>.`);
  if (!tips.length) tips.push("✨ Cấu hình rất chuẩn: transfer learning + tăng cường + đủ số vòng.");
  $("#tr-result").innerHTML = `<div class="result">
    <div class="res-top"><div class="res-g">${grade[0]}</div><div><div class="res-n">${pct}%</div><div class="muted">mAP50 · ${grade[1]}</div></div>
    <div class="res-s"><b>${Math.round(ms)} ms</b><span class="muted small">/ảnh trên máy này</span></div></div>
    <div class="ap">${sim.perClass.map(({ c, ap }) => `<div class="bar"><span class="bl">${c.emoji} ${c.vi}</span><span class="bt"><i style="width:${ap * 100}%;background:${c.color}"></i></span><span class="bv">${Math.round(ap * 100)}%</span></div>`).join("")}</div>
    <div class="tips">${tips.map((t) => `<p>${t}</p>`).join("")}</div>
    ${SHOW_SIM_NOTE ? `<div class="muted small">ⓘ Đây là mô phỏng. Huấn luyện thật cần GPU nhiều giờ. Bước sau dùng YOLO11n đã được huấn luyện sẵn.</div>` : ""}
  </div>`;
  renderHist();
  if (pct >= 60) { sfx.win(); confetti({ count: 120 }); } else sfx.fail();
  if (S.runs.length === 1) toast("💡", "Thử thách", "Đổi 1 cài đặt rồi huấn luyện lại để so sánh!");
  ctx.complete(S.runs.length >= 2 ? "Bạn đã so sánh các cấu hình. Đi tiếp để dùng AI thật!" : "Huấn luyện xong! Có thể thử cấu hình khác hoặc đi tiếp.");
}

function renderHist() {
  if (S.runs.length < 1) return;
  $("#tr-hist").hidden = false;
  const best = S.best;
  $("#tr-table").innerHTML = `<tr><th>#</th><th>Mô hình</th><th>Khởi đầu</th><th>Vòng</th><th>Tăng cường</th><th>mAP50</th><th>Tốc độ</th></tr>` +
    S.runs.map((r) => `<tr class="${r === best ? "best" : ""}"><td>${r.n}${r === best ? " 👑" : ""}</td><td>${MODELS[r.model].vi}</td><td>${INITS[r.init].vi}</td><td>${r.ep}</td><td>${r.aug ? "✔" : "✖"}</td><td><b>${Math.round(r.map * 100)}%</b></td><td>${Math.round(r.ms)} ms</td></tr>`).join("");
}

export default {
  id: "train", icon: "🧠", title: "Huấn luyện",
  blurb: "Xem AI học qua từng vòng",
  hint: "Chọn cài đặt rồi bấm ▶ Huấn luyện. Thử nhiều cấu hình để so sánh!",
  guide: { title: "Bước 4: Huấn luyện mô hình", text: "Mỗi <b>vòng (epoch)</b>, AI xem hết ảnh luyện tập, đoán khung, so với đáp án rồi <b>tự chỉnh</b> để bớt sai. Chọn cài đặt, bấm <b>▶ Huấn luyện</b>, rồi thử đổi một cài đặt (ví dụ <b>Từ con số 0</b> hoặc <b>Tắt tăng cường</b>) xem chuyện gì xảy ra!" },
  enter(c) {
    ctx = c;
    if (!inited) {
      inited = true;
      opt.aug = Object.values(S.prep.augs).some(Boolean);
      $("#tr-go").onclick = run;
      renderNet();
      chart($("#tr-loss"), [], { ymax: 2.6, xmax: opt.ep }); chart($("#tr-map"), [], { xmax: opt.ep });
      // đo tốc độ thật của YOLO11n trên máy để hiển thị
      yolo.load().then(async () => { const im = await img(S.pool[0].file); const r = await yolo.detect(im, { classIds: [16] }); S.yoloMs = r.ms; }).catch(() => {});
    }
    renderOpts();
  },
};
