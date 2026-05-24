export type ColumnType = 'i32' | 'u32' | 'f32'
export type NodeType = 'column' | 'literal' | 'binop' | 'unop' | 'func' | 'aggregate' | 'list' | 'order' | 'table'
export type BinOp = '+' | '-' | '*' | '/' | '%' | '=' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or' | 'in' | 'like' | 'ilike'
export type UnOp = 'not' | 'isNull' | 'isNotNull'
export type AggKind = 'count' | 'sum' | 'avg' | 'min' | 'max'
export interface ColumnNode {
        type: 'column'
        name: string
        dataType: ColumnType | string
        tableName?: string
}
export interface LiteralNode {
        type: 'literal'
        value: unknown
}
export interface BinopNode {
        type: 'binop'
        op: BinOp
        args: SQL[]
}
export interface UnopNode {
        type: 'unop'
        op: UnOp
        args: SQL[]
}
export interface FuncNode {
        type: 'func'
        name: string
        args: SQL[]
}
export interface AggregateNode {
        type: 'aggregate'
        name: AggKind
        distinct: boolean
        args: SQL[]
}
export interface ListNode {
        type: 'list'
        items: SQL[]
}
export interface OrderNode {
        type: 'order'
        dir: 'asc' | 'desc'
        col: SQL
}
export interface TableNode {
        type: 'table'
        name: string
}
export type SqlNode = ColumnNode | LiteralNode | BinopNode | UnopNode | FuncNode | AggregateNode | ListNode | OrderNode | TableNode
export interface ExprMethods {
        add(other: SqlValue): SQL
        sub(other: SqlValue): SQL
        mul(other: SqlValue): SQL
        div(other: SqlValue): SQL
        mod(other: SqlValue): SQL
        eq(other: SqlValue): SQL
        ne(other: SqlValue): SQL
        lt(other: SqlValue): SQL
        lte(other: SqlValue): SQL
        gt(other: SqlValue): SQL
        gte(other: SqlValue): SQL
        toFloat(): SQL
        toInt(): SQL
        toBool(): SQL
}
export interface SQL<T = unknown> extends ExprMethods {
        kind: 'sql'
        node: SqlNode
        _t?: T
}
export type SqlValue = SQL | number | string | boolean | null
export type Operand<T = unknown> = T | SQL<T> | SQL
export interface ColumnConfig {
        primaryKey?: boolean
        unique?: boolean
        notNull?: boolean
        defaultValue?: unknown
        defaultFn?: () => unknown
        references?: { fn: () => SQL; onDelete?: string; onUpdate?: string }
        tag?: 'str'
}
export interface ColumnDescriptor extends ColumnConfig {
        name: string
        key?: string
        type: ColumnType
        tableName?: string
}
export type Rid = readonly [number, number]
export type AdapterKind = 'memory' | 'nodejs' | 'bun' | 'deno' | 'browser' | 'cloudflare' | 'vercel' | 'netlify' | 'fastly' | 'aws-lambda' | 'lambda-edge'
export interface AdapterOptions {
        dir?: string
        rootName?: string
        kv?: any
        store?: any
        s3?: any
        bucket?: string
}
export interface FileAdapter {
        get(key: string): Promise<Uint8Array | undefined>
        put(key: string, bytes: Uint8Array): Promise<void>
        delete(key: string): Promise<void>
        list(prefix: string): Promise<string[]>
}
export type Row = Record<string, unknown>
export type RowPredicate = (row: Row) => boolean
export type RowSetter = (row: Row) => unknown
export type JoinRow = Record<string, Row | null>
export type JoinPredicate = (joinRow: JoinRow) => boolean
export type TableRef = string | { $meta: { name: string } } | { node: { name: string } }
export type AggSpec = { name: string; kind: AggKind; field: string; distinct?: boolean }
export type SortKey = { field: string; dir: 'asc' | 'desc'; eval?: (row: Row) => unknown }
export type JoinKind = 'inner' | 'left' | 'right' | 'full'
export interface SeqScanOp {
        op: 'SeqScan'
        table: TableRef
}
export interface NamedScanOp {
        op: 'NamedScan'
        table: TableRef
        name: string
}
export interface FilterOp {
        op: 'Filter'
        child: PhysicalOp
        predicate: RowPredicate
}
export type ProjectorSpec = { alias: string; eval: RowSetter }
export interface ProjectionOp {
        op: 'Projection'
        child: PhysicalOp
        fields: string[]
        projectors?: ProjectorSpec[]
}
export interface NestedLoopJoinOp {
        op: 'NestedLoopJoin'
        left: PhysicalOp
        right: PhysicalOp
        rightName: string
        predicate: JoinPredicate
        kind?: JoinKind
}
export interface AggregateOp {
        op: 'Aggregate'
        child: PhysicalOp
        groupBy: string[]
        aggs: AggSpec[]
}
export interface SortOp {
        op: 'Sort'
        child: PhysicalOp
        keys: SortKey[]
}
export interface DistinctOp {
        op: 'Distinct'
        child: PhysicalOp
}
export interface LimitOp {
        op: 'Limit'
        child: PhysicalOp
        limit?: number
        offset?: number
}
export interface UpdateOp {
        op: 'Update'
        table: TableRef
        predicate?: RowPredicate
        setters?: Record<string, RowSetter>
        returning?: boolean
}
export interface DeleteOp {
        op: 'Delete'
        table: TableRef
        predicate?: RowPredicate
        returning?: boolean
}
export interface InsertOp {
        op: 'Insert'
        table: TableRef
        values: Row[]
        returning?: boolean
}
export type PhysicalOp = SeqScanOp | NamedScanOp | FilterOp | ProjectionOp | NestedLoopJoinOp | AggregateOp | SortOp | DistinctOp | LimitOp | UpdateOp | DeleteOp | InsertOp
export interface EmptyAst {
        op?: undefined
}
export type ExecuteAst = PhysicalOp | EmptyAst
