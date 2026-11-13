// Bước 2 — Vẽ khung (bounding box): dạy AI con vật nằm ở ĐÂU. Chấm bằng IoU.
// (1) 4 ảnh một con: vẽ 1 khung  (2) 2 ảnh nhiều con: vẽ nhiều khung rồi kéo tên vào từng khung
// (3) máy tự vẽ khung cho phần còn lại (bấm từng ảnh để xem)  (4) giới thiệu bo viền (segmentation) + tự thử bo viền
import { S, $, h, imgUrl, sleep, shuffle } from "../state.js";
import { classes, byKey, ACTIVE } from "../config.js";
import { iou } from "../yolo.js";
import { sfx, confetti } from "../fx.js";
import { openLightbox, paintBox, paintSeg, paintObjs, segIoU, boxWaste, label } from "../lightbox.js";

const SINGLE_COUNT = 4, MULTI_COUNT = 2;
const UNLABELED = "#7c3aed"; // màu khung chưa gắn tên (không trùng màu lớp nào)
let list = [], idx = 0, ctx, finished = false, inited = false;
let mode = "single";            // single | multi | try
let cur = null, start = null;   // khung đang kéo
let marks = [];                 // ảnh nhiều con: [{x,y,w,h,cls,ok}]
let checked = false, tries = 0;
let selChip = null, hoverMark = -1;
let poly = [], drawingTry = false, tryItem = null, tryBag = [];
let tab = "auto", autoShown = false;
const img = () => $("#bx-img"), cv = () => $("#bx-cv");
const objsOf = (it) => it.objs || [{ cls: it.cls, box: it.box, seg: it.seg }];
const rect = (b) => ({ x: b[0], y: b[1], w: b[2], h: b[3] });
const stars = (v) => (v >= 0.85 ? "⭐⭐⭐" : v >= 0.7 ? "⭐⭐" : v >= 0.5 ? "⭐" : "❌");

function pickList() {
  const singles = classes().map((c) => S.pool.find((it) => it.cls === c.key && (S.labelSet || []).includes(it.file)) || S.pool.find((it) => it.cls === c.key))
    .filter(Boolean).slice(0, SINGLE_COUNT).map((it) => ({ file: it.file, objs: objsOf(it) }));
  // ảnh nhiều con: chỉ lấy ảnh mà mọi con vật đều thuộc lớp đang học; ưu tiên 1 ảnh 2 con + 1 ảnh 3 con
  const act = new Set(ACTIVE);
  let mixed = (S.data.mixed || []).filter((m) => m.objs.every((o) => act.has(o.cls)));
  if (!mixed.length) mixed = (S.data.multi || []).filter((m) => act.has(m.cls) && m.boxes.length <= 3).map((m) => ({ file: m.file, objs: m.boxes.map((b) => ({ cls: m.cls, box: b })) }));
  const pick = [mixed.find((m) => m.objs.length === 2), mixed.find((m) => m.objs.length >= 3)].filter(Boolean);
  for (const m of mixed) if (pick.length < MULTI_COUNT && !pick.includes(m)) pick.push(m);
  list = [...singles, ...pick.slice(0, MULTI_COUNT).map((m) => ({ ...m, multi: true }))];
}

// ---------- vẽ ----------
function draw() {
  const c = cv(), im = img();
  c.width = im.clientWidth; c.height = im.clientHeight;
  const g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  if (mode === "try") return drawTry(g, W, H);
  const it = list[idx];
  if (!it) return;
  // nhãn đáp án đặt ở mép dưới khung để không đè lên tên học sinh gắn
  if (checked) for (const o of it.objs) paintBox(g, o.box, W, H, "#34d399", mode === "multi" ? `Đáp án: ${label(o.cls)}` : "Đáp án", { dashed: true, bottom: true });
  if (mode === "single") {
    if (checked && cur) { // phần chồng nhau
      const [x, y, w, hh] = it.objs[0].box;
      const ix = Math.max(x, cur.x), iy = Math.max(y, cur.y), ax = Math.min(x + w, cur.x + cur.w), ay = Math.min(y + hh, cur.y + cur.h);
      if (ax > ix && ay > iy) { g.fillStyle = "rgba(52,211,153,.28)"; g.fillRect(ix * W, iy * H, (ax - ix) * W, (ay - iy) * H); }
    }
    if (cur) { const c2 = byKey(it.objs[0].cls); paintBox(g, [cur.x, cur.y, cur.w, cur.h], W, H, c2.color, label(c2.key)); }
    return;
  }
  marks.forEach((m, i) => {
    const c2 = m.cls ? byKey(m.cls) : null;
    const tag = c2 ? `${label(m.cls)}${m.ok === true ? " ✓" : m.ok === false ? " ✗ sai tên" : ""}` : "? kéo tên vào";
    // khung chưa gắn tên: tím đậm nét đứt + viền trắng, nổi rõ trên cả nền sáng lẫn tối
    const opt = c2 ? {} : { dashed: true, halo: true, ink: "#fff", lw: 3.5 };
    paintBox(g, [m.x, m.y, m.w, m.h], W, H, m.ok === false ? "#ef4444" : c2 ? c2.color : UNLABELED, tag, { ...opt, fill: i === hoverMark ? 0.3 : 0, del: !checked });
  });
  if (cur) paintBox(g, [cur.x, cur.y, cur.w, cur.h], W, H, UNLABELED, "", { dashed: true, halo: true, lw: 3.5 });
}

function drawTry(g, W, H) {
  if (!tryItem) return;
  const o = tryItem.objs[0], c2 = byKey(o.cls);
  if (checked) paintSeg(g, o.seg, W, H, "#34d399", { alpha: 0.25, dashed: true, label: "Đáp án" });
  if (!poly.length) return;
  g.save();
  g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p.x * W, p.y * H) : g.moveTo(p.x * W, p.y * H)));
  if (checked || poly.length >= 3) { g.closePath(); g.globalAlpha = 0.3; g.fillStyle = c2.color; g.fill(); g.globalAlpha = 1; }
  g.lineWidth = 3; g.lineJoin = "round"; g.strokeStyle = c2.color; g.stroke();
  g.fillStyle = "#fff";
  for (const p of poly.length < 40 ? poly : [poly[0]]) { g.beginPath(); g.arc(p.x * W, p.y * H, 3.5, 0, 7); g.fill(); g.stroke(); }
  g.restore();
}

// ---------- chuột ----------
const posAt = (e) => {
  const r = cv().getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
};
const clampPos = (e) => { const r = cv().getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
function markAt(p) {
  let best = -1, area = 9;
  marks.forEach((m, i) => { if (p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h && m.w * m.h < area) { best = i; area = m.w * m.h; } });
  return best;
}
function delAt(p) {
  const W = cv().width, H = cv().height;
  return marks.findIndex((m) => { const X = (m.x + m.w) * W, Y = m.y * H; return p.x * W >= X - 22 && p.x * W <= X && p.y * H >= Y && p.y * H <= Y + 22; });
}

function enableDraw() {
  const c = cv();
  // ảnh đổi kích thước (vd. dòng kết quả hiện ra làm ảnh co lại) → vẽ lại cho khớp
  new ResizeObserver(() => { if (img().clientWidth && img().clientWidth !== c.width) draw(); }).observe(img());
  c.onpointerdown = (e) => {
    const p = clampPos(e);
    if (checked) return;
    if (mode === "try") { c.setPointerCapture(e.pointerId); drawingTry = true; addPt(p, true); return; }
    if (mode === "multi") {
      const di = delAt(p);
      if (di >= 0) { marks.splice(di, 1); sfx.blip(); afterMarks(); return; }
      const mi = markAt(p);
      if (selChip && mi >= 0) { assign(mi, selChip); return; }
      const n = list[idx].objs.length;
      if (marks.length >= n) { ctx.status(`Ảnh này có ${n} con vật và bạn đã vẽ đủ ${n} khung. Bấm ✕ trên khung để xoá nếu muốn vẽ lại.`); sfx.error(); return; }
    }
    c.setPointerCapture(e.pointerId); start = p; cur = null;
  };
  c.onpointermove = (e) => {
    if (mode === "try") { if (drawingTry) addPt(clampPos(e)); return; }
    if (!start) return;
    const p = clampPos(e);
    cur = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    draw();
  };
  c.onpointerup = () => {
    if (mode === "try") { drawingTry = false; $("#bx-check").disabled = poly.length < 3; return; }
    if (!start) return;
    start = null;
    if (cur && (cur.w < 0.03 || cur.h < 0.03)) cur = null;
    if (mode === "multi") { if (cur) { marks.push({ ...cur, cls: null }); sfx.blip(); } cur = null; afterMarks(); return; }
    $("#bx-check").disabled = !cur; if (cur) sfx.blip(); draw();
  };
}

// ---------- ảnh nhiều con: nhãn kéo thả ----------
function renderChips() {
  const el = $("#bx-labels"); el.innerHTML = "";
  el.append(h("span", { class: "muted small" }, "Kéo tên vào đúng khung:"));
  for (const c of classes()) {
    const chip = h("button", { class: `lbl-chip ${selChip === c.key ? "sel" : ""}`, style: `--c:${c.color}`, "data-k": c.key }, `${c.emoji} ${c.vi}`);
    chip.onpointerdown = (e) => chipDrag(e, chip, c.key);
    el.append(chip);
  }
}
function chipDrag(e, chip, k) {
  if (checked) return;
  e.preventDefault(); getSelection()?.removeAllRanges();
  const sx = e.clientX, sy = e.clientY; let moved = false, ghost = null;
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
    moved = true;
    if (!ghost) { ghost = chip.cloneNode(true); ghost.classList.add("lbl-ghost"); document.body.append(ghost); }
    ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px";
    const p = posAt(ev), hm = p ? markAt(p) : -1;
    if (hm !== hoverMark) { hoverMark = hm; draw(); }
  };
  const up = (ev) => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    ghost?.remove();
    if (moved) { const p = posAt(ev), mi = p ? markAt(p) : -1; hoverMark = -1; if (mi >= 0) assign(mi, k); else draw(); }
    else { selChip = selChip === k ? null : k; renderChips(); if (selChip) ctx.status("Giờ bấm vào khung muốn gắn tên này."); }
  };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}
function assign(mi, k) { marks[mi].cls = k; marks[mi].ok = undefined; selChip = null; sfx.lock(); renderChips(); afterMarks(); }
function afterMarks() {
  const n = list[idx].objs.length, lab = marks.filter((m) => m.cls).length;
  $("#bx-check").disabled = !(marks.length === n && lab === n);
  ctx.status(marks.length < n ? `Đã vẽ ${marks.length}/${n} khung. Vẽ tiếp khung cho từng con vật.`
    : lab < n ? `Đủ ${n} khung rồi! Giờ kéo tên con vật vào từng khung (${lab}/${n}).` : "Xong! Bấm ✔ Kiểm tra khung.");
  draw();
}

// ---------- từng ảnh ----------
function show() {
  const it = list[idx];
  mode = it.multi ? "multi" : "single";
  cur = null; start = null; marks = []; checked = false; tries = 0; selChip = null; hoverMark = -1;
  if (it.multi) {
    $("#bx-title").innerHTML = `Ảnh có <b>${it.objs.length} con vật</b>: vẽ ${it.objs.length} khung, rồi kéo tên vào từng khung`;
    renderChips();
  } else {
    const c = byKey(it.objs[0].cls);
    $("#bx-title").innerHTML = `Vẽ khung quanh <b class="tagc" style="--c:${c.color}">${c.emoji} ${c.vi}</b>`;
  }
  $("#bx-labels").hidden = !it.multi;
  $("#bx-prog").textContent = `Ảnh ${idx + 1}/${list.length}`;
  $("#bx-result").innerHTML = "";
  $("#bx-check").textContent = "✔ Kiểm tra khung";
  $("#bx-check").disabled = true; $("#bx-check").hidden = false; $("#bx-next").hidden = true;
  if (it.multi) ctx.status(`Ảnh này có ${it.objs.length} con vật: vẽ khung cho từng con.`);
  img().onload = draw;
  img().src = imgUrl(it.file);
  renderThumbs();
}

function renderThumbs() {
  const el = $("#bx-thumbs"); el.innerHTML = "";
  list.forEach((it, i) => {
    const r = S.myBoxes[it.file];
    el.append(h("div", { class: `thumb ${i === idx && !finished ? "on" : ""}` }, h("img", { src: imgUrl(it.file) }),
      h("span", {}, r ? stars(r.iou) : it.multi ? `👥 ${it.objs.length} con` : byKey(it.objs[0].cls).emoji)));
  });
}

function check() {
  if (mode === "try") return checkTry();
  const it = list[idx];
  checked = true; tries++;
  let v, msg, extra = "", allOk = true;
  if (mode === "single") {
    v = iou(cur, rect(it.objs[0].box));
    msg = v >= 0.85 ? "Xuất sắc! Khung rất sát con vật." : v >= 0.7 ? "Tốt lắm! Khung khá sát." :
      v >= 0.5 ? "Tạm ổn, nhưng khung còn lệch. Nhớ ôm sát từ tai đến chân, đuôi." : "Khung lệch nhiều quá: AI sẽ học sai vị trí con vật. Thử lại nhé!";
  } else {
    // ghép mỗi khung đáp án với khung học sinh chồng nhiều nhất
    const gts = it.objs, pairs = [], match = gts.map(() => ({ v: 0, mi: -1 })), used = new Set();
    gts.forEach((o, gi) => marks.forEach((m, mi) => pairs.push([iou(m, rect(o.box)), gi, mi])));
    pairs.sort((a, b) => b[0] - a[0]);
    for (const [pv, gi, mi] of pairs) if (match[gi].mi < 0 && !used.has(mi) && pv > 0) { match[gi] = { v: pv, mi }; used.add(mi); }
    marks.forEach((m) => (m.ok = undefined));
    match.forEach((m, gi) => { if (m.mi >= 0) marks[m.mi].ok = marks[m.mi].cls === gts[gi].cls; });
    const okN = marks.filter((m) => m.ok === true).length;
    allOk = okN === gts.length;
    v = match.reduce((a, m) => a + m.v, 0) / gts.length;
    extra = ` · Tên đúng <b>${okN}/${gts.length}</b>`;
    msg = !allOk ? "Có khung bị gắn sai tên (✗): AI sẽ học nhầm con này thành con khác!" : v >= 0.7 ? "Tuyệt! Đủ khung, đúng tên, khung sát." :
      v >= 0.5 ? "Đúng tên rồi, nhưng có khung còn lệch." : "Khung lệch nhiều quá. Thử chỉnh lại nhé!";
  }
  draw();
  const pct = Math.round(v * 100), good = v >= 0.5 && allOk, pass = good || tries >= 3;
  $("#bx-result").innerHTML = `<div class="iou-big ${good ? "ok" : "bad"}"><b>Khớp ${pct}%</b> ${stars(v)}${extra}</div><div>${msg}</div>`;
  if (good) sfx.correct(); else sfx.fail();
  if (pass) {
    const prev = S.myBoxes[it.file]?.iou || 0;
    S.myBoxes[it.file] = { box: cur ? { ...cur } : null, iou: Math.max(prev, v) };
    $("#bx-check").hidden = true; $("#bx-next").hidden = false;
    $("#bx-next").textContent = idx < list.length - 1 ? "Ảnh tiếp →" : "Xong 🎉";
    ctx.status(idx < list.length - 1 ? "Bấm Ảnh tiếp để sang ảnh sau." : "Bấm Xong để máy vẽ khung cho các ảnh còn lại.");
  } else {
    // giữ lại khung để học sinh sửa (ảnh nhiều con) hoặc vẽ lại (ảnh một con)
    setTimeout(() => {
      if (list[idx] !== it || !checked) return;
      checked = false;
      if (mode === "single") { cur = null; $("#bx-check").disabled = true; } else { marks.forEach((m) => { if (m.ok !== false) m.ok = undefined; }); afterMarks(); }
      draw();
    }, 1800);
  }
  renderThumbs();
}

// ---------- máy vẽ khung tự động + bo viền ----------
const restItems = () => { const done = new Set(list.map((it) => it.file)); return S.pool.filter((it) => !done.has(it.file)).map((it) => ({ file: it.file, objs: objsOf(it) })); };
const segItems = () => {
  const act = new Set(ACTIVE);
  const mixed = (S.data.mixed || []).filter((m) => m.objs.every((o) => act.has(o.cls) && o.seg)).map((m) => ({ file: m.file, objs: m.objs }));
  return [...mixed, ...S.pool.filter((it) => it.seg).map((it) => ({ file: it.file, objs: objsOf(it) }))];
};

function cell(it, m, onclick) {
  const svg = it.objs.map((o) => {
    const c = byKey(o.cls), [x, y, w, hh] = o.box;
    if (m === "seg" && o.seg) {
      const pts = []; for (let i = 0; i < o.seg.length; i += 2) pts.push(`${(o.seg[i] * 100).toFixed(1)},${(o.seg[i + 1] * 100).toFixed(1)}`);
      return `<polygon points="${pts.join(" ")}" fill="${c.color}" fill-opacity=".5" stroke="${c.color}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    }
    return `<rect x="${x * 100}" y="${y * 100}" width="${w * 100}" height="${hh * 100}" fill="none" stroke="${c.color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const el = h("button", { class: "auto-cell", title: "Bấm để phóng to", onclick }, h("img", { src: imgUrl(it.file), loading: "lazy" }),
    h("span", { class: "auto-tag" }, it.objs.map((o) => byKey(o.cls).emoji).join("")));
  el.insertAdjacentHTML("beforeend", `<svg class="auto-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${svg}</svg>`);
  return el;
}

/** chọn số cột để TẤT CẢ ô (tỉ lệ 4:3) vừa trong vùng còn trống, không phải cuộn */
function fitGrid(grid) {
  const panel = $("#bx-panel"), head = panel.querySelector(".auto-head");
  const n = grid.children.length, gap = 6;
  const Wd = grid.clientWidth, Hd = panel.clientHeight - (head?.offsetHeight || 0) - 4;
  if (!n || Wd <= 0 || Hd <= 0) return;
  let cols = 1;
  for (let c = 1; c <= n; c++) {
    const w = (Wd - gap * (c - 1)) / c, rows = Math.ceil(n / c);
    cols = c;
    if (rows * (w * 0.75) + gap * (rows - 1) <= Hd) break;
  }
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

async function renderAuto(animate) {
  const rest = restItems(), panel = $("#bx-panel");
  panel.innerHTML = `<div class="auto-head">🤖 Còn <b>${rest.length}</b> ảnh nữa. Vẽ tay hết thì lâu lắm! Kỹ sư thật để <b>máy vẽ khung tự động</b>, rồi người kiểm tra lại. <span class="muted">Bấm vào ảnh để phóng to.</span></div><div class="auto-grid" id="bx-auto"></div>`;
  const grid = $("#bx-auto");
  rest.forEach((it, i) => grid.append(cell(it, "box", () => openLightbox(rest, i, "box"))));
  fitGrid(grid);
  if (!animate) { [...grid.children].forEach((c) => c.classList.add("on")); return; }
  for (const c of grid.children) { await sleep(60); c.classList.add("on"); sfx.blip(); }
}

function renderSeg() {
  const items = segItems(), panel = $("#bx-panel");
  panel.innerHTML = `<div class="auto-head">✂️ <b>Bo viền (segmentation)</b>: thay vì khung chữ nhật, AI tô <b>đúng từng điểm ảnh</b> thuộc con vật nên biết cả hình dáng.
    Dùng trong xe tự lái (tách người, đường, xe), y tế (khoanh vùng khối u), xoá phông ảnh… <span class="muted">Bấm vào ảnh để phóng to và so sánh với khung.</span></div><div class="auto-grid" id="bx-seg"></div>`;
  const grid = $("#bx-seg");
  items.forEach((it, i) => { const c = cell(it, "seg", () => openLightbox(items, i, "seg")); c.classList.add("on"); grid.append(c); });
  fitGrid(grid);
}

function setTab(t) {
  tab = t;
  document.querySelectorAll("#bx-tabs .tab").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  const isTry = t === "try";
  $("#bx-area").hidden = !isTry; $("#bx-panel").hidden = isTry;
  $("#bx-labels").hidden = true; $("#bx-foot").hidden = !isTry; $("#bx-clear").hidden = !isTry;
  const cc = $("#bx-concept");
  if (t === "auto") { mode = "done"; renderAuto(false); $("#bx-title").textContent = "Mọi ảnh đã có tên và khung ✅"; $("#bx-prog").textContent = ""; cc.innerHTML = conceptBox(); }
  if (t === "seg") { mode = "done"; renderSeg(); $("#bx-title").textContent = "Khung chữ nhật và bo viền khác nhau thế nào?"; $("#bx-prog").textContent = ""; cc.innerHTML = conceptSeg(); }
  if (isTry) { mode = "try"; if (!tryItem) pickTry(); else showTry(); cc.innerHTML = conceptSeg(); }
}
function conceptBox() {
  const ious = Object.values(S.myBoxes).map((b) => b.iou);
  const avg = ious.length ? Math.round((ious.reduce((a, b) => a + b, 0) / ious.length) * 100) : 0;
  return `<b>💡 AI cần biết cả tên lẫn vị trí</b><p>Khung của bạn khớp trung bình <b>${avg}%</b> với đáp án. Khung vẽ ẩu hay gắn sai tên thì AI sẽ học sai.</p><p>Bây giờ bạn có <b>${S.pool.length} ảnh</b> đã đủ tên và khung. Xem thêm tab <b>✂️ Bo viền</b> nhé!</p>`;
}
function conceptSeg() {
  return `<b>💡 Khung hay viền?</b><p><b>Khung</b>: nhanh, dễ vẽ, đủ để đếm và tìm con vật (YOLO ở bài này dùng khung).</p><p><b>Viền</b>: chính xác tới từng điểm ảnh nhưng vẽ lâu hơn nhiều. Có bản YOLO làm được cả việc này (YOLO-seg).</p>`;
}

// ---------- tự thử bo viền ----------
function pickTry() {
  if (!tryBag.length) tryBag = shuffle(S.pool.filter((it) => it.seg && it.box[2] * it.box[3] > 0.12));
  const it = tryBag.pop() || S.pool.find((x) => x.seg);
  tryItem = { file: it.file, objs: objsOf(it) };
  poly = []; checked = false;
  showTry();
}
function showTry() {
  const c = byKey(tryItem.objs[0].cls);
  $("#bx-title").innerHTML = `Tự bo viền quanh <b class="tagc" style="--c:${c.color}">${c.emoji} ${c.vi}</b>`;
  $("#bx-prog").textContent = "giữ chuột rồi đi vòng theo dáng con vật";
  $("#bx-check").textContent = "✔ Kiểm tra viền"; $("#bx-check").hidden = false; $("#bx-check").disabled = poly.length < 3 || checked;
  $("#bx-next").textContent = "🎲 Ảnh khác"; $("#bx-next").hidden = false;
  if (!checked) $("#bx-result").innerHTML = `<div class="muted">Giữ chuột và kéo vòng quanh con vật (hoặc bấm từng điểm), thả ra rồi bấm Kiểm tra.</div>`;
  ctx.status("Thử bo viền là phần thêm, không bắt buộc. Bấm Tiếp tục khi muốn đi tiếp.");
  img().onload = draw;
  if (img().getAttribute("src") !== imgUrl(tryItem.file)) img().src = imgUrl(tryItem.file); else draw();
}
function addPt(p, force) {
  const l = poly[poly.length - 1];
  if (!force && l && Math.hypot(p.x - l.x, p.y - l.y) < 0.012) return;
  poly.push(p); draw();
}
function checkTry() {
  const o = tryItem.objs[0], flat = poly.flatMap((p) => [p.x, p.y]);
  const v = segIoU(flat, o.seg), waste = Math.round(boxWaste(o.box, o.seg) * 100);
  checked = true; draw();
  const pct = Math.round(v * 100);
  $("#bx-result").innerHTML = `<div class="iou-big ${v >= 0.6 ? "ok" : "bad"}"><b>Viền khớp ${pct}%</b> ${stars(v + 0.1)}</div>
    <div>${v >= 0.8 ? "Rất khéo tay!" : v >= 0.6 ? "Khá tốt!" : "Bo viền khó hơn vẽ khung nhiều, đúng không?"} Nếu chỉ dùng khung, <b>${waste}%</b> diện tích khung là nền chứ không phải con vật.</div>`;
  $("#bx-check").disabled = true;
  if (v >= 0.6) sfx.correct(); else sfx.fail();
}

async function autoAnnotate() {
  finished = true; mode = "done";
  sfx.win(); confetti({ count: 90 });
  $("#bx-result").innerHTML = ""; $("#bx-check").hidden = true; $("#bx-next").hidden = true;
  $("#bx-tabs").hidden = false;
  $("#bx-concept").hidden = false;
  renderThumbs();
  setTab("auto");
  if (!autoShown) { autoShown = true; await renderAuto(true); }
  ctx.complete("Tuyệt! Xem thử tab ✂️ Bo viền, hoặc bấm Tiếp tục để chuẩn bị ảnh cho AI học.");
}

export default {
  id: "box", icon: "🔲", title: "Khoanh vùng",
  blurb: "Đánh dấu vị trí từng con vật",
  hint: "Kéo chuột trên ảnh để vẽ khung ôm sát con vật.",
  guide: { title: "Bước 2: Khoanh vùng con vật", text: "AI không chỉ nói <b>“có con chó”</b> mà còn chỉ ra <b>con chó ở đâu</b>. Hãy <b>kéo chuột vẽ khung ôm sát</b> con vật trong 6 ảnh. Hai ảnh cuối có nhiều con: vẽ khung cho <b>từng con</b> rồi <b>kéo tên</b> vào đúng khung." },
  enter(c) {
    ctx = c;
    if (!inited) {
      inited = true;
      enableDraw();
      $("#bx-clear").onclick = () => {
        if (checked && mode !== "try") return;
        cur = null; marks = []; poly = []; checked = false; selChip = null;
        $("#bx-check").disabled = true;
        if (mode === "try") showTry(); else if (mode === "multi") { renderChips(); afterMarks(); } else draw();
      };
      $("#bx-check").onclick = check;
      $("#bx-next").onclick = () => {
        sfx.blip();
        if (mode === "try") return pickTry();
        if (idx < list.length - 1) { idx++; show(); } else autoAnnotate();
      };
      document.querySelectorAll("#bx-tabs .tab").forEach((b) => (b.onclick = () => { sfx.blip(); setTab(b.dataset.t); }));
      window.addEventListener("resize", () => {
        if ($("#s-box").hidden) return;
        if (!$("#bx-area").hidden) draw();
        const g = $("#bx-panel .auto-grid"); if (g && !$("#bx-panel").hidden) fitGrid(g);
      });
    }
    if (finished) return;
    pickList(); idx = 0; show();
  },
};
