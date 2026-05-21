yarn run v1.22.22
$ npx vitest run --coverage

 RUN  v4.1.6 /workspaces/_glre/projects/bad-dbms
      Coverage enabled with v8

 ✓ test/expression/arith.test.ts (23 tests) 27ms
 ✓ test/join/selfjoin.test.ts (9 tests) 52ms
 ✓ test/group/order.test.ts (13 tests) 62ms
 ✓ test/join/leftjoin.test.ts (20 tests) 66ms
 ✓ test/group/avg.test.ts (23 tests) 77ms
 ✓ test/join/joinproj.test.ts (17 tests) 76ms
 ✓ test/group/groupby1.test.ts (30 tests | 2 skipped) 81ms
 ✓ test/join/joinchain.test.ts (20 tests | 1 skipped) 82ms
 ✓ test/join/innerjoin.test.ts (26 tests) 83ms
 ✓ test/aggregate/count1.test.ts (52 tests | 7 skipped) 86ms
 ✓ test/aggregate/distinct.test.ts (51 tests) 95ms
 ✓ test/select/select1.test.ts (21 tests) 18ms
 ✓ test/insert/single-row.test.ts (26 tests | 1 skipped) 19ms
 ✓ test/update/null-and-constraints.test.ts (15 tests | 1 skipped) 19ms
 ✓ test/where/two-columns.test.ts (6 tests) 15ms
 ✓ test/join/rightjoin.test.ts (10 tests) 24ms
 ✓ test/group/sum.test.ts (16 tests) 19ms
 ✓ test/select/alias.test.ts (24 tests) 19ms
 ✓ test/update/literal-set.test.ts (13 tests) 22ms
 ✓ test/select/select2.test.ts (24 tests) 25ms
 ✓ test/where/comparison.test.ts (23 tests) 31ms
 ✓ test/aggregate/minmax.test.ts (53 tests) 62ms
 ✓ test/select/select3.test.ts (14 tests) 16ms
 ✓ test/where/text-predicates.test.ts (13 tests) 17ms
 ✓ test/insert/transaction.test.ts (12 tests | 1 skipped) 15ms
 ✓ test/expression/compose.test.ts (9 tests) 13ms
 ✓ test/update/repeated.test.ts (8 tests) 19ms
 ✓ test/group/having.test.ts (24 tests) 27ms
 ✓ test/group/count.test.ts (16 tests) 29ms
 ✓ test/select/expr.test.ts (25 tests) 30ms
 ✓ test/group/minmax.test.ts (31 tests | 7 skipped) 30ms
 ✓ test/order/pagination.test.ts (12 tests) 23ms
 ✓ test/insert/column-types.test.ts (36 tests) 26ms
 ✓ test/aggregate/avg.test.ts (33 tests | 21 skipped) 18ms
 ✓ test/order/composed.test.ts (10 tests) 13ms
 ✓ test/where/logical.test.ts (20 tests) 21ms
 ✓ test/select/distinct.test.ts (17 tests) 25ms
 ✓ test/update/visible-to-reads.test.ts (6 tests) 14ms
 ✓ test/join/onetomany.test.ts (5 tests) 17ms
 ✓ test/order/limit.test.ts (13 tests) 23ms
 ✓ test/join/fulljoin.test.ts (10 tests) 16ms
 ✓ test/aggregate/sum.test.ts (42 tests | 29 skipped) 22ms
 ✓ test/expression/compare.test.ts (15 tests) 23ms
 ✓ test/where/between.test.ts (13 tests) 14ms
 ✓ test/update/return-value.test.ts (12 tests) 15ms
 ✓ test/where/null-predicates.test.ts (12 tests) 15ms
 ✓ test/transaction/rollback-on-throw.test.ts (7 tests) 21ms
 ✓ test/where/arithmetic-expression.test.ts (12 tests) 15ms
 ✓ test/order/text-ordering.test.ts (7 tests) 12ms
 ✓ test/expression/convert.test.ts (12 tests) 14ms
 ✓ test/insert/batches.test.ts (14 tests) 17ms
 ✓ test/update/transaction.test.ts (9 tests) 32ms
 ✓ test/order/multi-key.test.ts (12 tests) 15ms
 ✓ test/insert/multi-row.test.ts (27 tests | 9 skipped) 25ms
 ✓ test/order/single-key.test.ts (17 tests) 23ms
 ✓ test/expression/twocol.test.ts (9 tests) 12ms
 ✓ test/where/transaction.test.ts (5 tests) 15ms
 ✓ test/update/multi-column.test.ts (5 tests) 17ms
 ✓ test/expression/usecase.test.ts (7 tests) 15ms
 ✓ test/transaction/commit.test.ts (11 tests) 13ms
 ✓ test/update/expression-setter.test.ts (12 tests) 16ms
 ✓ test/order/expression-key.test.ts (5 tests) 11ms
 ✓ test/where/successive-queries.test.ts (8 tests) 18ms
 ✓ test/transaction/per-row-tick.test.ts (10 tests) 22ms
 ✓ test/where/set-membership.test.ts (15 tests) 15ms
 ✓ test/insert/read-consistency.test.ts (21 tests | 8 skipped) 19ms
 ✓ test/delete/re-delete.test.ts (5 tests) 11ms
 ✓ test/transaction/read-your-writes.test.ts (5 tests) 12ms
 ✓ test/expression/chain.test.ts (14 tests) 17ms
 ✓ test/select/aggshape.test.ts (10 tests) 14ms
 ✓ test/insert/returning.test.ts (17 tests | 8 skipped) 7ms
 ✓ test/insert/column-omission.test.ts (9 tests) 14ms
 ✓ test/group/where.test.ts (10 tests) 15ms
 ✓ test/where/row-shape.test.ts (5 tests) 11ms
 ✓ test/order/null-ordering.test.ts (8 tests) 10ms
 ✓ test/order/offset.test.ts (11 tests) 12ms
 ✓ test/delete/return-value.test.ts (6 tests) 11ms
 ✓ test/insert/table-shapes.test.ts (13 tests | 5 skipped) 11ms
 ✓ test/insert/default.test.ts (13 tests) 12ms
 ✓ test/order/leaderboard.test.ts (8 tests) 13ms
 ✓ test/aggregate/multiagg.test.ts (7 tests) 12ms
 ✓ test/update/multi-row.test.ts (7 tests) 11ms
 ✓ test/aggregate/aggmut.test.ts (7 tests) 14ms
 ✓ test/delete/sibling-isolation.test.ts (4 tests) 12ms
 ✓ test/group/groupmut.test.ts (5 tests) 18ms
 ✓ test/delete/transaction.test.ts (5 tests) 17ms
 ✓ test/delete/cascade.test.ts (5 tests | 1 skipped) 11ms
 ✓ test/order/no-leak.test.ts (4 tests) 9ms
 ✓ test/transaction/explicit-rollback.test.ts (3 tests) 11ms
 ✓ test/update/untouched-rows.test.ts (5 tests) 10ms
 ✓ test/order/ties.test.ts (4 tests) 8ms
 ✓ test/insert/seed-helpers.test.ts (7 tests | 2 skipped) 11ms
 ✓ test/delete/returning.test.ts (5 tests) 12ms
 ✓ test/delete/null-predicate.test.ts (3 tests) 9ms
 ✓ test/delete/text-predicate.test.ts (3 tests) 10ms
 ✓ test/transaction/nested.test.ts (4 tests) 10ms
 ✓ test/aggregate/count2.test.ts (4 tests) 8ms
 ✓ test/transaction/isolation.test.ts (4 tests) 10ms
 ✓ test/aggregate/count3.test.ts (4 tests) 9ms
 ✓ test/transaction/return-value.test.ts (9 tests) 8ms
 ✓ test/schema/reference.test.ts (16 tests) 4ms
 ✓ test/schema/table-metadata.test.ts (17 tests) 6ms
 ✓ test/schema/column-name.test.ts (41 tests) 9ms
 ✓ test/schema/table.test.ts (23 tests) 6ms
 ✓ test/schema/column-factory.test.ts (31 tests) 5ms
 ✓ test/schema/not-null.test.ts (17 tests) 4ms
 ✓ test/schema/default.test.ts (33 tests) 4ms
 ✓ test/schema/unique.test.ts (19 tests) 4ms
 ✓ test/schema/primary-key.test.ts (21 tests) 8ms
 ✓ test/schema/text-column.test.ts (16 tests) 6ms
 ✓ test/schema/default-fn.test.ts (17 tests) 4ms
 ✓ test/schema/order.test.ts (13 tests) 4ms
 ↓ test/insert/upsert.test.ts (1 test | 1 skipped)
 ↓ test/delete/cascade-tree.test.ts (3 tests | 3 skipped)

 Test Files  112 passed | 2 skipped (114)
      Tests  1542 passed | 107 skipped (1649)
   Start at  10:40:59
   Duration  6.27s (transform 3.50s, setup 0ms, import 17.58s, tests 2.34s, environment 6ms)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   62.08 |     55.4 |   69.01 |   63.18 |                   
 src               |   38.46 |        0 |      25 |   41.66 |                   
  index.ts         |   38.46 |        0 |      25 |   41.66 | 24,44-50          
 src/backend       |   75.78 |     62.8 |   65.45 |    79.2 |                   
  catalog.ts       |   80.75 |    60.74 |   76.74 |   85.22 | ...19-238,303-311 
  index.ts         |   50.94 |    72.41 |      25 |   53.19 | 23-25,52-81       
 ...backend/access |   26.23 |    15.76 |   31.16 |   26.83 |                   
  hash.ts          |    3.12 |        0 |       0 |    3.55 | 35-258            
  heap.ts          |   68.51 |    65.38 |   78.57 |   66.31 | ...95,121-122,130 
  nbtree.ts        |   30.93 |    17.33 |      50 |   31.95 | ...65-196,221-299 
  transam.ts       |    17.5 |        5 |    6.25 |   20.89 | ...4,57-69,73-112 
 ...ackend/adapter |       0 |        0 |       0 |       0 |                   
  browser.ts       |       0 |        0 |       0 |       0 | 2-78              
 ...ckend/executor |   84.94 |    80.44 |   82.85 |    86.1 |                   
  group.ts         |   98.58 |    97.02 |     100 |   99.06 | 35                
  index.ts         |   88.88 |    81.25 |     100 |   90.47 | 24-25             
  join.ts          |   66.66 |    65.51 |   57.14 |   66.66 | 51-74             
  modify.ts        |   88.88 |    75.86 |    90.9 |   90.56 | 63-67             
  scan.ts          |   65.51 |    43.33 |   70.58 |   69.56 | 30-42,72-73       
  utils.ts         |    87.5 |       75 |      70 |     100 | 21                
 ...ackend/storage |    56.8 |    33.33 |   59.49 |   60.77 |                   
  buffer.ts        |   67.44 |    35.41 |   63.63 |    72.3 | ...53,68-70,93-97 
  file.ts          |    75.6 |     37.5 |   53.33 |   80.55 | 32,38,52-55,59-63 
  free.ts          |   86.36 |    71.42 |   88.88 |   86.53 | 64-70             
  lmgr.ts          |    9.55 |        0 |    6.66 |   12.38 | ...5,88-93,97-146 
  page.ts          |   85.39 |    76.08 |   88.88 |   92.42 | 104-110           
  smgr.ts          |   62.22 |    28.57 |   63.63 |   65.78 | 28-30,41-43,49-58 
 src/interface     |   84.18 |    71.62 |   86.69 |   88.84 |                   
  column.ts        |   95.74 |      100 |   86.66 |     100 |                   
  compile.ts       |   80.51 |    72.35 |    86.2 |   86.11 | ...00,125,139-141 
  database.ts      |    81.4 |    66.91 |   88.23 |    85.8 | ...46,184,220-225 
  introspect.ts    |     100 |    83.33 |     100 |     100 | 47                
  plan.ts          |   93.37 |    80.29 |   97.36 |   97.14 | 42-44             
  sql.ts           |   65.27 |    29.41 |   66.66 |   69.76 | 39-45,48-55       
  table.ts         |   88.23 |    57.14 |      80 |   90.62 | 37-39             
 ...ce/expressions |    85.5 |       50 |   78.12 |     100 |                   
  conditions.ts    |   84.61 |       50 |   76.66 |     100 | 16-32             
  select.ts        |     100 |      100 |     100 |     100 |                   
 ...face/functions |   78.12 |      100 |   56.25 |     100 |                   
  aggregate.ts     |     100 |      100 |     100 |     100 |                   
  vector.ts        |      50 |      100 |       0 |     100 |                   
 src/shared        |   69.56 |    54.54 |      75 |   73.33 |                   
  helper.ts        |   69.56 |    54.54 |      75 |   73.33 | 9-12              
-------------------|---------|----------|---------|---------|-------------------
Done in 7.28s.
