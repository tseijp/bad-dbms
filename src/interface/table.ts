import type { Column, Columns } from './column'

export interface TableMeta {
        name: string
        columns: Column[]
}

export type Table = Columns & { $meta: TableMeta; kind: 'sql'; node: any }

const attachTable = (col: Column, name: string, tableName: string): Column => {
        col.$col.name = col.$col.name || name
        col.$col.tableName = tableName
        col.node = { type: 'column', name: col.$col.name, dataType: col.$col.type, tableName }
        return col
}

export const table = (name: string, schema: Columns, _config?: (self: Columns) => any[]): Table => {
        const ret: any = { kind: 'sql', node: { type: 'table', name } }
        const meta: TableMeta = { name, columns: [] }
        for (const key in schema) {
                const col = attachTable(schema[key], key, name)
                ret[key] = col
                meta.columns.push(col)
        }
        ret.$meta = meta
        return ret as Table
}

export const isTable = (v: any): v is Table => !!v && typeof v === 'object' && v.node && v.node.type === 'table'
