import type { Row, RowPredicate, RowSetter, TableRef, SqlNode, SQL } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RelationDescriptor, RowIterator, Rid } from '../types'
// shared executor support: identifier resolution, row construction, and the
// per-row expression evaluator that every operator builds predicates on.
export const tableNameOf = (t: TableRef): string => {
        if (typeof t === 'string') return t
        if (t && '$meta' in t && t.$meta) return t.$meta.name
        if (t && 'node' in t && t.node) return t.node.name
        return String(t)
}
export const nodeOf = (e: unknown): SqlNode | undefined => {
        if (!e || typeof e !== 'object') return undefined
        if ('kind' in e && (e as { kind?: string }).kind === 'sql') return (e as SQL).node
        if ('type' in e) return e as SqlNode
        return undefined
}
export const fieldNameOf = (e: unknown): string => {
        const n = nodeOf(e)
        if (n && n.type === 'column') return n.name
        if (n && n.type === 'order') return fieldNameOf(n.col)
        return ''
}
// build a user-facing row through the catalog so text / null cells decode.
export const buildRow = (catalog: Catalog, rel: RelationDescriptor, rid: Rid): Row => catalog.readRow(rel, rid)
export const collectRids = (firstHeap: { scan(emit: (rid: Rid) => boolean | void): void }): Rid[] => {
        const rids: Rid[] = []
        firstHeap.scan((rid: Rid) => void rids.push(rid))
        return rids
}
export const EMPTY_ITER: RowIterator = { next: () => null, close: () => {} }
export const fromRows = (rows: Row[]): RowIterator => {
        let i = 0
        return { next: () => (i < rows.length ? rows[i++] : null), close: () => {} }
}
// arithmetic propagates NULL: a null operand yields null, never a number.
export const isNullish = (v: unknown): boolean => v === null || v === undefined
const evalBinop = (op: string, a: any, b: any): any => {
        if (op === '=') return a === b
        if (op === '!=') return a !== b
        if (op === '<') return a < b
        if (op === '<=') return a <= b
        if (op === '>') return a > b
        if (op === '>=') return a >= b
        if (op === 'and') return !!a && !!b
        if (op === 'or') return !!a || !!b
        if (op === 'in') return Array.isArray(b) ? b.includes(a) : false
        if (isNullish(a) || isNullish(b)) return null
        if (op === '+') return a + b
        if (op === '-') return a - b
        if (op === '*') return a * b
        if (op === '/') return b === 0 ? 0 : a / b
        if (op === '%') return b === 0 ? 0 : a % b
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
export type PredInput = RowPredicate | SqlNode | SQL | undefined
export type SetterInput = RowSetter | SqlNode | SQL | unknown
export const compilePredicate = (pred: PredInput): RowPredicate => {
        if (!pred) return () => true
        if (typeof pred === 'function') return pred
        return (row: Row) => !!evalNode(pred, row)
}
export const compileSetter = (expr: SetterInput): RowSetter => {
        if (typeof expr === 'function') return expr as RowSetter
        if (expr && typeof expr === 'object' && 'kind' in expr && (expr as { kind?: string }).kind === 'sql') return (row: Row) => evalNode(expr, row)
        if (expr && typeof expr === 'object' && 'type' in expr) return (row: Row) => evalNode(expr, row)
        return () => expr
}
