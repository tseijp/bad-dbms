import type { SqlNode, SQL, Row } from '../shared/types'
import { isNullish } from '../shared/helper'
export type JoinRow = Record<string, Row | null>
export interface EvalCtx {
        current: Row | null
        params: Record<string, unknown> | null
        joinRow?: boolean
}
type NodeInput = SqlNode | SQL | null | undefined
export type Compiled = (row: Row | JoinRow | null) => unknown
const asNode = (node: NodeInput): SqlNode | null => {
        if (!node) return null
        if ((node as SQL).kind === 'sql') return (node as SQL).node
        return node as SqlNode
}
const noNegZero = (n: number): number => (n === 0 ? 0 : n)
const fromJoinRow = (jr: JoinRow, name: string, table?: string): unknown => {
        if (table && Object.prototype.hasOwnProperty.call(jr, table)) {
                const t = jr[table]
                return t ? t[name] : null
        }
        for (const k in jr) {
                const t = jr[k]
                if (t && name in t) return t[name]
        }
        return undefined
}
const isIntExpr = (node: SqlNode | null): boolean => {
        if (!node) return false
        if (node.type === 'column') return node.dataType === 'integer' || node.dataType === 'i32' || node.dataType === 'u32'
        if (node.type === 'literal') return typeof node.value === 'number' && Number.isInteger(node.value)
        if (node.type === 'func') return node.name === 'toInt'
        if (node.type !== 'binop' || node.op === '/') return false
        if (node.op === '+' || node.op === '-' || node.op === '*' || node.op === '%') return isIntExpr(asNode(node.args[0])) && isIntExpr(asNode(node.args[1]))
        return false
}
const likeRegExp = (pattern: string, flags: string): RegExp => {
        let body = ''
        for (const ch of pattern) {
                if (ch === '%') body += '.*'
                else if (ch === '_') body += '.'
                else body += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
        return new RegExp(`^${body}$`, flags)
}
const RAW: Record<string, (a: any, b: any) => unknown> = {
        '=': (a, b) => a === b,
        '!=': (a, b) => a !== b,
        in: (a, b) => (Array.isArray(b) ? (isNullish(a) ? undefined : b.indexOf(a) >= 0) : undefined),
        like: (a, b) => (isNullish(a) || isNullish(b) ? undefined : likeRegExp(String(b), '').test(String(a))),
        ilike: (a, b) => (isNullish(a) || isNullish(b) ? undefined : likeRegExp(String(b), 'i').test(String(a))),
        '<': (a, b) => a < b,
        '<=': (a, b) => a <= b,
        '>': (a, b) => a > b,
        '>=': (a, b) => a >= b,
        '+': (a, b) => noNegZero(a + b),
        '-': (a, b) => noNegZero(a - b),
        '*': (a, b) => noNegZero(a * b),
        '%': (a, b) => noNegZero(a % b),
}
const NULL_PROP = new Set(['=', '!=', '<', '<=', '>', '>=', '+', '-', '*', '%', '/'])
export const binopFn = (op: string, intDiv = false): ((a: unknown, b: unknown) => unknown) => {
        const raw = op === '/' ? (a: any, b: any) => (intDiv ? noNegZero(Math.trunc(a / b)) : a / b) : (RAW[op] ?? (() => undefined))
        if (!NULL_PROP.has(op)) return raw
        return (a, b) => (isNullish(a) || isNullish(b) ? undefined : raw(a, b))
}
const UNOP: Record<string, (v: any) => unknown> = {
        isNull: (v) => isNullish(v),
        isNotNull: (v) => !isNullish(v),
        not: (v) => (isNullish(v) ? undefined : !v),
}
const FUNC: Record<string, (a: any[]) => unknown> = {
        between: (a) => (a.some(isNullish) ? undefined : a[0] >= a[1] && a[0] <= a[2]),
        toFloat: (a) => (isNullish(a[0]) ? undefined : Number(a[0])),
        toInt: (a) => (isNullish(a[0]) ? undefined : noNegZero(Math.trunc(Number(a[0])))),
        toBool: (a) => (isNullish(a[0]) ? undefined : !!a[0]),
}
export const compileNode = (input: NodeInput, ctx: EvalCtx): Compiled => {
        const node = asNode(input)
        if (!node) return () => undefined
        if (node.type === 'literal') {
                const v = node.value
                return () => v
        }
        if (node.type === 'column') {
                const { name, tableName } = node
                if (ctx.joinRow) return (row) => fromJoinRow(row as JoinRow, name, tableName)
                return (row) => (row as Row | null)?.[name]
        }
        if (node.type === 'list') {
                const items = node.items.map((a) => compileNode(a, ctx))
                return (row) => items.map((fn) => fn(row))
        }
        if (node.type === 'unop') {
                const fn = UNOP[node.op] ?? (() => undefined)
                return ((arg) => (row) => fn(arg(row)))(compileNode(node.args[0], ctx))
        }
        if (node.type === 'func') {
                const args = node.args.map((a) => compileNode(a, ctx))
                const fn = FUNC[node.name] ?? (() => undefined)
                return (row) => fn(args.map((a) => a(row)))
        }
        if (node.type === 'binop') {
                const args = node.args.map((a) => compileNode(a, ctx))
                if (node.op === 'and') return (row) => args.every((a) => !!a(row))
                if (node.op === 'or') return (row) => args.some((a) => !!a(row))
                const intDiv = node.op === '/' && isIntExpr(asNode(node.args[0])) && isIntExpr(asNode(node.args[1]))
                const fn = binopFn(node.op, intDiv)
                const [l, r] = args
                return (row) => fn(l(row), r(row))
        }
        return () => undefined
}
export const compilePredicate = (node: NodeInput, ctx: EvalCtx): ((row: Row) => boolean) => {
        const fn = compileNode(node, ctx)
        return (row) => !!fn(row)
}
export const compileExpr = (node: NodeInput, ctx: EvalCtx): ((row: Row) => unknown) => {
        const fn = compileNode(node, ctx)
        return (row) => fn(row)
}
export const colNameOf = (c: unknown): string => {
        const col = c as { $col?: { key?: string; name: string }; node?: SqlNode }
        if (col.$col) return col.$col.key ?? col.$col.name
        if (col.node?.type === 'column') return col.node.name
        return String(c)
}
