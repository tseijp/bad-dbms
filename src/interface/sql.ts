import { Column } from './column'
import { Table } from './table'
export * from './expressions/conditions'
export * from './expressions/select'
export * from './functions/aggregate'
export * from './functions/vector'

export interface SQL<T = unknown> {}

export type SQLChunk =
        | string //
        | SQLChunk[]
        | Placeholder
        | SQL
        | Column
        | Table

export type Encoder = {}

export interface Placeholder {}

export const sql = () => {
        return {} as SQL
}

export const empty = () => {}

export const fromList = (list: SQLChunk[]) => {}

export const raw = (str: string) => {}

export const join = (chunks: SQLChunk[], separator?: SQLChunk) => {}

export const identifier = (value: string) => {}

export const placeholder = (name: string) => {}

export const param = <T>(value: T, encoder?: Encoder) => {}
