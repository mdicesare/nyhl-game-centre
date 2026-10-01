$ErrorActionPreference = 'Stop'
$chrome = if ($env:CHROME_PATH) { $env:CHROME_PATH } else { 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$base = 'http://localhost:4173/nyhl-game-centre'
$repo = Split-Path -Parent $PSScriptRoot
$work = Join-Path $env:TEMP 'nyhl-uitest'

Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $work | Out-Null

# Seed files live in dist (the preview server's document root) and every
# build empties that folder, so the script writes them itself each run —
# otherwise the dumps silently fall back to the app shell and every positive
# assertion fails against an empty state.
$dist = Join-Path $repo 'dist'
if (-not (Test-Path $dist)) { throw 'dist not found - run npm run build first' }

$V27 = '{"name":"Vaughan Blue","division":"U15","tier":"Tier 1","season":"26-27"}'
$V26 = '{"name":"Vaughan Blue","division":"U14","tier":"Tier 1","season":"25-26"}'
$L27 = '{"name":"Leaside Red","division":"U15","tier":"Tier 1","season":"26-27"}'
$Vold = '{"name":"Vaughan Blue","division":"U15","tier":"Tier 1"}'
$F_T1 = '"filters":{"division":"U15","tier":"Tier 1","gameType":"ALL","club":"ALL"}'
$F_T2 = '"filters":{"division":"U15","tier":"Tier 2","gameType":"ALL","club":"ALL"}'
$F_ALL = '"filters":{"division":"ALL","tier":"ALL","gameType":"ALL","club":"ALL"}'

function Prefs($teams, $active, $season, $filters) {
  $act = if ($null -eq $active) { 'null' } else { '"' + $active + '"' }
  return '{"savedTeams":[' + $teams + '],"activeTeam":' + $act + ',"season":"' + $season + '",' + $filters + ',"scheduleFilter":"all","viewPreference":"list"}'
}
function Write-Seed($name, $prefs, $target) {
  $html = "<!doctype html><html><body><script>`nlocalStorage.setItem('nyhl-preferences', JSON.stringify($prefs));`nlocation.replace('$target');`n</script>seeding</body></html>`n"
  Set-Content -Path (Join-Path $dist "$name.html") -Value $html -Encoding ASCII
}

Write-Seed 'seed-home'   (Prefs $V27 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/'
Write-Seed 'seed-bug1'   (Prefs $V27 'Vaughan Blue' '25-26' $F_T1) '/nyhl-game-centre/'
Write-Seed 'seed-guard'  (Prefs $V27 'Vaughan Blue' '26-27' $F_T2) '/nyhl-game-centre/schedule'
Write-Seed 'seed-legacy' (Prefs $Vold 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/'
Write-Seed 'seed-two'    (Prefs ($V27 + ',' + $L27) 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/'
Write-Seed 'seed-deep'   (Prefs $V27 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/schedule?team=Vaughan+Blue&division=U15&tier=Tier+1&season=26-27'
Write-Seed 'seed-deepst' (Prefs $V27 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/standings?division=U15&tier=Tier+1&season=26-27'
Write-Seed 'seed-none'   (Prefs '' $null '26-27' $F_ALL) '/nyhl-game-centre/settings'
Write-Seed 'seed-twin'   (Prefs ($V27 + ',' + $V26) 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/'
Write-Seed 'seed-twinS'  (Prefs ($V27 + ',' + $V26) 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/settings'
Write-Seed 'seed-twinC'  (Prefs ($V27 + ',' + $V26) 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/schedule'
Write-Seed 'seed-opp'    (Prefs $V27 'Vaughan Blue' '26-27' $F_T1) '/nyhl-game-centre/schedule?team=Leaside+Red&division=U15&tier=Tier+1&season=26-27'

$seeds = 'seed-home', 'seed-bug1', 'seed-guard', 'seed-legacy', 'seed-two', 'seed-deep', 'seed-deepst', 'seed-none', 'seed-twin', 'seed-twinS', 'seed-twinC', 'seed-opp'
foreach ($s in $seeds) {
  $prof = Join-Path $work "prof-$s"
  $out = Join-Path $work "$s.html"
  $cmd = "`"$chrome`" --headless=new --disable-gpu --no-first-run --no-default-browser-check --user-data-dir=`"$prof`" --virtual-time-budget=20000 --dump-dom `"$base/$s.html`" > `"$out`" 2>nul"
  cmd /c $cmd
}

function Get-Dump($s) { Get-Content -Raw -Encoding UTF8 (Join-Path $work "$s.html") }
function Count($hay, $needle) { return ([regex]::Matches($hay, [regex]::Escape($needle))).Count }
function HasEn($s, $a, $b) {
  $d = [char]0x2013
  $m = ([char]0x0393).ToString() + ([char]0x00C7) + ([char]0x00F4)
  return $s.Contains("$a$d$b") -or $s.Contains($a + $m + $b)
}
$script:fail = 0
function Check($name, $cond) {
  if ($cond) { Write-Output "PASS  $name" }
  else { Write-Output "FAIL  $name"; $script:fail++ }
}

$d1 = Get-Dump 'seed-home'
$d2 = Get-Dump 'seed-bug1'
$d3 = Get-Dump 'seed-guard'
$d4 = Get-Dump 'seed-legacy'
$d5 = Get-Dump 'seed-two'
$d6 = Get-Dump 'seed-deep'
$d7 = Get-Dump 'seed-deepst'
$d8 = Get-Dump 'seed-none'
$d9 = Get-Dump 'seed-twin'
$d10 = Get-Dump 'seed-twinS'
$d11 = Get-Dump 'seed-twinC'
$d12 = Get-Dump 'seed-opp'

Write-Output '--- D1 seed-home (card structure + alignment) ---'
Check 'D1 schedule button present'        $d1.Contains('Open Vaughan Blue schedule')
Check 'D1 standings button present'       $d1.Contains('Open Vaughan Blue standings')
Check 'D1 record link kept'               $d1.Contains('aria-label="Vaughan Blue standings"')
Check 'D1 quick tiles removed'            (-not $d1.Contains('All Games'))
Check 'D1 schedule href count == 1'       ((Count $d1 'schedule?team=Vaughan+Blue') -eq 1)
Check 'D1 standings href count == 2'      ((Count $d1 'standings?season=26-27') -eq 2)
Check 'D1 header name unhidden'           $d1.Contains('text-sm text-blue-200 truncate')
Check 'D1 active badge'                   $d1.Contains('Active')
Check 'D1 next game block present'        $d1.Contains('Next Game')
Check 'D1 old next-game aria gone'        (-not $d1.Contains('aria-label="Vaughan Blue schedule"'))
Check 'D1 card season label 2026-27'      (HasEn $d1 '2026' '27')
Check 'D1 next-game bleed removed'        (-not $d1.Contains('-mx-3'))
Check 'D1 stats left aligned (3 cells)'   ((Count $d1 '<div class="text-left">') -eq 3)
Check 'D1 refresh control present'        $d1.Contains('Refresh data')

Write-Output '--- D2 seed-bug1 (cross-season card regression) ---'
Check 'D2 card own-season label'          (HasEn $d2 '2026' '27')
Check 'D2 standings links pinned 26-27'   ((Count $d2 'standings?season=26-27') -eq 2)
Check 'D2 next game block present'        $d2.Contains('Next Game')

Write-Output '--- D3 seed-guard (two-team filter rule) ---'
Check 'D3 tier mismatch browses (T2 game)' $d3.Contains('Scarborough Black')
Check 'D3 not the empty-list state'       (-not $d3.Contains('No games match these filters'))
Check 'D3 not awaiting division'          (-not $d3.Contains('Choose a division to see games'))
Check 'D3 Vaughan = header only'          ((Count $d3 'Vaughan Blue') -eq 1)
Check 'D3 saved-team chips removed'       (-not $d3.Contains('flex gap-2 mb-3 overflow-x-auto'))
Check 'D3 Leaside absent (no T1 games leak)' ((Count $d3 'Leaside Red') -eq 0)

Write-Output '--- D4 seed-legacy (season stamp) ---'
Check 'D4 standings links stamped'        ((Count $d4 'standings?season=26-27') -eq 2)
Check 'D4 schedule link stamped'          ((Count $d4 'season=26-27') -eq 3)
Check 'D4 card label 2026-27 not 2025-26' ((HasEn $d4 '2026' '27') -and $d4.Contains('Vaughan Blue'))

Write-Output '--- D5 seed-two (second team gets its own doors) ---'
Check 'D5 first team buttons'             $d5.Contains('Open Vaughan Blue schedule')
Check 'D5 second team buttons'            $d5.Contains('Open Leaside Red schedule')
Check 'D5 second card rendered'           $d5.Contains('Leaside Red')

Write-Output '--- D6 seed-deep (pinned schedule: pre-filled filters) ---'
Check 'D6 pinned team game listed'        $d6.Contains('Leaside Red')
Check 'D6 pinned team visible'            $d6.Contains('Vaughan Blue')
Check 'D6 not awaiting division'          (-not $d6.Contains('Choose a division to see games'))
Check 'D6 tier select still visible'      $d6.Contains('Choose a tier')
Check 'D6 redundant pin auto-dropped'     (-not $d6.Contains('Showing '))
Check 'D6 summary chips removed'          ((-not $d6.Contains('bg-blue-100')) -and (-not $d6.Contains('bg-purple-100')))
Check 'D6 header team line removed'       (-not $d6.Contains('w-full text-sm text-nyhl-blue'))
Check 'D6 header + game rows show team'   ((Count $d6 'Vaughan Blue') -ge 2)
Check 'D6 saved-team chips removed'       (-not $d6.Contains('flex gap-2 mb-3 overflow-x-auto'))
Check 'D6 refresh control present'        $d6.Contains('Refresh data')

Write-Output '--- D7 seed-deepst (standings deep link) ---'
Check 'D7 table rendered (name >= 3x)'    ((Count $d7 'Vaughan Blue') -ge 3)
Check 'D7 season badge 2026-27'           (HasEn $d7 '2026' '27')
Check 'D7 refresh control present'        $d7.Contains('Refresh data')
Check 'D7 saved-team chips removed'       (-not $d7.Contains('flex gap-2 mb-3 overflow-x-auto'))

Write-Output '--- D8 seed-none (Settings season picker) ---'
Check 'D8 season picker offered'          ($d8.Contains('>Season</label>') -and (HasEn $d8 '2026' '27'))
Check 'D8 empty-state finder shown'       $d8.Contains('Find your team')

Write-Output '--- D9 seed-twin (same name, two seasons, two cards) ---'
Check 'D9 both cards get doors'           ((Count $d9 'Open Vaughan Blue schedule') -eq 2)
Check 'D9 exactly one Active badge'       ((Count $d9 '>Active<') -eq 1)
Check 'D9 this season card'               (HasEn $d9 '2026' '27')
Check 'D9 last season card'               (HasEn $d9 '2025' '26')
Check 'D9 U14 card link stamped'          $d9.Contains('division=U14')
Check 'D9 both competitions listed'       ($d9.Contains('U14') -and $d9.Contains('U15'))

Write-Output '--- D10 seed-twinS (settings lists both) ---'
Check 'D10 two saved rows'                $d10.Contains('My Teams (2)')
Check 'D10 exactly one active row'        ((Count $d10 'Set active') -eq 1)
Check 'D10 seasons distinguish twins'     ((HasEn $d10 '2025' '26') -and (HasEn $d10 '2026' '27'))
Check 'D10 both names listed'             ((Count $d10 'Vaughan Blue') -eq 3)

Write-Output '--- D11 seed-twinC (chips removed; header + filters carry state) ---'
Check 'D11 saved-team chips removed'      (-not $d11.Contains('flex gap-2 mb-3 overflow-x-auto'))
Check 'D11 twin chip labels gone'         ((-not $d11.Contains('Vaughan Blue (26-27)')) -and (-not $d11.Contains('Vaughan Blue (25-26)')))
Check 'D11 header shows active twin'      ($d11.Contains('text-sm text-blue-200 truncate') -and $d11.Contains('Vaughan Blue'))
Check 'D11 season badge shows active season' ((HasEn $d11 '2026' '27') -and [regex]::IsMatch($d11, 'bg-nyhl-blue[^>]*>2026.27<'))
Check 'D11 filters pre-selected (no gate)'   (-not $d11.Contains('Choose a division to see games'))
Check 'D11 no pin chip on plain load'     (-not $d11.Contains('Showing '))

Write-Output '--- D12 seed-opp (opponent pin keeps its chip) ---'
Check 'D12 focus chip survives'           $d12.Contains('Showing Leaside')
Check 'D12 pinned games listed'           $d12.Contains('Leaside Red')
Check 'D12 header keeps active team'      ($d12.Contains('text-sm text-blue-200 truncate') -and $d12.Contains('Vaughan Blue'))
Check 'D12 saved-team chips removed'      (-not $d12.Contains('flex gap-2 mb-3 overflow-x-auto'))
Check 'D12 tier select visible while pinned' $d12.Contains('Choose a tier')

Write-Output ''
if ($script:fail -eq 0) { Write-Output 'ALL PASS' } else { Write-Output "$script:fail FAILURE(S)" }
Remove-Item (Join-Path $dist 'seed-*.html') -ErrorAction SilentlyContinue
exit $script:fail
