$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflared) {
  Write-Error "cloudflared is not installed or not on PATH. Install it first, then rerun this script."
  exit 1
}

$targetUrl = "http://127.0.0.1:5000"

Write-Host "Starting Cloudflare quick tunnel for $targetUrl"
Write-Host "Share the generated https://*.trycloudflare.com URL with the security gateway."

& $cloudflared.Source tunnel --url $targetUrl
