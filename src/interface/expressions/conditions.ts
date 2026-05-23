import type { SQL, BinOp, UnOp, SqlValue, Operand } from '../../shared/types'
import { wrap, make } from '../sql'
type Bool = SQL<boolean>
const binop = (op: BinOp, left: SqlValue, right: SqlValue): Bool => make({ type: 'binop', op, args: [wrap(left), wrap(right)] })
const unop = (op: UnOp, arg: SqlValue): Bool => make({ type: 'unop', op, args: [wrap(arg)] })
const func = (name: string, args: SqlValue[]): Bool => make({ type: 'func', name, args: args.map(wrap) })
export const eq = <T>(left: Operand<T>, right: Operand<T>): Bool => binop('=', left as SqlValue, right as SqlValue)
export const ne = <T>(left: Operand<T>, right: Operand<T>): Bool => binop('!=', left as SqlValue, right as SqlValue)
export const gt = <T>(left: Operand<T>, right: Operand<T>): Bool => binop('>', left as SqlValue, right as SqlValue)
export const gte = <T>(left: Operand<T>, right: Operand<T>): Bool => binop('>=', left as SqlValue, right as SqlValue)
export const lt = <T>(left: Operand<T>, right: Operand<T>): Bool => binop('<', left as SqlValue, right as SqlValue)
export const lte = <T>(left: Operand<T>, right: Operand<T>): Bool => binop('<=', left as SqlValue, right as SqlValue)
const combine = (op: 'and' | 'or', conditions: (Bool | undefined)[]): Bool => {
        const xs = conditions.filter((c): c is Bool => !!c)
        if (xs.length === 1) return xs[0]
        return make({ type: 'binop', op, args: xs })
}
export const and = (...conditions: (Bool | undefined)[]): Bool => combine('and', conditions)
export const or = (...conditions: (Bool | undefined)[]): Bool => combine('or', conditions)
export const not = (condition: Bool): Bool => unop('not', condition)
export const inArray = <T>(col: SQL<T>, values: ReadonlyArray<Operand<T>>): Bool =>
        make({ type: 'binop', op: 'in', args: [col, make({ type: 'list', items: (values as SqlValue[]).map(wrap) })] })
export const notInArray = <T>(col: SQL<T>, values: ReadonlyArray<Operand<T>>): Bool => not(inArray(col, values))
export const isNull = (value: SQL): Bool => unop('isNull', value)
export const isNotNull = (value: SQL): Bool => unop('isNotNull', value)
export const between = <T>(col: SQL<T>, min: Operand<T>, max: Operand<T>): Bool => func('between', [col, min as SqlValue, max as SqlValue])
export const notBetween = <T>(col: SQL<T>, min: Operand<T>, max: Operand<T>): Bool => not(between(col, min, max))
export const like = (col: SQL, value: Operand<string>): Bool => binop('like', col, value as SqlValue)
export const notLike = (col: SQL, value: Operand<string>): Bool => not(like(col, value))
export const ilike = (col: SQL, value: Operand<string>): Bool => binop('ilike', col, value as SqlValue)
