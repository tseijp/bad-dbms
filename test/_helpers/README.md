# _helpers

Shared fixtures imported by every feature test file. This directory holds no
`*.test.ts`; it exists so schema declarations and seed datasets live in one
place and are never duplicated across features. A team implementing any
feature imports from here instead of re-declaring tables or re-typing seed
arrays.

```
_helpers/index.ts
   |
   +- schema factories : makeUsers / makePosts / makeEvents / makeNodes
   +- seed constants   : USERS_SEED / POSTS_SEED / EVENTS_SEED
   +- seed helpers     : seedUsers / seedPosts / seedEvents
```

bad-dbms is a numeric column store (`i32` / `u32` / `f32`). The canonical
fixtures use `integer` columns so every expected value in the feature docs is
an exact integer and the examples stay readable.

## schema factories

State the exact table to return. A factory takes no arguments and returns a
fresh table object on every call so feature tests never share mutable state.

- `makeUsers()` returns `table('users', { ... })` with three columns: `id` as
  `integer('id').primaryKey()`, `name` as `integer('name').notNull()`, `score`
  as `integer('score').default(0)`.
- `makePosts()` returns `table('posts', { ... })` with three columns: `id` as
  `integer('id').primaryKey()`, `userId` as `integer('user_id')`, `score` as
  `integer('score').default(0)`.
- `makeEvents()` returns `table('events', { ... })` with three columns: `id`
  as `integer('id').primaryKey()`, `kind` as `integer('kind')`, `v` as
  `integer('v')`.
- `makeNodes()` returns `table('nodes', { ... })` with two columns: `id` as
  `integer('id').primaryKey()`, `parentId` as `integer('parent_id')`. Used by
  join and self-reference scenarios.

## seed constants

State the exact row literals. These are plain arrays; a feature test inserts
them as-is.

- `USERS_SEED` is the three rows `{id:1,name:11,score:10}`,
  `{id:2,name:22,score:20}`, `{id:3,name:33,score:30}`.
- `POSTS_SEED` is the four rows `{id:1,userId:1,score:5}`,
  `{id:2,userId:1,score:7}`, `{id:3,userId:2,score:9}`,
  `{id:4,userId:3,score:4}`. Note user 1 owns two posts, user 2 one, user 3
  one — a deliberate one-to-many shape for join and group tests.
- `EVENTS_SEED` is the five rows `{id:1,kind:0,v:100}`, `{id:2,kind:0,v:200}`,
  `{id:3,kind:1,v:300}`, `{id:4,kind:1,v:400}`, `{id:5,kind:2,v:500}`. Note
  `kind` takes three distinct values with group sizes 2 / 2 / 1 — a deliberate
  uneven-group shape for group and aggregate tests.

## seed helpers

State the exact steps. Each helper is async, builds a fresh in-memory
`database`, inserts one seed array, and returns the connection plus the
queryable table handle.

- `seedUsers()` builds `database({ users })` from `makeUsers()`, inserts
  `USERS_SEED`, and resolves to `{ db, users }` where `users` is the handle on
  `db.tables`.
- `seedPosts()` builds `database({ posts })` from `makePosts()`, inserts
  `POSTS_SEED`, and resolves to `{ db, posts }`.
- `seedEvents()` builds `database({ events })` from `makeEvents()`, inserts
  `EVENTS_SEED`, and resolves to `{ db, events }`.
- `seedUsersPosts()` builds one `database({ users, posts })`, inserts
  `USERS_SEED` into `users` and `POSTS_SEED` into `posts`, and resolves to
  `{ db, users, posts }`. Used only by join tests so both tables share a db.

## notes for implementing teams

- The exact spelling of `table`, the column factory functions, the constraint
  methods, and how a table handle is exposed on the connection must be
  confirmed against the source. This doc fixes the fixture data and structure;
  the source fixes the API spelling.
- A feature test that needs an empty table uses the `makeX` factory directly
  and builds its own `database`; a feature test that needs populated data uses
  the matching `seedX` helper. No feature re-implements seeding.
