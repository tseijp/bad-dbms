import type { SQL, SqlNode, SqlValue, ExprMethods, ColumnDescriptor, InitAllAst, FileAdapter } from '../shared/types'
export type { SQL, SqlNode, SqlValue, Placeholder, SQLChunk, NodeType, BinOp, UnOp, AggKind, ColumnType, ColumnConfig, ColumnDescriptor, ExprMethods, Rid, Row, PhysicalOp, InitAllAst } from '../shared/types'
export interface Column<T = number | string | boolean> extends SQL<T>, ExprMethods {
        $col: ColumnDescriptor
        primaryKey(): Column<T>
        unique(): Column<T>
        notNull(): Column<T>
        default(value: T): Column<T>
        $defaultFn(fn: () => T): Column<T>
        defaultFn(fn: () => T): Column<T>
        references(fn: () => SQL, opts?: { onDelete?: string }): Column<T>
        order(min: number, max: number): Column<T>
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
export type RowOf<S extends Columns> = { [K in keyof S]: number }
export interface DatabaseConfig {
        execute?: (ast: unknown) => unknown
        tables?: Record<string, Table>
        pageSize?: number
        frameCount?: number
        ringCount?: number
        fileAdapter?: FileAdapter
}
export type ProjItem = { alias: string; expr: SQL | SqlNode }
export interface SelectAst {
        op: 'Select'
        projection?: ProjItem[]
        table?: Table
        where?: SQL
        groupBy?: SQL[]
        orderBy?: SQL[]
        limit?: number
        offset?: number
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
        from?: Table
        where?: SQL
}
export interface DeleteAst {
        op: 'Delete'
        table: Table
        where?: SQL
}
export type LogicalAst = SelectAst | InsertAst | UpdateAst | DeleteAst | InitAllAst
