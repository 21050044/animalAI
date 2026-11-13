"""Bổ sung dữ liệu, KHÔNG build lại ảnh cũ:
- items : thêm ảnh một con cho các lớp đang học để cả bộ đủ ~100 ảnh (chia 80/20 cho số đẹp)
- mixed : ảnh có 2–3 con vật (ưu tiên khác loài) lấy từ raw/mixed → học sinh vẽ nhiều khung + kéo nhãn
- seg   : viền (polygon) của con vật trong từng ảnh items/mixed → giới thiệu bo viền (segmentation)
Dùng YOLO11m-seg (tải yolo11m-seg.pt vào _tools/ từ trang releases của ultralytics/assets).
Chạy:  python build_extra.py [so_anh_mixed]
"""
import json, os, re, sys
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(HERE, "ulcfg"))
sys.path.insert(0, os.path.join(HERE, "pylib"))
from ultralytics import YOLO  # noqa: E402

APP = os.path.dirname(HERE)
DATA = os.path.join(APP, "data")
RAW = os.path.join(HERE, "raw", "mixed")
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
N_MIXED = int(sys.argv[1]) if len(sys.argv) > 1 else 8
TARGET = 100  # tổng số ảnh một con của các lớp đang học
COCO = {"bird": 14, "cat": 15, "dog": 16, "horse": 17, "sheep": 18, "cow": 19,
        "elephant": 20, "bear": 21, "zebra": 22, "giraffe": 23}
NAME = {v: k for k, v in COCO.items()}
# lớp đang dùng trong buổi (đọc từ js/config.js) — ảnh mixed chỉ lấy các lớp này
cfg = open(os.path.join(APP, "js", "config.js"), encoding="utf-8").read()
ACTIVE = re.findall(r'"(\w+)"', re.search(r"export const ACTIVE = \[(.*?)\]", cfg).group(1))
BL_PATH = os.path.join(HERE, "blacklist.txt")
BLACKLIST = {l.split("#")[0].strip() for l in open(BL_PATH, encoding="utf-8")} if os.path.exists(BL_PATH) else set()

model = YOLO(os.path.join(HERE, "yolo11m-seg.pt"))
ds = json.load(open(os.path.join(DATA, "dataset.json"), encoding="utf-8"))
credits = json.load(open(os.path.join(DATA, "credits.json"), encoding="utf-8"))


def load(path):
    return cv2.imdecode(np.fromfile(path, np.uint8), cv2.IMREAD_COLOR)


def iou(a, b):
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw, ih = max(0, min(ax2, bx2) - max(a[0], b[0])), max(0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    return inter / (a[2] * a[3] + b[2] * b[3] - inter + 1e-9)


MIN_GAP = 0.03  # khoảng hở tối thiểu giữa 2 khung (theo tỉ lệ ảnh)


def gap(a, b):
    """khoảng hở giữa 2 khung [x,y,w,h]; âm/0 nếu chạm hoặc chồng nhau"""
    dx = max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]))
    dy = max(b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3]))
    return max(dx, dy)


def polygon(mask_xy, w, h):
    """polygon pixel → đơn giản hoá còn ~30–70 điểm → toạ độ chuẩn hoá [x0,y0,x1,y1,...]"""
    pts = np.asarray(mask_xy, np.float32)
    if len(pts) < 3: return None
    eps = 0.0025 * cv2.arcLength(pts, True)
    ap = cv2.approxPolyDP(pts, eps, True).reshape(-1, 2)
    if len(ap) < 3: return None
    return [round(float(v), 4) for x, y in ap for v in (x / w, y / h)]


def detect(im):
    r = model.predict(im, conf=0.25, verbose=False, retina_masks=True)[0]
    h, w = im.shape[:2]
    out = []
    if r.masks is None: return out, r
    for c, s, b, xy in zip(r.boxes.cls, r.boxes.conf, r.boxes.xyxy, r.masks.xy):
        x1, y1, x2, y2 = [float(v) for v in b]
        out.append({"cid": int(c), "conf": float(s), "box": [x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h],
                    "seg": polygon(xy, w, h)})
    return out, r


def draw(im, objs, path):
    v = im.copy(); h, w = v.shape[:2]
    for o in objs:
        if o.get("seg"):
            p = (np.array(o["seg"]).reshape(-1, 2) * [w, h]).astype(np.int32)
            ov = v.copy(); cv2.fillPoly(ov, [p], (0, 200, 255)); v = cv2.addWeighted(ov, .35, v, .65, 0)
            cv2.polylines(v, [p], True, (0, 200, 255), 2)
        x, y, bw, bh = o["box"]
        cv2.rectangle(v, (int(x * w), int(y * h)), (int((x + bw) * w), int((y + bh) * h)), (0, 255, 0), 2)
        cv2.putText(v, o["cls"], (int(x * w) + 3, int(y * h) + 16), cv2.FONT_HERSHEY_SIMPLEX, .55, (0, 255, 0), 2)
    cv2.imencode(".jpg", v)[1].tofile(path)


# ---------- 0. bỏ ảnh trong blacklist, thêm ảnh một con cho đủ TARGET ----------
for it in [it for it in ds["items"] if credits.get(it["file"], {}).get("raw") in BLACKLIST]:
    ds["items"].remove(it); credits.pop(it["file"], None)
    if os.path.exists(os.path.join(DATA, "img", it["file"])): os.remove(os.path.join(DATA, "img", it["file"]))
    print("bỏ", it["file"])


def ahash(im):
    small = cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (9, 8), interpolation=cv2.INTER_AREA)
    return (small[:, 1:] > small[:, :-1]).flatten()


per = -(-TARGET // len(ACTIVE))
used_raw = {v.get("raw") for v in credits.values()}
for cls in ACTIVE:
    n = sum(1 for it in ds["items"] if it["cls"] == cls)
    hashes = [ahash(load(os.path.join(DATA, "img", it["file"]))) for it in ds["items"] if it["cls"] == cls]
    taken = {it["file"] for it in ds["items"]}
    d = os.path.join(HERE, "raw", cls)
    if n >= per or not os.path.isdir(d): continue
    cred = json.load(open(os.path.join(d, "credits.json"), encoding="utf-8"))
    for f in sorted(cred):
        if n >= per: break
        if f"{cls}/{f}" in BLACKLIST or f"{cls}/{f}" in used_raw: continue
        im = load(os.path.join(d, f))
        if im is None: continue
        h, w = im.shape[:2]
        if w > 640: im = cv2.resize(im, (640, round(h * 640 / w)), interpolation=cv2.INTER_AREA); h, w = im.shape[:2]
        if h > w * 1.4 or w > h * 2.2: continue
        dets, _ = detect(im)
        mine = [x for x in dets if x["cid"] == COCO[cls]]
        others = [x for x in dets if x["cid"] in NAME and x["cid"] != COCO[cls] and x["conf"] >= 0.3]
        if others or len(mine) != 1 or mine[0]["conf"] < 0.5 or not mine[0]["seg"]: continue
        bw, bh = mine[0]["box"][2], mine[0]["box"][3]
        if bw * bh < 0.06 or bw * bh > 0.85: continue
        hs = ahash(im)
        if any(np.count_nonzero(hs != x) <= 18 for x in hashes): continue  # trùng hoặc gần trùng ảnh đã có
        name = next(f"{cls}_{i}.jpg" for i in range(1000) if f"{cls}_{i}.jpg" not in taken)
        taken.add(name); hashes.append(hs)
        cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, 82])[1].tofile(os.path.join(DATA, "img", name))
        ds["items"].append({"file": name, "cls": cls, "box": [round(v, 4) for v in mine[0]["box"]]})
        credits[name] = {**cred[f], "raw": f"{cls}/{f}"}; n += 1
    print("thêm ảnh", cls, "→", n)
ds["items"].sort(key=lambda it: (it["cls"], int(re.search(r"_(\d+)\.jpg", it["file"]).group(1))))

# ---------- 1. viền cho ảnh một con ----------
n_seg = 0
for it in ds["items"]:
    im = load(os.path.join(DATA, "img", it["file"]))
    dets, _ = detect(im)
    cands = [d for d in dets if d["cid"] == COCO[it["cls"]] and d["seg"] and iou(d["box"], it["box"]) > 0.6]
    it.pop("seg", None)
    if cands:
        it["seg"] = max(cands, key=lambda d: iou(d["box"], it["box"]))["seg"]; n_seg += 1
print("items có viền:", n_seg, "/", len(ds["items"]))

# ---------- 1b. sắp xếp để các ảnh ĐẦU mỗi lớp khác nhau nhất (bước Gắn nhãn lấy 4 ảnh đầu) ----------
def feature(it):
    im = load(os.path.join(DATA, "img", it["file"]))
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [12, 4, 4], [0, 180, 0, 256, 0, 256]).flatten()
    hist /= hist.sum() + 1e-9
    thumb = cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (12, 9), interpolation=cv2.INTER_AREA).flatten().astype(np.float32)
    thumb = (thumb - thumb.mean()) / (thumb.std() + 1e-6)
    x, y, w, h = it["box"]
    geo = np.array([x + w / 2, y + h / 2, w, h, w * h], np.float32)
    # màu (đổi cảnh), bố cục sáng tối (đổi tư thế/khung hình), vị trí/kích thước con vật
    return np.concatenate([np.sqrt(hist) * 2.0, thumb * 0.12, geo * 1.5])


N_DIVERSE = 6
# Ảnh ghim cho bước Gắn nhãn (do giáo viên chọn): các ảnh này đứng đầu lớp, phần còn lại chọn theo độ khác biệt
PINS = {"cat": ["cat_0.jpg", "cat_6.jpg", "cat_2.jpg", "cat_7.jpg"]}
for cls in sorted({it["cls"] for it in ds["items"]}):
    its = [it for it in ds["items"] if it["cls"] == cls]
    if len(its) <= 2: continue
    F = np.stack([feature(it) for it in its])
    names = [it["file"] for it in its]
    chosen = [names.index(f) for f in PINS.get(cls, []) if f in names] or [0]  # ảnh ghim (hoặc ảnh đầu), rồi lần lượt lấy ảnh khác xa nhất
    while len(chosen) < min(N_DIVERSE, len(its)):
        dmin = np.min(np.linalg.norm(F[:, None, :] - F[None, chosen, :], axis=2), axis=1)
        dmin[chosen] = -1
        chosen.append(int(np.argmax(dmin)))
    order = [its[i] for i in chosen] + [it for i, it in enumerate(its) if i not in chosen]
    pos = [i for i, it in enumerate(ds["items"]) if it["cls"] == cls]
    for i, it in zip(pos, order): ds["items"][i] = it
    print("đa dạng", cls, [its[i]["file"] for i in chosen[:4]])

# ---------- 2. ảnh nhiều con, khác loài ----------
mixed = []
if os.path.isdir(RAW):
    cred = json.load(open(os.path.join(RAW, "credits.json"), encoding="utf-8"))
    scored = []
    for f in sorted(cred):
        if f"mixed/{f}" in BLACKLIST: continue
        im = load(os.path.join(RAW, f))
        if im is None: continue
        h, w = im.shape[:2]
        if w > 640: im = cv2.resize(im, (640, round(h * 640 / w)), interpolation=cv2.INTER_AREA); h, w = im.shape[:2]
        if h > w * 1.3 or w > h * 2: continue
        dets, _ = detect(im)
        animals = [d for d in dets if d["cid"] in NAME]
        strong = [d for d in animals if d["conf"] >= 0.6]
        people = [d for d in dets if d["cid"] == 0 and d["box"][2] * d["box"][3] > 0.2]
        if len(strong) != len(animals) or not 2 <= len(strong) <= 3 or people: continue
        if any(NAME[d["cid"]] not in ACTIVE for d in strong): continue
        if any(not d["seg"] for d in strong): continue
        areas = [d["box"][2] * d["box"][3] for d in strong]
        if min(areas) < 0.012 or max(areas) > 0.55: continue
        # các con phải TÁCH RỜI nhau (không chồng khung, có khoảng hở) để học sinh dễ vẽ khung
        if any(gap(a["box"], b["box"]) < MIN_GAP for i, a in enumerate(strong) for b in strong[i + 1:]): continue
        # mã băm ảnh để loại ảnh trùng (cùng 1 ảnh đăng nhiều lần)
        small = cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (9, 8), interpolation=cv2.INTER_AREA)
        hsh = (small[:, 1:] > small[:, :-1]).flatten()
        kinds = len({d["cid"] for d in strong})
        scored.append((kinds, len(strong), min(areas), f, im, strong, hsh))
    scored.sort(key=lambda x: (-x[0], -x[1], -x[2]))
    # bỏ ảnh trùng, rồi ưu tiên các tổ hợp loài khác nhau (không để toàn chó + mèo)
    uniq = []
    for x in scored:
        if all(np.count_nonzero(x[6] != y[6]) > 10 for y in uniq): uniq.append(x)
    seen, first, rest = set(), [], []
    for x in uniq:
        sig = (tuple(sorted({d["cid"] for d in x[5]})), len(x[5]))
        (rest if sig in seen else first).append(x); seen.add(sig)
    scored = first + rest
    for f in [os.path.basename(p) for p in os.listdir(DATA + "/img") if p.startswith("mixed_")]:
        os.remove(os.path.join(DATA, "img", f)); credits.pop(f, None)
    for i, (kinds, _, _, f, im, strong, _) in enumerate(scored[:N_MIXED]):
        name = f"mixed_{i}.jpg"
        cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, 82])[1].tofile(os.path.join(DATA, "img", name))
        objs = [{"cls": NAME[d["cid"]], "box": [round(v, 4) for v in d["box"]], "seg": d["seg"]}
                for d in sorted(strong, key=lambda d: d["box"][0])]
        mixed.append({"file": name, "objs": objs})
        credits[name] = {**cred[f], "raw": f"mixed/{f}"}
        draw(im, objs, os.path.join(SHOTS, f"check_{name}"))
        print(name, "<-", f, [o["cls"] for o in objs], cred[f]["license"])
    print("mixed:", len(mixed), "/ ứng viên đạt:", len(scored))
ds["mixed"] = mixed

json.dump(ds, open(os.path.join(DATA, "dataset.json"), "w", encoding="utf-8"), indent=0)
with open(os.path.join(DATA, "dataset.js"), "w", encoding="utf-8") as fh:
    fh.write("window.DATASET = " + json.dumps(ds) + ";\n")
json.dump(credits, open(os.path.join(DATA, "credits.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
