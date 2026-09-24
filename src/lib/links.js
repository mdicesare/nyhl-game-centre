// Deep links into a single team's schedule.
//
// Schedule reads `team` from the query string and pins itself to that team,
// so anything that promises "this team's schedule" — a standings row, a Home
// card — has to name the team explicitly instead of relying on whichever team
// happens to be active. Division and tier ride along as context.
export function teamScheduleLink(team) {
  const params = new URLSearchParams({ team: team.name })
  if (team.division) params.set('division', team.division)
  if (team.tier) params.set('tier', team.tier)
  return `/schedule?${params.toString()}`
}
