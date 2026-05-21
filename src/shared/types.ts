export type ColumnType = 'i32' | 'u32' | 'f32'
export type NodeType = 'column' | 'literal' | 'placeholder' | 'binop' | 'unop' | 'func' | 'aggregate' | 'list' | 'order' | 'table' | 'raw' | 'identifier' | 'currentTuple'
export type BinOp = '+' | '-' | '*' | '/' | '%' | '=' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or' | 'in' | 'like' | 'ilike'
export type UnOp = 'not' | 'isNull' | 'isNotNull' | 'exists' | 'notExists'
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
        encoder?: unknown
}
export interface RawNode {
        type: 'raw'
        value: string
}
export interface IdentifierNode {
        type: 'identifier'
        name: string
}
export interface PlaceholderNode {
        type: 'placeholder'
        name: string
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
export interface CurrentTupleNode {
        type: 'currentTuple'
        col: string
        tableName: string
}
export type SqlNode = ColumnNode | LiteralNode | RawNode | IdentifierNode | PlaceholderNode | BinopNode | UnopNode | FuncNode | AggregateNode | ListNode | OrderNode | TableNode | CurrentTupleNode
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
        at(index: SqlValue): SQL
}
export interface SQL<T = unknown> extends ExprMethods {
        kind: 'sql'
        node: SqlNode
        _t?: T
}
export type SqlValue = SQL | number | string | boolean | null
export type Operand<T = unknown> = T | SQL<T> | SQL
export interface Placeholder {
        kind: 'sql'
        node: SqlNode
}
export type SQLChunk = string | number | boolean | null | SQLChunk[] | SQL | Placeholder
export type Encoder = unknown
export interface ColumnConfig {
        primaryKey?: boolean
        unique?: boolean
        notNull?: boolean
        defaultValue?: unknown
        defaultFn?: () => unknown
        hasOrder?: boolean
        orderRange?: [number, number]
        references?: { fn: () => SQL; onDelete?: string; onUpdate?: string }
        tag?: 'str'
}
export interface ColumnDescriptor extends ColumnConfig {
        name: string
        type: ColumnType
        tableName?: string
}
export type Rid = readonly [number, number]
export interface FileAdapter {
        read(id: string, offset: number, length: number): Uint8Array
        write(id: string, offset: number, bytes: Uint8Array): void
        sync(id: string): void
        close(id: string): void
        list?(): string[]
        exists?(id: string): boolean
        size?(id: string): number
        open?(id: string): Promise<void>
}
export type Row = Record<string, unknown>
export type RowPredicate = (row: Row) => boolean
export type RowSetter = (row: Row) => unknown
export type JoinRow = Record<string, Row | null>
export type JoinPredicate = (joinRow: JoinRow) => boolean
export type TableRef = string | { $meta: { name: string } } | { node: { name: string } }
export type SqlExpr = SQL | SqlNode
export type AggSpec = { name: string; kind: AggKind; field: string; distinct?: boolean }
export type SortKey = { field: string; dir: 'asc' | 'desc'; eval?: (row: Row) => unknown }
export type Projection = Array<{ alias: string; expr: SqlExpr }>
export interface SeqScanOp {
        op: 'SeqScan'
        table: TableRef
}
export interface NamedScanOp {
        op: 'NamedScan'
        table: TableRef
        name: string
}
export interface IndexScanOp {
        op: 'IndexScan'
        table: TableRef
        indexName: string
        range?: { start?: number; end?: number }
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
export type JoinKind = 'inner' | 'left' | 'right' | 'full'
export interface NestedLoopJoinOp {
        op: 'NestedLoopJoin'
        left: PhysicalOp
        right: PhysicalOp
        rightName: string
        predicate: JoinPredicate
        kind?: JoinKind
}
export interface HashJoinOp {
        op: 'HashJoin'
        left: PhysicalOp
        right: PhysicalOp
        leftKey: string
        rightKey: string
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
export type PhysicalOp = SeqScanOp | NamedScanOp | IndexScanOp | FilterOp | ProjectionOp | NestedLoopJoinOp | HashJoinOp | AggregateOp | SortOp | DistinctOp | LimitOp | UpdateOp | DeleteOp | InsertOp
export type LogicalOp = 'Select' | 'Insert' | 'Update' | 'Delete' | 'InitAll'
export interface InitAllAst {
        op: 'InitAll'
        tables: Record<string, unknown>
        count?: number
        adapters?: unknown[]
}
export interface EmptyAst {
        op?: undefined
}
export type ExecuteAst = PhysicalOp | InitAllAst | EmptyAst
