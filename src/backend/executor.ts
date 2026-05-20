import type { Row, RowPredicate, RowSetter, AggSpec, SortKey, PhysicalOp, TableRef, SqlNode, SQL } from '../shared/types'
import type { SeqScanOp, IndexScanOp, UpdateOp, DeleteOp, InsertOp, SelectOp } from '../shared/types'
import type { Catalog } from './catalog'
import type { TupleDescriptor, RowIterator, Rid } from './types'
const tableNameOf = (t: TableRef): string => {
        if (typeof t === 'string') return t
        if (t && '$meta' in t && t.$meta) return t.$meta.name
        if (t && 'node' in t && t.node) return t.node.name
        return String(t)
}
const nodeOf = (e: unknown): SqlNode | undefined => {
        if (!e || typeof e !== 'object') return undefined
        if ('kind' in e && (e as { kind?: string }).kind === 'sql') return (e as SQL).node
        if ('type' in e) return e as SqlNode
        return undefined
}
const fieldNameOf = (e: unknown): string => {
        const n = nodeOf(e)
        if (n && n.type === 'column') return n.name
        if (n && n.type === 'order') return fieldNameOf(n.col)
        return ''
}
const buildRow = (desc: TupleDescriptor, rid: Rid): Row => {
        const row: Row = { __rid: rid }
        for (const col of desc.columns) row[col.name] = col.heap.read(rid)
        return row
}
const collectRids = (firstHeap: { scan(emit: (rid: Rid) => boolean | void): void }): Rid[] => {
        const rids: Rid[] = []
        firstHeap.scan((rid: Rid) => void rids.push(rid))
        return rids
}
const EMPTY_ITER: RowIterator = { next: () => null, close: () => {} }
const evalBinop = (op: string, a: any, b: any): any => {
        if (op === '+') return a + b
        if (op === '-') return a - b
        if (op === '*') return a * b
        if (op === '/') return b === 0 ? 0 : a / b
        if (op === '%') return b === 0 ? 0 : a % b
        if (op === '=') return a === b
        if (op === '!=') return a !== b
        if (op === '<') return a < b
        if (op === '<=') return a <= b
        if (op === '>') return a > b
        if (op === '>=') return a >= b
        if (op === 'and') return !!a && !!b
        if (op === 'or') return !!a || !!b
        if (op === 'in') return Array.isArray(b) ? b.includes(a) : false
        return undefined
}
const evalUnop = (op: string, v: any): any => {
        if (op === 'not') return !v
        if (op === 'isNull') return v === null || v === undefined
        if (op === 'isNotNull') return v !== null && v !== undefined
        return v
}
const evalFunc = (name: string, args: any[]): any => {
        if (name === 'toFloat') return Number(args[0])
        if (name === 'toInt') return args[0] | 0
        if (name === 'toBool') return !!args[0]
        if (name === 'between') return args[0] >= args[1] && args[0] <= args[2]
        if (name === 'at') return args[0]
        return undefined
}
export const evalNode = (node: unknown, row: Row | null, ctx?: Record<string, unknown>): any => {
        if (node === null || node === undefined) return node
        if (typeof node !== 'object') return node
        const n: any = (node as { node?: unknown }).node ? (node as { node: unknown }).node : node
        if (!n || !n.type) return n
        const t: string = n.type
        if (t === 'literal') return n.value
        if (t === 'raw') return n.value
        if (t === 'identifier') return n.name
        if (t === 'column') return row ? row[n.name] : undefined
        if (t === 'currentTuple') return ctx ? ctx[n.col] : undefined
        if (t === 'binop') {
                const args = (n.args || []).map((a: unknown) => evalNode(a, row, ctx))
                if (n.op === 'and') return args.every((x: unknown) => !!x)
                if (n.op === 'or') return args.some((x: unknown) => !!x)
                return evalBinop(n.op, args[0], args[1])
        }
        if (t === 'unop') return evalUnop(n.op, evalNode((n.args || [])[0], row, ctx))
        if (t === 'func')
                return evalFunc(
                        n.name,
                        (n.args || []).map((a: unknown) => evalNode(a, row, ctx)),
                )
        if (t === 'list') return (n.items || []).map((a: unknown) => evalNode(a, row, ctx))
        if (t === 'order') return evalNode(n.col, row, ctx)
        if (t === 'placeholder') return ctx ? ctx[n.name] : undefined
        return undefined
}
type PredInput = RowPredicate | SqlNode | SQL | undefined
type SetterInput = RowSetter | SqlNode | SQL | unknown
const compilePredicate = (pred: PredInput): RowPredicate => {
        if (!pred) return () => true
        if (typeof pred === 'function') return pred
        return (row: Row) => !!evalNode(pred, row)
}
const compileSetter = (expr: SetterInput): RowSetter => {
        if (typeof expr === 'function') return expr as RowSetter
        if (expr && typeof expr === 'object' && 'kind' in expr && (expr as { kind?: string }).kind === 'sql') return (row: Row) => evalNode(expr, row)
        if (expr && typeof expr === 'object' && 'type' in expr) return (row: Row) => evalNode(expr, row)
        return () => expr
}
const makeSeqScan = (catalog: Catalog, ast: SeqScanOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const desc = catalog.tupleDescriptor(rel)
        const rids = collectRids(rel.heaps[0])
        let i = 0
        const next = () => {
                if (i >= rids.length) return null
                return buildRow(desc, rids[i++])
        }
        return { next, close: () => {} }
}
const makeIndexScan = (catalog: Catalog, ast: IndexScanOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const desc = catalog.tupleDescriptor(rel)
        const idx = catalog.findIndex(rel, ast.indexName)
        if (!idx) return EMPTY_ITER
        const range = ast.range ?? {}
        const start = range.start ?? -2147483648
        const end = range.end ?? 2147483647
        const rids: Rid[] = []
        if (idx.kind === 'nbtree' && 'forward' in idx.handle) idx.handle.forward(start, end, (rid: Rid) => void rids.push(rid))
        else if ('lookup' in idx.handle) idx.handle.lookup(start, (rid: Rid) => void rids.push(rid))
        let i = 0
        const next = () => (i >= rids.length ? null : buildRow(desc, rids[i++]))
        return { next, close: () => {} }
}
const makeFilter = (child: RowIterator, predicate: PredInput): RowIterator => {
        const fn = compilePredicate(predicate)
        const next = () => {
                while (true) {
                        const r = child.next()
                        if (r === null) return null
                        if (fn(r)) return r
                }
        }
        return { next, close: () => child.close() }
}
const makeProjection = (child: RowIterator, fields: string[]): RowIterator => {
        const next = () => {
                const r = child.next()
                if (r === null) return null
                const out: Row = {}
                for (const f of fields) out[f] = r[f]
                return out
        }
        return { next, close: () => child.close() }
}
const makeNestedLoopJoin = (left: RowIterator, right: RowIterator, predicate: unknown): RowIterator => {
        const fn = typeof predicate === 'function' ? (predicate as (l: Row, r: Row) => boolean) : (l: Row, r: Row) => !!evalNode(predicate, { ...l, ...r })
        const rightBuf: Row[] = []
        while (true) {
                const r = right.next()
                if (r === null) break
                rightBuf.push(r)
        }
        right.close()
        let curLeft: Row | null = null
        let j = 0
        const next = () => {
                while (true) {
                        if (curLeft === null) {
                                curLeft = left.next()
                                if (curLeft === null) return null
                                j = 0
                        }
                        while (j < rightBuf.length) {
                                const r = rightBuf[j++]
                                if (fn(curLeft, r)) return { ...curLeft, ...r }
                        }
                        curLeft = null
                }
        }
        return { next, close: () => left.close() }
}
const makeHashJoin = (left: RowIterator, right: RowIterator, leftKey: string, rightKey: string): RowIterator => {
        const table = new Map<unknown, Row[]>()
        while (true) {
                const r = left.next()
                if (r === null) break
                const k = r[leftKey]
                const arr = table.get(k) ?? []
                arr.push(r)
                table.set(k, arr)
        }
        left.close()
        const queue: Row[] = []
        const next = () => {
                while (queue.length === 0) {
                        const r = right.next()
                        if (r === null) return null
                        const match = table.get(r[rightKey])
                        if (!match) continue
                        for (const m of match) queue.push({ ...m, ...r })
                }
                return queue.shift() ?? null
        }
        return { next, close: () => right.close() }
}
type AggState = { count: number } | { sum: number; count: number } | { val: number } | Record<string, never>
const initAgg = (kind: string): AggState => {
        if (kind === 'count') return { count: 0 }
        if (kind === 'sum' || kind === 'avg') return { sum: 0, count: 0 }
        if (kind === 'min') return { val: Infinity }
        if (kind === 'max') return { val: -Infinity }
        return {}
}
const updateAgg = (state: any, kind: string, v: any) => {
        if (kind === 'count') return void state.count++
        if (kind === 'sum') return void (state.sum += v)
        if (kind === 'avg') return void ((state.sum += v), state.count++)
        if (kind === 'min') return void (state.val = Math.min(state.val, v))
        if (kind === 'max') return void (state.val = Math.max(state.val, v))
}
const finalAgg = (state: any, kind: string): number => {
        if (kind === 'count') return state.count
        if (kind === 'sum') return state.sum
        if (kind === 'avg') return state.count > 0 ? state.sum / state.count : 0
        return state.val
}
interface AggGroup {
        key: unknown[]
        states: AggState[]
}
const makeAggregate = (child: RowIterator, groupBy: string[], aggs: AggSpec[]): RowIterator => {
        const groups = new Map<string, AggGroup>()
        while (true) {
                const r = child.next()
                if (r === null) break
                const k = groupBy.map((g) => r[g]).join('|')
                let g = groups.get(k)
                if (!g) {
                        g = { key: groupBy.map((gb) => r[gb]), states: aggs.map((a) => initAgg(a.kind)) }
                        groups.set(k, g)
                }
                for (let i = 0; i < aggs.length; i++) updateAgg(g.states[i], aggs[i].kind, r[aggs[i].field])
        }
        child.close()
        const out: Row[] = []
        for (const g of groups.values()) {
                const row: Row = {}
                for (let i = 0; i < groupBy.length; i++) row[groupBy[i]] = g.key[i]
                for (let i = 0; i < aggs.length; i++) row[aggs[i].name] = finalAgg(g.states[i], aggs[i].kind)
                out.push(row)
        }
        if (groupBy.length === 0 && out.length === 0 && aggs.length > 0) {
                const row: Row = {}
                for (let i = 0; i < aggs.length; i++) row[aggs[i].name] = finalAgg(initAgg(aggs[i].kind), aggs[i].kind)
                out.push(row)
        }
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}
const makeSort = (child: RowIterator, keys: SortKey[]): RowIterator => {
        const buf: Row[] = []
        while (true) {
                const r = child.next()
                if (r === null) break
                buf.push(r)
        }
        child.close()
        buf.sort((a, b) => {
                for (const k of keys) {
                        const av = a[k.field] as number
                        const bv = b[k.field] as number
                        if (av < bv) return k.dir === 'desc' ? 1 : -1
                        if (av > bv) return k.dir === 'desc' ? -1 : 1
                }
                return 0
        })
        let i = 0
        const next = () => (i < buf.length ? buf[i++] : null)
        return { next, close: () => {} }
}
const makeUpdate = (catalog: Catalog, ast: UpdateOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const desc = catalog.tupleDescriptor(rel)
        const pred = compilePredicate(ast.predicate)
        const setters: Record<string, SetterInput> = ast.setters ?? {}
        const compiled: Record<string, RowSetter> = {}
        for (const k of Object.keys(setters)) compiled[k] = compileSetter(setters[k])
        const rids = collectRids(rel.heaps[0])
        let updated = 0
        for (const rid of rids) {
                const row = buildRow(desc, rid)
                if (!pred(row)) continue
                for (const k of Object.keys(compiled)) {
                        const colIdx = rel.columns.findIndex((c) => c.name === k)
                        if (colIdx < 0) continue
                        const newVal = compiled[k](row)
                        rel.heaps[colIdx].update(rid, Number(newVal))
                }
                updated++
        }
        const out: Row[] = [{ updated }]
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}
const makeDelete = (catalog: Catalog, ast: DeleteOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const desc = catalog.tupleDescriptor(rel)
        const pred = compilePredicate(ast.predicate)
        const rids = collectRids(rel.heaps[0])
        let deleted = 0
        for (const rid of rids) {
                const row = buildRow(desc, rid)
                if (!pred(row)) continue
                for (let i = 0; i < rel.heaps.length; i++) rel.heaps[i].delete(rid)
                deleted++
        }
        const out: Row[] = [{ deleted }]
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}
const makeInsert = (catalog: Catalog, ast: InsertOp): RowIterator => {
        const name = tableNameOf(ast.table)
        const rows: Row[] = ast.values || []
        const rids: Rid[] = []
        for (const row of rows) rids.push(catalog.insertRow(name, row))
        const out: Row[] = ast.returning ? [{ rowCount: rids.length, rids }] : [{ rowCount: rids.length }]
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}
const build = (catalog: Catalog, ast: PhysicalOp): RowIterator => {
        if (!ast || !ast.op) return EMPTY_ITER
        if (ast.op === 'SeqScan') return makeSeqScan(catalog, ast)
        if (ast.op === 'IndexScan') return makeIndexScan(catalog, ast)
        if (ast.op === 'Filter') return makeFilter(build(catalog, ast.child), ast.predicate)
        if (ast.op === 'Projection') return makeProjection(build(catalog, ast.child), ast.fields)
        if (ast.op === 'NestedLoopJoin') return makeNestedLoopJoin(build(catalog, ast.left), build(catalog, ast.right), ast.predicate)
        if (ast.op === 'HashJoin') return makeHashJoin(build(catalog, ast.left), build(catalog, ast.right), ast.leftKey, ast.rightKey)
        if (ast.op === 'Aggregate') return makeAggregate(build(catalog, ast.child), ast.groupBy, ast.aggs)
        if (ast.op === 'Sort') return makeSort(build(catalog, ast.child), ast.keys)
        if (ast.op === 'Update') return makeUpdate(catalog, ast)
        if (ast.op === 'Delete') return makeDelete(catalog, ast)
        if (ast.op === 'Insert') return makeInsert(catalog, ast)
        if (ast.op === 'Select') return makeSelectLogical(catalog, ast)
        return EMPTY_ITER
}
interface Rename {
        from: string
        to: string
}
const makeSelectLogical = (catalog: Catalog, ast: SelectOp): RowIterator => {
        const hasTable = !!tableNameOf(ast.table ?? '')
        const seq: PhysicalOp = { op: 'SeqScan', table: ast.table ?? '' }
        let cur: RowIterator = hasTable ? build(catalog, seq) : EMPTY_ITER
        if (ast.where) cur = makeFilter(cur, ast.where)
        const proj = ast.projection
        const aggs: AggSpec[] = []
        const plainFields: string[] = []
        const renames: Rename[] = []
        if (proj && Array.isArray(proj)) {
                for (const p of proj) {
                        const node = nodeOf(p.expr)
                        if (node && node.type === 'aggregate') {
                                const inner = nodeOf((node.args || [])[0])
                                const field = inner && inner.type === 'column' ? inner.name : '*'
                                aggs.push({ name: p.alias, kind: node.name, field })
                        } else if (node && node.type === 'column') {
                                plainFields.push(node.name)
                                if (p.alias && p.alias !== node.name) renames.push({ from: node.name, to: p.alias })
                        }
                }
        }
        const groupBy: string[] = (ast.groupBy ?? []).map(fieldNameOf)
        if (aggs.length > 0) cur = makeAggregate(cur, groupBy, aggs)
        else if (plainFields.length > 0) cur = makeProjection(cur, plainFields)
        if (ast.orderBy && Array.isArray(ast.orderBy) && ast.orderBy.length > 0) {
                const keys: SortKey[] = ast.orderBy.map((o) => {
                        const n = nodeOf(o)
                        const dir = n && n.type === 'order' ? n.dir : 'asc'
                        return { field: fieldNameOf(o), dir }
                })
                cur = makeSort(cur, keys)
        }
        const limit: number | undefined = ast.limit
        const offset: number = ast.offset ?? 0
        let produced = 0
        let skipped = 0
        const inner = cur
        const next = () => {
                while (true) {
                        const r = inner.next()
                        if (r === null) return null
                        if (skipped < offset) {
                                skipped++
                                continue
                        }
                        if (limit !== undefined && produced >= limit) return null
                        produced++
                        if (renames.length > 0) {
                                const out: Row = { ...r }
                                for (const ren of renames) out[ren.to] = r[ren.from]
                                return out
                        }
                        return r
                }
        }
        return { next, close: () => inner.close() }
}
export interface ExecutorDeps {
        catalog: Catalog
}
export const createExecutor = (deps: ExecutorDeps) => {
        const { catalog: _catalog } = deps
        return {
                execute(ast: PhysicalOp): RowIterator {
                        return build(_catalog, ast)
                },
        }
}
export type Executor = ReturnType<typeof createExecutor>
