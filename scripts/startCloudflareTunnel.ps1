$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflared) {
  Write-Error "cloudflared is not installed or not on PATH. Install it first, then rerun this script."
  exit 1
}

$targetUrl = "http://127.0.0.1:5000"
$urlPrinted = $false

Write-Host "Starting Cloudflare quick tunnel for $targetUrl"
Write-Host "Waiting for public URL..."

& $cloudflared.Source tunnel --url $targetUrl 2>&1 | ForEach-Object {
  $line = $_.ToString()

  if (-not $urlPrinted) {
    $match = [regex]::Match($line, 'https://[a-z0-9-]+\.trycloudflare\.com')

    if ($match.Success) {
      $publicUrl = $match.Value
      $webhookUrl = "$publicUrl/api/alerts"

      Write-Host ""
      Write-Host "Cloudflare Tunnel Ready" -ForegroundColor Green
      Write-Host "Public URL : $publicUrl" -ForegroundColor Cyan
      Write-Host "Webhook URL: $webhookUrl" -ForegroundColor Cyan
      Write-Host "Keep this terminal open to keep the tunnel alive."
      Write-Host ""

      $urlPrinted = $true
    }
  }

  if ($line -match '\b(ERR|WRN)\b') {
    Write-Host $line -ForegroundColor Yellow
  }
}
