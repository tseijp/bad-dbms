import type { SQL, SqlValue, JoinKind } from '../shared/types'
import type { TypedColumn, Table } from './infer'

export type { SQL, SqlNode, SqlValue, NodeType, BinOp, UnOp, AggKind, ColumnType, ColumnConfig, ColumnDescriptor, ExprMethods, Rid, Row, PhysicalOp, JoinKind, AdapterKind, AdapterOptions } from '../shared/types'

export type Column<T = number | string | boolean | null | undefined> = TypedColumn<T>
export type Columns<Key extends string = string> = Record<Key, Column<any>>

export interface TableMeta {
        name: string
        columns: Column<any>[]
}

export type ProjItem = { alias: string; expr: SQL | unknown }
export interface JoinClause {
        kind: JoinKind
        table: Table
        on: SQL
}

export interface SelectAst {
        op: 'Select'
        projection?: ProjItem[]
        table?: Table
        where?: SQL
        groupBy?: SQL[]
        having?: SQL
        orderBy?: SQL[]
        limit?: number
        offset?: number
        distinct?: boolean
        joins?: JoinClause[]
}
export interface InsertAst {
        op: 'Insert'
        table: Table
        values?: Record<string, unknown>[]
        returning?: boolean
}
export interface UpdateAst {
        op: 'Update'
        table: Table
        set?: Record<string, SqlValue>
        where?: SQL
        returning?: boolean
}
export interface DeleteAst {
        op: 'Delete'
        table: Table
        where?: SQL
        returning?: boolean
}
