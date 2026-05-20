export interface EvalCtx {
        current: any
        params: any
}
export const evalNode = (node: any, row: any, ctx: EvalCtx): any => {
        if (!node) return undefined
        if (node.kind === 'sql') return evalNode(node.node, row, ctx)
        if (node.type === 'literal') return node.value
        if (node.type === 'raw') return node.value
        if (node.type === 'column') return row?.[node.name]
        if (node.type === 'currentTuple') return ctx?.current?.[node.col]
        if (node.type === 'placeholder') return ctx?.params?.[node.name]
        if (node.type === 'unop') return evalUnop(node, row, ctx)
        if (node.type === 'binop') return evalBinop(node, row, ctx)
        if (node.type === 'func') return evalFunc(node, row, ctx)
        if (node.type === 'list') return node.items.map((a: any) => evalNode(a, row, ctx))
        return undefined
}
const evalUnop = (node: any, row: any, ctx: EvalCtx): any => {
        const v = evalNode(node.args[0], row, ctx)
        if (node.op === 'not') return !v
        if (node.op === 'isNull') return v === null || v === undefined
        if (node.op === 'isNotNull') return v !== null && v !== undefined
        return undefined
}
const evalBinop = (node: any, row: any, ctx: EvalCtx): any => {
        if (node.op === 'and') return node.args.every((a: any) => !!evalNode(a, row, ctx))
        if (node.op === 'or') return node.args.some((a: any) => !!evalNode(a, row, ctx))
        const l = evalNode(node.args[0], row, ctx)
        const r = evalNode(node.args[1], row, ctx)
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
        if (node.op === 'in') return Array.isArray(r) && r.indexOf(l) >= 0
        return undefined
}
const evalFunc = (node: any, row: any, ctx: EvalCtx): any => {
        const args = node.args.map((a: any) => evalNode(a, row, ctx))
        if (node.name === 'between') return args[0] >= args[1] && args[0] <= args[2]
        if (node.name === 'toFloat') return Number(args[0])
        if (node.name === 'toInt') return Math.trunc(args[0])
        if (node.name === 'toBool') return !!args[0]
        if (node.name === 'at') return args[0]?.[args[1]]
        return undefined
}
export const compilePredicate = (node: any, ctx: EvalCtx) => (row: any) => !!evalNode(node, row, ctx)
export const compileExpr = (node: any, ctx: EvalCtx) => (row: any) => evalNode(node, row, ctx)
export const colNameOf = (c: any): string => {
        if (!c) return ''
        if (c.$col) return c.$col.name
        if (c.node?.type === 'column') return c.node.name
        if (c.node?.type === 'currentTuple') return c.node.col
        return String(c)
}
