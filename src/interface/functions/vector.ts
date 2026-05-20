import type { SQL } from '../../shared/types'
import type { Column } from '../types'
import { wrap, make } from '../sql'
type Vec = number[] | string[] | string
const vecFn = (name: string, col: SQL | Column, value: Vec): SQL<number> => make({ type: 'func', name, args: [col, wrap(value)] })
export const l2Distance = (col: SQL | Column, value: Vec): SQL<number> => vecFn('l2Distance', col, value)
export const l1Distance = (col: SQL | Column, value: Vec): SQL<number> => vecFn('l1Distance', col, value)
export const innerProduct = (col: SQL | Column, value: Vec): SQL<number> => vecFn('innerProduct', col, value)
export const cosineDistance = (col: SQL | Column, value: Vec): SQL<number> => vecFn('cosineDistance', col, value)
export const hammingDistance = (col: SQL | Column, value: Vec): SQL<number> => vecFn('hammingDistance', col, value)
export const jaccardDistance = (col: SQL | Column, value: Vec): SQL<number> => vecFn('jaccardDistance', col, value)
