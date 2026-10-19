# Installs zinc on Windows with nothing to compile: the engine, its libraries, the templates and the plugins' native libraries, as released.
#
#   irm https://github.com/Frulko/zinc/releases/latest/download/install.ps1 | iex
#
# It reads SHA256SUMS beside it, downloads zinc-<version>-windows-x86_64.zip, checks its SHA-256, unpacks it into %USERPROFILE%\.zinc\engine and adds
# its bin folder to your user PATH (open a new terminal afterwards). No administrator rights, no Visual Studio, no CMake: `zinc build` downloads its own
# pinned compiler the first time. Run it again to update; delete %USERPROFILE%\.zinc\engine and the PATH entry to uninstall.
#   ZINC_INSTALL_URL        where SHA256SUMS and the archive are (default: the latest release of $env:ZINC_REPO, default Frulko/zinc; file:// works)
#   ZINC_INSTALL_DIR        where the engine goes (default %USERPROFILE%\.zinc\engine)
#   ZINC_NO_MODIFY_PATH=1   never touch the PATH: the folder to add is printed instead
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is much faster without its progress bar
function Die($msg) { throw "zinc install: $msg" }

$repo = if ($env:ZINC_REPO) { $env:ZINC_REPO } else { 'Frulko/zinc' }
$url = if ($env:ZINC_INSTALL_URL) { $env:ZINC_INSTALL_URL.TrimEnd('/') } else { "https://github.com/$repo/releases/latest/download" }
$dir = if ($env:ZINC_INSTALL_DIR) { $env:ZINC_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.zinc\engine' }

$arch = switch ($env:PROCESSOR_ARCHITECTURE) { 'AMD64' { 'x86_64' } 'ARM64' { 'aarch64' } default { Die "no prebuilt zinc for $($env:PROCESSOR_ARCHITECTURE)" } }
if ([Environment]::OSVersion.Version.Build -lt 18362) { Die 'Windows 10 1903 (build 18362) or later is needed' }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("zinc-install-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  function Get-Release($name, $to) {   # an http(s):// or file:// address
    if ($url -like 'file://*') { Copy-Item -LiteralPath ([Uri]"$url/$name").LocalPath -Destination $to }
    else { Invoke-WebRequest -UseBasicParsing -Uri "$url/$name" -OutFile $to }
  }
  try { Get-Release 'SHA256SUMS' (Join-Path $tmp 'SHA256SUMS') } catch { Die "cannot read $url/SHA256SUMS: no network, or no release yet" }
  $line = Get-Content (Join-Path $tmp 'SHA256SUMS') | Where-Object { $_ -match "\s\*?zinc-[^ /\\]*-windows-$arch\.zip$" } | Select-Object -First 1
  if (-not $line) { Die "this release has no Windows archive for $arch (zinc-*-windows-$arch.zip)" }
  $want, $file = ($line -split '\s+', 2)
  $file = $file.TrimStart('*').Trim()
  if ($file -match '[\\/]') { Die "SHA256SUMS names an unexpected file: $file" }
  Write-Host "zinc install: downloading $file"
  $zip = Join-Path $tmp $file
  try { Get-Release $file $zip } catch { Die "the download of $url/$file failed" }
  $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLower()
  if ($got -ne $want.ToLower()) { Die "checksum mismatch for ${file}: got $got, SHA256SUMS says $want; nothing was installed" }

  Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tmp 'new')
  $inner = Get-ChildItem (Join-Path $tmp 'new') | Select-Object -First 1
  if (-not (Test-Path (Join-Path $inner.FullName 'bin\zinc.exe'))) { Die 'the archive holds no bin\zinc.exe' }

  $old = "$dir.old"
  if (Test-Path $old) { Remove-Item -Recurse -Force $old }
  New-Item -ItemType Directory -Force -Path (Split-Path $dir) | Out-Null
  if (Test-Path $dir) { Move-Item -LiteralPath $dir -Destination $old }   # put back if the new one cannot take its place
  try { Move-Item -LiteralPath $inner.FullName -Destination $dir }
  catch { if (Test-Path $old) { Move-Item -LiteralPath $old -Destination $dir }; Die "cannot write $dir" }
  if (Test-Path $old) { Remove-Item -Recurse -Force $old }

  $exe = Join-Path $dir 'bin\zinc.exe'
  $version = & $exe --version
  if ($LASTEXITCODE) { Die "$exe does not start on this machine" }
  $bin = Join-Path $dir 'bin'
  Write-Host "zinc install: $version in $dir"

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $onPath = ($userPath -split ';') -contains $bin
  if ($onPath) { Write-Host 'zinc install: bin is already on your PATH' }
  elseif ($env:ZINC_NO_MODIFY_PATH -eq '1') { Write-Host "zinc install: add $bin to your PATH to run zinc from anywhere" }
  else {
    [Environment]::SetEnvironmentVariable('Path', ($(if ($userPath) { "$userPath;" } else { '' }) + $bin), 'User')
    Write-Host "zinc install: added $bin to your user PATH; open a new terminal, then run: zinc doctor"
  }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
