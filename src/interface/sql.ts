import type { SQL, SqlNode, Placeholder, SQLChunk } from '../shared/types'
export * from './expressions/conditions'
export * from './expressions/select'
export * from './functions/aggregate'
export * from './functions/vector'
export type { SQL, SqlNode, Placeholder, SQLChunk, NodeType, Encoder } from '../shared/types'
type PartialSQL = Partial<SQL> & { kind: 'sql'; node: SqlNode }
const attach = (s: PartialSQL): SQL => {
        s.toFloat = () => attach({ kind: 'sql', node: { type: 'func', name: 'toFloat', args: [s as SQL] } })
        s.toInt = () => attach({ kind: 'sql', node: { type: 'func', name: 'toInt', args: [s as SQL] } })
        s.toBool = () => attach({ kind: 'sql', node: { type: 'func', name: 'toBool', args: [s as SQL] } })
        s.add = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '+', args: [s as SQL, wrap(o)] } })
        s.sub = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '-', args: [s as SQL, wrap(o)] } })
        s.mul = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '*', args: [s as SQL, wrap(o)] } })
        s.div = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '/', args: [s as SQL, wrap(o)] } })
        s.mod = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '%', args: [s as SQL, wrap(o)] } })
        s.eq = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '=', args: [s as SQL, wrap(o)] } })
        s.ne = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '!=', args: [s as SQL, wrap(o)] } })
        s.lt = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '<', args: [s as SQL, wrap(o)] } })
        s.lte = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '<=', args: [s as SQL, wrap(o)] } })
        s.gt = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '>', args: [s as SQL, wrap(o)] } })
        s.gte = (o) => attach({ kind: 'sql', node: { type: 'binop', op: '>=', args: [s as SQL, wrap(o)] } })
        s.at = (i) => attach({ kind: 'sql', node: { type: 'func', name: 'at', args: [s as SQL, wrap(i)] } })
        return s as SQL
}
export const make = <T = unknown>(node: SqlNode): SQL<T> => attach({ kind: 'sql', node }) as SQL<T>
export const isSQL = (v: unknown): v is SQL => !!v && typeof v === 'object' && (v as { kind?: string }).kind === 'sql'
export const wrap = (v: unknown): SQL => {
        if (isSQL(v)) return v
        return make({ type: 'literal', value: v })
}
export const raw = (str: string): SQL => make({ type: 'raw', value: str })
export const identifier = (name: string): SQL => make({ type: 'identifier', name })
export const placeholder = (name: string): Placeholder => make({ type: 'placeholder', name })
export const param = <T>(value: T, encoder?: unknown): SQL => make({ type: 'literal', value, encoder })
export const empty = (): SQL => make({ type: 'raw', value: '' })
export const fromList = (list: SQLChunk[]): SQL => make({ type: 'list', items: list.map(wrap) })
export const join = (chunks: SQLChunk[], separator?: SQLChunk): SQL => {
        const items: SQL[] = []
        const sep = separator === undefined ? undefined : wrap(separator)
        for (let i = 0; i < chunks.length; i++) {
                if (i > 0 && sep) items.push(sep)
                items.push(wrap(chunks[i]))
        }
        return make({ type: 'list', items })
}
export const sql = (strings: TemplateStringsArray | SQLChunk[], ...values: SQLChunk[]): SQL => {
        const parts: SQL[] = []
        const arr: readonly unknown[] = Array.isArray(strings) ? strings : strings
        for (let i = 0; i < arr.length; i++) {
                const s = String(arr[i])
                if (s.length > 0) parts.push(raw(s))
                if (i < values.length) parts.push(wrap(values[i]))
        }
        return make({ type: 'list', items: parts })
}
