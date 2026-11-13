// Vẽ khung / viền (segmentation) lên canvas + hộp xem ảnh phóng to (lightbox) dùng chung.
import { $, h, imgUrl, loadImg } from "./state.js";
import { byKey } from "./config.js";

/** khung chữ nhật [x,y,w,h] (toạ độ 0..1) + nhãn */
export function paintBox(g, box, W, H, color, label, { dashed = false, fill = 0, del = false, lw = 3, bottom = false, halo = false, ink = "#0b1220" } = {}) {
  const [x, y, w, hh] = box, X = x * W, Y = y * H, BW = w * W, BH = hh * H;
  g.save();
  if (fill) { g.globalAlpha = fill; g.fillStyle = color; g.fillRect(X, Y, BW, BH); g.globalAlpha = 1; }
  if (halo) { g.lineWidth = lw + 4; g.strokeStyle = "rgba(255,255,255,.9)"; g.strokeRect(X, Y, BW, BH); } // viền trắng để nổi trên mọi nền
  g.lineWidth = lw; g.strokeStyle = color; g.setLineDash(dashed ? [8, 6] : []); g.strokeRect(X, Y, BW, BH); g.setLineDash([]);
  if (label) {
    g.font = "bold 14px system-ui"; const tw = g.measureText(label).width + 10, th = 22;
    const ty = bottom ? (Y + BH + th <= H ? Y + BH : Y + BH - th) : Y > th ? Y - th : Y;
    const lx = Math.max(0, Math.min(X - lw / 2, W - tw)); // nhãn không tràn ra ngoài ảnh
    g.fillStyle = color; g.fillRect(lx, ty, tw, th);
    g.fillStyle = ink; g.fillText(label, lx + 4, ty + 16);
  }
  if (del) { // nút ✕ xoá khung ở góc trên phải
    g.fillStyle = "rgba(17,24,39,.8)"; g.fillRect(X + BW - 20, Y + 2, 18, 18);
    g.fillStyle = "#fff"; g.font = "bold 13px system-ui"; g.fillText("✕", X + BW - 16, Y + 16);
  }
  g.restore();
}

/** viền polygon [x0,y0,x1,y1,...] (0..1) */
export function paintSeg(g, seg, W, H, color, { alpha = 0.42, dashed = false, lw = 2.5, label = "" } = {}) {
  if (!seg || seg.length < 6) return;
  g.save();
  g.beginPath();
  for (let i = 0; i < seg.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, seg[i] * W, seg[i + 1] * H);
  g.closePath();
  if (alpha) { g.globalAlpha = alpha; g.fillStyle = color; g.fill(); g.globalAlpha = 1; }
  g.lineWidth = lw; g.strokeStyle = color; g.setLineDash(dashed ? [7, 5] : []); g.stroke(); g.setLineDash([]);
  if (label) {
    let mx = 1, my = 1; for (let i = 0; i < seg.length; i += 2) if (seg[i + 1] < my) { my = seg[i + 1]; mx = seg[i]; }
    g.font = "bold 14px system-ui"; const tw = g.measureText(label).width + 10;
    const X = Math.min(W - tw, Math.max(0, mx * W - tw / 2)), Y = Math.max(0, my * H - 26);
    g.fillStyle = color; g.fillRect(X, Y, tw, 22); g.fillStyle = "#0b1220"; g.fillText(label, X + 5, Y + 16);
  }
  g.restore();
}

// ---------- so khớp viền bằng cách tô điểm ảnh ----------
const RW = 240, RH = 180;
const rc = document.createElement("canvas"); rc.width = RW; rc.height = RH;
const rg = rc.getContext("2d", { willReadFrequently: true });
function fillPoly(seg, color) {
  rg.fillStyle = color; rg.beginPath();
  for (let i = 0; i < seg.length; i += 2) (i ? rg.lineTo : rg.moveTo).call(rg, seg[i] * RW, seg[i + 1] * RH);
  rg.closePath(); rg.fill();
}
/** độ khớp (IoU) giữa 2 viền */
export function segIoU(a, b) {
  rg.globalCompositeOperation = "source-over"; rg.fillStyle = "#000"; rg.fillRect(0, 0, RW, RH);
  rg.globalCompositeOperation = "lighter"; fillPoly(a, "#ff0000"); fillPoly(b, "#0000ff");
  rg.globalCompositeOperation = "source-over";
  const d = rg.getImageData(0, 0, RW, RH).data; let inter = 0, uni = 0;
  for (let i = 0; i < d.length; i += 4) { const A = d[i] > 127, B = d[i + 2] > 127; if (A && B) inter++; if (A || B) uni++; }
  return uni ? inter / uni : 0;
}
/** tỉ lệ diện tích khung là nền (không thuộc con vật) */
export function boxWaste(box, seg) {
  rg.fillStyle = "#000"; rg.fillRect(0, 0, RW, RH); fillPoly(seg, "#ff0000");
  const d = rg.getImageData(0, 0, RW, RH).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 127) n++;
  return Math.max(0, 1 - n / (box[2] * box[3] * RW * RH));
}

// ---------- lightbox ----------
let list = [], idx = 0, mode = "box", im = null, inited = false;
const MODES = { box: "🔲 Khung", seg: "✂️ Viền", both: "So sánh" };
const CAPS = {
  box: "Khung chữ nhật cho AI biết con vật <b>ở đâu</b>, nhưng trong khung vẫn còn lẫn cả nền (cỏ, trời, đất…).",
  seg: "Bo viền (segmentation) tô <b>đúng từng điểm ảnh</b> thuộc con vật, nên AI biết cả <b>hình dáng</b>.",
  both: "Phần nằm trong khung nhưng ngoài viền chính là <b>nền thừa</b> mà khung không phân biệt được.",
};
export const label = (cls) => { const c = byKey(cls); return `${c.emoji} ${c.vi}`; };
/** vẽ các con vật của 1 ảnh theo kiểu khung / viền / cả hai */
export function paintObjs(g, objs, W, H, m) {
  for (const o of objs) {
    const c = byKey(o.cls);
    if (m === "box" || !o.seg) paintBox(g, o.box, W, H, c.color, label(o.cls));
    else if (m === "seg") paintSeg(g, o.seg, W, H, c.color, { label: label(o.cls) });
    else { paintSeg(g, o.seg, W, H, c.color, { alpha: 0.5 }); paintBox(g, o.box, W, H, c.color, label(o.cls), { dashed: true, lw: 2 }); }
  }
}

function init() {
  inited = true;
  const lb = $("#lightbox");
  lb.onclick = (e) => { if (e.target === lb) close(); };
  $("#lbx-close").onclick = close;
  $("#lbx-prev").onclick = () => go(-1);
  $("#lbx-next").onclick = () => go(1);
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1);
  });
  window.addEventListener("resize", () => !lb.hidden && render());
}
/** items: [{file, objs:[{cls, box, seg}]}] */
export function openLightbox(items, i = 0, m = "box") {
  if (!inited) init();
  list = items; idx = i; mode = m;
  $("#lightbox").hidden = false;
  show();
}
function close() { $("#lightbox").hidden = true; }
function go(d) { idx = (idx + d + list.length) % list.length; show(); }

async function show() {
  const it = list[idx];
  const hasSeg = it.objs.some((o) => o.seg);
  if (!hasSeg) mode = "box";
  $("#lbx-title").textContent = it.objs.length > 1 ? `${it.objs.length} con vật: ${it.objs.map((o) => label(o.cls)).join(", ")}` : label(it.objs[0].cls);
  $("#lbx-count").textContent = `${idx + 1} / ${list.length}`;
  const md = $("#lbx-modes"); md.innerHTML = "";
  if (hasSeg) for (const [k, t] of Object.entries(MODES)) md.append(h("button", { class: `segb ${k === mode ? "on" : ""}`, onclick: () => { mode = k; show(); } }, t));
  $("#lbx-cap").innerHTML = CAPS[mode];
  const nav = list.length > 1; $("#lbx-prev").hidden = $("#lbx-next").hidden = !nav;
  const img = await loadImg(imgUrl(it.file));
  if (list[idx] !== it) return;
  im = img; render();
}
function render() {
  if (!im) return;
  const it = list[idx], cv = $("#lbx-cv"), area = $("#lbx-area");
  const k = Math.min(area.clientWidth / im.naturalWidth, area.clientHeight / im.naturalHeight, 2.2);
  const W = (cv.width = Math.round(im.naturalWidth * k)), H = (cv.height = Math.round(im.naturalHeight * k));
  const g = cv.getContext("2d"); g.drawImage(im, 0, 0, W, H);
  paintObjs(g, it.objs, W, H, mode);
}
