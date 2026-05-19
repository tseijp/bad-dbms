import type { SQL } from './sql'

export interface ColumnConfig {
        primaryKey?: boolean
        unique?: boolean
        notNull?: boolean
        defaultValue?: any
        defaultFn?: () => any
        hasOrder?: boolean
        orderRange?: [number, number]
        references?: { fn: () => SQL; onDelete?: string }
}

export interface ColumnDescriptor extends ColumnConfig {
        name: string
        type: string
        tableName?: string
}

export interface Column {
        kind: 'sql'
        node: any
        $col: ColumnDescriptor
        primaryKey: () => Column
        unique: () => Column
        notNull: () => Column
        default: (value: any) => Column
        $defaultFn: (fn: () => any) => Column
        defaultFn: (fn: () => any) => Column
        references: (fn: () => SQL, opts?: { onDelete?: string }) => Column
        order: (min: number, max: number) => Column
        at: (index: any) => SQL
}

const buildNode = (desc: ColumnDescriptor) => ({ type: 'column', name: desc.name, dataType: desc.type, tableName: desc.tableName })

export const column = (type: string, name?: string, config: ColumnConfig = {}): Column => {
        const desc: ColumnDescriptor = { name: name || '', type, ...config }
        const self: Column = {
                kind: 'sql',
                node: buildNode(desc),
                $col: desc,
                primaryKey() {
                        desc.primaryKey = true
                        return self
                },
                unique() {
                        desc.unique = true
                        return self
                },
                notNull() {
                        desc.notNull = true
                        return self
                },
                default(value: any) {
                        desc.defaultValue = value
                        return self
                },
                $defaultFn(fn: () => any) {
                        desc.defaultFn = fn
                        return self
                },
                defaultFn(fn: () => any) {
                        desc.defaultFn = fn
                        return self
                },
                references(fn: () => SQL, opts?: { onDelete?: string }) {
                        desc.references = { fn, onDelete: opts?.onDelete }
                        return self
                },
                order(min: number, max: number) {
                        desc.hasOrder = true
                        desc.orderRange = [min, max]
                        return self
                },
                at(index: any) {
                        return { kind: 'sql', node: { type: 'func', name: 'at', args: [self, index] } } as SQL
                },
        }
        return self
}

export type Columns = Record<string, Column>

export const text = (name?: string, config?: ColumnConfig) => column('text', name, config)
export const integer = (name?: string, config?: ColumnConfig) => column('i32', name, config)
export const float = (name?: string, config?: ColumnConfig) => column('f32', name, config)
export const uint = (name?: string, config?: ColumnConfig) => column('u32', name, config)
