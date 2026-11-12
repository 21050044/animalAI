# 🐾 Xưởng AI Động Vật

Bài trải nghiệm khoảng 20–25 phút cho học sinh. Mỗi học sinh tự đi hết quy trình làm ra một mô hình **YOLO** nhận diện động vật. Không cần camera, không cần Internet, mỗi máy chạy riêng.

## Chạy

1. Chép nguyên thư mục `AnimalAI` sang máy học sinh. Thư mục `_tools` là đồ nghề chuẩn bị dữ liệu, **không cần chép**.
2. Nhấp đúp **`start.cmd`**. Trình duyệt sẽ tự mở `http://localhost:8100`. Nên dùng Chrome hoặc Edge.
   - Máy có Python thì dùng `server.py`, chỉ cần thư viện chuẩn, không phải cài gì.
   - Máy không có Python thì tự chuyển sang `server.ps1` (PowerShell có sẵn trên Windows).
3. Học sinh khác vào làm: bấm **↻ Bắt đầu lại** ở màn chứng nhận, hoặc tải lại trang (F5).

> Không mở thẳng file `index.html` bằng cách nhấp đúp, vì trình duyệt sẽ chặn việc tải mô hình AI.

## Năm bước

| Bước | Thời gian | Học sinh làm gì | Thật hay mô phỏng |
|---|---|---|---|
| 🏷️ Gắn nhãn | ~4' | Kéo từng ảnh vào nhóm con vật. Có ảnh "bẫy" (gấu bông, tượng, vạch kẻ đường…) phải kéo vào 🗑️ | Thật (ảnh thật, có chấm đúng/sai) |
| 🔲 Vẽ khung | ~5' | Vẽ khung bao con vật, được chấm **IoU** và thấy 5 con số nhãn YOLO. Sau đó "trợ lý" tự gán khung cho phần ảnh còn lại | Thật (đáp án lấy từ YOLO11m) |
| 🧪 Chuẩn bị dữ liệu | ~3' | Kéo thanh chia train/val, xem letterbox 640×640, bật/tắt tăng cường (lật, màu, phóng, mosaic) | Thật (tăng cường được vẽ trực tiếp, khung biến đổi theo) |
| 🧠 Huấn luyện | ~5' | Chọn cỡ mô hình, transfer learning hay học từ 0, số epoch, tăng cường. Xem luồng chạy, loss, mAP, ảnh kiểm tra tốt dần lên. So sánh các lần chạy | **Mô phỏng.** Kết quả thay đổi theo lựa chọn và chất lượng nhãn của học sinh |
| 🎯 Nhận diện | ~6' | Kéo thả, chọn file hoặc **Ctrl+V** ảnh/video tìm trên mạng. Chỉnh ngưỡng, bật/tắt lớp, làm 6 thử thách | **Thật**: YOLO11n chạy trong trình duyệt (onnxruntime-web) |

Bài học về huấn luyện được cài sẵn trong mô phỏng:
- **Học từ con số 0** thì điểm rất thấp. Đây là lý do cần transfer learning.
- **Tắt tăng cường và để nhiều epoch** thì đường loss kiểm tra đi lên lại, tức là mô hình học vẹt.
- **10 epoch** thì mô hình học chưa đủ.
- **Medium** chính xác hơn nhưng chậm hơn.
- Nhãn và khung học sinh làm càng ẩu thì điểm càng thấp.

## Tuỳ chỉnh (`js/config.js`)

- `ACTIVE`: những lớp dùng trong buổi. Có thể chọn trong: `bird cat dog horse sheep cow elephant bear zebra giraffe`.
- `LABEL_PER_CLASS`, `TRASH_COUNT`: số ảnh ở bước gắn nhãn.
- `SHOW_SIM_NOTE = true`: hiện một dòng nói rõ bước huấn luyện là mô phỏng.
- `DEFAULT_CONF`: ngưỡng tin cậy mặc định ở bước nhận diện.

Mô hình YOLO11n gốc biết 80 lớp COCO. App **chỉ đọc điểm của các lớp động vật đang bật**, nên các vật khác (người, xe…) bị bỏ qua.

## Thêm hoặc đổi ảnh (dành cho người chuẩn bị)

```
cd _tools
python fetch_images.py 45      # tải ảnh giấy phép mở từ Wikimedia Commons vào _tools/raw/
python build_dataset.py 8      # YOLO11m lọc ảnh rõ ràng, ghi khung đáp án → data/
```

- Ảnh ở `data/img/`, nhãn ở `data/dataset.json`.
- Tác giả và giấy phép từng ảnh ở `data/credits.json` (Wikimedia Commons, CC/PD).
- `_tools/pylib` chứa Ultralytics được cài riêng, để không đụng tới Python của app điểm danh. Thư mục này không có trên Git, cài lại bằng:
  `python -m pip install --no-deps --target _tools/pylib ultralytics ultralytics-thop onnx onnxslim onnxruntime protobuf ml_dtypes`
  rồi tải `yolo11m.pt` vào `_tools/` (từ trang releases của ultralytics/assets).

## Cấu trúc

```
index.html, css/, js/        giao diện (mỗi bước một file trong js/steps/)
js/yolo.js                   chạy YOLO: letterbox → ONNX → lọc lớp → NMS
models/yolo11n.onnx          mô hình (~11 MB)
vendor/ort/                  onnxruntime-web 1.19.2 (offline)
data/                        ảnh + nhãn + nguồn ảnh
server.py / server.ps1       máy chủ tĩnh (bật COOP/COEP để chạy đa luồng)
```

Giấy phép: YOLO11 của Ultralytics theo AGPL-3.0, dùng cho mục đích giáo dục là phù hợp.
