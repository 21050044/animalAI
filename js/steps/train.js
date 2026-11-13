// Bước 4 — Huấn luyện (MÔ PHỎNG trực quan). Kết quả phụ thuộc vào lựa chọn của học sinh
// và chất lượng nhãn ở bước 1–2. Bước 5 dùng mô hình YOLO11n đã được huấn luyện sẵn trên COCO.
import { S, $, h, imgUrl, loadImg, sleep, rng, labelQuality } from "../state.js";
import { classes, byKey, SHOW_SIM_NOTE } from "../config.js";
import * as yolo from "../yolo.js";
import { sfx, confetti, toast } from "../fx.js";
import { nnPopup as openNN } from "../nnpopup.js";

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

// ---------- băng chuyền ảnh ----------
const TH = 30, GAP = 3, COL = TH + GAP, BATCH = 16, ROWS = 2, GATE_X = 56; // mỗi lô 16 ảnh = 8 cột × 2 hàng
const BCOLS = BATCH / ROWS;
const belt = { files: [] };
function trainItems() {
  const t = (S.trainFiles || []).map((f) => S.pool.find((x) => x.file === f)).filter(Boolean);
  return t.length ? t : S.pool;
}
function buildBelt() {
  const items = trainItems(), track = $("#tr-belt");
  belt.files = items;
  track.innerHTML = "";
  // 2 vòng ảnh nối nhau: hết epoch này là thấy ảnh của epoch sau đang chờ
  for (const it of [...belt.files, ...belt.files]) {
    track.append(h("div", { class: "bt-th" }, h("img", { src: imgUrl(it.file), loading: "lazy" })));
  }
  moveBelt(0, false);
  $("#tr-beltinfo").innerHTML = `Mỗi lượt AI xem <b>${BATCH} ảnh</b> (1 lô) · 1 epoch = xem hết <b>${items.length} ảnh học</b>`;
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

// ---------- popup giải thích mạng nơ-ron (bấm vào khối 🧠) ----------
let paused = false;
const wait = async (ms) => { await sleep(ms); while (paused) await sleep(120); };
function nnPopup() {
  const m = MODELS[opt.model];
  openNN({ vi: m.vi, sub: m.sub, init: opt.init }); // huấn luyện vẫn chạy bình thường phía sau
}

// ---------- lô ảnh → mô hình → loss ----------
const lerp = (a, b, t) => a + (b - a) * t;
function setPhase(p, cap) {
  document.querySelectorAll(".pipe .ph").forEach((el) => el.classList.toggle("act", +el.dataset.p === p));
  $("#tr-model").classList.toggle("think", p === 2);
  $("#tr-model").classList.toggle("tune", p === 3);
  $("#tr-a1").classList.toggle("go", p === 1);
  $("#tr-a2").classList.toggle("go", p === 2);
  $("#tr-loop").classList.toggle("act", p === 3);
  if (cap != null) $("#tr-cap").innerHTML = cap;
}
function buildModel() {
  const m = $("#tr-model"); m.innerHTML = "";
  m.onclick = nnPopup; m.title = "Bấm để xem bên trong mạng nơ-ron";
  m.append(h("span", { style: "font-size:30px" }, "🧠"));
  [4, 5, 4, 3].forEach((n, li) => m.append(h("div", { class: "lay" }, ...Array.from({ length: n }, (_, k) => h("i", { style: `--i:${li + k * 0.3}` })))));
}
function showBatch(b) {
  const box = $("#tr-batch"); box.innerHTML = "";
  belt.files.slice(b * BATCH, (b + 1) * BATCH).forEach((it) => box.append(h("img", { src: imgUrl(it.file) })));
  box.animate([{ transform: "translateX(-46px) scale(1.12)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "ease-out" });
}
function showLoss(v, max = 2.6) {
  const k = Math.max(0, Math.min(1, v / max)), col = k > 0.6 ? "#dc2626" : k > 0.35 ? "#d97706" : "#059669";
  const b = $("#tr-lossnow"); b.textContent = v.toFixed(2); b.style.color = col;
  $("#tr-lossbar").style.width = k * 100 + "%"; $(".pp-lbar").style.color = col;
  const o = document.querySelector(".pp-out"); o.classList.remove("pop"); void o.offsetWidth; o.classList.add("pop");
}

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
  buildBelt(); buildModel(); showLoss(sim.box[0] + 0.35);
  const nb = Math.ceil(belt.files.length / BATCH), r = rng(11);
  const nbE = Math.ceil(belt.files.length / BATCH), fast = Math.max(nbE * 240, Math.min(nbE * 420 * m.slow, 60000 / E));
  for (let e = 1; e <= E && running; e++) {
    // 2 epoch đầu chiếu chậm để kịp đọc, sau đó chạy nhanh
    const dur = e === 1 ? 16000 : e === 2 ? 9000 : fast, bd = dur / nb, slow = bd > 700;
    const p = Math.min(1, sim.map[e - 1] / 0.85), acc = 0.15 + 0.8 * p;
    const l0 = e > 1 ? sim.box[e - 2] : sim.box[0] + 0.35, l1 = sim.box[e - 1];
    clearMarks(); moveBelt(0, false);
    for (let b = 0; b < nb && running; b++) {
      $("#tr-epoch").textContent = `· epoch ${e}/${E}`;
      $("#tr-beltinfo").innerHTML = `<b>Epoch ${e}/${E}</b> · lô ${b + 1}/${nb} · đã xem <b>${Math.min((b + 1) * BATCH, belt.files.length)}/${belt.files.length}</b> ảnh`;
      if (b > 0) moveBelt(b, true, Math.min(450, bd * 0.4));
      const loss = Math.max(0.2, lerp(l0, l1, (b + 1) / nb) + (r() - 0.5) * 0.06);
      // ① lô ảnh được bốc ra, đưa vào AI
      showBatch(b);
      setPhase(1, `Lô <b>${b + 1}</b> (${Math.min(BATCH, belt.files.length - b * BATCH)} ảnh) được bốc ra khỏi băng chuyền và đưa vào AI.`);
      await wait(slow ? bd * 0.25 : bd * 0.2);
      // ② AI nhìn & đoán
      setPhase(2, `AI nhìn từng ảnh qua nhiều lớp (nét → hình dạng → bộ phận) rồi <b>đoán</b> con gì, nằm ở đâu.`);
      await wait(slow ? bd * 0.3 : bd * 0.3);
      // ③ đầu ra: loss; mô hình tự chỉnh
      showLoss(loss);
      setPhase(3, `AI đối chiếu với đáp án: lô này sai ở mức <b>loss = ${loss.toFixed(2)}</b>. Rồi AI <b>tự chỉnh ${MODELS[opt.model].sub.split(" ")[0]} triệu con số</b> bên trong để lần sau bớt sai.`);
      sfx.tick();
      await wait(slow ? bd * 0.3 : bd * 0.3);
      markBatch(b, acc, r);
      await wait(bd * 0.15);
    }
    chart($("#tr-loss"), [
      { name: "train loss", color: "#0284c7", data: sim.box.slice(0, e) },
      { name: "val loss", color: "#db2777", data: sim.vbox.slice(0, e), dash: true },
    ], { ymax: 2.6, ymin: 0, xmax: E });
    chart($("#tr-map"), [{ name: "mAP50", color: "#059669", data: sim.map.slice(0, e) }], { ymax: 1, xmax: E, fmt: (x) => Math.round(x * 100) + "%" });
    vals.forEach((vv, i) => drawVal(vcs[i], ims[i], p < 0.15 ? [predictBox(vv, p, r), predictBox(vv, p, r)] : [predictBox(vv, p, r)]));
    if (!opt.aug && e === 22) ctx.status("⚠ val loss (mức sai trên ảnh kiểm tra) đang tăng trở lại: AI bắt đầu học vẹt!");
  }
  setPhase(0, `Xong ${E} epoch! Loss giảm từ <b>${(sim.box[0] + 0.35).toFixed(2)}</b> xuống <b>${sim.box[E - 1].toFixed(2)}</b>: mỗi epoch AI xem <b>tất cả ${belt.files.length} ảnh học</b>, đoán, đo loss rồi tự chỉnh.`);
  showLoss(sim.box[E - 1]);
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
      chart($("#tr-loss"), [], { ymax: 2.6, xmax: opt.ep }); chart($("#tr-map"), [], { xmax: opt.ep, fmt: (v) => Math.round(v * 100) + "%" });
      // đo tốc độ thật của YOLO11n trên máy để hiển thị
      yolo.load().then(async () => { const im = await img(S.pool[0].file); const r = await yolo.detect(im, { classIds: [16] }); S.yoloMs = r.ms; }).catch(() => {});
    }
    renderOpts();
    if (!running) {
      buildBelt(); buildModel(); showLoss(0, 1); $("#tr-lossnow").textContent = "–";
      setPhase(0, `Bấm <b>▶ Huấn luyện</b>: băng chuyền đưa từng lô ảnh vào AI → AI đoán → ra con số <b>loss</b> (mức sai) → AI tự chỉnh để loss giảm. Lặp lại qua từng epoch.`);
    }
  },
};
