import type { SQL, ColumnType, ColumnConfig, ColumnDescriptor } from '../shared/types'
import type { Column } from './types'
import { make } from './sql'
export type { ColumnConfig, ColumnDescriptor } from '../shared/types'
export type { Column, Columns } from './types'
export const dataTypeOf = (type: ColumnType, tag?: 'str'): string => {
        if (tag === 'str') return 'text'
        if (type === 'f32') return 'float'
        return 'integer'
}
export const column = <T = number>(type: ColumnType, name?: string, { tag, ...config }: ColumnConfig = {}): Column<T> => {
        const _desc: ColumnDescriptor = { name: name ?? '', type, tag, ...config }
        const self = make({ type: 'column', name: _desc.name, dataType: dataTypeOf(type, tag) }) as unknown as Column<T>
        self.$col = _desc
        self.primaryKey = () => ((_desc.primaryKey = true), self)
        self.unique = () => ((_desc.unique = true), self)
        self.notNull = () => ((_desc.notNull = true), self)
        self.default = (value: T) => ((_desc.defaultValue = value), self)
        self.$defaultFn = (fn: () => T) => ((_desc.defaultFn = fn), (self.defaultFn = fn as Column<T>['defaultFn']), self)
        self.defaultFn = self.$defaultFn
        self.references = (fn: () => SQL, opts?: { onDelete?: string; onUpdate?: string }) => {
                _desc.references = { fn, onDelete: opts?.onDelete, onUpdate: opts?.onUpdate }
                return self
        }
        return self
}
export const text = (name?: string, config?: ColumnConfig): Column<string> => column<string>('u32', name, { ...config, tag: 'str' })
export const integer = (name?: string, config?: ColumnConfig): Column<number> => column<number>('i32', name, config)
export const float = (name?: string, config?: ColumnConfig): Column<number> => column<number>('f32', name, config)
export const uint = (name?: string, config?: ColumnConfig): Column<number> => column<number>('u32', name, config)
