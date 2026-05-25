# Feature: expression

## 対象ファイル一覧

`projects/bad-dbms/test/expression/` 配下のファイル:

- `arith.test.ts`
- `chain.test.ts`
- `compare.test.ts`
- `compose.test.ts`
- `convert.test.ts`
- `helpers.ts` (テスト用ヘルパー、非 `.test.ts`)
- `twocol.test.ts`
- `usecase.test.ts`

## tsc 実行結果

実行コマンド (リポジトリ全体):

```
cd /workspaces/_glre/projects/bad-dbms
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "test/expression/"
```

直接実行 (expression ファイル単体):

```
npx tsc --noEmit --target ESNext --module ESNext --moduleResolution Bundler --strict \
  --skipLibCheck --jsx react-jsx --jsxImportSource react --lib ESNext,DOM \
  test/expression/*.test.ts test/expression/helpers.ts
```

### tsc エラー全件

(該当なし)

### エラー件数の集計

| ファイル              | エラー件数 |
| --------------------- | ---------- |
| `arith.test.ts`       | 0          |
| `chain.test.ts`       | 0          |
| `compare.test.ts`     | 0          |
| `compose.test.ts`     | 0          |
| `convert.test.ts`     | 0          |
| `helpers.ts`          | 0          |
| `twocol.test.ts`      | 0          |
| `usecase.test.ts`     | 0          |
| **合計**              | **0**      |

リポジトリ全体の tsc 出力 (171 行) 内に `test/expression/` を含む行は 0 件。
(grep `expression` で他ディレクトリにヒットするのは TS7053 等のメッセージ本文中の "expression of type 'string'" など、ファイルパスとは無関係のもの。)

## library user の代表的な記述パターン (引用付き)

### 1. import 形

すべての `.test.ts` は `vitest` から `describe / it / expect` を import し、
同じ feature ディレクトリ内の `./helpers` から `column` と各種シードヘルパーを import している。
`usecase.test.ts` のみ `../../src/index` から `eq` も import する。

`arith.test.ts:1-2`
```ts
import { describe, it, expect } from 'vitest'
import { column, seedUsers, intTable } from './helpers'
```

`usecase.test.ts:1-3`
```ts
import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { column, seedUsers, intTable } from './helpers'
```

### 2. ヘルパーの API

`helpers.ts` で `database`, `table`, `integer`, `float` を `../../src/index` から import し、
`seedUsers / intTable / floatTable / pairTable` を提供する。これらの戻り値は分割代入で `db` と
テーブル本体 (`users` / `t`) を取り出す形に統一されている。

`helpers.ts:14-19`
```ts
export const seedUsers = async () => {
        const users = makeUsers()
        const db = database({ users })
        await db.insert(users).values(USERS_SEED)
        return { db, users }
}
```

`helpers.ts:21-30`
```ts
export const intTable = async (values: number[]) => {
        const t = table('t', {
                id: integer('id').primaryKey(),
                v: integer('v'),
        })
        const db = database({ t })
        const rows = values.map((v, i) => ({ id: i + 1, v }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}
```

### 3. select projection で式を評価

カラムオブジェクトに対するメソッド呼び出し (`.add / .sub / .mul / .div / .mod` 等) を
`db.select({ <key>: <expr> }).from(<table>)` の projection に直接置く形。
戻り値の rows は `column(rows, key)` で 1 列の配列として取り出す。

`arith.test.ts:10-12`
```ts
const { db, users } = await seedUsers()
const rows = await db.select({ x: users.score.add(5) }).from(users)
expect(column(rows, 'x')).toEqual([15, 25, 35])
```

### 4. メソッドチェーン (`chain.test.ts`)

`column.<op>(x).<op>(y)...` の左→右チェーン。

`chain.test.ts:9`
```ts
const rows = await db.select({ x: users.score.add(1).mul(2) }).from(users)
```

`chain.test.ts:54-55`
```ts
const first = await db.select({ x: users.score.add(5).mul(2).sub(10) }).from(users)
const second = await db.select({ x: users.score.add(5).mul(2).sub(10) }).from(users)
```

### 5. 比較演算子は bool を返す (`compare.test.ts`)

`.eq / .ne / .gt / .gte / .lt / .lte` の戻り値を projection に置き、
`column(rows, 'x')` が `boolean[]` (strict bool、`1/0` ではない) になることを期待。

`compare.test.ts:19-22`
```ts
const { db, users } = await seedUsers()
const rows = await db.select({ x: users.score.gt(15) }).from(users)
expect(column(rows, 'x')).toEqual([false, true, true])
```

`compare.test.ts:26`
```ts
const rows = await db.select({ x: users.score.eq(users.id.mul(10)) }).from(users)
```

### 6. 型変換 (`convert.test.ts`, `compose.test.ts`)

`.toFloat() / .toInt() / .toBool()` を最後あるいはチェーン途中に挟む。

`convert.test.ts:14-16`
```ts
const { db, t } = await floatTable([1.9, 2.1, 3.5])
const rows = await db.select({ x: t.v.toInt() }).from(t)
expect(column(rows, 'x')).toEqual([1, 2, 3])
```

`compose.test.ts:22-24`
```ts
const { db, t } = await floatTable([1.9, 2.1, 3.5])
const rows = await db.select({ x: t.v.toInt().mul(10) }).from(t)
expect(column(rows, 'x')).toEqual([10, 20, 30])
```

### 7. `it.each` + `(col as any)[method](arg)` 動的呼び出し

メソッド名を文字列として渡し、`as any` 経由でインデックスアクセスする。
このため tsc 上では method 呼び出しの型検証はスキップされる。

`arith.test.ts:62-66`
```ts
])('evaluates score.%s over the user seed', async (_label, method, arg, expected) => {
        const { db, users } = await seedUsers()
        const rows = await db.select({ x: (users.score as any)[method](arg) }).from(users)
        expect(column(rows, 'x')).toEqual(expected)
})
```

`compare.test.ts:14-18`
```ts
])('evaluates score.%s(20) to a boolean sequence', async (_label, method, arg, expected) => {
        const { db, users } = await seedUsers()
        const rows = await db.select({ x: (users.score as any)[method](arg) }).from(users)
        expect(column(rows, 'x')).toEqual(expected)
})
```

`it.each` ケースの builder 関数は `(s: any) => s.add(...).mul(...)` 形で受け、
projection に渡される値も実質 `any`。

`chain.test.ts:29-37`
```ts
it.each([
        ['add then sub', (s: any) => s.add(5).sub(3), [12, 22, 32]],
        ['sub then mul', (s: any) => s.sub(5).mul(2), [10, 30, 50]],
        ['mul then div', (s: any) => s.mul(3).div(2), [15, 30, 45]],
        ['add then mul then sub', (s: any) => s.add(2).mul(2).sub(4), [20, 40, 60]],
        ['div then add then mul', (s: any) => s.div(10).add(1).mul(3), [6, 9, 12]],
        ['mod then add', (s: any) => s.mod(7).add(100), [103, 106, 102]],
        ['mul then mod', (s: any) => s.mul(2).mod(7), [6, 5, 4]],
        ['four-step chain', (s: any) => s.add(1).mul(2).sub(2).div(2), [10, 20, 30]],
])('evaluates the %s chain left-to-right', async (_label, build, expected) => {
```

### 8. 2 カラム間の演算 (`twocol.test.ts`)

メソッドの引数にもう一方のカラム式を渡す。

`twocol.test.ts:9`
```ts
const rows = await db.select({ x: users.score.add(users.id) }).from(users)
```

`twocol.test.ts:46`
```ts
const rows = await db.select({ x: t.a.mod(t.b) }).from(t)
```

### 9. where + select の組み合わせ

`twocol.test.ts:51-55`
```ts
const rows = await db
        .select({ x: users.score.add(users.id) })
        .from(users)
        .where(users.id.gt(1))
```

### 10. usecase: mutation を挟んだ前後比較 (`usecase.test.ts`)

`db.update(...).set({...}).where(eq(...))` や `db.delete(...).where(...)`,
`db.insert(...).values(...)` で状態を変えた前後で同じ projection を再評価する。

`usecase.test.ts:14-23`
```ts
it('flags rows over a threshold and re-reads the flag after an update', async () => {
        const { db, users } = await seedUsers()
        const before = await db.select({ hot: users.score.gt(15) }).from(users)
        await db.update(users).set({ score: 5 }).where(eq(users.id, 3))
        const after = await db.select({ hot: users.score.gt(15) }).from(users)
        expect([column(before, 'hot'), column(after, 'hot')]).toEqual([
                [false, true, true],
                [false, true, false],
        ])
})
```

`usecase.test.ts:24-32`
```ts
it('computes a per-row bonus from two columns and projects it beside the id', async () => {
        const { db, users } = await seedUsers()
        const rows = await db.select({ id: users.id, bonus: users.score.add(users.id).mul(2) }).from(users)
        expect(rows).toEqual([
                { id: 1, bonus: 22 },
                { id: 2, bonus: 44 },
                { id: 3, bonus: 66 },
        ])
})
```

`usecase.test.ts:58-67`
```ts
it('reads a derived running scale before and after deleting a row', async () => {
        const { db, t } = await intTable([10, 20, 30])
        const before = await db.select({ scaled: t.v.mul(3) }).from(t)
        await db.delete(t).where(eq(t.id, 2))
        const after = await db.select({ scaled: t.v.mul(3) }).from(t)
        expect([column(before, 'scaled'), column(after, 'scaled')]).toEqual([
                [30, 60, 90],
                [30, 90],
        ])
})
```

### 11. `column` ヘルパーの戻り値の扱い

`helpers.ts:10-12`
```ts
export const rowsOf = (r: unknown): any[] => (Array.isArray(r) ? (r as any[]) : [])
// the projected expression column read in row order.
export const column = (r: unknown, key: string): any[] => rowsOf(r).map((row) => row[key])
```

`column` は引数を `unknown` で受けて `any[]` に変換するため、`db.select(...).from(...)` の
戻り値型がどうであっても tsc 上は通る。test 側で型エラーが 1 件も出ていないのはこの
ヘルパー設計に依存している。
