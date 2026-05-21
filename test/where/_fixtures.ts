// idsOf extracts the surviving id column, ascending, so a predicate's effect
// is observed as the exact set of rows that passed the filter
export const idsOf = (rows: { id: number }[]) => rows.map((r) => r.id).sort((a, b) => a - b)

// scoresOf extracts the surviving score column in returned (heap) order
export const scoresOf = (rows: { score: number }[]) => rows.map((r) => r.score)
