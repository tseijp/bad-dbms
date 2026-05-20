import type { Column, Columns, Table, TableMeta } from './types'

export type { Table, TableMeta } from './types'

const attachTable = (col: Column, name: string, tableName: string): Column => {
        col.$col.name = col.$col.name || name
        col.$col.tableName = tableName
        col.node = { type: 'column', name: col.$col.name, dataType: col.$col.type, tableName }
        return col
}

export const table = <S extends Columns>(name: string, schema: S, _config?: (self: S) => unknown[]): Table<S> => {
        const meta: TableMeta = { name, columns: [] }
        const ret = { kind: 'sql' as const, node: { type: 'table' as const, name }, $meta: meta } as Table<S>
        for (const key in schema) {
                const col = attachTable(schema[key], key, name)
                ;(ret as Record<string, unknown>)[key] = col
                meta.columns.push(col)
        }
        return ret
}

export const isTable = (v: unknown): v is Table => {
        if (!v || typeof v !== 'object') return false
        const node = (v as { node?: { type?: string } }).node
        return !!node && node.type === 'table'
}
