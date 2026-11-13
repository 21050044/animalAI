// Bước 1 — Gắn nhãn: kéo từng ảnh vào đúng nhóm. Có ảnh "bẫy" phải loại bỏ.
import { S, $, h, imgUrl, shuffle } from "../state.js";
import { classes, byKey, LABEL_PER_CLASS, TRASH_COUNT } from "../config.js";
import { sfx, toast, confetti } from "../fx.js";

let queue = [], started = false, wrongTries = 0, ctx;

const TRASH_WHY = "Đây không phải con vật thật (đồ chơi, tượng, vạch kẻ đường…). Nếu giữ lại, AI sẽ học sai!";

function buildQueue() {
  const items = [];
  for (const c of classes()) items.push(...S.pool.filter((it) => it.cls === c.key).slice(0, LABEL_PER_CLASS));
  const trash = shuffle(S.data.trash).slice(0, TRASH_COUNT).map((t) => ({ ...t, cls: "trash" }));
  queue = shuffle([...items, ...trash]);
  S.labelSet = items.map((it) => it.file);
  S.labels = {}; S.labelStats = { first: 0, total: 0, trash: 0 };
}

function renderBuckets() {
  const wrap = $("#lb-buckets"); wrap.innerHTML = "";
  let n = 0;
  for (const c of classes()) {
    wrap.append(h("button", { class: "bucket", "data-k": c.key, style: `--c:${c.color}`, onclick: () => assign(c.key) },
      h("span", { class: "bk" }, String(++n)),
      h("span", { class: "be" }, c.emoji), h("span", { class: "bn" }, c.vi), h("span", { class: "bc" }, "0")));
  }
  wrap.append(h("button", { class: "bucket trash", "data-k": "trash", onclick: () => assign("trash") },
    h("span", { class: "bk" }, String(++n)),
    h("span", { class: "be" }, "🗑️"), h("span", { class: "bn" }, "Loại bỏ"), h("span", { class: "bc" }, "0")));
}

function renderBars() {
  const el = $("#lb-bars"); el.innerHTML = "";
  for (const c of classes()) {
    const n = Object.values(S.labels).filter((v) => v === c.key).length;
    el.append(h("div", { class: "bar" }, h("span", { class: "bl" }, `${c.emoji} ${c.vi}`),
      h("span", { class: "bt" }, h("i", { style: `width:${(n / LABEL_PER_CLASS) * 100}%;background:${c.color}` })),
      h("span", { class: "bv" }, `${n}/${LABEL_PER_CLASS}`)));
  }
  const st = S.labelStats;
  $("#lb-acc").textContent = st.total ? Math.round((st.first / st.total) * 100) + "%" : "–";
  $("#lb-trash").textContent = st.trash;
  document.querySelectorAll(".bucket").forEach((b) => {
    const k = b.dataset.k;
    b.querySelector(".bc").textContent = Object.values(S.labels).filter((v) => v === k).length;
  });
}

function renderStack() {
  const st = $("#lb-stack"); st.innerHTML = "";
  $("#lb-left").textContent = queue.length ? `Còn ${queue.length} ảnh chưa gắn nhãn` : "";
  queue.slice(0, 3).reverse().forEach((it, idx, arr) => {
    const top = idx === arr.length - 1;
    const card = h("div", { class: `pcard ${top ? "top" : ""}`, style: `--d:${arr.length - 1 - idx}` }, h("img", { src: imgUrl(it.file), draggable: "false" }));
    if (top) { card.append(h("div", { class: "pcard-q" }, "Con gì đây? 🤔")); enableDrag(card); }
    st.append(card);
  });
}

function bucketAt(x, y) {
  for (const b of document.querySelectorAll(".bucket")) {
    const r = b.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return b;
  }
  return null;
}

// Khi kéo, thẻ thu nhỏ quanh đúng điểm đang cầm (transform-origin = chỗ con trỏ) để không che các nhóm bên dưới.
function resetCard(card) {
  card.classList.remove("drag");
  card.style.translate = card.style.rotate = card.style.scale = ""; card.style.transformOrigin = "";
}
function enableDrag(card) {
  let sx, sy, dragging = false;
  card.addEventListener("pointerdown", (e) => {
    // chặn bôi đen chữ: nếu có chữ đang bôi đen, lần kéo sau trình duyệt sẽ huỷ thao tác (pointercancel)
    e.preventDefault(); getSelection()?.removeAllRanges();
    dragging = true; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId);
    const r = card.getBoundingClientRect();
    card.style.transformOrigin = `${e.clientX - r.left}px ${e.clientY - r.top}px`;
    card.classList.add("drag");
  });
  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    card.style.translate = `${dx}px ${dy}px`;
    card.style.rotate = `${Math.max(-12, Math.min(12, dx / 30))}deg`;
    document.querySelectorAll(".bucket").forEach((b) => b.classList.remove("hover"));
    bucketAt(e.clientX, e.clientY)?.classList.add("hover");
  });
  const end = (e) => {
    if (!dragging) return; dragging = false;
    document.querySelectorAll(".bucket").forEach((b) => b.classList.remove("hover"));
    const b = bucketAt(e.clientX, e.clientY);
    // nhấp nhẹ (không kéo) thì thôi, thẻ trở lại như cũ
    if (b && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) assign(b.dataset.k, card);
    else resetCard(card);
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

function flyTo(card, bucket) {
  const r = card.getBoundingClientRect(), t = bucket.getBoundingClientRect();
  const [tx = 0, ty = 0] = (card.style.translate || "0px 0px").split(" ").map(parseFloat);
  const dx = t.left + t.width / 2 - (r.left + r.width / 2), dy = t.top + t.height / 2 - (r.top + r.height / 2);
  const sc = card.classList.contains("drag") ? 0.22 : 1;
  card.style.transformOrigin = "50% 50%";
  card.animate([{ translate: `${tx}px ${ty}px`, scale: sc, opacity: 1 }, { translate: `${tx + dx}px ${ty + dy}px`, scale: 0.06, opacity: 0.2 }],
    { duration: 360, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" });
  bucket.classList.remove("bump"); void bucket.offsetWidth; bucket.classList.add("bump");
}

async function assign(key, cardEl) {
  const it = queue[0];
  if (!it) return;
  const card = cardEl || $("#lb-stack .pcard.top");
  const bucket = document.querySelector(`.bucket[data-k="${key}"]`);
  if (key === it.cls) {
    if (wrongTries === 0) S.labelStats.first++;
    S.labelStats.total++; wrongTries = 0;
    if (key === "trash") { S.labelStats.trash++; toast("🗑️", "Loại bỏ chuẩn!", TRASH_WHY, "ok"); }
    S.labels[it.file] = key;
    sfx.correct();
    flyTo(card, bucket);
    document.querySelectorAll(".bucket").forEach((b) => b.classList.remove("hint"));
    queue.shift();
    setTimeout(() => { renderStack(); renderBars(); if (!queue.length) finish(); }, 360);
  } else {
    wrongTries++;
    sfx.fail();
    resetCard(card);
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    const msg = it.cls === "trash" ? "Nhìn kỹ lại: đây có phải con vật THẬT không? 🤨"
      : key === "trash" ? "Ảnh này là con vật thật, giữ lại nhé!" : "Chưa đúng, nhìn kỹ lại nào 👀";
    ctx.status(msg);
    if (wrongTries >= 2) document.querySelector(`.bucket[data-k="${it.cls}"]`)?.classList.add("hint");
  }
}

// Phím tắt: bấm 1..7 để chọn nhóm tương ứng (số ghi trên từng nhóm)
let keysBound = false;
function bindKeys() {
  if (keysBound) return; keysBound = true;
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !queue.length) return;
    if (e.target.closest?.("input, textarea, select")) return;
    const stack = $("#lb-stack");
    if (!stack || !stack.offsetParent) return; // bước này đang ẩn
    const b = document.querySelectorAll(".bucket")[Number(e.key) - 1];
    if (b) { e.preventDefault(); assign(b.dataset.k); }
  });
}

function finish() {
  sfx.win(); confetti({ count: 100 });
  const st = S.labelStats, n = st.total - st.trash;
  const c = $("#lb-concept"); c.hidden = false;
  c.innerHTML = `<b>💡 Bạn vừa làm việc của "người gắn nhãn"</b>
    <p>Bạn đã gắn ${n} nhãn, loại ${st.trash} ảnh rác, đúng ngay lần đầu ${Math.round((st.first / st.total) * 100)}%.</p>
    <p>AI <b>không tự biết</b> con chó là gì. Con người phải chỉ cho nó bằng <b>nhãn</b> (tên gắn vào từng ảnh). AI thật học từ <b>hơn 200.000 ảnh</b> do hàng nghìn người gắn nhãn. Nhãn sai thì AI học sai.</p>`;
  $("#lb-stack").innerHTML = `<div class="stack-done">✅ Gắn nhãn xong!<br><span class="muted">Nhưng AI còn cần biết con vật nằm <b>ở đâu</b> trong ảnh…</span></div>`;
  ctx.complete("Gắn nhãn xong! Tiếp theo: vẽ khung cho con vật.");
}

export default {
  id: "label", icon: "🏷️", title: "Gắn nhãn",
  blurb: "Giúp AI nhận biết từng loài động vật",
  hint: "Bấm vào nhóm (hoặc nhấn phím số 1–7) đúng với con vật trong ảnh. Cẩn thận ảnh 'bẫy'!",
  guide: { title: "Bước 1: Gắn nhãn cho ảnh", text: "AI học từ ví dụ. Hãy <b>bấm vào đúng nhóm</b> của con vật trong ảnh (hoặc kéo ảnh vào nhóm). Có vài ảnh <b>bẫy</b> không phải con vật thật, hãy kéo chúng vào <b>🗑️ Loại bỏ</b>." },
  enter(c) {
    ctx = c; bindKeys();
    if (started && !queue.length) return; // đã xong — giữ nguyên
    started = true; wrongTries = 0;
    buildQueue(); renderBuckets(); renderBars(); renderStack();
    $("#lb-concept").hidden = true;
  },
};
