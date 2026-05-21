import type { SqlNode, SQL, Row } from '../shared/types'
// a join row groups one Row per source table, keyed by table name; a left/right
// join may null-fill a side. evalNode resolves column nodes against it.
export type JoinRow = Record<string, Row | null>
export interface EvalCtx {
        current: Row | null
        params: Record<string, unknown> | null
        joinRow?: JoinRow | null
}
type NodeInput = SqlNode | SQL | null | undefined
const asNode = (node: NodeInput): SqlNode | null => {
        if (!node) return null
        if ((node as SQL).kind === 'sql') return (node as SQL).node
        return node as SqlNode
}
// resolve a column node's value: from the flat row, or — when the query joins
// tables — from the join row, preferring an explicit tableName match.
const columnValue = (node: Extract<SqlNode, { type: 'column' }>, row: Row | null, ctx: EvalCtx): unknown => {
        const joinRow = ctx?.joinRow
        if (joinRow) {
                if (node.tableName && Object.prototype.hasOwnProperty.call(joinRow, node.tableName)) {
                        const tbl = joinRow[node.tableName]
                        return tbl ? tbl[node.name] : null
                }
                for (const k in joinRow) {
                        const tbl = joinRow[k]
                        if (tbl && node.name in tbl) return tbl[node.name]
                }
                return undefined
        }
        return row?.[node.name]
}
export const evalNode = (input: NodeInput, row: Row | null, ctx: EvalCtx): unknown => {
        const node = asNode(input)
        if (!node) return undefined
        if (node.type === 'literal') return node.value
        if (node.type === 'raw') return node.value
        if (node.type === 'column') return columnValue(node, row, ctx)
        if (node.type === 'currentTuple') return ctx?.current?.[node.col]
        if (node.type === 'placeholder') return ctx?.params?.[node.name]
        if (node.type === 'unop') return evalUnop(node, row, ctx)
        if (node.type === 'binop') return evalBinop(node, row, ctx)
        if (node.type === 'func') return evalFunc(node, row, ctx)
        if (node.type === 'list') return node.items.map((a) => evalNode(a, row, ctx))
        return undefined
}
// evaluate a node against a join row (Record<tableName, Row>); single canonical
// evaluator shared with the flat-row path — no separate join evaluator.
export const evalJoinNode = (input: NodeInput, joinRow: JoinRow, ctx: EvalCtx): unknown => evalNode(input, null, { ...ctx, joinRow })
// SQL NULL: a nullish operand makes arithmetic / comparison UNKNOWN.
const isNullish = (v: unknown): boolean => v === null || v === undefined
// normalize the IEEE-754 negative zero that %, integer division and trunc can
// produce, so -0 reads back as the plain 0 the tests expect.
const noNegZero = (n: number): number => (n === 0 ? 0 : n)
// an expression is integer-typed when it is an integer column, an integer
// literal, or arithmetic between two integer operands. SQL divides two integers
// with truncation, so the evaluator needs this to pick the path.
const isIntExpr = (input: NodeInput): boolean => {
        const node = asNode(input)
        if (!node) return false
        if (node.type === 'column') return node.dataType === 'integer' || node.dataType === 'i32' || node.dataType === 'u32'
        if (node.type === 'literal') return typeof node.value === 'number' && Number.isInteger(node.value)
        if (node.type === 'func') return node.name === 'toInt'
        if (node.type === 'binop') {
                if (node.op === '/') return false
                if (node.op === '+' || node.op === '-' || node.op === '*' || node.op === '%') return isIntExpr(node.args[0]) && isIntExpr(node.args[1])
        }
        return false
}
// glob pattern (% any run, _ one char) compiled to a RegExp.
const likeRegExp = (pattern: string, flags: string): RegExp => {
        let body = ''
        for (const ch of pattern) {
                if (ch === '%') body += '.*'
                else if (ch === '_') body += '.'
                else body += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
        return new RegExp(`^${body}$`, flags)
}
const evalUnop = (node: Extract<SqlNode, { type: 'unop' }>, row: Row | null, ctx: EvalCtx): unknown => {
        const v = evalNode(node.args[0], row, ctx)
        if (node.op === 'isNull') return isNullish(v)
        if (node.op === 'isNotNull') return !isNullish(v)
        if (node.op === 'not') return isNullish(v) ? undefined : !v
        return undefined
}
const evalBinop = (node: Extract<SqlNode, { type: 'binop' }>, row: Row | null, ctx: EvalCtx): unknown => {
        if (node.op === 'and') return node.args.every((a) => !!evalNode(a, row, ctx))
        if (node.op === 'or') return node.args.some((a) => !!evalNode(a, row, ctx))
        const l = evalNode(node.args[0], row, ctx)
        const r = evalNode(node.args[1], row, ctx)
        if (node.op === 'in') return Array.isArray(r) ? (isNullish(l) ? undefined : (r as unknown[]).indexOf(l) >= 0) : undefined
        if (node.op === 'like' || node.op === 'ilike') {
                if (isNullish(l) || isNullish(r)) return undefined
                return likeRegExp(String(r), node.op === 'ilike' ? 'i' : '').test(String(l))
        }
        if (isNullish(l) || isNullish(r)) return undefined
        if (node.op === '=') return l === r
        if (node.op === '!=') return l !== r
        const a = l as number
        const b = r as number
        if (node.op === '<') return a < b
        if (node.op === '<=') return a <= b
        if (node.op === '>') return a > b
        if (node.op === '>=') return a >= b
        if (node.op === '+') return noNegZero(a + b)
        if (node.op === '-') return noNegZero(a - b)
        if (node.op === '*') return noNegZero(a * b)
        if (node.op === '/') {
                const q = a / b
                return isIntExpr(node.args[0]) && isIntExpr(node.args[1]) ? noNegZero(Math.trunc(q)) : q
        }
        if (node.op === '%') return noNegZero(a % b)
        return undefined
}
const evalFunc = (node: Extract<SqlNode, { type: 'func' }>, row: Row | null, ctx: EvalCtx): unknown => {
        const args = node.args.map((a) => evalNode(a, row, ctx))
        if (node.name === 'between') {
                if (isNullish(args[0]) || isNullish(args[1]) || isNullish(args[2])) return undefined
                return (args[0] as number) >= (args[1] as number) && (args[0] as number) <= (args[2] as number)
        }
        if (node.name === 'toFloat') return isNullish(args[0]) ? undefined : Number(args[0])
        if (node.name === 'toInt') return isNullish(args[0]) ? undefined : noNegZero(Math.trunc(Number(args[0])))
        if (node.name === 'toBool') return isNullish(args[0]) ? undefined : !!args[0]
        if (node.name === 'at') return (args[0] as Record<string, unknown>)?.[args[1] as string]
        return undefined
}
export const compilePredicate = (node: NodeInput, ctx: EvalCtx) => (row: Row) => !!evalNode(node, row, ctx)
export const compileExpr = (node: NodeInput, ctx: EvalCtx) => (row: Row) => evalNode(node, row, ctx)
export const colNameOf = (c: unknown): string => {
        if (!c) return ''
        const col = c as { $col?: { name: string }; node?: SqlNode }
        if (col.$col) return col.$col.name
        if (col.node?.type === 'column') return col.node.name
        if (col.node?.type === 'currentTuple') return col.node.col
        return String(c)
}
