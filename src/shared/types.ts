export type ColumnType = 'i32' | 'u32' | 'f32'

export type NodeType =
        | 'column'
        | 'literal'
        | 'placeholder'
        | 'binop'
        | 'unop'
        | 'func'
        | 'aggregate'
        | 'list'
        | 'order'
        | 'table'
        | 'raw'
        | 'identifier'
        | 'currentTuple'

export type BinOp = '+' | '-' | '*' | '/' | '%' | '=' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or' | 'in' | 'like' | 'ilike'
export type UnOp = 'not' | 'isNull' | 'isNotNull' | 'exists' | 'notExists'
export type AggKind = 'count' | 'sum' | 'avg' | 'min' | 'max'

export type SqlNode =
        | { type: 'column'; name: string; dataType: ColumnType | string; tableName?: string }
        | { type: 'literal'; value: unknown; encoder?: unknown }
        | { type: 'raw'; value: string }
        | { type: 'identifier'; name: string }
        | { type: 'placeholder'; name: string }
        | { type: 'binop'; op: BinOp; args: SQL[] }
        | { type: 'unop'; op: UnOp; args: SQL[] }
        | { type: 'func'; name: string; args: SQL[] }
        | { type: 'aggregate'; name: AggKind; distinct: boolean; args: SQL[] }
        | { type: 'list'; items: SQL[] }
        | { type: 'order'; dir: 'asc' | 'desc'; col: SQL }
        | { type: 'table'; name: string }
        | { type: 'currentTuple'; col: string; tableName: string }

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
        references?: { fn: () => SQL; onDelete?: string }
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
export type JoinPredicate = (left: Row, right: Row) => boolean
export type TableRef = string | { $meta: { name: string } } | { node: { name: string } }
export type SqlExpr = SQL | SqlNode
export type AggSpec = { name: string; kind: AggKind; field: string }
export type SortKey = { field: string; dir: 'asc' | 'desc' }
export type Projection = Array<{ alias: string; expr: SqlExpr }>

export type PhysicalOp =
        | { op: 'SeqScan'; table: TableRef }
        | { op: 'IndexScan'; table: TableRef; indexName: string; range?: { start?: number; end?: number } }
        | { op: 'Filter'; child: PhysicalOp; predicate: RowPredicate }
        | { op: 'Projection'; child: PhysicalOp; fields: string[] }
        | { op: 'NestedLoopJoin'; left: PhysicalOp; right: PhysicalOp; predicate: JoinPredicate }
        | { op: 'HashJoin'; left: PhysicalOp; right: PhysicalOp; leftKey: string; rightKey: string }
        | { op: 'Aggregate'; child: PhysicalOp; groupBy: string[]; aggs: AggSpec[] }
        | { op: 'Sort'; child: PhysicalOp; keys: SortKey[] }
        | { op: 'Update'; table: TableRef; predicate?: RowPredicate; setters?: Record<string, RowSetter> }
        | { op: 'Delete'; table: TableRef; predicate?: RowPredicate }
        | { op: 'Insert'; table: TableRef; values: Row[]; returning?: boolean }
        | { op: 'Select'; table?: TableRef; projection?: Projection; where?: SqlExpr; groupBy?: unknown[]; orderBy?: unknown[]; limit?: number; offset?: number }

export type LogicalOp = 'Select' | 'Insert' | 'Update' | 'Delete' | 'InitAll'

export interface InitAllAst {
        op: 'InitAll'
        tables: Record<string, unknown>
        count?: number
        adapters?: unknown[]
}
