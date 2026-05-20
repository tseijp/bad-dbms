import type { SQL, SqlNode, ColumnType, ColumnConfig, ColumnDescriptor } from '../shared/types'
import type { Column } from './types'
import { wrap, make } from './sql'
export type { ColumnConfig, ColumnDescriptor } from '../shared/types'
export type { Column, Columns } from './types'
const exprNode = (self: SQL): SqlNode => self.node
const column = <T = number>(type: ColumnType, name?: string, config: ColumnConfig = {}): Column<T> => {
        const desc: ColumnDescriptor = { name: name ?? '', type, ...config }
        const base = make({ type: 'column', name: desc.name, dataType: type })
        const self = base as unknown as Column<T>
        self.$col = desc
        self.primaryKey = () => {
                desc.primaryKey = true
                return self
        }
        self.unique = () => {
                desc.unique = true
                return self
        }
        self.notNull = () => {
                desc.notNull = true
                return self
        }
        self.default = (value: T) => {
                desc.defaultValue = value
                return self
        }
        self.$defaultFn = (fn: () => T) => {
                desc.defaultFn = fn
                return self
        }
        self.defaultFn = self.$defaultFn
        self.references = (fn: () => SQL, opts?: { onDelete?: string }) => {
                desc.references = { fn, onDelete: opts?.onDelete }
                return self
        }
        self.order = (min: number, max: number) => {
                desc.hasOrder = true
                desc.orderRange = [min, max]
                return self
        }
        return self
}
export const wrapExpr = (s: SQL): SQL => wrap(s)
export { column, exprNode }
export const text = (name?: string, config?: ColumnConfig): Column<number> => column<number>('u32', name, { ...config, tag: 'str' })
export const integer = (name?: string, config?: ColumnConfig): Column<number> => column<number>('i32', name, config)
export const float = (name?: string, config?: ColumnConfig): Column<number> => column<number>('f32', name, config)
export const uint = (name?: string, config?: ColumnConfig): Column<number> => column<number>('u32', name, config)
