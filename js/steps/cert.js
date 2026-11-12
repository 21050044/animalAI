// Chứng nhận cuối buổi.
import { S, $, labelQuality } from "../state.js";
import { classes } from "../config.js";
import { confetti } from "../fx.js";

export default {
  enter() {
    const q = labelQuality();
    const nm = Object.values(S.missions).filter(Boolean).length;
    const best = S.best;
    const date = new Date().toLocaleDateString("vi-VN");
    $("#cert").innerHTML = `
      <div class="cert-card">
        <div class="cert-badge">🎓</div>
        <div class="muted">CHỨNG NHẬN</div>
        <h1>Kỹ sư AI Thị giác máy tính</h1>
        <div class="cert-name">${(S.name || "Kỹ sư AI").replace(/</g, "&lt;")}</div>
        <p>đã tự tay đi hết các bước chế tạo một <b>AI nhận diện</b> ${classes().map((c) => c.emoji).join(" ")}</p>
        <div class="cert-stats">
          <div><b>${S.labelStats.total || 0}</b><span>ảnh đã gắn nhãn</span></div>
          <div><b>${Math.round(q.acc * 100)}%</b><span>nhãn chính xác</span></div>
          <div><b>${Math.round(q.iou * 100)}%</b><span>khung vẽ khớp</span></div>
          <div><b>${S.runs.length}</b><span>lần huấn luyện</span></div>
          <div><b>${best ? Math.round(best.map * 100) + "%" : "–"}</b><span>điểm AI cao nhất</span></div>
          <div><b>${nm}/4</b><span>thử thách</span></div>
        </div>
        <div class="cert-flow">🏷️ Gắn nhãn → 🔲 Vẽ khung → 🧪 Chuẩn bị ảnh → 🧠 Huấn luyện → 🎯 Nhận diện</div>
        <div class="cert-take">
          <b>3 điều mang về:</b>
          <p>① AI không tự biết gì: nó học từ <b>ảnh do con người gắn nhãn</b>. Dạy sai thì AI sai.</p>
          <p>② AI giỏi cần <b>nhiều ảnh</b>, nên <b>học tiếp từ AI có sẵn</b>, và luôn phải được <b>kiểm tra trên ảnh chưa từng thấy</b>.</p>
          <p>③ AI vẫn có thể bị lừa. Con người phải <b>kiểm tra lại</b> kết quả.</p>
        </div>
        <div class="muted small">${date} · Xưởng AI Động Vật</div>
      </div>
      <div class="cert-actions"><button class="btn" onclick="window.print()">🖨 In / lưu PDF</button><button class="btn primary" onclick="location.reload()">↻ Bắt đầu lại (bạn khác)</button></div>`;
    confetti({ count: 200 });
  },
};
