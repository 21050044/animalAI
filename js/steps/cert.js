// Chứng nhận cuối buổi (in được khổ A4 ngang).
import { S, $, labelQuality } from "../state.js";
import { classes } from "../config.js";
import { confetti } from "../fx.js";
import { icon } from "../icons.js";

const STEPS = [["label", "Gắn nhãn"], ["box", "Khoanh vùng"], ["prep", "Chuẩn bị dữ liệu"], ["train", "Huấn luyện AI"], ["detect", "Thử nghiệm"]];
const MEDAL = `<svg viewBox="0 0 80 96" aria-hidden="true"><defs>
  <linearGradient id="mdG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#b45309"/></linearGradient>
  <linearGradient id="mdR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#059669"/></linearGradient></defs>
  <path d="M22 50L10 92l14-7 8 11 8-40z" fill="url(#mdR)"/><path d="M58 50l12 42-14-7-8 11-8-40z" fill="url(#mdR)"/>
  <circle cx="40" cy="38" r="31" fill="url(#mdG)"/><circle cx="40" cy="38" r="24" fill="none" stroke="#fff7d6" stroke-width="2" stroke-dasharray="3 3"/>
  <path d="M40 22l4.7 9.6 10.6 1.5-7.7 7.5 1.8 10.5L40 46.2l-9.4 4.9 1.8-10.5-7.7-7.5 10.6-1.5z" fill="#fff"/></svg>`;

export default {
  enter() {
    const q = labelQuality();
    const nm = Object.values(S.missions).filter(Boolean).length;
    const best = S.best;
    const now = new Date();
    const date = now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const mins = S.startedAt ? Math.max(1, Math.round((Date.now() - S.startedAt) / 60000)) : null;
    const name = (S.name || "Kỹ sư AI").replace(/</g, "&lt;");
    const stats = [
      [S.labelStats.total || 0, "ảnh đã gắn nhãn"],
      [Math.round(q.acc * 100) + "%", "nhãn chính xác"],
      [Math.round(q.iou * 100) + "%", "khung vẽ khớp"],
      [S.runs.length, "lần huấn luyện"],
      [best ? Math.round(best.map * 100) + "%" : "–", "mAP50 cao nhất"],
      [`${nm}/4`, "thử thách"],
    ];
    $("#cert").innerHTML = `
      <div class="cert-card">
        <div class="cert-top">
          <div class="cert-medal">${MEDAL}</div>
          <div class="cert-head">
            <div class="cert-kicker">Chứng nhận hoàn thành</div>
            <h1>Kỹ sư AI Thị giác máy tính</h1>
            <div class="cert-sub">Xưởng AI Động Vật · Trải nghiệm tự tạo AI nhận diện động vật</div>
          </div>
        </div>
        <div class="cert-give"><span>Trao cho</span></div>
        <div class="cert-name">${name}</div>
        <p class="cert-desc">đã tự tay đi hết 5 bước để tạo ra một AI biết nhận diện <span class="cert-zoo">${classes().map((c) => c.emoji).join(" ")}</span></p>
        <div class="cert-steps">${STEPS.map(([k, t]) => `<div class="cs">${icon(k)}<span>${t}</span></div>`).join('<i class="cs-arrow"></i>')}</div>
        <div class="cert-stats">${stats.map(([v, t]) => `<div><b>${v}</b><span>${t}</span></div>`).join("")}</div>
        <div class="cert-take">
          <div class="cert-take-h">3 điều mang về</div>
          <div class="cert-take-grid">
            <p><span class="num">1</span><span>AI không tự biết gì: nó học từ ảnh do con người gắn nhãn. Dạy sai thì AI sai.</span></p>
            <p><span class="num">2</span><span>AI giỏi cần nhiều dữ liệu, nên học tiếp từ AI có sẵn và luôn được kiểm tra trên ảnh chưa từng thấy.</span></p>
            <p><span class="num">3</span><span>AI vẫn có thể bị lừa. Con người phải kiểm tra lại kết quả.</span></p>
          </div>
        </div>
        <div class="cert-foot">
          <div><b>${date}</b><span>Ngày cấp</span></div>
          <div class="cert-sign"><span class="sig">Xưởng AI</span><span>Xưởng AI Động Vật</span></div>
          <div><b>${mins ? mins + " phút" : classes().length + " loài"}</b><span>${mins ? "Thời gian hoàn thành" : "Số loài AI nhận diện"}</span></div>
        </div>
      </div>
      <div class="cert-actions"><button class="btn" onclick="window.print()">🖨 In / lưu PDF</button><button class="btn primary" onclick="location.reload()">↻ Bắt đầu lại (bạn khác)</button></div>`;
    confetti({ count: 200 });
  },
};
