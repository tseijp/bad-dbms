import type { SQL, Placeholder } from '../sql'
import { wrap } from '../sql'
const attach = (sql: SQL): SQL => {
        sql.toFloat = () => attach({ kind: 'sql', node: { type: 'func', name: 'toFloat', args: [sql] } })
        sql.toInt = () => attach({ kind: 'sql', node: { type: 'func', name: 'toInt', args: [sql] } })
        sql.add = (o: any) => attach({ kind: 'sql', node: { type: 'binop', op: '+', args: [sql, wrap(o)] } })
        sql.sub = (o: any) => attach({ kind: 'sql', node: { type: 'binop', op: '-', args: [sql, wrap(o)] } })
        sql.mul = (o: any) => attach({ kind: 'sql', node: { type: 'binop', op: '*', args: [sql, wrap(o)] } })
        sql.div = (o: any) => attach({ kind: 'sql', node: { type: 'binop', op: '/', args: [sql, wrap(o)] } })
        return sql
}
const make = (node: any): SQL => attach({ kind: 'sql', node })
const binop = (op: string, left: any, right: any): SQL => make({ type: 'binop', op, args: [wrap(left), wrap(right)] })
const unop = (op: string, arg: any): SQL => make({ type: 'unop', op, args: [wrap(arg)] })
const func = (name: string, args: any[]): SQL => make({ type: 'func', name, args: args.map(wrap) })
export const bindIfParam = (value: unknown, _column: SQL): SQL => wrap(value)
export const eq = (left: any, right: unknown): SQL => binop('=', left, right)
export const ne = (left: any, right: unknown): SQL => binop('!=', left, right)
export const gt = (left: any, right: unknown): SQL => binop('>', left, right)
export const gte = (left: any, right: unknown): SQL => binop('>=', left, right)
export const lt = (left: any, right: unknown): SQL => binop('<', left, right)
export const lte = (left: any, right: unknown): SQL => binop('<=', left, right)
export const and = (...conditions: (SQL | undefined)[]): SQL | undefined => {
        const xs = conditions.filter((c): c is SQL => !!c)
        if (xs.length === 0) return undefined
        if (xs.length === 1) return xs[0]
        return make({ type: 'binop', op: 'and', args: xs })
}
export const or = (...conditions: (SQL | undefined)[]): SQL | undefined => {
        const xs = conditions.filter((c): c is SQL => !!c)
        if (xs.length === 0) return undefined
        if (xs.length === 1) return xs[0]
        return make({ type: 'binop', op: 'or', args: xs })
}
export const not = (condition: SQL): SQL => unop('not', condition)
export const inArray = (col: SQL, values: ReadonlyArray<unknown | Placeholder> | SQL): SQL => {
        if ((values as any).kind === 'sql') return make({ type: 'binop', op: 'in', args: [col, values] })
        return make({ type: 'binop', op: 'in', args: [col, { kind: 'sql', node: { type: 'list', items: (values as any[]).map(wrap) } }] })
}
export const notInArray = (col: SQL, values: (unknown | Placeholder)[] | SQL): SQL => not(inArray(col, values as any))
export const isNull = (value: SQL): SQL => unop('isNull', value)
export const isNotNull = (value: SQL): SQL => unop('isNotNull', value)
export const exists = (subquery: SQL): SQL => unop('exists', subquery)
export const notExists = (subquery: SQL): SQL => unop('notExists', subquery)
export const between = (col: SQL, min: unknown, max: unknown): SQL => func('between', [col, min, max])
export const notBetween = (col: SQL, min: unknown, max: unknown): SQL => not(between(col, min, max))
export const like = (col: any, value: any): SQL => binop('like', col, value)
export const notLike = (col: any, value: any): SQL => not(like(col, value))
export const ilike = (col: any, value: any): SQL => binop('ilike', col, value)
export const notIlike = (col: any, value: any): SQL => not(ilike(col, value))
export const arrayContains = (col: SQL, values: any): SQL => func('arrayContains', [col, values])
export const arrayContained = (col: SQL, values: any): SQL => func('arrayContained', [col, values])
export const arrayOverlaps = (col: SQL, values: any): SQL => func('arrayOverlaps', [col, values])
