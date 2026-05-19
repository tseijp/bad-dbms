import type { SQL } from '../sql'
import { wrap } from '../sql'

const agg = (name: string, distinct: boolean, args: any[]): SQL => ({
        kind: 'sql',
        node: { type: 'aggregate', name, distinct, args: args.map(wrap) },
})

export const count = (expression?: SQL): SQL => agg('count', false, expression ? [expression] : [])

export const countDistinct = (expression: SQL): SQL => agg('count', true, [expression])

export const avg = (expression: SQL): SQL => agg('avg', false, [expression])

export const avgDistinct = (expression: SQL): SQL => agg('avg', true, [expression])

export const sum = (expression: SQL): SQL => agg('sum', false, [expression])

export const sumDistinct = (expression: SQL): SQL => agg('sum', true, [expression])

export const max = <T extends SQL>(expression: T): SQL => agg('max', false, [expression])

export const min = <T extends SQL>(expression: T): SQL => agg('min', false, [expression])
