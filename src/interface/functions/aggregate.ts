import type { SQL, AggKind } from '../../shared/types'
import { wrap, make } from '../sql'
const agg = <R = unknown>(name: AggKind, distinct: boolean, args: SQL[]): SQL<R> => make<R>({ type: 'aggregate', name, distinct, args })
export const count = (expression?: SQL): SQL<number> => agg('count', false, expression ? [wrap(expression)] : [])
export const countDistinct = (expression: SQL): SQL<number> => agg('count', true, [wrap(expression)])
export const avg = (expression: SQL): SQL<number> => agg('avg', false, [wrap(expression)])
export const avgDistinct = (expression: SQL): SQL<number> => agg('avg', true, [wrap(expression)])
export const sum = (expression: SQL): SQL<number> => agg('sum', false, [wrap(expression)])
export const sumDistinct = (expression: SQL): SQL<number> => agg('sum', true, [wrap(expression)])
export const max = <T>(expression: SQL<T>): SQL<T> => agg('max', false, [wrap(expression)])
export const min = <T>(expression: SQL<T>): SQL<T> => agg('min', false, [wrap(expression)])
