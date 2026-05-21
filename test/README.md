# bad-dbms test suite

bad-dbms の public interface を実際の usecase から操作する、example 集としての
unit test 群。SQLite の test corpus と同じ思想で、library user が「この機能はこう
書く」を test を読むだけで学べることを目的とする。

## 構成

feature ごとに directory を切り、`test/${feature}/README.md` に詳細設計、
`test/${feature}/${feature}.test.ts` に test code を置く。

| feature       | 対象                                               |
| ------------- | -------------------------------------------------- |
| `schema`      | table 宣言 / column factory / 制約 / introspection |
| `insert`      | 行の挿入 / 複数行 / returning / default            |
| `select`      | 行の取得 / projection / expression column / alias  |
| `where`       | 比較 / 論理 / between / inArray / null の filter   |
| `order`       | orderBy / limit / offset / pagination              |
| `aggregate`   | count / sum / avg / min / max / distinct           |
| `group`       | groupBy / per-group 集計 / having                  |
| `update`      | set / expression setter / multi-column / where     |
| `delete`      | where 一致削除 / range 削除 / 全削除               |
| `join`        | innerJoin / leftJoin / join projection             |
| `transaction` | transaction callback / commit / per-row tick       |
| `expression`  | column の算術 / 比較 / 変換 chain                  |

## 設計方針

- test は public な `interface/` API のみを操作する。`backend/` の内部
  (`catalog` / `executor` / `heap` / `nbtree` / `hash` / `page` / `buffer`) は
  import も直接呼び出しもしない。
- test は user-facing な feature 単位で分割する。`interface` / `backend` の
  実装分割を軸にしない。
- 外部 dataset と大量 data は使わない。fixture は手書きの小さな literal 配列
  (数件〜十数件) で、各 file が 5s 未満で完了する。
- edge case / error handling / 性能 / 並行性などの非機能要件は対象外。
  test は library user が依存する happy-path の振る舞いを assert する。
- Drizzle ORM 相当の正しい仕様を test に書く。bad-dbms が未実装・不具合で
  あっても test は正しい仕様のまま書き、結果として fail する場合は fail の
  ままにする。fail を pass に書き換えて test を弱めない。
- t-wada の TDD 規律: 1 test 1 振る舞い、1 test の assert 観点は 1 つ、
  test 名は意図を表す、test 内 loop ではなく parameterized test を使う、
  fixture は `_helpers.ts` に集約し重複を作らない。
