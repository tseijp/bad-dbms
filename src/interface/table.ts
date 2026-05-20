import type { Column, Columns } from './column'
export interface TableMeta {
        name: string
        columns: Column[]
}
export type Table<Key extends string = string> = Columns & { $meta: TableMeta; kind: 'sql'; node: any }
const attachTable = (col: Column, name: string, tableName: string): Column => {
        col.$col.name = col.$col.name || name
        col.$col.tableName = tableName
        col.node = { type: 'column', name: col.$col.name, dataType: col.$col.type, tableName }
        return col
}
export const table = <Key extends string>(name: string, schema: Columns<Key>, _config?: (self: Columns) => any[]): Table<Key> => {
        const ret: any = { kind: 'sql', node: { type: 'table', name } }
        const _meta: TableMeta = { name, columns: [] }
        for (const key in schema) {
                const col = attachTable(schema[key], key, name)
                ret[key] = col
                _meta.columns.push(col)
        }
        ret.$meta = _meta
        return ret
}
export const isTable = (v: any): v is Table => !!v && typeof v === 'object' && v.node && v.node.type === 'table'
