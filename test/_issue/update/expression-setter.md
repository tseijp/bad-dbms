# Issue: update — expression-setter

Test file: `test/update/expression-setter.test.ts`
Result: 2 failed / 10 passed (12 total)

## Observed failures

### 1. Adding a constant to a NULL column does not preserve NULL

- Test: `an expression setter is evaluated per row > adding a constant to a null column writes null back, not the constant`
- Setup: row id 2 has `score` = NULL. Run `db.update(t).set({ score: t.score.add(5) })`.
- Expected: `score` of row id 2 reads back as `null` (NULL + 5 = NULL).
- Observed: `score` of row id 2 reads back as `5`.

### 2. Multiplying a NULL column by zero does not preserve NULL

- Test: `an expression setter is evaluated per row > multiplying a null column by zero still yields null, not zero`
- Setup: row id 2 has `score` = NULL. Run `db.update(t).set({ score: t.score.mul(0) })`.
- Expected: `score` of row id 2 reads back as `null` (NULL * 0 = NULL).
- Observed: `score` of row id 2 reads back as `0`.

## Behavior observed

In an expression-based update setter, a NULL column value is treated as `0` during arithmetic instead of propagating NULL. Arithmetic involving a NULL operand yields a numeric result rather than NULL.
