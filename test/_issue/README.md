# bad-dbms — issue priority

Priority of every observed issue. Derived **only** from the `_issue/<feature>/`
tickets — recorded test runs, pass/fail counts, observed behaviors. No source
code was read; no internal cause is inferred.

## Scoring method (Fermi, two axes, observation-only)

| axis | what it measures (observed only) | 1 | 3 | 5 |
| --- | --- | --- | --- | --- |
| **Urgency** | blast radius: failing-test count, whole-feature/whole-file outages | <10 fails, 1 file | ~20–40 fails, several files | whole feature down / 100+ fails |
| **Difficulty** | spread: how many features the same observed behavior appears in | 1 feature | 2 features | 3+ features |

**Cross-feature rule** (as instructed): an issue whose same observed behavior
appears in N features scores Difficulty = N (capped at 5). Wider observed
spread = higher difficulty = lower priority. This is observed breadth only,
not a cause analysis.

**Priority = Urgency × (6 − Difficulty) / 5.** Higher = do sooner.
Buckets: **P1** ≥ 2.4 · **P2** 1.5–2.3 · **P3** < 1.5.

---

## Part B — insert / where / order / update / delete / transaction / expression

40 tickets, 7 features. Owner: insert/where/order/update/delete/transaction/
expression test implementer.

### Observed totals (from each ticket's `Result:` line)

| feature | files | Σ fail | whole-file outages observed |
| --- | --- | --- | --- |
| insert | 7 | 33 | — |
| where | 9 | 37 | — |
| order | 3 | 12 | text-ordering 7/7 |
| update | 3 | 23 | return-value 12/12 |
| delete | 8 | 33 | cascade 5/5, cascade-tree 3/3, returning 5/5 |
| transaction | 7 | 15 | explicit-rollback 3/3 |
| expression | 7 | 89 | all 7 files — whole feature |

### Issue table

`Feat` = distinct features the behavior is observed in (= Difficulty).
`Fail` = failing tests attributable to it.

| ID | observed issue | observed evidence (tickets) | Feat | Fail | Urg | Diff | Score | Bkt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | expression in a `select()` projection reads back `undefined` | expression: arith 23, chain 14, compare 15, compose 9, convert 12, twocol 9, usecase 7 — whole feature 0 pass; plain-column projection also `undefined` (compose, usecase) | 1 | 89 | 5 | 1 | **5.0** | P1 |
| B3 | transaction writes not rolled back on throw / `rollback()` | transaction: rollback-on-throw 6, explicit-rollback 3, isolation 1, read-your-writes 1; delete transaction 1 — writes survive abort (error does propagate) | 2 | 12 | 5 | 2 | **4.0** | P1 |
| B2 | `count()` projection yields `.n` of `undefined` | insert: read-consistency 8, seed-helpers 2, transaction 1 — `select({n:count()})` → `.n` `undefined` every case | 1 | 11 | 3 | 1 | **3.0** | P1 |
| B4 | `onDelete:'cascade'` does not remove dependent rows | delete: cascade 5/5, cascade-tree 3/3 — parent delete leaves FK children (single-level + self-ref tree) | 1 | 8 | 3 | 1 | **3.0** | P1 |
| B5 | write-builder result shape + missing `.returning()`/`.catch()` | update return-value 12/12 (`[{updated:n}]`), delete return-value 5 / returning 5/5 `TypeError` / re-delete 2, update `.catch` `TypeError` | 2 | 26 | 3 | 2 | **2.4** | P1 |
| B8 | constraint violations not rejected | insert column-omission (`notNull` omit succeeds); update null-and-constraints (`notNull` set-null + `unique` collision both resolve) | 2 | 4 | 3 | 2 | **2.4** | P1 |
| B9 | renamed (snake_case) column reads its value back as `0` | insert table-shapes 2, where row-shape 1, delete cascade side-note — `userId`→`user_id` etc. inserted camelCase reads `0` | 3 | 3 | 3 | 3 | **1.8** | P2 |
| B6 | `text` column stores/reads back `0`, not the string | insert column-types 5, where text-predicates 11, order text-ordering 7/7, delete text-predicate 3, update null-and-constraints 3 | 5 | 29 | 5 | 5 | **1.0** | P3 |
| B7 | nullable column with no value is `0`, not NULL | insert column-omission 6 + default 9; where comparison 4/logical 3/between 3/null-predicates 6/set-membership 3/arithmetic 4; order multi-key 1/null-ordering 4; update null+expr-setter 2 | 4 | 45 | 5 | 5 | **1.0** | P3 |
| B13 | row objects carry an internal `__rid` key | where row-shape 2 + comparison note, transaction commit 1 + rollback actuals, update null-and-constraints actuals — surfaces only in strict `toEqual` | 3 | 3 | 1 | 3 | **0.6** | P3 |
| B10 | `eq` between two columns of the same row matches no row | where two-columns 1 — `eq(posts.userId,posts.id)`→`[]`; `gt` between two columns passes on the same seed | 1 | 1 | 1 | 1 | **1.0** | P3 |
| B11 | per-row tick `c.col` yields an expression object, not the value | transaction per-row-tick 3 — `c.id`/`c.amount` are SQL-expression objects; predicate from `c` selects nothing | 1 | 3 | 1 | 1 | **1.0** | P3 |
| B12 | empty `SUM` over an empty table returns `0`, not `null` | delete re-delete 1 — after deleting all rows `sum(col)`→`0` | 1 | 1 | 1 | 1 | **1.0** | P3 |

### Worklist order (Part B)

| # | issue | why this slot (observation-based) |
| --- | --- | --- |
| 1 | B1 expression projection | 89 fails / whole feature down; 1 feature, uniform surface |
| 2 | B3 transaction rollback | atomicity absent for insert/update/delete; 2 features |
| 3 | B2 `count()` projection | 11 fails, 1 feature, uniform surface — narrow |
| 4 | B4 `onDelete:cascade` | 8 fails, 1 feature, self-contained |
| 5 | B5 builder shape / B8 constraints | moderate radius, 2-feature spread |
| 6 | B9 renamed-column | small radius, 3-feature spread |
| 7 | B6 text `0` | 29 fails but **5 features** → widest spread, lowest score |
| 8 | B7 nullable `0` | 45 fails (largest raw count) but **4 features** → low score |
| 9 | B10 / B11 / B12 | tiny single-feature edge cases |
| 10 | B13 `__rid` leak | lowest urgency; strict-equality only |

> **Why B6/B7 sit in P3 despite the largest raw fail counts (29, 45).**
> The cross-feature rule applied as instructed: the same observed behavior
> recurs across 5 and 4 features, so Difficulty caps at 5, and the score drops
> below issues that — though smaller — are confined to one or two features.

### ポンチ絵 — Part B: blast radius × cross-feature spread

```
  blast      narrow spread (1 feat) ───────────────► wide spread (5 feat)
  radius     do first                                 do later
   ▲       ┌──────────────────────────────────────────────────────┐
 whole     │ ● B1  expression                                      │
 feature   │   (89 fail, 1 feat)        ○ B7 nullable=0 (45F,4feat) │
 /100+     │ ● B3  tx-rollback          ○ B6 text=0     (29F,5feat) │
           │   (12 fail, 2 feat)                                   │
           ├──────────────────────────────────────────────────────┤
 ~20-40    │ ◆ B5 builder-shape (26F, 2 feat)                       │
 fails     │ ● B2 count()      ◆ B8 constraints  ◆ B9 renamed-col   │
           │ ● B4 cascade        (4F,2feat)        (3F,3feat)       │
           ├──────────────────────────────────────────────────────┤
 few       │ ○ B10 eq-2col                       ○ B13 __rid leak   │
 fails     │ ○ B11 tick-bind                                       │
 /1 file   │ ○ B12 empty-SUM                                       │
   ▼       └──────────────────────────────────────────────────────┘
            ● P1 (score ≥2.4)   ◆ P2 (1.5–2.3)   ○ P3 (<1.5)

  Read: upper-LEFT  = big outage, narrow spread  → do first  (B1,B3,B2,B4)
        upper-RIGHT = big outage, wide spread    → pushed down (B6,B7)
        lower-*     = small edge cases           → later
```

```
   Part B worklist lanes
   ┌─ P1 do-first ──────────┐ ┌─ P2 next ──────────┐ ┌─ P3 later ───────────┐
   │ B1 expr projection 5.0 │ │ B9 renamed-col 1.8 │ │ B6 text=0       1.0  │
   │ B3 tx-rollback     4.0 │ │                    │ │ B7 nullable=0   1.0  │
   │ B2 count()         3.0 │ │                    │ │ B10 eq-2col     1.0  │
   │ B4 cascade         3.0 │ │                    │ │ B11 tick-bind   1.0  │
   │ B5 builder-shape   2.4 │ │                    │ │ B12 empty-SUM   1.0  │
   │ B8 constraints     2.4 │ │                    │ │ B13 __rid leak  0.6  │
   └────────────────────────┘ └────────────────────┘ └──────────────────────┘
     widest outage,             moderate on both       wide cross-feature
     narrow spread              axes                   spread → low score
```

### Notes

- Echoes across parts (observed symptom only, no shared cause asserted):
  B13 `__rid` ↔ Part A select `__rid`; B12 empty-SUM ↔ Part A aggregate
  empty-set `0`; B6 text=`0` ↔ Part A select text=`0`.
- B1/B2 both record a projection key reading `undefined`; B9/B10 both involve
  a renamed column — listed separately, each ticket is a distinct scenario.
- Fail counts are QA-time; insert/where/order/update files were reworked after
  QA, so a fresh run may differ. The observed behaviors and ranking are stable.

---

## Part A — schema / select / aggregate / group / join

42 tickets, 5 features. Owner: schema/select/aggregate/group/join test
implementer. (Scored on the same method; this section is maintained by that
owner. Data below is carried from the prior Part-A analysis.)

### Observed totals

| feature | files | Σ fail | whole-file outages observed |
| --- | --- | --- | --- |
| schema | 12 | 222 | not-null 17/17, unique 19/19, default 33/33, reference 16/16 |
| select | 6 | 102 | distinct 17/17 |
| aggregate | 7 | 68 | count3 4/4 |
| group | 9 | 67 | having 24/24 |
| join | 8 | 119 | all 8 files — whole feature |

### Issue table

| ID | observed issue | Feat | Fail | Urg | Diff | Score | Bkt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | join builders `innerJoin`/`leftJoin`/`rightJoin`/`fullJoin` not functions | 1 | 119 | 5 | 1 | **5.0** | P1 |
| A2 | `getTableColumns`/`getTableConfig` not exported | 1 | 50 | 4 | 1 | **4.0** | P1 |
| A13 | projection alias ignored — row keyed by source column name | 1 | 23 | 4 | 1 | **4.0** | P1 |
| A6 | `groupBy` does not collapse to one row per distinct key | 1 | 22 | 4 | 1 | **4.0** | P1 |
| A14 | expression columns in a projection yield `undefined` | 1 | 22 | 4 | 1 | **4.0** | P1 |
| A8 | `having` not a function | 1 | 24 | 3 | 1 | **3.0** | P1 |
| A10 | `selectDistinct` not a function | 1 | 17 | 3 | 1 | **3.0** | P1 |
| A4 | aggregate empty-set result is `0`/`Infinity`, not `null` | 1 | 12 | 3 | 1 | **3.0** | P1 |
| A3 | column public API absent (`name`/`primary`/`notNull`/`default`/…) | 1 | 185 | 5 | 1 | **5.0** | P1 |
| A7 | grouped rows not addressable by integer group-key value | 1 | 5 | 3 | 1 | **3.0** | P1 |
| A15 | bare `select()` leaks internal `__rid` key | 1 | 10 | 3 | 1 | **3.0** | P1 |
| A11 | `$count` not a function | 1 | 4 | 2 | 1 | **2.0** | P2 |
| A9 | `orderBy` over an aggregate expression does not reorder | 1 | 3 | 2 | 1 | **2.0** | P2 |
| A5 | aggregate value type `number`, not `string` | 2 | 40 | 3 | 2 | **2.4** | P1 |
| A12 | distinct aggregates do not deduplicate | 2 | 37 | 3 | 2 | **2.4** | P1 |
| A16 | text column values return numeric `0` on read | 2 | 10 | 3 | 2 | **2.4** | P1 |

### Notes (Part A)

- A3 carries the largest raw fail count (~185) but is confined to one feature
  (schema), so under the cross-feature rule its Difficulty stays 1.
- A5/A12/A16 each appear in 2 features → Difficulty 2.
- Part-A scores were recomputed under this README's single shared formula
  `Urgency × (6 − Difficulty) / 5` with Difficulty = feature count; the
  Part-A owner should re-confirm the Urgency values against the tickets.
