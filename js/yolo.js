// YOLO11n (COCO) chạy trong trình duyệt bằng onnxruntime-web (WASM).
// Mô hình gốc biết 80 lớp; ta chỉ đọc điểm của những lớp động vật được bật.
const SIZE = 640;
let session = null;
let loading = null;

export function isReady() { return !!session; }

export async function load(onProgress = () => {}) {
  if (session) return session;
  if (loading) return loading;
  loading = (async () => {
    const ort = window.ort;
    ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    const res = await fetch(new URL("../models/yolo11n.onnx", import.meta.url));
    const total = +res.headers.get("content-length") || 10.7e6;
    const reader = res.body.getReader();
    const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onProgress(Math.min(0.95, got / total));
    }
    const buf = new Uint8Array(got); let o = 0;
    for (const c of chunks) { buf.set(c, o); o += c.length; }
    session = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    onProgress(1);
    // chạy nháp 1 lần cho "nóng máy"
    await run(new Float32Array(3 * SIZE * SIZE));
    return session;
  })();
  return loading;
}

const cv = document.createElement("canvas");
cv.width = cv.height = SIZE;
const cx = cv.getContext("2d", { willReadFrequently: true });
const input = new Float32Array(3 * SIZE * SIZE);

async function run(data) {
  const t = new window.ort.Tensor("float32", data, [1, 3, SIZE, SIZE]);
  const out = await session.run({ [session.inputNames[0]]: t });
  return out[session.outputNames[0]];
}

/** Letterbox ảnh vào khung 640×640 (giữ tỉ lệ, viền xám) — giống lúc YOLO được huấn luyện. */
export function letterbox(src) {
  const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
  const r = Math.min(SIZE / w, SIZE / h);
  const nw = Math.round(w * r), nh = Math.round(h * r);
  const px = Math.floor((SIZE - nw) / 2), py = Math.floor((SIZE - nh) / 2);
  cx.fillStyle = "rgb(114,114,114)"; cx.fillRect(0, 0, SIZE, SIZE);
  cx.drawImage(src, px, py, nw, nh);
  return { canvas: cv, r, px, py, w, h };
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter + 1e-9);
}
export { iou };

/**
 * Nhận diện. classIds: mảng id lớp COCO được phép. Trả về khung theo toạ độ ảnh gốc (pixel).
 * stats: số ô dự đoán thô → qua ngưỡng → sau NMS (để giải thích cho học sinh).
 */
export async function detect(src, { conf = 0.35, classIds = [], iouThr = 0.45 } = {}) {
  const t0 = performance.now();
  const lb = letterbox(src);
  const px = cx.getImageData(0, 0, SIZE, SIZE).data;
  const N = SIZE * SIZE;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    input[i] = px[j] / 255; input[i + N] = px[j + 1] / 255; input[i + 2 * N] = px[j + 2] / 255;
  }
  const out = await run(input);
  const [, ch, A] = out.dims; // [1, 84, 8400]
  const d = out.data;
  const cand = [];
  for (let i = 0; i < A; i++) {
    let best = 0, bc = -1;
    for (const c of classIds) { const s = d[(4 + c) * A + i]; if (s > best) { best = s; bc = c; } }
    if (best < conf) continue;
    const cxp = d[i], cyp = d[A + i], wp = d[2 * A + i], hp = d[3 * A + i];
    cand.push({
      x: (cxp - wp / 2 - lb.px) / lb.r, y: (cyp - hp / 2 - lb.py) / lb.r,
      w: wp / lb.r, h: hp / lb.r, score: best, cls: bc,
    });
  }
  cand.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const b of cand) if (!keep.some((k) => k.cls === b.cls && iou(k, b) > iouThr)) keep.push(b);
  for (const b of keep) { // kẹp trong ảnh
    const x2 = Math.min(lb.w, b.x + b.w), y2 = Math.min(lb.h, b.y + b.h);
    b.x = Math.max(0, b.x); b.y = Math.max(0, b.y); b.w = x2 - b.x; b.h = y2 - b.y;
  }
  return { boxes: keep, stats: { raw: A, channels: ch, passed: cand.length, kept: keep.length }, ms: performance.now() - t0, size: [lb.w, lb.h] };
}
