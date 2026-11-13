// Trạng thái dùng chung giữa các bước + tiện ích nhỏ.
import { ACTIVE, SAMPLE_TOTAL } from "./config.js";

export const S = {
  name: "",
  gender: "",            // "m" | "f" | "" (chưa chọn)
  data: null,            // dataset.json
  pool: [],              // ảnh dùng trong buổi (đã lọc theo lớp ACTIVE)
  labels: {},            // file -> key lớp | "trash"
  labelStats: { first: 0, total: 0, trash: 0 },
  myBoxes: {},           // file -> {box, iou}
  prep: { split: 80, augs: { flip: true, hsv: true, scale: true, mosaic: true } },
  runs: [],              // lịch sử huấn luyện
  best: null,            // lần huấn luyện tốt nhất
  missions: {},
};

export async function loadData() {
  const r = await fetch("data/dataset.json");
  S.data = await r.json();
  // lấy lần lượt từng lớp cho tới đủ SAMPLE_TOTAL ảnh để các lớp đều nhau
  const by = ACTIVE.map((k) => S.data.items.filter((it) => it.cls === k));
  const pick = [];
  for (let i = 0; pick.length < SAMPLE_TOTAL && by.some((l) => l[i]); i++) for (const l of by) if (l[i] && pick.length < SAMPLE_TOTAL) pick.push(l[i]);
  const keep = new Set(pick);
  S.pool = S.data.items.filter((it) => keep.has(it));
  return S.data;
}

export const imgUrl = (f) => `data/img/${f}`;

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function shuffle(a, r = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const $ = (s, el = document) => el.querySelector(s);
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
export function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
/** Chất lượng nhãn của học sinh (0..1) — dùng để ảnh hưởng kết quả huấn luyện mô phỏng. */
export function labelQuality() {
  const acc = S.labelStats.total ? S.labelStats.first / S.labelStats.total : 0.9;
  const ious = Object.values(S.myBoxes).map((b) => b.iou);
  const iou = ious.length ? ious.reduce((a, b) => a + b, 0) / ious.length : 0.8;
  return { acc, iou, q: Math.min(1, 0.55 * acc + 0.45 * Math.min(1, iou / 0.85)) };
}
