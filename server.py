"""Máy chủ tĩnh siêu nhẹ cho AnimalAI (chỉ dùng thư viện chuẩn của Python).
Bật header COOP/COEP để onnxruntime-web chạy đa luồng (nhanh hơn ~3 lần).
"""
import http.server, os, socketserver, sys, threading, webbrowser

PORT = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8100))
ROOT = os.path.dirname(os.path.abspath(__file__))


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
                      ".onnx": "application/octet-stream", ".json": "application/json"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        pass


class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    url = f"http://localhost:{PORT}"
    with S(("0.0.0.0", PORT), H) as srv:
        print(f"AnimalAI đang chạy tại {url}  (đóng cửa sổ này để tắt)")
        if "--no-browser" not in sys.argv:
            threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        srv.serve_forever()
