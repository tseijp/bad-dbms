# where / text-predicates

Test file: `test/where/text-predicates.test.ts`
Result: 11 failed / 2 passed (13 total)

## Summary

`text` column predicates do not match on string values. String equality,
inequality, LIKE/ILIKE patterns, and `inArray`/`notInArray` over strings all
fail to find the rows whose names match.

Seed used by most failures:

```ts
table('people', { id: integer('id').primaryKey(), name: text('name') })
insert([
  { id: 1, name: 'alice' },
  { id: 2, name: 'Bob' },
  { id: 3, name: 'amir' },
  { id: 4, name: 'Carol' },
  { id: 5, name: 'alice' },
])
```

## Observed failures

### 1. `an exact-string equality keeps every row carrying that name` (line 32)

- Operation: `where(eq(t.name, 'alice'))`
- Expected: `[1, 5]` — Actual: `[]`

### 2. `a string inequality keeps every row whose name differs` (line 45)

- Operation: `where(ne(t.name, 'alice'))`
- Expected: `[2, 3, 4]` — Actual: `[1, 2, 3, 4, 5]` (every row).

### 3. `a LIKE prefix pattern keeps the rows whose name starts with the literal` (line 51)

- Operation: `where(like(t.name, 'a%'))`
- Expected: `[1, 3, 5]` — Actual: `[]`

### 4. `a LIKE suffix pattern keeps the rows whose name ends with the literal` (line 58)

- Operation: `where(like(t.name, '%ice'))`
- Expected: `[1, 5]` — Actual: `[]`

### 5. `a LIKE single-character wildcard matches exactly one position` (line 64)

- Operation: `where(like(t.name, 'amir'))`
- Expected: `[3]` — Actual: `[]`

### 6. `ilike matches case-insensitively, so a lowercase pattern catches a capitalised name` (line 77)

- Operation: `where(ilike(t.name, 'b%'))`
- Expected: `[2]` — Actual: `[]`

### 7. `notLike keeps every row whose name does not match the pattern` (line 83)

- Operation: `where(notLike(t.name, 'a%'))`
- Expected: `[2, 4]` — Actual: differs (notLike does not match on string content).

### 8. `inArray over a list of strings keeps the rows whose name is in the list` (line 89)

- Operation: `where(inArray(t.name, ['amir', 'Carol']))`
- Expected: `[3, 4]` — Actual: differs.

### 9. `notInArray over a list of strings keeps the rows whose name is absent from it` (line 95)

- Operation: `where(notInArray(t.name, ['alice']))`
- Expected: `[2, 3, 4]` — Actual: `[1, 2, 3, 4, 5]` (every row).

### 10. `a text filter reads the surviving names back as their original strings` (line 101)

- Operation: `db.select().from(t).where(eq(t.name, 'Bob'))`
- Expected: `rows[0].name === 'Bob'`
- Actual: `TypeError: Cannot read properties of undefined (reading 'name')` —
  the filtered result is empty, so `rows[0]` is undefined.

### 11. `an empty-string name is a real value distinct from a missing one` (line 107)

- Seed: `table('labels', { id, tag: text('tag') })`,
  `insert([{ id: 1, tag: '' }, { id: 2, tag: 'x' }])`
- Operation: `where(eq(t.tag, ''))`
- Expected: `[1]` — Actual: `[]`

## Observed behavior

`eq` / `ne` / `like` / `ilike` / `notLike` / `inArray` / `notInArray` against a
`text` column never match on string content. String-equality and pattern
filters return empty (`eq`, `like`, `ilike` -> `[]`), and inequality filters
return every row (`ne`, `notInArray` -> all ids). An empty-string value is not
matched by `eq(col, '')`.

## Passing tests

2 tests pass: `eq(t.name, 'ALICE')` returns `[]` (a wrong-case name matches
nothing), and `like(t.name, 'b%')` returns `[]` (a lowercase pattern misses the
capitalised `Bob`). Both expect an empty result, which matches the observed
behavior that no string predicate finds a row.
