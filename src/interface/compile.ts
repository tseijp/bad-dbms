import type { SqlNode, SQL, Row } from '../shared/types'

export interface EvalCtx {
        current: Row | null
        params: Record<string, unknown> | null
}

type NodeInput = SqlNode | SQL | null | undefined

const asNode = (node: NodeInput): SqlNode | null => {
        if (!node) return null
        if ((node as SQL).kind === 'sql') return (node as SQL).node
        return node as SqlNode
}

export const evalNode = (input: NodeInput, row: Row | null, ctx: EvalCtx): unknown => {
        const node = asNode(input)
        if (!node) return undefined
        if (node.type === 'literal') return node.value
        if (node.type === 'raw') return node.value
        if (node.type === 'column') return row?.[node.name]
        if (node.type === 'currentTuple') return ctx?.current?.[node.col]
        if (node.type === 'placeholder') return ctx?.params?.[node.name]
        if (node.type === 'unop') return evalUnop(node, row, ctx)
        if (node.type === 'binop') return evalBinop(node, row, ctx)
        if (node.type === 'func') return evalFunc(node, row, ctx)
        if (node.type === 'list') return node.items.map((a) => evalNode(a, row, ctx))
        return undefined
}

const evalUnop = (node: Extract<SqlNode, { type: 'unop' }>, row: Row | null, ctx: EvalCtx): unknown => {
        const v = evalNode(node.args[0], row, ctx)
        if (node.op === 'not') return !v
        if (node.op === 'isNull') return v === null || v === undefined
        if (node.op === 'isNotNull') return v !== null && v !== undefined
        return undefined
}

const evalBinop = (node: Extract<SqlNode, { type: 'binop' }>, row: Row | null, ctx: EvalCtx): unknown => {
        if (node.op === 'and') return node.args.every((a) => !!evalNode(a, row, ctx))
        if (node.op === 'or') return node.args.some((a) => !!evalNode(a, row, ctx))
        const l = evalNode(node.args[0], row, ctx) as number
        const r = evalNode(node.args[1], row, ctx) as number
        if (node.op === '=') return l === r
        if (node.op === '!=') return l !== r
        if (node.op === '<') return l < r
        if (node.op === '<=') return l <= r
        if (node.op === '>') return l > r
        if (node.op === '>=') return l >= r
        if (node.op === '+') return l + r
        if (node.op === '-') return l - r
        if (node.op === '*') return l * r
        if (node.op === '/') return l / r
        if (node.op === '%') return l % r
        if (node.op === 'in') return Array.isArray(r) && (r as unknown[]).indexOf(l) >= 0
        return undefined
}

const evalFunc = (node: Extract<SqlNode, { type: 'func' }>, row: Row | null, ctx: EvalCtx): unknown => {
        const args = node.args.map((a) => evalNode(a, row, ctx))
        if (node.name === 'between') return (args[0] as number) >= (args[1] as number) && (args[0] as number) <= (args[2] as number)
        if (node.name === 'toFloat') return Number(args[0])
        if (node.name === 'toInt') return Math.trunc(Number(args[0]))
        if (node.name === 'toBool') return !!args[0]
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
