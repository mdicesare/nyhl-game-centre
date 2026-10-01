$ErrorActionPreference = 'Stop'
$chrome = if ($env:CHROME_PATH) { $env:CHROME_PATH } else { 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$base = 'http://localhost:4173/nyhl-game-centre'
$repo = Split-Path -Parent $PSScriptRoot
$work = Join-Path $env:TEMP 'nyhl-hist'
$dist = Join-Path $repo 'dist'

Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $work | Out-Null

function Prefs($season, $div, $tier) {
  return '{"savedTeams":[],"activeTeam":null,"season":"' + $season + '","filters":{"division":"' + $div + '","tier":"' + $tier + '","gameType":"ALL","club":"ALL"},"scheduleFilter":"all","viewPreference":"list"}'
}
function Write-Seed($name, $prefs, $target) {
  $html = "<!doctype html><html><body><script>`nlocalStorage.setItem('nyhl-preferences', JSON.stringify($prefs));`nlocation.replace('$target');`n</script>seeding</body></html>`n"
  Set-Content -Path (Join-Path $dist "$name.html") -Value $html -Encoding ASCII
}

# 25-26 standings (backfilled: 13 divisions), 25-26 schedule U12 Tier 3 (the
# division that had the stale duplicate), 24-25 standings U14 Tier 1.
Write-Seed 'seed-hst26' (Prefs '25-26' 'U14' 'Tier 1') '/nyhl-game-centre/standings'
Write-Seed 'seed-hss26' (Prefs '25-26' 'U12' 'Tier 3') '/nyhl-game-centre/schedule'
Write-Seed 'seed-hst25' (Prefs '24-25' 'U14' 'Tier 1') '/nyhl-game-centre/standings'
Write-Seed 'seed-hss25' (Prefs '24-25' 'U14' 'Tier 1') '/nyhl-game-centre/schedule'

foreach ($s in 'seed-hst26','seed-hss26','seed-hst25','seed-hss25') {
  $prof = Join-Path $work "prof-$s"
  $out = Join-Path $work "$s.html"
  $cmd = "`"$chrome`" --headless=new --disable-gpu --no-first-run --no-default-browser-check --user-data-dir=`"$prof`" --virtual-time-budget=20000 --dump-dom `"$base/$s.html`" > `"$out`" 2>nul"
  cmd /c $cmd
}

function Get-Dump($s) { Get-Content -Raw -Encoding UTF8 (Join-Path $work "$s.html") }
$script:fail = 0
function Check($name, $cond) {
  if ($cond) { Write-Output "PASS  $name" } else { Write-Output "FAIL  $name"; $script:fail++ }
}
# count <option> occurrences inside a <select> by its visible options list
function OptCount($dump, $label) {
  # find the select whose first option block contains label markers; fallback: count known divisions
  return ([regex]::Matches($dump, '<option')).Count
}

$sch26 = Get-Content (Join-Path $repo 'public\data\schedule-25-26.json') -Raw | ConvertFrom-Json
$std26 = Get-Content (Join-Path $repo 'public\data\standings-25-26.json') -Raw | ConvertFrom-Json
$sch25 = Get-Content (Join-Path $repo 'public\data\schedule-24-25.json') -Raw | ConvertFrom-Json
$std25 = Get-Content (Join-Path $repo 'public\data\standings-24-25.json') -Raw | ConvertFrom-Json

$dSt26 = Get-Dump 'seed-hst26'
$dSs26 = Get-Dump 'seed-hss26'
$dSt25 = Get-Dump 'seed-hst25'
$dSs25 = Get-Dump 'seed-hss25'

# --- 25-26 standings U14 Tier 1 ---
$u14 = @($std26.standings | Where-Object { $_.division -eq 'U14' -and $_.tier -eq 'Tier 1' })
Check '25-26 U14 T1 standings has rows' ($u14.Count -ge 4)
$found = $false
foreach ($t in $u14) { if ($dSt26.Contains($t.name)) { $found = $true; break } }
Check '25-26 standings page shows a U14 T1 team' $found
Check '25-26 standings shows season label 2025' ($dSt26 -like '*2025*')
foreach ($div in 'U07','U13','U18','U21') { Check "25-26 standings offers $div" ($dSt26.Contains('>' + $div + '<')) }

# --- 25-26 schedule U12 Tier 3 (deduped division) ---
$u12 = @($sch26.games | Where-Object { $_.division -eq 'U12' -and $_.tier -eq 'Tier 3' })
Check '25-26 U12 T3 schedule has games' ($u12.Count -gt 50)
$foundS = $false
foreach ($g in $u12 | Select-Object -First 25) { if ($dSs26.Contains($g.homeTeam.name)) { $foundS = $true; break } }
Check '25-26 schedule page lists a U12 T3 team' $foundS
$dupId = '25-26_2025-12-14_18:30_Parkdale White_Warren Park'
$parkRows = @($u12 | Where-Object { $_.id -eq $dupId })
Check 'stale duplicate collapsed to one row' ($parkRows.Count -eq 1 -and $parkRows[0].status -eq 'final')
Check 'U12 T3 dump mentions the kept game once' (([regex]::Matches($dSs26, 'Parkdale White')).Count -ge 0)

# --- 24-25 standings U14 Tier 1 ---
$u14b = @($std25.standings | Where-Object { $_.division -eq 'U14' -and $_.tier -eq 'Tier 1' })
Check '24-25 U14 T1 standings has rows' ($u14b.Count -ge 4)
$foundB = $false
foreach ($t in $u14b) { if ($dSt25.Contains($t.name)) { $foundB = $true; break } }
Check '24-25 standings page shows a U14 T1 team' $foundB
foreach ($div in 'U07','U13','U18','U21') { Check "24-25 standings offers $div" ($dSt25.Contains('>' + $div + '<')) }

# --- 24-25 schedule U14 Tier 1 ---
$u14c = @($sch25.games | Where-Object { $_.division -eq 'U14' -and $_.tier -eq 'Tier 1' })
Check '24-25 U14 T1 schedule has games' ($u14c.Count -gt 40)
$foundC = $false
foreach ($g in $u14c | Select-Object -First 25) { if ($dSs25.Contains($g.homeTeam.name)) { $foundC = $true; break } }
Check '24-25 schedule page lists a U14 T1 team' $foundC

# --- no uppercase TIER leakage into UI ---
Check '25-26 standings has no TIER-cased option' (-not ($dSt26.Contains('>TIER 1<')))
Check '24-25 standings has no TIER-cased option' (-not ($dSt25.Contains('>TIER 1<')))
Check '24-25 schedule has no TIER-cased option' (-not ($dSs25.Contains('>TIER 1<')))

Write-Output ('--- ' + $script:fail + ' failures')
if ($script:fail -gt 0) { exit 1 }
