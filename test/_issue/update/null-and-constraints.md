# Issue: update — null-and-constraints

Test file: `test/update/null-and-constraints.test.ts`
Result: 9 failed / 2 passed (11 total)

## Observed failures

### 1. Updating a nullable column to NULL does not store NULL

- Test: `updating a column to NULL > setting a nullable column to null stores a genuine null`
- Action: `db.update(t).set({ score: null })` on row id 2, then select.
- Expected: row id 2 `score` reads back as `null`.
- Observed: row id 2 `score` reads back as `0`.

### 2. A column set to NULL is matched by equality on zero

- Test: `updating a column to NULL > a column set to null is not caught by an equality on zero`
- Action: set a row's `score` to null, then `select().from(t).where(eq(t.score, 0))`.
- Expected: empty result (NULL is not 0).
- Observed: result contains the nulled row `{ __rid: [0, 2], id: 3, label: 0, score: 0 }`.

### 3. Setting a notNull column to null is not rejected

- Test: `an update that would break a constraint is rejected > setting a notNull column to null rejects the update`
- Action: `db.update(t).set({ label: null }).where(...)` where `label` is a notNull column.
- Expected: the returned promise rejects.
- Observed: the promise resolves with `[{ updated: 1 }]`.

### 4. Update builder result has no `.catch` method

- Test: `an update that would break a constraint is rejected > a rejected notNull update leaves the column at its original value`
- Action: `db.update(t).set({ label: null }).where(eq(t.id, 1)).catch(() => undefined)`.
- Expected: `.catch` callable (a thenable/promise) on the update builder chain.
- Observed: `TypeError: db.update(...).set(...).where(...).catch is not a function`.

### 5. Setting a unique column to a duplicate value is not rejected

- Test: `an update that would break a constraint is rejected > setting a unique column to a value another row holds rejects the update`
- Setup: row 1 holds `code` 100; update row 2's `code` to 100 where `code` is unique.
- Expected: the returned promise rejects.
- Observed: the promise resolves with `[{ updated: 1 }]`.

### 6. Update builder result has no `.catch` method (unique case)

- Test: `an update that would break a constraint is rejected > a rejected unique update leaves both rows at their original codes`
- Action: `db.update(t).set({ code: 100 }).where(eq(t.id, 2)).catch(() => undefined)`.
- Expected: `.catch` callable on the update builder chain.
- Observed: `TypeError: db.update(...).set(...).where(...).catch is not a function`.

### 7. Updating a text column to a new string does not store the string

- Test: `updating a text column stores the string given > setting a text column to a new string stores the string verbatim`
- Action: `db.update(t).set({ label: 'renamed' }).where(eq(t.id, 2))`, then select.
- Expected: row id 2 `label` reads back as `'renamed'`.
- Observed: row id 2 `label` reads back as `0`.

### 8. A text update reads back as 0 on untouched rows

- Test: `updating a text column stores the string given > a text update leaves the other rows strings untouched`
- Action: update row id 2's `label` to `'renamed'`, then select.
- Expected: row id 1 `label` still reads back as `'first'`.
- Observed: row id 1 `label` reads back as `0`.

### 9. Updating a text column to an empty string does not store the empty string

- Test: `updating a text column stores the string given > a text column can be updated to an empty string distinct from null`
- Action: `db.update(t).set({ label: '' }).where(eq(t.id, 3))`, then select.
- Expected: row id 3 `label` reads back as `''`.
- Observed: row id 3 `label` reads back as `0`.

## Behavior observed

- `null` set on a column is stored/read back as `0`; NULL semantics are not preserved (NULL matches `eq(col, 0)`).
- notNull and unique constraint violations during update are not rejected; the update succeeds and reports `{ updated: N }`.
- The update builder chain (`update().set().where()`) is not a thenable that exposes `.catch`.
- String values set on text columns are stored/read back as `0`; string values (including `''`) are not stored verbatim, and untouched text columns also read back as `0`.
