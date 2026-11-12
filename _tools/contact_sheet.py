"""Ghép ảnh trong data/img thành 1 tờ duyệt (kèm khung + tên file gốc) để soát lỗi nhanh.
Ảnh nào không ổn → thêm dòng 'lop/ten_raw.jpg' vào blacklist.txt rồi chạy lại build_dataset.py
"""
import json, os
import cv2, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "data")
ds = json.load(open(os.path.join(D, "dataset.json"), encoding="utf-8"))
cr = json.load(open(os.path.join(D, "credits.json"), encoding="utf-8"))
recs = [(it["file"], [it["box"]]) for it in ds["items"]] + [(m["file"], m["boxes"]) for m in ds["multi"]] + [(t["file"], []) for t in ds["trash"]]
W, H, C = 220, 165, 9
rows = (len(recs) + C - 1) // C
sheet = np.full((rows * (H + 18), C * W, 3), 30, np.uint8)
for i, (f, boxes) in enumerate(recs):
    im = cv2.imdecode(np.fromfile(os.path.join(D, "img", f), np.uint8), 1)
    im = cv2.resize(im, (W, H))
    for x, y, w, h in boxes:
        cv2.rectangle(im, (int(x * W), int(y * H)), (int((x + w) * W), int((y + h) * H)), (0, 255, 255), 2)
    r, c = divmod(i, C)
    sheet[r * (H + 18): r * (H + 18) + H, c * W: (c + 1) * W] = im
    cv2.putText(sheet, cr[f]["raw"], (c * W + 3, r * (H + 18) + H + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
out = os.path.join(HERE, "sheet.jpg")
cv2.imencode(".jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tofile(out)
print(out, len(recs))
