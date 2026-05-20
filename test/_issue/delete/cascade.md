# Issue: delete/cascade — ON DELETE CASCADE does not remove dependent rows

Test file: `test/delete/cascade.test.ts`
Result: 5 failed / 5 total

## Summary

Deleting a parent row in `authors` (FK declared with `onDelete: 'cascade'` on `books.authorId`)
leaves the dependent child rows in `books` untouched. The cascade is not observed at all.

## Observed failures

### deleting an author cascades to remove that authors books
- Seed: authors {1,2}; books {id 10→author 1, id 11→author 1, id 12→author 2}.
- Action: `db.delete(authors).where(eq(authors.id, 1))`, then `db.select().from(books)`.
- Expected book ids: `[12]`
- Observed book ids: `[10, 11, 12]` (books of author 1 still present)

### a cascade leaves books of other authors untouched
- Action: same delete of author 1, then read `books`.
- Expected `rows[0]` to match `{ id: 12, authorId: 2 }`.
- Observed `rows[0]` is `{ id: 10, ... }` — book 10 still present.

### deleting every author cascades the books table to empty
- Action: `db.delete(authors)` (no where), then read `books`.
- Expected: `[]`
- Observed: all 3 book rows (ids 10, 11, 12) still present.

### the cascade count of removed children is reflected by a follow-up read
- Action: delete author 1, then `db.select({ n: count() }).from(books)`.
- Expected: `[{ n: 1 }]`
- Observed: `[{ n: 3 }]`

### a cascade triggered inside a transaction still removes the children
- Action: inside `db.transaction`, `tx.delete(authors).where(eq(authors.id, 2))`, then read `books`.
- Expected book ids: `[10, 11]`
- Observed book ids: `[10, 11, 12]` (book 12 of author 2 still present)

## Observed capability gap

Deleting a parent row does not remove child rows linked by a foreign key declared
with `onDelete: 'cascade'`. Child rows survive in every case observed, including
no-where deletes and deletes inside a transaction.

## Side observation

In the observed `books` rows, `authorId` is read back under the key `author_id` and
`title` values are returned as integers (e.g. `1`, `2`, `3`) rather than the seeded values.
