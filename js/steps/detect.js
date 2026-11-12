// Bước 5 — Dùng thử: YOLO THẬT chạy trong trình duyệt trên ảnh/video học sinh đưa vào.
import { S, $, h, imgUrl, loadImg } from "../state.js";
import { classes, byId, DEFAULT_CONF } from "../config.js";
import * as yolo from "../yolo.js";
import { sfx, toast, confetti } from "../fx.js";

let ctx, inited = false, conf = DEFAULT_CONF, enabled = new Set(), source = null, isVideo = false, busy = false, raf = 0, lastBoxes = [], videoUrl = null;
const MISSIONS = [
  { k: "web", t: "Nhận diện 1 ảnh bạn tự tìm trên mạng" },
  { k: "three", t: "Tìm ảnh có từ 3 con vật trở lên" },
  { k: "mix", t: "Ảnh có 2 loài khác nhau cùng lúc" },
  { k: "video", t: "Cho AI xem một video" },
  { k: "low", t: "Kéo ngưỡng xuống dưới 15%: chuyện gì xảy ra?" },
  { k: "fool", t: "Đánh lừa được AI (đoán sai / bỏ sót), bấm để đánh dấu", manual: true },
];

function renderMissions() {
  const el = $("#dt-missions"); el.innerHTML = "";
  for (const m of MISSIONS) {
    const li = h("li", { class: S.missions[m.k] ? "ok" : "" }, h("span", { class: "mk" }, S.missions[m.k] ? "✅" : "⬜"), m.t);
    if (m.manual) li.onclick = () => mission(m.k, !S.missions[m.k]);
    el.append(li);
  }
}
function mission(k, v = true) {
  if (!!S.missions[k] === v) return;
  S.missions[k] = v; renderMissions();
  if (v) { sfx.badge(); toast("🏅", "Hoàn thành thử thách!", MISSIONS.find((m) => m.k === k).t, "ok"); }
  if (MISSIONS.every((m) => S.missions[m.k])) confetti({ count: 160 });
}

function renderChips() {
  const el = $("#dt-chips"); el.innerHTML = "";
  for (const c of classes()) {
    el.append(h("button", { class: `chip ${enabled.has(c.id) ? "on" : ""}`, style: `--c:${c.color}`, onclick: () => {
      if (enabled.has(c.id) && enabled.size > 1) enabled.delete(c.id); else enabled.add(c.id);
      sfx.blip(); renderChips(); if (!isVideo) runImage();
    } }, `${c.emoji} ${c.vi}`));
  }
}

function fitCanvas(w, hh) {
  const cv = $("#dt-cv"), box = $("#dt-stage");
  const maxW = box.clientWidth - 4, maxH = Math.max(300, innerHeight * 0.62);
  const k = Math.min(maxW / w, maxH / hh, 2);
  cv.width = Math.round(w * k); cv.height = Math.round(hh * k);
  return k;
}

function drawBoxes(g, boxes, k) {
  g.lineWidth = Math.max(2, 3 * k); g.font = `bold ${Math.round(Math.max(12, 15 * Math.min(1.4, k)))}px system-ui`;
  for (const b of boxes) {
    const c = byId[b.cls];
    const x = b.x * k, y = b.y * k, w = b.w * k, hh = b.h * k;
    g.strokeStyle = c.color; g.strokeRect(x, y, w, hh);
    const t = `${c.emoji} ${c.vi} ${Math.round(b.score * 100)}%`, tw = g.measureText(t).width + 10, th = parseInt(g.font.match(/\d+/)[0]) + 8;
    const ty = y - th < 0 ? y : y - th;
    g.fillStyle = c.color; g.fillRect(x - g.lineWidth / 2, ty, tw, th);
    g.fillStyle = "#0b1220"; g.fillText(t, x + 4, ty + th - 6);
  }
}

let lastSig = "";
function renderCounts(res) {
  const el = $("#dt-counts");
  const cnt = {};
  res.boxes.forEach((b) => (cnt[b.cls] = (cnt[b.cls] || 0) + 1));
  const keys = Object.keys(cnt);
  const sig = JSON.stringify(cnt);
  const changed = sig !== lastSig || !isVideo; lastSig = sig;
  if (changed) el.innerHTML = "";
  if (!changed) { /* giữ nguyên danh sách, chỉ cập nhật số liệu bên dưới */ }
  else if (!keys.length) el.append(h("div", { class: "muted" }, "Không thấy con vật nào (trong các lớp đang bật)."));
  if (changed) for (const id of keys) { const c = byId[id]; el.append(h("div", { class: "cnt", style: `--c:${c.color}` }, h("span", { class: "ce" }, c.emoji), h("b", {}, `×${cnt[id]}`), h("span", {}, c.vi))); }
  const st = res.stats;
  $("#dt-pipe").innerHTML = `<div class="pp"><b>${st.raw.toLocaleString("vi-VN")}</b><span>ô dự đoán</span></div><div class="pa">→</div>
    <div class="pp"><b>${st.passed}</b><span>vượt ngưỡng ${Math.round(conf * 100)}%</span></div><div class="pa">→</div>
    <div class="pp"><b>${st.kept}</b><span>sau khi lọc trùng (NMS)</span></div>`;
  $("#dt-ms").textContent = `⚡ ${Math.round(res.ms)} ms/lần · ${Math.round(1000 / res.ms)} khung hình/giây`;
  if (res.boxes.length >= 3) mission("three");
  if (keys.length >= 2) mission("mix");
  if (conf < 0.15) mission("low");
}

async function runImage() {
  if (!source || isVideo) return;
  if (!yolo.isReady()) { ctx.status("Đang tải mô hình AI…"); await yolo.load(); }
  const res = await yolo.detect(source, { conf, classIds: [...enabled] });
  const w = source.naturalWidth, hh = source.naturalHeight, k = fitCanvas(w, hh);
  const g = $("#dt-cv").getContext("2d");
  g.drawImage(source, 0, 0, w * k, hh * k);
  drawBoxes(g, res.boxes, k);
  renderCounts(res);
  ctx.status(res.boxes.length ? `AI tìm thấy ${res.boxes.length} con vật.` : "AI không thấy con vật nào. Thử hạ ngưỡng xem?");
}

function videoLoop() {
  const v = $("#dt-video");
  const k = fitCanvas(v.videoWidth || 640, v.videoHeight || 360);
  const g = $("#dt-cv").getContext("2d");
  g.drawImage(v, 0, 0, v.videoWidth * k, v.videoHeight * k);
  drawBoxes(g, lastBoxes, k);
  if (!busy && !v.paused && v.readyState >= 2) {
    busy = true;
    yolo.detect(v, { conf, classIds: [...enabled] }).then((res) => { lastBoxes = res.boxes; renderCounts(res); }).finally(() => (busy = false));
  }
  raf = requestAnimationFrame(videoLoop);
}

function stop() {
  cancelAnimationFrame(raf); raf = 0;
  const v = $("#dt-video"); v.pause(); v.removeAttribute("src"); v.load();
  if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
}

async function openSource(src, kind, fromUser) {
  stop();
  if (!yolo.isReady()) { ctx.status("Đang tải mô hình AI… chờ chút nhé"); await yolo.load(); }
  $("#dt-drop").hidden = true; $("#dt-view").hidden = false;
  lastBoxes = [];
  if (kind === "video") {
    isVideo = true; source = null;
    const v = $("#dt-video"); videoUrl = src; v.src = src;
    await v.play().catch(() => {});
    $("#dt-play").hidden = false; $("#dt-play").textContent = "⏸";
    lastSig = ""; ctx.status("🎬 AI đang xem video: mỗi khung hình được nhận diện lại từ đầu.");
    mission("video"); if (fromUser) mission("web");
    videoLoop();
  } else {
    isVideo = false; $("#dt-play").hidden = true;
    try { source = await loadImg(src); } catch { toast("⚠️", "Không mở được ảnh này", "Thử ảnh khác (JPG/PNG)."); return close(); }
    await runImage();
    if (fromUser) mission("web");
  }
  sfx.lock();
}

function close() { stop(); source = null; isVideo = false; $("#dt-view").hidden = true; $("#dt-drop").hidden = false; $("#dt-counts").innerHTML = `<span class="muted">Chưa có ảnh</span>`; $("#dt-pipe").innerHTML = ""; }

function handleFiles(files) {
  const f = [...files].find((x) => x.type.startsWith("image/") || x.type.startsWith("video/"));
  if (!f) return toast("⚠️", "File không hợp lệ", "Hãy chọn ảnh hoặc video.");
  openSource(URL.createObjectURL(f), f.type.startsWith("video/") ? "video" : "image", true);
}

function renderGallery() {
  const g = $("#dt-gal"); g.innerHTML = "";
  const act = new Set(classes().map((c) => c.key));
  const on = S.data.multi.filter((x) => act.has(x.cls)), off = S.data.multi.filter((x) => !act.has(x.cls));
  // ảnh lớp đang bật trước; sau đó 2 ảnh "bẫy" gấu bông + 2 ảnh loài chưa bật (để thảo luận: vì sao AI không thấy?)
  const items = [...on.map((x) => [x.file, ""]), ...S.data.trash.slice(0, 2).map((x) => [x.file, "🧸 bẫy"]), ...off.slice(0, 2).map((x) => [x.file, "lớp tắt"])];
  for (const [f, tag] of items) g.append(h("button", { class: "gi", title: tag, onclick: () => openSource(imgUrl(f), "image") },
    h("img", { src: imgUrl(f), loading: "lazy" }), tag ? h("span", { class: "gt" }, tag) : null));
}

export default {
  id: "detect", icon: "🎯", title: "Nhận diện",
  blurb: "Dùng AI thật trên ảnh/video của bạn",
  hint: "Kéo ảnh/video vào, hoặc copy ảnh trên mạng rồi Ctrl+V.",
  guide: { title: "Bước 5: AI đi làm nhiệm vụ!", text: "Đây là mô hình <b>YOLO thật</b> chạy ngay trên máy bạn. Hãy lên mạng tìm <b>ảnh hoặc video</b> động vật, <b>kéo thả vào</b> (hoặc copy ảnh rồi <kbd>Ctrl</kbd>+<kbd>V</kbd>). Hoàn thành các <b>thử thách</b> bên phải!" },
  enter(c) {
    ctx = c;
    if (!inited) {
      inited = true;
      enabled = new Set(classes().map((x) => x.id));
      const drop = $("#dt-stage");
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
      drop.addEventListener("drop", (e) => {
        if (e.dataTransfer.files.length) return handleFiles(e.dataTransfer.files);
        const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
        if (url) toast("📋", "Ảnh từ trang web khác bị chặn", "Hãy bấm chuột phải → Sao chép hình ảnh, rồi Ctrl+V ở đây. Hoặc tải ảnh về máy rồi kéo vào.");
      });
      document.addEventListener("paste", (e) => {
        if ($("#s-detect").hidden) return;
        const f = [...(e.clipboardData?.files || [])];
        if (f.length) handleFiles(f);
      });
      $("#dt-pick").onclick = () => $("#dt-file").click();
      $("#dt-file").onchange = (e) => { handleFiles(e.target.files); e.target.value = ""; };
      $("#dt-close").onclick = close;
      $("#dt-play").onclick = () => { const v = $("#dt-video"); if (v.paused) { v.play(); $("#dt-play").textContent = "⏸"; } else { v.pause(); $("#dt-play").textContent = "▶"; } };
      const cs = $("#dt-conf"); cs.value = Math.round(conf * 100); $("#dt-conf-v").textContent = cs.value + "%";
      cs.oninput = () => { conf = cs.value / 100; $("#dt-conf-v").textContent = cs.value + "%"; };
      cs.onchange = () => runImage();
      $("#dt-finish").onclick = () => { sfx.win(); ctx.finish(); };
      renderGallery();
    }
    renderChips(); renderMissions();
    ctx.complete("Hoàn thành thử thách rồi bấm 🎓 Nhận chứng nhận.");
  },
  leave() { stop(); if (isVideo) close(); },
};
