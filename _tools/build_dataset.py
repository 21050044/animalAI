"""Lọc ảnh trong _tools/raw bằng YOLO, ghi khung chuẩn, xuất vào ../data/.
- single: ảnh có đúng 1 con vật rõ ràng (dùng để gắn nhãn + vẽ khung)
- multi : ảnh có >=2 con (dùng làm ảnh mẫu ở bước Dùng thử)
- trash : ảnh "bẫy" không có con vật thật (gấu bông, tượng...)
"""
import json, os, shutil, sys
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(HERE, "ulcfg"))
sys.path.insert(0, os.path.join(HERE, "pylib"))
from ultralytics import YOLO  # noqa: E402

RAW = os.path.join(HERE, "raw")
OUT = os.path.join(os.path.dirname(HERE), "data")
COCO = {"bird": 14, "cat": 15, "dog": 16, "horse": 17, "sheep": 18, "cow": 19,
        "elephant": 20, "bear": 21, "zebra": 22, "giraffe": 23}
ANIMAL_IDS = set(COCO.values())
PER_CLASS = int(sys.argv[1]) if len(sys.argv) > 1 else 8
MULTI_PER_CLASS = 2

BL_PATH = os.path.join(HERE, "blacklist.txt")  # mỗi dòng: lop/ten_file_raw.jpg — ảnh muốn loại thủ công
BLACKLIST = {l.split("#")[0].strip() for l in open(BL_PATH, encoding="utf-8")} if os.path.exists(BL_PATH) else set()
model = YOLO(os.path.join(HERE, "yolo11m.pt"))
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(os.path.join(OUT, "img"))
items, multi, trash, credits = [], [], [], {}


def load(path):
    import numpy as np
    return cv2.imdecode(np.fromfile(path, np.uint8), cv2.IMREAD_COLOR)


def save(im, name):
    ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, 82])
    open(os.path.join(OUT, "img", name), "wb").write(buf.tobytes())


def fit(im, maxw=640):
    h, w = im.shape[:2]
    if w > maxw:
        im = cv2.resize(im, (maxw, round(h * maxw / w)), interpolation=cv2.INTER_AREA)
    return im


for folder in sorted(os.listdir(RAW)):
    d = os.path.join(RAW, folder)
    if not os.path.isdir(d) or not os.path.exists(os.path.join(d, "credits.json")): continue
    cred =json.load(open(os.path.join(d, "credits.json"), encoding="utf-8"))
    n_single = n_multi = n_trash = 0
    for f in sorted(cred):
        if f"{folder}/{f}" in BLACKLIST: continue
        im = load(os.path.join(d, f))
        if im is None: continue
        im = fit(im)
        h, w = im.shape[:2]
        if h > w * 1.4 or w > h * 2.2: continue  # tỉ lệ quá dị
        r = model.predict(im, conf=0.25, verbose=False)[0]
        dets = [(int(c), float(s), [float(v) for v in b]) for c, s, b in
                zip(r.boxes.cls, r.boxes.conf, r.boxes.xyxy)]
        animals = [x for x in dets if x[0] in ANIMAL_IDS]
        rec = lambda name: credits.__setitem__(name, {**cred[f], "raw": f"{folder}/{f}"})  # noqa: E731
        if folder == "trash":
            if not animals and n_trash < 8:
                name = f"trash_{n_trash}.jpg"; save(im, name); rec(name)
                trash.append({"file": name}); n_trash += 1
            continue
        cid = COCO[folder]
        mine = [x for x in animals if x[0] == cid and x[1] >= 0.5]
        others = [x for x in animals if x[0] != cid and x[1] >= 0.3]
        if others or not mine: continue
        boxes = [[round(b[0] / w, 4), round(b[1] / h, 4), round((b[2] - b[0]) / w, 4), round((b[3] - b[1]) / h, 4)]
                 for _, _, b in mine]
        if len(mine) == 1 and len([x for x in animals if x[0] == cid]) == 1:
            bw, bh = boxes[0][2], boxes[0][3]
            if bw * bh < 0.06 or bw * bh > 0.85 or n_single >= PER_CLASS: continue
            name = f"{folder}_{n_single}.jpg"; save(im, name); rec(name)
            items.append({"file": name, "cls": folder, "box": boxes[0]}); n_single += 1
        elif len(mine) >= 2 and n_multi < MULTI_PER_CLASS:
            name = f"{folder}_multi{n_multi}.jpg"; save(im, name); rec(name)
            multi.append({"file": name, "cls": folder, "boxes": boxes}); n_multi += 1
    print(folder, "single", n_single, "multi", n_multi, "trash", n_trash)

json.dump({"items": items, "multi": multi, "trash": trash}, open(os.path.join(OUT, "dataset.json"), "w", encoding="utf-8"), indent=0)
with open(os.path.join(OUT, "dataset.js"), "w", encoding="utf-8") as fh:
    fh.write("window.DATASET = " + json.dumps({"items": items, "multi": multi, "trash": trash}) + ";\n")
json.dump(credits, open(os.path.join(OUT, "credits.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("total", len(items), len(multi), len(trash))
