// Deep links into a single team's schedule.
//
// Schedule reads `team` from the query string and pins itself to that team,
// so anything that promises "this team's schedule" — a standings row, a Home
// card — has to name the team explicitly instead of relying on whichever team
// happens to be active. Division, tier and season ride along as context: a
// card read from the team's own season snapshot must open the schedule on
// that snapshot too, not on whichever year was last browsed.
export function teamScheduleLink(team) {
  const params = new URLSearchParams({ team: team.name })
  if (team.division) params.set('division', team.division)
  if (team.tier) params.set('tier', team.tier)
  if (team.season) params.set('season', team.season)
  return `/schedule?${params.toString()}`
}

// The record on a Home card has to lead to the table it was read from — the
// team's own season, division, tier and game type — rather than to whatever
// competition the visitor last browsed. Standings consumes these parameters
// once on arrival and then hands control back to the normal filter selects.
export function teamStandingsLink(team, gameType) {
  const params = new URLSearchParams()
  if (team.season) params.set('season', team.season)
  if (team.division) params.set('division', team.division)
  if (team.tier) params.set('tier', team.tier)
  if (gameType) params.set('gameType', gameType)
  const query = params.toString()
  return query ? `/standings?${query}` : '/standings'
}
