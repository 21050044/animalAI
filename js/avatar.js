// Ảnh đại diện kỹ sư AI (tự vẽ SVG) theo giới tính: "m" nam, "f" nữ, "" chưa chọn.
let n = 0;
const BG = { m: ["#38bdf8", "#2563eb"], f: ["#f9a8d4", "#db2777"], "": ["#6ee7b7", "#059669"] };

export function avatar(g = "", size = 32) {
  const id = `av${++n}`, [a, b] = BG[g] || BG[""];
  const skin = "#fcd9b8", hair = g === "f" ? "#5b3a29" : "#2f2a28";
  const hairBack = g === "f"
    ? `<path d="M15 30c0-11 7-18 17-18s17 7 17 18v16c0 3-2 5-5 5H20c-3 0-5-2-5-5z" fill="${hair}"/>` : "";
  const hairTop = g === "f"
    ? `<path d="M19 29c1-9 6-14 13-14s12 5 13 14c-5-1-9-4-12-8-2 4-7 7-14 8z" fill="${hair}"/>`
    : g === "m"
      ? `<path d="M20 27c0-8 5-13 12-13 8 0 13 5 12 13-2-3-5-4-8-4-4 0-6-2-7-4-2 3-5 5-9 8z" fill="${hair}"/>`
      : `<path d="M20 27c0-8 5-13 12-13s12 5 12 13c-3-4-7-6-12-6s-9 2-12 6z" fill="${hair}"/>`;
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <clipPath id="${id}c"><circle cx="32" cy="32" r="30"/></clipPath></defs>
    <circle cx="32" cy="32" r="30" fill="url(#${id})"/>
    <g clip-path="url(#${id}c)">
      ${hairBack}
      <path d="M10 66c0-13 10-21 22-21s22 8 22 21z" fill="#fff"/>
      <path d="M26 45l6 9 6-9" fill="none" stroke="${b}" stroke-width="3" stroke-linejoin="round"/>
      <rect x="28" y="38" width="8" height="8" rx="3" fill="${skin}"/>
      <ellipse cx="32" cy="30" rx="11.5" ry="12.5" fill="${skin}"/>
      ${hairTop}
      <circle cx="27.5" cy="31" r="1.6" fill="#1f2937"/><circle cx="36.5" cy="31" r="1.6" fill="#1f2937"/>
      <path d="M28.5 36.5q3.5 2.6 7 0" fill="none" stroke="#b45309" stroke-width="1.6" stroke-linecap="round"/>
      ${g === "f" ? `<circle cx="25" cy="34.5" r="1.8" fill="#fda4af" opacity=".7"/><circle cx="39" cy="34.5" r="1.8" fill="#fda4af" opacity=".7"/>` : ""}
      <rect x="38" y="51" width="7" height="2.5" rx="1" fill="${b}"/>
    </g></svg>`;
}
