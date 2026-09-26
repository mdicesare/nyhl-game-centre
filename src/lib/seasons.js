// The last three seasons we keep a snapshot for. The first entry is the
// current one: every team search opens there, and saved teams added before
// the season field existed are stamped with it when preferences load — they
// were all added while it was on screen, and links without a season land on
// whichever year was last browsed.
export const SEASONS = [
  { value: '26-27', label: '2026–27' },
  { value: '25-26', label: '2025–26' },
  { value: '24-25', label: '2024–25' },
]

export const CURRENT_SEASON = SEASONS[0].value
