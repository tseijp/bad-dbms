import { dataTypeOf } from './column'
import type { Column, TableMeta } from './types'
import type { ColumnsShape, Table } from './infer'
export type { TableMeta } from './types'
export const finalizeColumn = (col: Column, key: string, tableName: string): Column => {
        const desc = col.$col
        desc.name = desc.name || key
        desc.key = key
        desc.tableName = tableName
        const dt = dataTypeOf(desc.type, desc.tag)
        col.node = { type: 'column', name: key, dataType: dt, tableName }
        const meta = col as unknown as Record<string, unknown>
        meta.name = desc.name
        meta.dataType = dt
        meta.columnType = dt
        meta.primary = !!desc.primaryKey
        meta.isUnique = !!desc.unique
        meta.notNull = !!desc.notNull || !!desc.primaryKey
        meta.hasDefault = desc.defaultValue !== undefined || !!desc.defaultFn
        meta.default = desc.defaultValue
        meta.$defaultFn = desc.defaultFn
        return col
}
export const table = <S extends ColumnsShape>(name: string, schema: S): Table<S> => {
        const meta: TableMeta = { name, columns: [] }
        const ret = { kind: 'sql', node: { type: 'table', name }, $meta: meta } as Table<S>
        for (const key in schema) {
                const col = finalizeColumn(schema[key], key, name)
                ;(ret as Record<string, unknown>)[key] = col
                meta.columns.push(col)
        }
        return ret
}
