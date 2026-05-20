# schema/reference — observed failures

Test run: `npx vitest run --no-coverage test/schema/reference.test.ts`
Result: 16 failed / 0 passed (16 total)

## summary

Observed from `.references()` foreign-key declarations and the `getTableConfig` introspection helper:

- The `getTableConfig` symbol is not exported from `src/index`; calling it throws `TypeError: getTableConfig is not a function`.
- Because `getTableConfig` is unavailable, none of the foreign-key introspection behaviour (listing foreign keys, resolving target table/column, reading `onDelete` / `onUpdate`) can be observed.

All 16 tests in the file fail with the same `TypeError`.

## failures

### lists a declared foreign key in getTableConfig
- 操作: declare `posts` with `userId: integer('user_id').references(() => users.id)`, then call `getTableConfig(posts)`.
- 期待: `config.foreignKeys.length` is `1`.
- 観測: `TypeError: getTableConfig is not a function`.

### reports no foreign keys in getTableConfig when none is declared
- 操作: a table with no `.references()`, then call `getTableConfig(t)`.
- 期待: `config.foreignKeys` equals `[]`.
- 観測: `TypeError: getTableConfig is not a function`.

### resolves a foreign key to its referencing column name
- 操作: as above, then `getTableConfig(posts).foreignKeys[0].reference()` and read `ref.columns[].name`.
- 期待: contains `'user_id'`.
- 観測: `TypeError: getTableConfig is not a function`.

### resolves a foreign key to its target table name
- 操作: as above, then read `ref.foreignTable` name from the resolved reference.
- 期待: `'users'`.
- 観測: `TypeError: getTableConfig is not a function`.

### records the onDelete action cascade / restrict / set null / no action on the foreign key
- 操作: `.references(() => users.id, { onDelete: action })`, then read `getTableConfig(posts).foreignKeys[0].onDelete`.
- 期待: the supplied action string.
- 観測: `TypeError: getTableConfig is not a function`.

### records an onUpdate action on the foreign key
- 操作: `.references(() => users.id, { onUpdate: 'cascade' })`, then read `getTableConfig(posts).foreignKeys[0].onUpdate`.
- 期待: `'cascade'`.
- 観測: `TypeError: getTableConfig is not a function`.

### contributes no foreign key from a plain integer / uint / float / text column
- 操作: a table with a plain column and no `.references()`, then call `getTableConfig(t)`.
- 期待: `config.foreignKeys` equals `[]`.
- 観測: `TypeError: getTableConfig is not a function`.

### lists a self-referential foreign key in getTableConfig
- 操作: `nodes` with `parentId: integer('parent_id').references(() => nodes.id)`, then call `getTableConfig(nodes)`.
- 期待: `config.foreignKeys.length` is `1`.
- 観測: `TypeError: getTableConfig is not a function`.

### resolves a self-referential foreign key back to its own table
- 操作: as above, then read `reference().foreignTable` name.
- 期待: `'nodes'`.
- 観測: `TypeError: getTableConfig is not a function`.

### lists two foreign keys when a table references two parents
- 操作: `members` with `userId` and `groupId` each `.references()` a different table, then call `getTableConfig(members)`.
- 期待: `config.foreignKeys.length` is `2`.
- 観測: `TypeError: getTableConfig is not a function`.
