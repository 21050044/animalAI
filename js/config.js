// ===== CẤU HÌNH CHO THẦY CÔ =====
// Các lớp động vật YOLO (bộ COCO) biết sẵn. id = số thứ tự lớp trong mô hình.
export const ALL_CLASSES = {
  bird:     { id: 14, vi: "Chim",         emoji: "🐦", color: "#38bdf8" },
  cat:      { id: 15, vi: "Mèo",          emoji: "🐱", color: "#f472b6" },
  dog:      { id: 16, vi: "Chó",          emoji: "🐶", color: "#fbbf24" },
  horse:    { id: 17, vi: "Ngựa",         emoji: "🐴", color: "#a78bfa" },
  sheep:    { id: 18, vi: "Cừu",          emoji: "🐑", color: "#2dd4bf" },
  cow:      { id: 19, vi: "Bò",           emoji: "🐮", color: "#fb923c" },
  elephant: { id: 20, vi: "Voi",          emoji: "🐘", color: "#94a3b8" },
  bear:     { id: 21, vi: "Gấu",          emoji: "🐻", color: "#b45309" },
  zebra:    { id: 22, vi: "Ngựa vằn",     emoji: "🦓", color: "#84cc16" },
  giraffe:  { id: 23, vi: "Hươu cao cổ",  emoji: "🦒", color: "#facc15" },
};

// Chỉ dùng những lớp này trong buổi học (thêm/bớt tên ở đây). Nên 4–8 lớp.
export const ACTIVE = ["dog", "cat", "bird", "cow", "elephant", "zebra"];

// Số ảnh mỗi lớp cho bước gắn nhãn, và số ảnh "bẫy" trộn vào.
export const LABEL_PER_CLASS = 4;
export const TRASH_COUNT = 3;

// Bước Huấn luyện là MÔ PHỎNG. true = hiện một dòng ghi chú nhỏ cho học sinh biết điều đó.
export const SHOW_SIM_NOTE = false;

// Bước Dùng thử: ngưỡng tin cậy mặc định.
export const DEFAULT_CONF = 0.35;

export const classes = () => ACTIVE.filter((k) => ALL_CLASSES[k]).map((k) => ({ key: k, ...ALL_CLASSES[k] }));
export const byKey = (k) => ({ key: k, ...ALL_CLASSES[k] });
export const byId = Object.fromEntries(Object.entries(ALL_CLASSES).map(([k, v]) => [v.id, { key: k, ...v }]));
