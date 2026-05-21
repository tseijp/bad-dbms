# self-join は alias 必須（SQL 標準準拠で未対応）

## 観測した事実

`test/join/selfjoin.test.ts` の 9 件中 6 件が失敗。

self-join テストは alias を使わず、同一 `nodes` テーブルオブジェクトを `from(nodes)` と `innerJoin(nodes, ...)` の両方に渡している。on 句も projection も同じ `nodes.id` / `nodes.parentId` を使う。

```
innerJoin(
  db.select({ child: nodes.id, parent: nodes.id }).from(nodes),
  nodes,
  eq(nodes.parentId, nodes.id)
)
```

期待値: `seedNodeChain`（id1/parent0, id2/parent1, id3/parent2）で結合ペア数 2。

## SQL 標準との関係

SQL 標準では同名テーブルを 1 つのクエリに 2 回出すと曖昧でエラー。self-join は必ず alias が要る:

```sql
FROM nodes AS child JOIN nodes AS parent ON child.parent_id = parent.id
```

alias が無いと `eq(nodes.parentId, nodes.id)` の 2 つの `nodes` 参照が AST 上で同一になり、どちらが left 行・right 行を指すか区別できない。projection の `{child: nodes.id, parent: nodes.id}` も両方同じ column で振り分け不能。

bad-dbms は SQL 標準準拠を方針とするため、alias 無しの self-join に位置ヒューリスティックを入れない。同名テーブルの join は同一参照として扱い、`eq(nodes.parentId, nodes.id)` は単一テーブル自己条件 `parent_id = id` 相当になる（`seedNodeChain` では該当行なし）。

## 対応方針

interface に `alias()` を導入し、self-join テストが alias 経由で書けるようにする。

- `alias(table, name)` が table の複製を返し、各 column の `tableName` を別名に差し替える
- `planJoin` は alias テーブルを別 `NamedScan` 名でスキャン
- on / projection の column は alias 経由で left / right を一意に解決

alias 導入後、self-join は通常の異テーブル join と同じ経路で処理でき、特殊コードは不要になる。

## 対象ファイル

- `src/interface/table.ts` または新規 — `alias()` 関数
- `src/interface/plan.ts` — alias テーブルの NamedScan 名解決
