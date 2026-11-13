// Bộ icon SVG cho 5 bước (tự vẽ, không cần tải gì). Mỗi icon có chuyển động nhẹ, xem css: .ico-*
const defs = (id, a, b) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;

const ICONS = {
  // nhãn treo có dấu chân → gắn tên cho ảnh
  label: `<svg class="ico ico-label" viewBox="0 0 64 64" aria-hidden="true">${defs("gL", "#fbbf24", "#f97316")}
    <g class="sw-g"><path d="M30 8h20a6 6 0 0 1 6 6v20a6 6 0 0 1-1.8 4.2L33 59.4a6 6 0 0 1-8.4 0L8.6 43.4a6 6 0 0 1 0-8.4L30 8z" fill="url(#gL)"/>
    <circle cx="45" cy="19" r="4.5" fill="#fff"/>
    <g fill="#fff" opacity=".95"><ellipse cx="27" cy="39" rx="5.2" ry="4.4"/><circle cx="20.5" cy="33" r="2.3"/><circle cx="25" cy="29.2" r="2.3"/><circle cx="30.6" cy="29.6" r="2.3"/><circle cx="34" cy="34" r="2.2"/></g></g>
    <path class="str" d="M45 19 Q52 6 60 4" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/></svg>`,

  // khung ngắm 4 góc + khung nét đứt quanh con vật → khoanh vùng
  box: `<svg class="ico ico-box" viewBox="0 0 64 64" aria-hidden="true">${defs("gB", "#22d3ee", "#0ea5e9")}
    <rect x="6" y="6" width="52" height="52" rx="12" fill="url(#gB)" opacity=".16"/>
    <g class="corners" fill="none" stroke="url(#gB)" stroke-width="4.5" stroke-linecap="round">
      <path d="M6 18V10a4 4 0 0 1 4-4h8"/><path d="M46 6h8a4 4 0 0 1 4 4v8"/><path d="M58 46v8a4 4 0 0 1-4 4h-8"/><path d="M18 58h-8a4 4 0 0 1-4-4v-8"/></g>
    <rect class="bbox" x="17" y="19" width="30" height="27" rx="3" fill="none" stroke="#0284c7" stroke-width="2.5" stroke-dasharray="5 4"/>
    <g fill="#0369a1"><ellipse cx="32" cy="37" rx="6" ry="5"/><circle cx="24.5" cy="30" r="2.6"/><circle cx="29.5" cy="25.7" r="2.6"/><circle cx="35.5" cy="26" r="2.6"/><circle cx="39.6" cy="31" r="2.5"/></g></svg>`,

  // xấp ảnh xoè ra → chuẩn bị dữ liệu
  prep: `<svg class="ico ico-prep" viewBox="0 0 64 64" aria-hidden="true">${defs("gP", "#818cf8", "#6366f1")}
    <rect class="c3" x="14" y="12" width="36" height="30" rx="5" fill="#c7d2fe"/>
    <rect class="c2" x="14" y="12" width="36" height="30" rx="5" fill="#a5b4fc"/>
    <g class="c1"><rect x="14" y="12" width="36" height="30" rx="5" fill="url(#gP)"/>
      <circle cx="23" cy="21" r="3.5" fill="#fde68a"/><path d="M16 39l10-11 7 7 5-5 10 9v1a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3z" fill="#e0e7ff"/></g>
    <g class="spark" fill="#f59e0b"><path d="M52 44l1.6 3.6L57 49l-3.4 1.4L52 54l-1.6-3.6L47 49l3.4-1.4z"/><path d="M9 46l1 2.2 2.2.9-2.2.9-1 2.2-1-2.2-2.2-.9 2.2-.9z"/></g></svg>`,

  // mạng nơ-ron với các nút sáng dần → huấn luyện
  train: `<svg class="ico ico-train" viewBox="0 0 64 64" aria-hidden="true">${defs("gT", "#a78bfa", "#7c3aed")}
    <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#gT)"/>
    <g stroke="#ede9fe" stroke-width="1.6" opacity=".7">
      <path d="M15 20L32 14M15 20L32 32M15 20L32 50M15 44L32 14M15 44L32 32M15 44L32 50M32 14L49 24M32 32L49 24M32 50L49 24M32 14L49 40M32 32L49 40M32 50L49 40"/></g>
    <g fill="#fff"><circle class="n n1" cx="15" cy="20" r="4.2"/><circle class="n n1" cx="15" cy="44" r="4.2"/>
      <circle class="n n2" cx="32" cy="14" r="4.2"/><circle class="n n2" cx="32" cy="32" r="4.2"/><circle class="n n2" cx="32" cy="50" r="4.2"/>
      <circle class="n n3" cx="49" cy="24" r="4.2"/><circle class="n n3" cx="49" cy="40" r="4.2"/></g></svg>`,

  // ống kính quét có tia quét chạy → thử nghiệm AI
  detect: `<svg class="ico ico-detect" viewBox="0 0 64 64" aria-hidden="true">${defs("gD", "#34d399", "#059669")}
    <circle cx="32" cy="32" r="26" fill="url(#gD)"/>
    <circle cx="32" cy="32" r="17" fill="#064e3b"/><circle cx="32" cy="32" r="10" fill="#10b981"/><circle cx="28" cy="28" r="3.6" fill="#d1fae5"/>
    <g class="ring" fill="none" stroke="#d1fae5" stroke-width="2.4" stroke-linecap="round"><path d="M32 2v8M32 54v8M2 32h8M54 32h8"/></g>
    <rect class="scan" x="12" y="30" width="40" height="3" rx="1.5" fill="#a7f3d0" opacity=".85"/></svg>`,
};

// mỗi lần chèn dùng id gradient riêng (gradient nằm trong phần tử bị ẩn sẽ không hiện)
let n = 0;
export function icon(k) {
  const id = `i${++n}`;
  return (ICONS[k] || "").replace(/id="g(\w)"/g, `id="g$1${id}"`).replace(/url\(#g(\w)\)/g, `url(#g$1${id})`);
}
