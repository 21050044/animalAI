"""Tải ảnh động vật (giấy phép mở) từ Wikimedia Commons vào _tools/raw/<lop>/.
Chạy:  python fetch_images.py  [so_anh_moi_lop] [chi_cac_lop...]
"""
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
UA = {"User-Agent": "AnimalAI-classroom-dataset/1.0 (educational, non-commercial)"}
QUERIES = {
    "bird": ["bird perched", "songbird", "sparrow", "parrot bird"],
    "cat": ["domestic cat", "kitten", "cat portrait"],
    "dog": ["dog", "puppy", "dog portrait"],
    "horse": ["horse", "horse pasture", "pony"],
    "sheep": ["sheep", "lamb sheep", "sheep flock"],
    "cow": ["cow", "cattle", "dairy cow"],
    "elephant": ["elephant", "african elephant", "asian elephant"],
    "bear": ["brown bear", "black bear", "polar bear"],
    "zebra": ["zebra", "plains zebra"],
    "giraffe": ["giraffe", "giraffe savanna"],
    # ảnh "bẫy" cho bước làm sạch dữ liệu: không phải con vật thật
    "trash": ["teddy bear toy", "elephant statue", "zebra crossing street", "horse sculpture bronze",
              "cat food bowl", "plush toy dog"],
    # ảnh có 2–3 con vật KHÁC LOÀI trong cùng ảnh, cho bước Vẽ khung (build_extra.py lọc lại)
    "mixed": ["dog and cat", "cat and dog together", "cattle egret cow", "cow with egret", "zebra and elephant",
              "elephants and zebras", "dog and cow", "cat and bird", "zebras birds", "dog herding cattle",
              "elephant egret", "dog cat sofa"],
}
N = int(sys.argv[1]) if len(sys.argv) > 1 else 45
ONLY = set(sys.argv[2:])  # vd: python fetch_images.py 150 mixed  → chỉ tải nhóm mixed


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except Exception as e:
            print("  retry", i, e); time.sleep(2 + i * 3)
    return None


def strip(html):
    return re.sub(r"<[^>]+>", "", html or "").strip()


def search(q, offset=0):
    p = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
         "gsrsearch": f"{q} filemime:image/jpeg", "gsrlimit": 50, "gsroffset": offset,
         "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 640}
    d = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(p))
    return list(json.loads(d).get("query", {}).get("pages", {}).values()) if d else []


for cls, qs in QUERIES.items():
    if ONLY and cls not in ONLY: continue
    out = os.path.join(RAW, cls); os.makedirs(out, exist_ok=True)
    credits_path = os.path.join(out, "credits.json")
    credits = json.load(open(credits_path, encoding="utf-8")) if os.path.exists(credits_path) else {}
    seen = {c["page"] for c in credits.values()}
    for q in qs:
        if len(credits) >= N: break
        for page in search(q):
            if len(credits) >= N: break
            ii = (page.get("imageinfo") or [{}])[0]
            if not ii.get("thumburl") or page["title"] in seen: continue
            if ii.get("width", 0) < 500 or ii.get("height", 0) < 350: continue
            md = ii.get("extmetadata", {})
            lic = strip(md.get("LicenseShortName", {}).get("value"))
            if not lic or "fair use" in lic.lower(): continue
            data = get(ii["thumburl"])
            if not data: continue
            name = f"{cls}_{len(credits):03d}.jpg"
            open(os.path.join(out, name), "wb").write(data)
            seen.add(page["title"])
            credits[name] = {"page": page["title"], "url": ii.get("descriptionurl"), "license": lic,
                             "author": strip(md.get("Artist", {}).get("value"))[:120]}
            time.sleep(0.15)
    json.dump(credits, open(credits_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(cls, len(credits))
