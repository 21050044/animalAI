"""Kiểm thử tự động toàn bộ 5 bước bằng Playwright (Chrome hệ thống).
python e2e_test.py <thu_muc_anh_chup> [port]
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]; PORT = sys.argv[2] if len(sys.argv) > 2 else "8100"
B = f"http://localhost:{PORT}"
HERE = os.path.dirname(os.path.abspath(__file__))
DS = json.load(open(os.path.join(HERE, "..", "data", "dataset.json"), encoding="utf-8"))
GT = {it["file"]: [{"cls": it["cls"], "box": it["box"]}] for it in DS["items"]}
GT.update({m["file"]: m["objs"] for m in DS.get("mixed", [])})
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    pg = b.new_page(viewport={"width": 1600, "height": 950})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append("console " + m.text))
    pg.on("response", lambda r: r.status >= 400 and errs.append(f"http {r.status} {r.url}"))
    pg.goto(B)
    pg.wait_for_function("document.querySelector('#intro-load').textContent.includes('sẵn sàng')", timeout=90000)
    print("model:", pg.inner_text("#intro-load"))
    pg.screenshot(path=f"{OUT}/a0_intro.png")
    pg.fill("#intro-name", "Nguyễn Văn Test"); pg.click("#intro-go"); pg.wait_for_timeout(600)

    # 1. gắn nhãn: lần đầu cố tình sai 1 lần
    pg.screenshot(path=f"{OUT}/a1_label.png")
    first = True
    for _ in range(80):
        src = pg.evaluate("document.querySelector('#lb-stack .pcard.top img')?.getAttribute('src')")
        if not src: break
        cls = os.path.basename(src).split("_")[0]
        if first:
            wrong = "trash" if cls != "trash" else "dog"
            pg.click(f'.bucket[data-k="{wrong}"]'); pg.wait_for_timeout(500); first = False
            pg.screenshot(path=f"{OUT}/a1_wrong.png")
        # kéo thả thật cho ảnh đầu, còn lại bấm
        card = pg.locator("#lb-stack .pcard.top").bounding_box()
        tgt = pg.locator(f'.bucket[data-k="{cls}"]').bounding_box()
        pg.mouse.move(card["x"] + card["width"] / 2, card["y"] + card["height"] / 2); pg.mouse.down()
        pg.mouse.move(tgt["x"] + tgt["width"] / 2, tgt["y"] + tgt["height"] / 2, steps=8); pg.mouse.up()
        pg.wait_for_timeout(450)
    pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}/a1_done.png")
    pg.click("#btn-next"); pg.wait_for_timeout(800)

    # 2. vẽ khung theo đáp án (lệch nhẹ); ảnh nhiều con: vẽ từng khung rồi kéo tên vào khung
    def drag(a, b):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*b, steps=6); pg.mouse.up(); pg.wait_for_timeout(150)
    for i in range(10):
        src = pg.get_attribute("#bx-img", "src")
        if not src: break
        f = os.path.basename(src)
        r = pg.locator("#bx-cv").bounding_box()
        P = lambda x, y: (r["x"] + x * r["width"], r["y"] + y * r["height"])
        for o in GT[f]:
            x, y, w, h = o["box"]; drag(P(x + 0.02, y + 0.01), P(x + w - 0.01, y + h - 0.005))
        if len(GT[f]) > 1:
            for o in GT[f]:
                x, y, w, h = o["box"]; c = pg.locator(f'#bx-labels .lbl-chip[data-k="{o["cls"]}"]').bounding_box()
                drag((c["x"] + c["width"] / 2, c["y"] + c["height"] / 2), P(x + w / 2, y + h / 2))
            pg.screenshot(path=f"{OUT}/a2_multi.png")
        if i == 0: pg.screenshot(path=f"{OUT}/a2_draw.png")
        pg.click("#bx-check"); pg.wait_for_timeout(400)
        if i == 0: pg.screenshot(path=f"{OUT}/a2_check.png")
        nxt = pg.locator("#bx-next")
        if not nxt.is_visible(): break
        last = "Xong" in nxt.inner_text()
        nxt.click(); pg.wait_for_timeout(500)
        if last: break
    pg.wait_for_timeout(8000)
    pg.screenshot(path=f"{OUT}/a2_auto.png")
    pg.click("#bx-auto .auto-cell:nth-child(1)"); pg.wait_for_timeout(600); pg.screenshot(path=f"{OUT}/a2_zoom.png"); pg.keyboard.press("Escape")
    pg.click('#bx-tabs .tab[data-t="seg"]'); pg.wait_for_timeout(500); pg.screenshot(path=f"{OUT}/a2_seg.png")
    pg.click("#btn-next"); pg.wait_for_timeout(1500)

    # 3. chuẩn bị dữ liệu
    pg.screenshot(path=f"{OUT}/a3_prep.png", full_page=True)
    pg.click(".aug:nth-child(4) .sw"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/a3_prep_nomosaic.png", full_page=True)
    pg.click(".aug:nth-child(4) .sw")
    pg.click("#btn-next"); pg.wait_for_timeout(800)

    # 4. huấn luyện: lần 1 mặc định, lần 2 từ con số 0
    pg.click("#tr-go"); pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}/a4_training.png", full_page=True)
    pg.wait_for_function("!document.querySelector('#tr-go').disabled", timeout=120000)
    pg.screenshot(path=f"{OUT}/a4_done.png", full_page=True)
    pg.click("#tr-init .segb:nth-child(2)"); pg.click("#tr-ep .segb:nth-child(1)"); pg.click("#tr-aug .segb:nth-child(2)")
    pg.click("#tr-go"); pg.wait_for_function("!document.querySelector('#tr-go').disabled", timeout=120000)
    pg.screenshot(path=f"{OUT}/a4_done2.png", full_page=True)
    pg.click("#btn-next"); pg.wait_for_timeout(800)

    # 5. nhận diện: ảnh mẫu + file upload
    pg.screenshot(path=f"{OUT}/a5_detect.png")
    pg.click("#dt-gal .gi:nth-child(1)"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{OUT}/a5_sample.png")
    print("counts:", pg.inner_text("#dt-counts").replace("\n", " "), "|", pg.inner_text("#dt-ms"))
    up = sys.argv[3] if len(sys.argv) > 3 else None
    if up:
        pg.set_input_files("#dt-file", up); pg.wait_for_timeout(4000)
        pg.screenshot(path=f"{OUT}/a5_upload.png")
        print("upload counts:", pg.inner_text("#dt-counts").replace("\n", " "))
    vid = os.path.join(HERE, "testvid.webm")
    if os.path.exists(vid):
        pg.set_input_files("#dt-file", vid); pg.wait_for_timeout(5000)
        pg.screenshot(path=f"{OUT}/a5_video.png")
        print("video counts:", pg.inner_text("#dt-counts").replace("\n", " "), "|", pg.inner_text("#dt-ms"))
    # thử thách kéo ngưỡng thấp
    pg.click("#dt-close"); pg.click("#dt-gal .gi:nth-child(3)"); pg.wait_for_timeout(1500)
    pg.evaluate("const s=document.querySelector('#dt-conf'); s.value=10; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change'))")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/a5_lowconf.png")
    print("missions:", pg.inner_text("#dt-missions").replace("\n", " | "))
    pg.click("#btn-next"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/a6_cert.png", full_page=True)
    print("errors:", errs)
    b.close()
