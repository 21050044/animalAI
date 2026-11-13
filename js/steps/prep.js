// Bước 3 — Chuẩn bị ảnh: chia phần học / phần kiểm tra, rồi tăng cường dữ liệu ảnh (lật, đổi màu, phóng, ghép 4).
// Mỗi kiểu tăng cường có chế độ so sánh ẢNH GỐC ↔ ẢNH SAU BIẾN ĐỔI; thẻ "Kết hợp" xem 6 ảnh trộn mọi kiểu đang bật.
import { S, $, h, imgUrl, loadImg, shuffle, rng } from "../state.js";
import { byKey } from "../config.js";
import { sfx } from "../fx.js";

let ctx, imgs = new Map(), order = [], seed = 7, inited = false;
let view = "flip", pos = 0; // view: một kiểu tăng cường | "all"

const AUGS = [
  { k: "flip", icon: "↔️", vi: "Lật ngang", why: "Chó quay trái hay phải vẫn là chó", after: "Sau khi lật ngang" },
  { k: "hsv", icon: "🎨", vi: "Đổi màu / độ sáng", why: "Ảnh chụp lúc trời tối hay nắng gắt", after: "Sau khi đổi màu, độ sáng" },
  { k: "scale", icon: "🔍", vi: "Phóng to / thu nhỏ", why: "Con vật ở xa, ở gần, ở góc ảnh", after: "Sau khi phóng / thu, dịch ảnh" },
  { k: "mosaic", icon: "🧩", vi: "Ghép 4 ảnh", why: "Nhiều con, nhiều cảnh trong 1 ảnh", after: "Sau khi ghép với 3 ảnh khác" },
];

async function preload() {
  await Promise.all(S.pool.map(async (it) => { if (!imgs.has(it.file)) imgs.set(it.file, await loadImg(imgUrl(it.file))); }));
}
const trainItems = () => { const t = (S.trainFiles || []).map((f) => S.pool.find((x) => x.file === f)).filter(Boolean); return t.length ? t : S.pool; };

// ---------- 1. chia dữ liệu ----------
function renderSplit() {
  const p = S.prep.split, n = order.length, ntr = Math.round((n * p) / 100);
  const tiles = $("#pp-tiles");
  if (tiles.children.length !== n) {
    tiles.innerHTML = "";
    order.forEach((it) => tiles.append(h("div", { class: "tile", title: byKey(it.cls).vi }, h("img", { src: imgUrl(it.file) }))));
  }
  [...tiles.children].forEach((t, i) => t.classList.toggle("val", i >= ntr));
  $("#pp-n").textContent = n;
  $("#pp-tr").textContent = `${p}% · ${ntr} ảnh`;
  $("#pp-va").textContent = `${100 - p}% · ${n - ntr} ảnh`;
  const w = $("#pp-warn");
  w.textContent = p >= 95 ? "⚠ Quá ít ảnh kiểm tra: điểm số sẽ không đáng tin (giống đề thi chỉ có 1 câu)."
    : p <= 60 ? "⚠ Quá ít ảnh để học: AI sẽ học không kỹ." : "👍 Tỉ lệ hợp lý. Kỹ sư thường chia 80% để học, 20% để kiểm tra.";
  w.className = "warn " + (p >= 95 || p <= 60 ? "bad" : "ok");
  S.trainFiles = order.slice(0, ntr).map((x) => x.file);
  S.valFiles = order.slice(ntr).map((x) => x.file);
  pos = Math.min(pos, ntr - 1);
  renderTotal(); renderView();
}

// ---------- 2. tăng cường dữ liệu ảnh ----------
function renderAugToggles() {
  const el = $("#pp-augs"); el.innerHTML = "";
  for (const a of AUGS) {
    const on = S.prep.augs[a.k];
    const sw = h("span", { class: `sw ${on ? "on" : ""}`, title: on ? "Đang bật: bấm để tắt" : "Đang tắt: bấm để bật", role: "switch" }, h("i"));
    sw.onclick = (e) => { e.stopPropagation(); S.prep.augs[a.k] = !S.prep.augs[a.k]; sfx.blip(); renderAugToggles(); renderTotal(); renderView(); };
    el.append(h("button", { class: `aug ${on ? "on" : ""} ${view === a.k ? "view" : ""}`, title: "Bấm để xem ảnh gốc và ảnh sau biến đổi", onclick: () => { view = a.k; sfx.blip(); renderAugToggles(); renderView(); } },
      h("span", { class: "ai" }, a.icon), sw, h("b", {}, a.vi), h("span", { class: "muted small" }, a.why)));
  }
  $("#pp-all").classList.toggle("on", view === "all");
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

/** vẽ 1 ảnh vuông. A = các kiểu bật; first = ảnh chính (nếu có) */
function renderTile(c, r, A, first = null, tags = true) {
  const T = c.width, g = c.getContext("2d");
  g.fillStyle = "#727272"; g.fillRect(0, 0, T, T);
  const src = trainItems();
  const pick = () => src[Math.floor(r() * src.length)];
  const flt = () => (A.hsv ? `hue-rotate(${Math.round((r() - 0.5) * 50)}deg) saturate(${(0.45 + r() * 1.2).toFixed(2)}) brightness(${(0.55 + r() * 0.9).toFixed(2)})` : "none");
  const sc = () => (A.scale ? 0.7 + r() * 0.7 : 1), tr = () => (A.scale ? (r() - 0.5) * 0.35 : 0);
  const flip = !!A.flip && (first ? true : r() < 0.5);
  let boxes = [];
  const tg = [];
  if (A.mosaic) {
    const mx = T * (0.3 + r() * 0.4), my = T * (0.3 + r() * 0.4);
    const regs = [{ x: 0, y: 0, w: mx, h: my }, { x: mx, y: 0, w: T - mx, h: my }, { x: 0, y: my, w: mx, h: T - my }, { x: mx, y: my, w: T - mx, h: T - my }];
    regs.forEach((rg, i) => { const it = i === 0 && first ? first : pick(); boxes.push(...place(g, imgs.get(it.file), [{ box: it.box, cls: it.cls }], rg, sc(), tr(), tr(), flip, T, flt())); });
    tg.push("🧩");
  } else {
    const it = first || pick();
    boxes = place(g, imgs.get(it.file), [{ box: it.box, cls: it.cls }], { x: 0, y: 0, w: T, h: T }, sc(), tr(), tr(), flip, T, flt());
  }
  if (flip) tg.push("↔️");
  g.lineWidth = Math.max(2.5, T / 110); g.font = `bold ${Math.round(T / 18)}px system-ui`;
  for (const b of boxes) {
    const c2 = byKey(b.cls), s = T / 13;
    g.strokeStyle = c2.color; g.strokeRect(b.x, b.y, b.w, b.h);
    g.fillStyle = c2.color; g.fillRect(b.x, b.y, s * 1.3, s); g.fillText(c2.emoji, b.x + 3, b.y + s * 0.8);
  }
  if (tags && tg.length) { g.font = `${Math.round(T / 14)}px system-ui`; g.fillText(tg.join(""), T - (T / 12) * tg.length - 4, T - 8); }
}

function renderCompare() {
  const src = trainItems();
  const it = src[pos % src.length];
  const a = AUGS.find((x) => x.k === view);
  renderTile($("#pp-orig"), rng(1), {}, it, false);
  renderTile($("#pp-aug"), rng(seed * 31 + pos), { [view]: true }, it, false);
  const on = S.prep.augs[view];
  $("#pp-augcap").innerHTML = `${a.icon} ${a.after}${on ? "" : ' <span class="off-tag">đang tắt</span>'}`;
  $("#pp-pos").textContent = `Ảnh ${(pos % src.length) + 1}/${src.length}`;
}

function renderGrid() {
  const grid = $("#pp-grid");
  if (!grid.children.length) for (let i = 0; i < 6; i++) { const c = h("canvas"); c.width = c.height = 260; grid.append(c); }
  const r = rng(seed);
  [...grid.children].forEach((c) => renderTile(c, r, S.prep.augs));
}

function renderView() {
  const all = view === "all";
  $("#pp-cmpwrap").hidden = all; $("#pp-gridwrap").hidden = !all; $("#pp-nav").hidden = all;
  $("#pp-reroll").textContent = all ? "🎲 Ảnh khác" : "🎲 Biến đổi khác";
  $("#pp-all").textContent = all ? "← Từng kiểu" : "✨ Kết hợp";
  if (all) renderGrid(); else renderCompare();
}

function renderTotal() {
  const n = (S.trainFiles || []).length;
  const on = Object.values(S.prep.augs).filter(Boolean).length;
  const mult = [1, 4, 12, 40, 120][on];
  $("#pp-total").textContent = (n * mult).toLocaleString("vi-VN");
  $("#pp-total").parentElement.lastChild.textContent = on ? ` ảnh khác nhau tạo ra từ ${n} ảnh gốc` : ` ảnh (không tăng cường: AI dễ học vẹt!)`;
}

export default {
  id: "prep", icon: "🧪", title: "Chuẩn bị dữ liệu",
  blurb: "Sắp xếp ảnh để AI học",
  hint: "Bấm từng thẻ để so sánh ảnh gốc và ảnh sau biến đổi, rồi bấm Tiếp tục.",
  guide: { title: "Bước 3: Chuẩn bị dữ liệu cho AI học", text: "Trước khi học, ảnh được <b>chia</b> làm hai phần (để học và để kiểm tra) rồi được <b>tăng cường</b> (biến đổi thành nhiều ảnh mới) để AI thấy nhiều tình huống hơn. <b>Bấm vào từng thẻ</b> để xem ảnh gốc biến thành ảnh mới ra sao!" },
  async enter(c) {
    ctx = c;
    await preload();
    if (!inited) {
      inited = true;
      order = shuffle(S.pool, rng(3));
      $("#pp-split").oninput = (e) => { S.prep.split = +e.target.value; renderSplit(); };
      $("#pp-reroll").onclick = () => { seed++; sfx.whoosh(); renderView(); };
      $("#pp-all").onclick = () => { view = view === "all" ? "flip" : "all"; sfx.blip(); renderAugToggles(); renderView(); };
      $("#pp-prev").onclick = () => { const n = trainItems().length; pos = (pos - 1 + n) % n; sfx.blip(); renderCompare(); };
      $("#pp-next").onclick = () => { pos = (pos + 1) % trainItems().length; sfx.blip(); renderCompare(); };
    }
    $("#pp-split").value = S.prep.split;
    renderAugToggles(); renderSplit();
    ctx.complete("Ảnh đã sẵn sàng! Tiếp theo: cho AI học.");
  },
};
