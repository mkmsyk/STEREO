# STEREO & MONORAL - Unified Deployment Script
# Copies local resources to CMS public folder, then deploys to VPS.

$ErrorActionPreference = 'Stop'

# ディレクトリパスの設定
$scriptDir = (Get-Location).Path
$monoralDir = "C:\Users\mkmsy\Repositories\MONORAL"
$cmsDir = "C:\Users\mkmsy\Repositories\CMS"
$cmsGameTarget = Join-Path $cmsDir "src\main\resources\public\games\gb-demo"

Write-Host "==> [Build] Preparing files to copy..." -ForegroundColor Cyan

# 1. コピー処理の実行
Write-Host "==> [Copy] Syncing files to CMS: $cmsGameTarget" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $cmsGameTarget)) {
    throw "Target CMS directory not found: $cmsGameTarget"
}

# STEREOの3Dアセットのコピー
$filesToCopy = @(
    "index.html",
    "style.css",
    "stereo.js",
    "app.js"
)

foreach ($fileName in $filesToCopy) {
    $src = Join-Path $scriptDir $fileName
    if (-not (Test-Path -LiteralPath $src)) {
        throw "Missing STEREO source file: $src"
    }
    $dest = Join-Path $cmsGameTarget $fileName
    Copy-Item -LiteralPath $src -Destination $dest -Force
    Write-Host "   Copied: $fileName"
}

# MONORALの2Dコアのコピー
$monoralGameJs = Join-Path $monoralDir "gb-demo\game.js"
if (-not (Test-Path -LiteralPath $monoralGameJs)) {
    throw "Missing MONORAL source file: $monoralGameJs"
}
$destGameJs = Join-Path $cmsGameTarget "game.js"
Copy-Item -LiteralPath $monoralGameJs -Destination $destGameJs -Force
Write-Host "   Copied: game.js (from MONORAL)"

# 2. CMSのデプロイスクリプトを起動
Write-Host "`n==> [Deploy] Triggering CMS VPS deployment..." -ForegroundColor Cyan
$cmsDeployScript = Join-Path $cmsDir "deploy.ps1"

if (-not (Test-Path -LiteralPath $cmsDeployScript)) {
    throw "CMS Deploy script not found: $cmsDeployScript"
}

# CMSリポジトリ側へ移動してコミット＆プッシュ＆デプロイ
Set-Location -LiteralPath $cmsDir

Write-Host "==> [Git] Committing changes in CMS..." -ForegroundColor Cyan
git add src/main/resources/public/games/gb-demo/index.html src/main/resources/public/games/gb-demo/style.css src/main/resources/public/games/gb-demo/stereo.js src/main/resources/public/games/gb-demo/app.js src/main/resources/public/games/gb-demo/game.js

$gitStatus = git status --porcelain
if ($gitStatus) {
    git commit -m "deploy: automated build sync from STEREO & MONORAL"
} else {
    Write-Host "   No changes in CMS repository."
}

# VPSへデプロイを実行
powershell -ExecutionPolicy Bypass -File .\deploy.ps1

Write-Host "`n==> [Done] STEREO & MONORAL successfully deployed to VPS!" -ForegroundColor Green
