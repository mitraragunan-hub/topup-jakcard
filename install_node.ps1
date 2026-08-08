$nodeVersion = "v20.12.2"
$nodeZip = "node-$nodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/$nodeVersion/$nodeZip"
$extractPath = "$PWD\node_env"
$nodeDir = "$extractPath\node-$nodeVersion-win-x64"

if (-Not (Test-Path $nodeDir)) {
    Write-Host "Mengunduh Node.js $nodeVersion..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
    Write-Host "Mengekstrak file ZIP..."
    Expand-Archive -Path $nodeZip -DestinationPath $extractPath -Force
    Write-Host "Menghapus file ZIP..."
    Remove-Item $nodeZip -Force
}

Write-Host "Node.js siap digunakan di: $nodeDir"
$env:Path = "$nodeDir;" + $env:Path

Write-Host "Menjalankan npm install..."
& "$nodeDir\npm.cmd" install
