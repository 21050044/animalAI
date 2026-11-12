# Máy chủ dự phòng cho máy KHÔNG có Python (PowerShell có sẵn trên mọi Windows).
param([int]$Port = 8100, [switch]$NoBrowser)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript";
  ".css"="text/css; charset=utf-8"; ".json"="application/json"; ".wasm"="application/wasm"; ".onnx"="application/octet-stream";
  ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".png"="image/png"; ".svg"="image/svg+xml"; ".ico"="image/x-icon" }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "AnimalAI dang chay tai http://localhost:$Port  (dong cua so nay de tat)"
if (-not $NoBrowser) { Start-Process "http://localhost:$Port" }
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart("/")
    if ($p -eq "") { $p = "index.html" }
    $f = [IO.Path]::GetFullPath((Join-Path $root $p))
    $c.Response.Headers.Add("Cross-Origin-Opener-Policy", "same-origin")
    $c.Response.Headers.Add("Cross-Origin-Embedder-Policy", "require-corp")
    $c.Response.Headers.Add("Cache-Control", "no-cache")
    if ($f.StartsWith($root) -and (Test-Path $f -PathType Leaf)) {
      $ext = [IO.Path]::GetExtension($f).ToLower()
      $c.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" })
      $fs = [IO.File]::OpenRead($f)
      $c.Response.ContentLength64 = $fs.Length
      $fs.CopyTo($c.Response.OutputStream); $fs.Close()
    } else { $c.Response.StatusCode = 404 }
  } catch { } finally { try { $c.Response.Close() } catch { } }
}
