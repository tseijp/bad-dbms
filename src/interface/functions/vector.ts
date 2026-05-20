import type { SQL } from '../sql'
import type { Column } from '../column'
import { wrap } from '../sql'
type Vec = number[] | string[] | string
const vecFn = (name: string, col: SQL | Column, value: Vec): SQL => ({
        kind: 'sql',
        node: { type: 'func', name, args: [col, wrap(value)] },
})
export const l2Distance = (col: SQL | Column, value: Vec): SQL => vecFn('l2Distance', col, value)
export const l1Distance = (col: SQL | Column, value: Vec): SQL => vecFn('l1Distance', col, value)
export const innerProduct = (col: SQL | Column, value: Vec): SQL => vecFn('innerProduct', col, value)
export const cosineDistance = (col: SQL | Column, value: Vec): SQL => vecFn('cosineDistance', col, value)
export const hammingDistance = (col: SQL | Column, value: Vec): SQL => vecFn('hammingDistance', col, value)
export const jaccardDistance = (col: SQL | Column, value: Vec): SQL => vecFn('jaccardDistance', col, value)
