// Bước 2 — Vẽ khung (bounding box): dạy AI con vật nằm ở ĐÂU. Chấm bằng IoU.
import { S, $, h, imgUrl, sleep } from "../state.js";
import { classes, byKey } from "../config.js";
import { iou } from "../yolo.js";
import { sfx, confetti } from "../fx.js";

let list = [], idx = 0, cur = null, checked = false, tries = 0, ctx, finished = false;
const DRAW_COUNT = 3; // số ảnh học sinh tự vẽ khung, phần còn lại máy làm
const img = () => $("#bx-img"), cv = () => $("#bx-cv");

function pickList() {
  list = classes().map((c) => S.pool.find((it) => it.cls === c.key && (S.labelSet || []).includes(it.file)) || S.pool.find((it) => it.cls === c.key)).filter(Boolean).slice(0, DRAW_COUNT);
}

function draw() {
  const c = cv(), im = img();
  c.width = im.clientWidth; c.height = im.clientHeight;
  const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height);
  const it = list[idx];
  const W = c.width, H = c.height;
  if (checked) {
    const [x, y, w, hh] = it.box;
    g.setLineDash([8, 6]); g.lineWidth = 3; g.strokeStyle = "#34d399"; g.strokeRect(x * W, y * H, w * W, hh * H);
    g.setLineDash([]);
    g.fillStyle = "#34d399"; g.font = "bold 13px system-ui"; g.fillText("Đáp án", x * W + 4, y * H - 6 < 12 ? y * H + 16 : y * H - 6);
    if (cur) { // phần chồng nhau
      const ix = Math.max(x, cur.x), iy = Math.max(y, cur.y), ax = Math.min(x + w, cur.x + cur.w), ay = Math.min(y + hh, cur.y + cur.h);
      if (ax > ix && ay > iy) { g.fillStyle = "rgba(52,211,153,.28)"; g.fillRect(ix * W, iy * H, (ax - ix) * W, (ay - iy) * H); }
    }
  }
  if (cur) {
    const c2 = byKey(it.cls);
    g.lineWidth = 3; g.strokeStyle = c2.color; g.strokeRect(cur.x * W, cur.y * H, cur.w * W, cur.h * H);
    const tag = `${c2.emoji} ${c2.vi}`;
    g.font = "bold 14px system-ui"; const tw = g.measureText(tag).width + 10;
    const ty = cur.y * H > 22 ? cur.y * H - 22 : cur.y * H;
    g.fillStyle = c2.color; g.fillRect(cur.x * W - 1.5, ty, tw, 22);
    g.fillStyle = "#0b1220"; g.fillText(tag, cur.x * W + 4, ty + 16);
  }
}

function enableDraw() {
  const c = cv();
  let start = null;
  const pos = (e) => { const r = c.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  c.onpointerdown = (e) => { if (checked) return; c.setPointerCapture(e.pointerId); start = pos(e); cur = null; };
  c.onpointermove = (e) => {
    if (!start) return; const p = pos(e);
    cur = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    draw();
  };
  c.onpointerup = () => {
    start = null;
    if (cur && (cur.w < 0.03 || cur.h < 0.03)) cur = null;
    $("#bx-check").disabled = !cur; if (cur) sfx.blip(); draw();
  };
}

function show() {
  const it = list[idx], c = byKey(it.cls);
  cur = null; checked = false; tries = 0;
  $("#bx-title").innerHTML = `Vẽ khung quanh <b class="tagc" style="--c:${c.color}">${c.emoji} ${c.vi}</b>`;
  $("#bx-prog").textContent = `Ảnh ${idx + 1}/${list.length}`;
  $("#bx-result").innerHTML = "";
  $("#bx-check").disabled = true; $("#bx-check").hidden = false; $("#bx-next").hidden = true;
  img().onload = draw;
  img().src = imgUrl(it.file);
  renderThumbs();
}

function renderThumbs() {
  const el = $("#bx-thumbs"); el.innerHTML = "";
  list.forEach((it, i) => {
    const r = S.myBoxes[it.file];
    el.append(h("div", { class: `thumb ${i === idx ? "on" : ""}` }, h("img", { src: imgUrl(it.file) }),
      h("span", {}, r ? stars(r.iou) : byKey(it.cls).emoji)));
  });
}
const stars = (v) => (v >= 0.85 ? "⭐⭐⭐" : v >= 0.7 ? "⭐⭐" : v >= 0.5 ? "⭐" : "❌");

function check() {
  const it = list[idx];
  const [x, y, w, hh] = it.box;
  const v = iou(cur, { x, y, w, h: hh });
  checked = true; tries++; draw();
  const pct = Math.round(v * 100);
  const pass = v >= 0.5 || tries >= 3;
  const msg = v >= 0.85 ? "Xuất sắc! Khung rất sát con vật." : v >= 0.7 ? "Tốt lắm! Khung khá sát." :
    v >= 0.5 ? "Tạm ổn, nhưng khung còn lệch. Nhớ ôm sát từ tai đến chân, đuôi." :
    "Khung lệch nhiều quá: AI sẽ học sai vị trí con vật. Thử lại nhé!";
  $("#bx-result").innerHTML = `<div class="iou-big ${v >= 0.5 ? "ok" : "bad"}"><b>Khớp ${pct}%</b> ${stars(v)}</div><div>${msg}</div>`;
  if (v >= 0.5) sfx.correct(); else sfx.fail();
  if (pass) {
    const prev = S.myBoxes[it.file]?.iou || 0;
    S.myBoxes[it.file] = { box: { ...cur }, iou: Math.max(prev, v) };
    $("#bx-check").hidden = true; $("#bx-next").hidden = false;
    $("#bx-next").textContent = idx < list.length - 1 ? "Ảnh tiếp →" : "Xong 🎉";
  } else {
    setTimeout(() => { if (list[idx] === it) { checked = false; cur = null; draw(); $("#bx-check").disabled = true; } }, 1800);
  }
  renderThumbs();
}

async function autoAnnotate() {
  finished = true;
  sfx.win(); confetti({ count: 90 });
  const rest = S.pool.filter((it) => !list.includes(it));
  const wrap = $("#bx-wrap");
  wrap.classList.add("auto");
  wrap.innerHTML = `<div class="auto-head">🤖 Còn <b>${rest.length}</b> ảnh nữa. Vẽ tay hết thì lâu lắm! Kỹ sư thật để <b>máy vẽ khung tự động</b>, rồi người kiểm tra lại.</div><div class="auto-grid" id="bx-auto"></div>`;
  const grid = $("#bx-auto");
  for (const it of rest) {
    const c = byKey(it.cls);
    const [x, y, w, hh] = it.box;
    const cell = h("div", { class: "auto-cell" }, h("img", { src: imgUrl(it.file) }),
      h("div", { class: "auto-box", style: `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${hh * 100}%;--c:${c.color}` }, h("span", {}, c.emoji)));
    grid.append(cell);
  }
  for (const cell of grid.children) { await sleep(70); cell.classList.add("on"); sfx.blip(); }
  const ious = Object.values(S.myBoxes).map((b) => b.iou);
  const avg = Math.round((ious.reduce((a, b) => a + b, 0) / ious.length) * 100);
  const cc = $("#bx-concept"); cc.hidden = false;
  cc.innerHTML = `<b>💡 AI cần biết cả tên lẫn vị trí</b><p>Khung của bạn khớp trung bình <b>${avg}%</b> với đáp án. Khung vẽ ẩu thì AI sẽ học sai chỗ con vật đứng.</p><p>Bây giờ bạn có <b>${S.pool.length} ảnh</b> đã đủ tên và khung.</p>`;
  $("#bx-result").innerHTML = ""; $("#bx-check").hidden = true; $("#bx-next").hidden = true; $("#bx-clear").hidden = true;
  $("#bx-title").textContent = "Mọi ảnh đã có tên và khung ✅"; $("#bx-prog").textContent = "";
  ctx.complete("Tuyệt! Tiếp theo: chuẩn bị ảnh cho AI học.");
}

export default {
  id: "box", icon: "🔲", title: "Vẽ khung",
  blurb: "Chỉ cho AI con vật nằm ở đâu",
  hint: "Kéo chuột trên ảnh để vẽ khung ôm sát con vật.",
  guide: { title: "Bước 2: Vẽ khung quanh con vật", text: "AI không chỉ nói <b>“có con chó”</b> mà còn chỉ ra <b>con chó ở đâu</b>. Hãy <b>kéo chuột vẽ khung ôm sát</b> con vật trong 3 ảnh. Khung càng sát thì độ khớp càng cao." },
  enter(c) {
    ctx = c;
    if (finished) return;
    pickList(); idx = 0; enableDraw(); show();
    $("#bx-clear").onclick = () => { if (checked) return; cur = null; $("#bx-check").disabled = true; draw(); };
    $("#bx-check").onclick = check;
    $("#bx-next").onclick = () => { sfx.blip(); if (idx < list.length - 1) { idx++; show(); } else autoAnnotate(); };
    window.addEventListener("resize", () => !finished && draw());
  },
};
