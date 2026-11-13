import { S, loadData, $, h } from "./state.js";
import { DEBUG_SKIP } from "./config.js";
import { initAudio, toggleMute, sfx } from "./fx.js";
import * as yolo from "./yolo.js";
import label from "./steps/label.js";
import box from "./steps/box.js";
import prep from "./steps/prep.js";
import train from "./steps/train.js";
import detect from "./steps/detect.js";
import cert from "./steps/cert.js";
import { icon } from "./icons.js";
import { avatar } from "./avatar.js";

const STEPS = [label, box, prep, train, detect];
let cur = -1;            // -1 = giới thiệu, STEPS.length = chứng nhận
let unlocked = DEBUG_SKIP ? STEPS.length - 1 : 0;
const done = new Set();

// ---------- thanh bước ----------
function renderStepper() {
  const nav = $("#stepper"); nav.innerHTML = "";
  STEPS.forEach((st, i) => {
    const b = h("button", { class: `step ${i === cur ? "on" : ""} ${done.has(i) ? "done" : ""}`, title: st.title },
      h("span", { class: "n" }, done.has(i) ? "✓" : String(i + 1)), h("span", { class: "t", html: `${icon(st.id)}${st.title}` }));
    b.disabled = i > unlocked;
    b.onclick = () => go(i);
    nav.append(b);
  });
}

function setGuide(g) {
  const el = $("#guide");
  if (!g) { el.hidden = true; return; }
  el.hidden = false;
  $("#guide-title").textContent = g.title;
  $("#guide-text").innerHTML = g.text;
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}

const ctx = {
  /** bước hiện tại báo đã hoàn thành → mở nút Tiếp tục */
  complete(msg = "Xong! Bấm Tiếp tục.") {
    done.add(cur); unlocked = Math.max(unlocked, cur + 1);
    $("#btn-next").disabled = false;
    $("#bottom-msg").textContent = msg;
    renderStepper();
  },
  status(msg) { $("#bottom-msg").textContent = msg; },
  guide: setGuide,
  next: () => go(cur + 1),
  finish: () => go(STEPS.length),
};

async function go(i) {
  if (cur >= 0 && cur < STEPS.length) STEPS[cur].leave?.();
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = true));
  cur = i;
  window.scrollTo(0, 0);
  if (i < 0) { $("#s-intro").hidden = false; $("#bottom").hidden = true; setGuide(null); renderStepper(); return; }
  if (i >= STEPS.length) {
    $("#s-cert").hidden = false; $("#bottom").hidden = true; setGuide(null); renderStepper();
    cert.enter(ctx); return;
  }
  const st = STEPS[i];
  $(`#s-${st.id}`).hidden = false;
  $("#bottom").hidden = false;
  $("#btn-prev").disabled = i === 0;
  $("#btn-next").disabled = !DEBUG_SKIP && !done.has(i);
  $("#btn-next").textContent = i === STEPS.length - 1 ? "🎓 Nhận chứng nhận →" : "Tiếp tục →";
  $("#bottom-msg").textContent = done.has(i) ? "Bước này đã xong, bạn có thể làm lại hoặc đi tiếp." : st.hint || "";
  setGuide(st.guide);
  renderStepper();
  await st.enter(ctx);
}

// ---------- hiệu ứng màn mở đầu ----------
// khung "AI nhận diện" nhảy qua từng con vật + thú bay lơ lửng phía sau
function introFx() {
  const zoo = $("#intro-zoo"), box = $("#zoo-box"), tag = $("#zoo-tag");
  const names = ["Chó", "Mèo", "Chim", "Bò", "Voi", "Ngựa vằn"], colors = ["#fbbf24", "#f472b6", "#38bdf8", "#fb923c", "#94a3b8", "#84cc16"];
  const kids = [...zoo.querySelectorAll("span")];
  let k = 0;
  const hop = () => {
    if ($("#s-intro").hidden) return;
    const el = kids[k], zr = zoo.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!r.width) return;
    kids.forEach((x) => x.classList.toggle("seen", x === el));
    box.style.cssText = `left:${r.left - zr.left - 6}px;top:${r.top - zr.top - 4}px;width:${r.width + 12}px;height:${r.height + 8}px;--c:${colors[k]}`;
    tag.textContent = `${names[k]} ${88 + Math.floor(Math.random() * 11)}%`;
    k = (k + 1) % kids.length;
  };
  hop(); setInterval(hop, 1300);
  const fl = $("#intro-floaters");
  [..."🐶🐱🐦🐮🐘🦓🐾🐾🐶🐱"].forEach((c, i) =>
    fl.append(h("span", { style: `--x:${(i * 13 + 5) % 100}%;--d:${14 + (i % 4) * 4}s;--w:${-i * 2.3}s;--s:${0.8 + (i % 3) * 0.35}` }, c)));
}

// ---------- khởi động ----------
async function boot() {
  await loadData();
  const steps = $("#intro-steps");
  STEPS.forEach((st, i) => steps.append(
    h("div", { class: "istep", style: `--i:${i}` }, h("div", { class: "istep-n" }, String(i + 1)), h("div", { class: "istep-i", html: icon(st.id) }),
      h("b", {}, st.title), h("div", { class: "muted small" }, st.blurb))));
  renderStepper();
  introFx();

  // tải sẵn mô hình YOLO ở chế độ nền để bước 5 dùng ngay
  const ld = $("#intro-load");
  yolo.load((p) => (ld.textContent = `Đang tải AI… ${Math.round(p * 100)}%`))
    .then(() => { ld.textContent = "✅ AI đã sẵn sàng"; ld.title = self.crossOriginIsolated ? "chế độ đa luồng" : "chế độ đơn luồng"; })
    .catch((e) => { ld.textContent = "⚠ Không tải được AI: " + e.message; console.error(e); });

  // chọn giới tính → ảnh đại diện tương ứng (bấm lại để bỏ chọn)
  const gb = [...document.querySelectorAll("#intro-gender .gbtn")];
  const paintGender = () => gb.forEach((b) => {
    b.querySelector(".gav").innerHTML = avatar(b.dataset.g, 30);
    b.classList.toggle("on", S.gender === b.dataset.g); b.setAttribute("aria-checked", S.gender === b.dataset.g);
  });
  gb.forEach((b) => (b.onclick = () => { S.gender = S.gender === b.dataset.g ? "" : b.dataset.g; initAudio(); sfx.blip(); paintGender(); }));
  paintGender();
  $("#intro-go").onclick = () => {
    initAudio(); sfx.go();
    S.name = $("#intro-name").value.trim();
    S.startedAt = Date.now();
    $("#who").innerHTML = `${avatar(S.gender, 30)}<span></span>`;
    $("#who span").textContent = S.name || "Kỹ sư AI";
    go(0);
  };
  $("#intro-name").addEventListener("keydown", (e) => e.key === "Enter" && $("#intro-go").click());
  $("#btn-next").onclick = () => { if (cur === STEPS.length - 1) { sfx.win(); ctx.finish(); } else { sfx.blip(); go(cur + 1); } };
  $("#btn-prev").onclick = () => { sfx.blip(); go(cur - 1); };
  $("#btn-mute").onclick = (e) => (e.currentTarget.textContent = toggleMute() ? "🔇" : "🔊");
  $("#btn-full").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  $("#logo").ondblclick = () => { unlocked = STEPS.length - 1; renderStepper(); };
  $("#logo").onclick = () => cur >= 0 && go(-1);
  go(-1);
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("afterbegin", `<div class="fatal">Lỗi khởi động: ${e.message}. Hãy mở bằng start.cmd (không mở trực tiếp file index.html).</div>`);
});
