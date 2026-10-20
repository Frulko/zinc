# Set up a Windows 10 (1903+) or 11 machine to work on Zinc Next (docs/targets/windows.md).
#   powershell -ExecutionPolicy Bypass -File tools\windows-setup.ps1 [-DryRun] [-NoBuild] [-Admin]
# Idempotent: each step checks first and says what it does. It needs no administrator rights; -Admin (from an elevated
# PowerShell) also turns long paths on and adds the Defender exclusions, which are the only steps that need them.
# Downloads are checked against the pinned SHA-256 of src/tc/tc.cpp (zig: https://ziglang.org/download/index.json).
param([switch]$DryRun, [switch]$NoBuild, [switch]$Admin)
$ErrorActionPreference = 'Stop'

$ZigVersion = '0.15.2'
$ZigPins = @{   # host arch -> archive and SHA-256 (ziglang.org/download/index.json, 0.15.2)
  'AMD64' = @('zig-x86_64-windows-0.15.2.zip',  '3a0ed1e8799a2f8ce2a6e6290a9ff22e6906f8227865911fb7ddedc3cc14cb0c')
  'ARM64' = @('zig-aarch64-windows-0.15.2.zip', 'b926465f8872bf983422257cd9ec248bb2b270996fbe8d57872cca13b56fc370')
}
# winget ids: each package is checked against its manifest's hash by winget itself
$Packages = [ordered]@{
  'git'     = 'Git.Git'               # Git for Windows: git, and the bash the tests and tools/ run in
  'cmake'   = 'Kitware.CMake'
  'ninja'   = 'Ninja-build.Ninja'     # make does not exist on Windows: CMake drives Ninja
  'python'  = 'Python.Python.3.12'    # tests/run and half of tools/ are Python 3
}

function Step($msg) { Write-Host "==> $msg" }
function Act($msg, [scriptblock]$action) {
  if ($DryRun) { Write-Host "    (dry run) $msg" } else { Write-Host "    $msg"; & $action }
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$arch = $env:PROCESSOR_ARCHITECTURE
Step "Windows $([Environment]::OSVersion.Version) on $arch, repository $repo"
if ([Environment]::OSVersion.Version.Build -lt 18362) { throw 'Windows 10 1903 (build 18362) or later is needed: the UTF-8 code page of the manifest' }
if (-not $ZigPins.ContainsKey($arch)) { throw "no zig pin for $arch" }

# 1. Tools from winget
Step 'Tools: git, cmake, ninja, python'
$haveWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
foreach ($name in $Packages.Keys) {
  $exe = if ($name -eq 'python') { 'python' } else { $name }
  if (Get-Command $exe -ErrorAction SilentlyContinue) { Write-Host "    ${name}: found"; continue }
  if (-not $haveWinget) { Write-Host "    ${name}: missing; install it (winget id $($Packages[$name])) and run this script again"; continue }
  # per user when the package offers it; winget asks for elevation itself for a package that installs only machine-wide
  Act "winget install --id $($Packages[$name]) --exact" { winget install --id $Packages[$name] --exact --silent --accept-package-agreements --accept-source-agreements | Out-Host }
}
# what winget installed is on the PATH of new sessions: this one reads it again
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
# the tests and tools call python3, which the python.org installer does not create: a shim in ~/bin, which Git Bash puts on its PATH
$shim = Join-Path $env:USERPROFILE 'bin\python3'
if (-not (Test-Path $shim)) {
  Act "write $shim (exec python)" {
    New-Item -ItemType Directory -Force (Split-Path $shim) | Out-Null
    [IO.File]::WriteAllText($shim, "#!/bin/sh`nexec python `"`$@`"`n")
  }
}

# 2. ZINC_HOME (toolchains and caches; default %USERPROFILE%\.zinc)
Step 'ZINC_HOME'
$zincHome = [Environment]::GetEnvironmentVariable('ZINC_HOME', 'User')
if (-not $zincHome) {
  $zincHome = Join-Path $env:USERPROFILE '.zinc'
  Act "set ZINC_HOME=$zincHome for this user" { [Environment]::SetEnvironmentVariable('ZINC_HOME', $zincHome, 'User') }
} else { Write-Host "    ZINC_HOME=$zincHome" }
$env:ZINC_HOME = $zincHome

# 3. The pinned zig, where `zinc toolchain` puts it: %ZINC_HOME%\toolchains\zig-<arch>-windows-<version>
Step "zig $ZigVersion"
$zigArch = if ($arch -eq 'ARM64') { 'aarch64' } else { 'x86_64' }
$zigDir = Join-Path $zincHome "toolchains\zig-$zigArch-windows-$ZigVersion"
$zigExe = Join-Path $zigDir 'zig.exe'
if (Test-Path $zigExe) { Write-Host "    found $zigExe" } else {
  $file, $sha = $ZigPins[$arch]
  $url = "https://ziglang.org/download/$ZigVersion/$file"
  $tmp = Join-Path $env:TEMP $file
  Act "download $url, check SHA-256 $sha, unpack into $zigDir" {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    $got = (Get-FileHash -Algorithm SHA256 $tmp).Hash.ToLower()
    if ($got -ne $sha) { Remove-Item $tmp; throw "zig archive checksum mismatch: got $got, want $sha" }
    $unpack = Join-Path $env:TEMP "zig-unpack-$ZigVersion"
    if (Test-Path $unpack) { Remove-Item -Recurse -Force $unpack }
    Expand-Archive -Path $tmp -DestinationPath $unpack
    New-Item -ItemType Directory -Force (Split-Path $zigDir) | Out-Null
    Move-Item (Join-Path $unpack ($file -replace '\.zip$', '')) $zigDir
    Remove-Item $tmp; Remove-Item -Recurse -Force $unpack
  }
}

# 4. The checkout keeps LF line endings: the golden outputs are compared byte for byte
Step 'git settings of this checkout'
if (Get-Command git -ErrorAction SilentlyContinue) {
  foreach ($kv in @(@('core.autocrlf', 'false'), @('core.symlinks', 'true'), @('core.longpaths', 'true'), @('core.hooksPath', '.githooks'))) {
    $cur = git -C $repo config --local --get $kv[0] 2>$null
    if ($cur -ne $kv[1]) { Act "git config $($kv[0]) $($kv[1])" { git -C $repo config --local $kv[0] $kv[1] } } else { Write-Host "    $($kv[0])=$cur" }
  }
}

# 5. What needs an administrator: long paths and the Defender exclusions (a build writes thousands of small files)
Step 'Long paths and Defender'
$lp = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($lp -eq 1) { Write-Host '    long paths: on' }
elseif ($Admin -and $isAdmin) { Act 'turn long paths on (LongPathsEnabled=1)' { Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -Type DWord } }
else { Write-Host '    long paths: off; from an elevated PowerShell: windows-setup.ps1 -Admin' }
if ($Admin -and $isAdmin) {
  foreach ($p in @($repo, $zincHome)) { Act "Defender: exclude $p" { Add-MpPreference -ExclusionPath $p } }
} else { Write-Host "    Defender exclusions: none added (-Admin from an elevated PowerShell excludes $repo and $zincHome; a Dev Drive is the better choice)" }

# 6. Configure and build zinc with the pinned zig (no Visual Studio)
if ($NoBuild) { Step 'build skipped (-NoBuild)'; exit 0 }
Step 'configure and build build (zinc.exe)'
$build = Join-Path $repo 'build'
if (-not (Test-Path (Join-Path $build 'CMakeCache.txt'))) {
  Act "cmake -S . -B build -G Ninja -DCMAKE_TOOLCHAIN_FILE=cmake\zig-windows.cmake" {
    cmake -S $repo -B $build -G Ninja "-DCMAKE_TOOLCHAIN_FILE=$(Join-Path $repo 'cmake\zig-windows.cmake')" "-DZIG=$zigExe" -DCMAKE_BUILD_TYPE=Release -DZN_HOST_GFX=ON
    if ($LASTEXITCODE) { throw 'cmake configure failed' }
  }
} else { Write-Host "    $build is configured" }
Act 'cmake --build build --target zinc' {
  cmake --build $build --target zinc
  if ($LASTEXITCODE) { throw 'build failed: see docs/reports/zinc-windows-port.md for the known blockers' }
}
Step "done: $build\zinc.exe; next: docs/targets/windows.md, section 'Run the tests'"
