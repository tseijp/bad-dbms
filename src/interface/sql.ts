import type { SQL, SqlNode } from '../shared/types'
export * from './expressions/conditions'
export * from './expressions/select'
export * from './functions/aggregate'
export type { SQL, SqlNode, NodeType } from '../shared/types'
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
        return s as SQL
}
export const make = <T = unknown>(node: SqlNode): SQL<T> => attach({ kind: 'sql', node }) as SQL<T>
export const isSQL = (v: unknown): v is SQL => !!v && typeof v === 'object' && (v as { kind?: string }).kind === 'sql'
export const wrap = (v: unknown): SQL => (isSQL(v) ? v : make({ type: 'literal', value: v }))
