// Bước 3 — Chuẩn bị dữ liệu: chia train/val, letterbox 640, tăng cường (giống YOLO thật).
import { S, $, h, imgUrl, loadImg, shuffle, rng } from "../state.js";
import { byKey } from "../config.js";
import { letterbox } from "../yolo.js";
import { sfx } from "../fx.js";

let ctx, imgs = new Map(), order = [], seed = 7, inited = false;

const AUGS = [
  { k: "flip", icon: "↔️", vi: "Lật ngang", why: "Chó quay trái hay phải vẫn là chó" },
  { k: "hsv", icon: "🎨", vi: "Đổi màu / độ sáng", why: "Ảnh chụp lúc trời tối hay nắng gắt" },
  { k: "scale", icon: "🔍", vi: "Phóng to / dịch", why: "Con vật ở xa, ở gần, ở góc ảnh" },
  { k: "mosaic", icon: "🧩", vi: "Ghép 4 ảnh (mosaic)", why: "Tuyệt chiêu riêng của YOLO: nhiều con, nhiều cảnh trong 1 ảnh" },
];

async function preload() {
  await Promise.all(S.pool.map(async (it) => { if (!imgs.has(it.file)) imgs.set(it.file, await loadImg(imgUrl(it.file))); }));
}

// ---------- ① chia dữ liệu ----------
function renderSplit() {
  const p = S.prep.split, n = order.length, ntr = Math.round((n * p) / 100);
  const tiles = $("#pp-tiles");
  if (tiles.children.length !== n) {
    tiles.innerHTML = "";
    order.forEach((it) => tiles.append(h("div", { class: "tile" }, h("img", { src: imgUrl(it.file) }))));
  }
  [...tiles.children].forEach((t, i) => t.classList.toggle("val", i >= ntr));
  $("#pp-tr").textContent = `${p}% · ${ntr} ảnh`;
  $("#pp-va").textContent = `${100 - p}% · ${n - ntr} ảnh`;
  const w = $("#pp-warn");
  w.textContent = p >= 95 ? "⚠ Quá ít ảnh kiểm tra: điểm số sẽ không đáng tin (giống đề thi chỉ có 1 câu)."
    : p <= 60 ? "⚠ Quá ít ảnh để học: AI sẽ học không kỹ." : "👍 Tỉ lệ hợp lý. Kỹ sư thường dùng 80/20.";
  w.className = "warn " + (p >= 95 || p <= 60 ? "bad" : "ok");
  S.trainFiles = order.slice(0, ntr).map((x) => x.file);
  S.valFiles = order.slice(ntr).map((x) => x.file);
  renderTotal();
}

// ---------- ② letterbox ----------
function renderLetterbox() {
  const it = S.pool.find((x) => { const im = imgs.get(x.file); return im && im.naturalWidth / im.naturalHeight > 1.25; }) || S.pool[0];
  const im = imgs.get(it.file);
  const o = $("#pp-orig"), D = 190;
  const k = Math.min(D / im.naturalWidth, D / im.naturalHeight);
  o.width = Math.round(im.naturalWidth * k); o.height = Math.round(im.naturalHeight * k);
  o.getContext("2d").drawImage(im, 0, 0, o.width, o.height);
  $("#pp-orig-cap").textContent = `Ảnh gốc ${im.naturalWidth}×${im.naturalHeight}`;
  const lb = letterbox(im);
  const c = $("#pp-lb"); c.width = c.height = D;
  c.getContext("2d").drawImage(lb.canvas, 0, 0, D, D);
  // mẫu điểm ảnh → con số
  const g = lb.canvas.getContext("2d", { willReadFrequently: true });
  const d = g.getImageData(320, 320, 1, 1).data;
  $("#pp-pix").innerHTML = `<div class="sw" style="background:rgb(${d[0]},${d[1]},${d[2]})"></div>
    <div>Mỗi điểm ảnh = 3 con số màu <b>R ${d[0]}, G ${d[1]}, B ${d[2]}</b> → chia cho 255 → <b>${(d[0] / 255).toFixed(2)}, ${(d[1] / 255).toFixed(2)}, ${(d[2] / 255).toFixed(2)}</b>.
    Một ảnh 640×640 = <b>1.228.800 con số</b> đưa vào YOLO.</div>`;
}

// ---------- ③ tăng cường ----------
function renderAugToggles() {
  const el = $("#pp-augs"); el.innerHTML = "";
  for (const a of AUGS) {
    const on = S.prep.augs[a.k];
    el.append(h("button", { class: `aug ${on ? "on" : ""}`, onclick: () => { S.prep.augs[a.k] = !S.prep.augs[a.k]; sfx.blip(); renderAugToggles(); renderGrid(); renderTotal(); } },
      h("span", { class: "ai" }, a.icon), h("span", {}, h("b", {}, a.vi), h("span", { class: "muted small" }, a.why)), h("span", { class: "sw2" }, on ? "BẬT" : "TẮT")));
  }
}

function place(g, im, boxes, region, s, tx, ty, flip, T, filter) {
  const k = Math.max(region.w / im.naturalWidth, region.h / im.naturalHeight) * s;
  const dw = im.naturalWidth * k, dh = im.naturalHeight * k;
  const dx = region.x + (region.w - dw) / 2 + tx * region.w, dy = region.y + (region.h - dh) / 2 + ty * region.h;
  g.save();
  g.beginPath(); g.rect(flip ? T - region.x - region.w : region.x, region.y, region.w, region.h); g.clip();
  if (flip) { g.translate(T, 0); g.scale(-1, 1); }
  g.filter = filter || "none";
  g.drawImage(im, dx, dy, dw, dh);
  g.restore();
  const out = [];
  for (const b of boxes) {
    let x1 = dx + b.box[0] * dw, y1 = dy + b.box[1] * dh, x2 = x1 + b.box[2] * dw, y2 = y1 + b.box[3] * dh;
    const area0 = (x2 - x1) * (y2 - y1);
    x1 = Math.max(x1, region.x); y1 = Math.max(y1, region.y); x2 = Math.min(x2, region.x + region.w); y2 = Math.min(y2, region.y + region.h);
    if (x2 <= x1 || y2 <= y1 || ((x2 - x1) * (y2 - y1)) / area0 < 0.3) continue;
    out.push({ x: flip ? T - x2 : x1, y: y1, w: x2 - x1, h: y2 - y1, cls: b.cls });
  }
  return out;
}

function renderTile(c, r) {
  const T = c.width, g = c.getContext("2d");
  const A = S.prep.augs;
  g.fillStyle = "#727272"; g.fillRect(0, 0, T, T);
  const train = (S.trainFiles || []).map((f) => S.pool.find((x) => x.file === f)).filter(Boolean);
  const src = train.length ? train : S.pool;
  const pick = () => src[Math.floor(r() * src.length)];
  const flt = () => (A.hsv ? `hue-rotate(${Math.round((r() - 0.5) * 40)}deg) saturate(${(0.5 + r() * 1.1).toFixed(2)}) brightness(${(0.6 + r() * 0.8).toFixed(2)})` : "none");
  const sc = () => (A.scale ? 0.75 + r() * 0.6 : 1), tr = () => (A.scale ? (r() - 0.5) * 0.3 : 0);
  const flip = A.flip && r() < 0.5;
  let boxes = [];
  const tags = [];
  if (A.mosaic) {
    const mx = T * (0.3 + r() * 0.4), my = T * (0.3 + r() * 0.4);
    const regs = [{ x: 0, y: 0, w: mx, h: my }, { x: mx, y: 0, w: T - mx, h: my }, { x: 0, y: my, w: mx, h: T - my }, { x: mx, y: my, w: T - mx, h: T - my }];
    for (const rg of regs) { const it = pick(); boxes.push(...place(g, imgs.get(it.file), [{ box: it.box, cls: it.cls }], rg, sc(), tr(), tr(), flip, T, flt())); }
    tags.push("🧩");
  } else {
    const it = pick();
    boxes = place(g, imgs.get(it.file), [{ box: it.box, cls: it.cls }], { x: 0, y: 0, w: T, h: T }, sc(), tr(), tr(), flip, T, flt());
  }
  if (flip) tags.push("↔️");
  g.lineWidth = 2.5; g.font = "bold 12px system-ui";
  for (const b of boxes) {
    const c2 = byKey(b.cls);
    g.strokeStyle = c2.color; g.strokeRect(b.x, b.y, b.w, b.h);
    g.fillStyle = c2.color; g.fillRect(b.x, b.y, 22, 18); g.fillText(c2.emoji, b.x + 3, b.y + 14);
  }
  if (tags.length) { g.font = "16px system-ui"; g.fillText(tags.join(""), T - 24 * tags.length - 2, T - 8); }
}

function renderGrid() {
  const grid = $("#pp-grid");
  if (!grid.children.length) for (let i = 0; i < 6; i++) { const c = h("canvas"); c.width = c.height = 220; grid.append(c); }
  const r = rng(seed);
  [...grid.children].forEach((c) => renderTile(c, r));
}

function renderTotal() {
  const n = (S.trainFiles || []).length;
  const on = Object.values(S.prep.augs).filter(Boolean).length;
  const mult = [1, 4, 12, 40, 120][on];
  $("#pp-total").textContent = (n * mult).toLocaleString("vi-VN");
  $("#pp-total").parentElement.lastChild.textContent = on ? ` biến thể khác nhau từ ${n} ảnh gốc` : ` ảnh (không tăng cường: AI dễ học vẹt!)`;
}

export default {
  id: "prep", icon: "🧪", title: "Chuẩn bị dữ liệu",
  blurb: "Chia đề, chuẩn hoá, nhân bản ảnh",
  hint: "Kéo thanh chia dữ liệu, bật/tắt các kiểu tăng cường để xem thay đổi.",
  guide: { title: "Bước 3: Chuẩn bị dữ liệu", text: "Trước khi học, dữ liệu cần được <b>chia</b> (ôn tập / đi thi), <b>chuẩn hoá</b> về cùng kích thước và <b>tăng cường</b> để AI thấy nhiều tình huống hơn. Thử <b>bật/tắt</b> từng kiểu tăng cường xem ảnh thay đổi ra sao!" },
  async enter(c) {
    ctx = c;
    await preload();
    if (!inited) {
      inited = true;
      order = shuffle(S.pool, rng(3));
      $("#pp-split").oninput = (e) => { S.prep.split = +e.target.value; renderSplit(); };
      $("#pp-reroll").onclick = () => { seed++; sfx.whoosh(); renderGrid(); };
      window.addEventListener("resize", () => {});
    }
    $("#pp-split").value = S.prep.split;
    renderSplit(); renderLetterbox(); renderAugToggles(); renderGrid();
    ctx.complete("Dữ liệu đã sẵn sàng! Tiếp theo: huấn luyện mô hình.");
  },
};
