import type { SQL, SqlNode, SqlValue, ExprMethods, ColumnDescriptor, FileAdapter, JoinKind } from '../shared/types'
export type { SQL, SqlNode, SqlValue, NodeType, BinOp, UnOp, AggKind, ColumnType, ColumnConfig, ColumnDescriptor, ExprMethods, Rid, Row, PhysicalOp, JoinKind } from '../shared/types'
export interface Column<T = number | string | boolean> extends SQL<T>, ExprMethods {
        $col: ColumnDescriptor
        primaryKey(): Column<T>
        unique(): Column<T>
        notNull(): Column<T>
        default(value: T): Column<T>
        $defaultFn(fn: () => T): Column<T>
        defaultFn(fn: () => T): Column<T>
        references(fn: () => SQL, opts?: { onDelete?: string; onUpdate?: string }): Column<T>
}
export type Columns<Key extends string = string> = Record<Key, Column>
export interface TableMeta {
        name: string
        columns: Column[]
}
export interface TableBase {
        $meta: TableMeta
        kind: 'sql'
        node: SqlNode
}
export type Table<S extends Columns = {}> = TableBase & S
export interface DatabaseConfig {
        execute?: (ast: unknown) => unknown
        pageSize?: number
        frameCount?: number
        fileAdapter?: FileAdapter
}
export type ProjItem = { alias: string; expr: SQL | SqlNode }
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
        values?: Record<string, number>[]
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
