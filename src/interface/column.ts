import type { SQL, SqlNode, ColumnType, ColumnConfig, ColumnDescriptor } from '../shared/types'
import type { Column } from './types'
import { wrap, make } from './sql'
export type { ColumnConfig, ColumnDescriptor } from '../shared/types'
export type { Column, Columns } from './types'
const exprNode = (self: SQL): SqlNode => self.node
const dataTypeOf = (type: ColumnType, tag?: 'str'): string => {
        if (tag === 'str') return 'text'
        if (type === 'f32') return 'float'
        return 'integer'
}
const column = <T = number>(type: ColumnType, name?: string, config: ColumnConfig = {}): Column<T> => {
        const _desc: ColumnDescriptor = { name: name ?? '', type, ...config }
        const _base = make({ type: 'column', name: _desc.name, dataType: dataTypeOf(type, config.tag) })
        const self = _base as unknown as Column<T>
        self.$col = _desc
        self.primaryKey = () => {
                _desc.primaryKey = true
                return self
        }
        self.unique = () => {
                _desc.unique = true
                return self
        }
        self.notNull = () => {
                _desc.notNull = true
                return self
        }
        self.default = (value: T) => {
                _desc.defaultValue = value
                return self
        }
        self.$defaultFn = (fn: () => T) => {
                _desc.defaultFn = fn
                return self
        }
        self.defaultFn = self.$defaultFn
        self.references = (fn: () => SQL, opts?: { onDelete?: string; onUpdate?: string }) => {
                _desc.references = { fn, onDelete: opts?.onDelete, onUpdate: opts?.onUpdate }
                return self
        }
        self.order = (min: number, max: number) => {
                _desc.hasOrder = true
                _desc.orderRange = [min, max]
                return self
        }
        return self
}
export const wrapExpr = (s: SQL): SQL => wrap(s)
export { column, exprNode, dataTypeOf }
export const text = (name?: string, config?: ColumnConfig): Column<string> => column<string>('u32', name, { ...config, tag: 'str' })
export const integer = (name?: string, config?: ColumnConfig): Column<number> => column<number>('i32', name, config)
export const float = (name?: string, config?: ColumnConfig): Column<number> => column<number>('f32', name, config)
export const uint = (name?: string, config?: ColumnConfig): Column<number> => column<number>('u32', name, config)
