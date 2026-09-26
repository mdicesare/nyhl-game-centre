// Saved teams are identified by the combination that makes them unique in
// the league: several divisions reuse the same team name, and the same name
// recurs across seasons (this year's U15 squad was last year's U14 team).
// Name alone stopped being a safe key the moment a team could be followed in
// more than one season, so every saved entry, the active team and removal
// all key off this composite instead. Deliberately derived, never stored —
// every consumer recomputes it the same way.
export function teamId(team) {
  if (!team || !team.name) return null
  return [team.name, team.season || '', team.division || '', team.tier || '']
    .map((part) => String(part).toLowerCase())
    .join('|')
}
