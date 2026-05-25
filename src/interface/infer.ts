import type { SQL, SqlValue, ColumnDescriptor, FileAdapter, AdapterKind, AdapterOptions, ExprMethods } from '../shared/types'

export type Operand<T> = T | SQL<T>

export interface TypedColumn<T> extends Omit<SQL<T>, keyof ExprMethods | 'node'> {
        $col: ColumnDescriptor
        kind: 'sql'
        node: { type: 'column'; name: string; dataType: string; tableName?: string }
        _t?: T
        name: string
        dataType: string
        columnType: string
        primary: boolean
        isUnique: boolean
        hasDefault: boolean
        default: (T | undefined) & ((value: T) => TypedColumn<T>)
        primaryKey(): TypedColumn<NonNullable<T>>
        unique(): TypedColumn<T>
        notNull(): TypedColumn<NonNullable<T>>
        $defaultFn(fn: () => T): TypedColumn<T>
        defaultFn: (() => T) & ((fn: () => T) => TypedColumn<T>)
        references<U>(fn: () => SQL<U> | TypedColumn<U>, opts?: { onDelete?: string; onUpdate?: string }): TypedColumn<T>
        eq(other: Operand<T>): SQL<boolean>
        ne(other: Operand<T>): SQL<boolean>
        lt(other: Operand<T>): SQL<boolean>
        lte(other: Operand<T>): SQL<boolean>
        gt(other: Operand<T>): SQL<boolean>
        gte(other: Operand<T>): SQL<boolean>
        add(other: Operand<T>): SQL<T>
        sub(other: Operand<T>): SQL<T>
        mul(other: Operand<T>): SQL<T>
        div(other: Operand<T>): SQL<T>
        mod(other: Operand<T>): SQL<T>
        toFloat(): SQL<number>
        toInt(): SQL<number>
        toBool(): SQL<boolean>
}

type AnyCol = TypedColumn<any>
export type ColumnsShape = { [k: string]: AnyCol }

type T_<C> = C extends TypedColumn<infer V> ? V : never
type NullKeys<S> = { [K in keyof S]: null extends T_<S[K]> ? K : never }[keyof S]
type ReqKeys<S> = Exclude<keyof S, NullKeys<S>>
type Unwrap<X> = X extends SQL<infer V> ? V : X extends TypedColumn<infer V> ? V : X extends Record<string, any> ? { [K in keyof X]: Unwrap<X[K]> } : X

export type RowOf<S> = { [K in keyof S]: T_<S[K]> } & { [k: string]: unknown }
export type InsertRowOf<S> = { [K in ReqKeys<S>]: T_<S[K]> } & { [K in NullKeys<S>]?: T_<S[K]> | null }
export type RowOfFields<F> = { [K in keyof F]: Unwrap<F[K]> } & { [k: string]: unknown }
export type SchemaOf<T> = T extends TableBase<infer S> ? S : never
export type RowOfTable<T> = unknown extends T ? Record<string, unknown> : RowOf<SchemaOf<T>>
export type InsertRowOfTable<T> = unknown extends T ? Record<string, unknown> : InsertRowOf<SchemaOf<T>>

export interface TableMetaTyped<S> {
        name: string
        columns: AnyCol[]
        _schema?: S
}

export interface TableBase<S> {
        $meta: TableMetaTyped<S>
        kind: 'sql'
        node: { type: 'table'; name: string }
        _schema?: S
}

export type Table<S extends ColumnsShape = ColumnsShape> = TableBase<S> & S
export type TableLike = TableBase<any>

export interface DatabaseConfig {
        execute?: (ast: unknown) => unknown
        pageSize?: number
        frameCount?: number
        file?: FileAdapter
        adapter?: AdapterKind
        adapterOptions?: AdapterOptions
}

type FieldVal = SQL | AnyCol | Record<string, SQL | AnyCol>
type Fields = Record<string, FieldVal>
type Changes = { rowCount: number; changes: number }
type P<R> = PromiseLike<R> & { catch<U>(f: (e: unknown) => U): Promise<R | U> }

type ArrayWithFirst<R> = R[] & R
export interface SelectStar {
        from<T extends TableLike>(t: T): SelectChain<RowOfTable<T>[]>
}
export interface SelectProj<F extends Fields> {
        from<T extends TableLike>(t: T): SelectChain<ArrayWithFirst<RowOfFields<F>>>
}

export interface SelectChain<R> extends P<R> {
        where(c?: SQL<boolean>): SelectChain<R>
        groupBy(...c: SQL[]): SelectChain<R>
        having(c?: SQL<boolean>): SelectChain<R>
        orderBy(...c: SQL[]): SelectChain<R>
        limit(n: number): SelectChain<R>
        offset(n: number): SelectChain<R>
        innerJoin<T extends TableLike>(t: T, on: SQL<boolean>): SelectChain<R>
        leftJoin<T extends TableLike>(t: T, on: SQL<boolean>): SelectChain<R>
        rightJoin<T extends TableLike>(t: T, on: SQL<boolean>): SelectChain<R>
        fullJoin<T extends TableLike>(t: T, on: SQL<boolean>): SelectChain<R>
}

type InsertInput<T extends TableLike> = InsertRowOfTable<T> | Partial<RowOfTable<T>>
export interface InsertChain<T extends TableLike, R> extends P<R> {
        values(rows: InsertInput<T> | InsertInput<T>[]): InsertChain<T, R>
        returning(): InsertChain<T, RowOfTable<T>[]>
}

type SetMap<T extends TableLike> = Partial<{ [K in keyof SchemaOf<T>]: SqlValue | T_<SchemaOf<T>[K]> | null }>

export interface UpdateChain<T extends TableLike, R> extends P<R> {
        set(v: SetMap<T>): UpdateChain<T, R>
        where(c?: SQL<boolean>): UpdateChain<T, R>
        from<U extends TableLike>(t: U): UpdateChain<T, R>
        returning(): UpdateChain<T, RowOfTable<T>[]>
}

export interface DeleteChain<T extends TableLike, R> extends P<R> {
        where(c?: SQL<boolean>): DeleteChain<T, R>
        returning(): DeleteChain<T, RowOfTable<T>[]>
}

export interface QueryBuilders {
        select(): SelectStar
        select<F extends Fields>(fields: F): SelectProj<F>
        selectDistinct(): SelectStar
        selectDistinct<F extends Fields>(fields: F): SelectProj<F>
        insert<T extends TableLike>(t: T): InsertChain<T, Changes>
        update<T extends TableLike>(t: T): UpdateChain<T, Changes>
        delete<T extends TableLike>(t: T): DeleteChain<T, Changes>
}

export interface Tx extends QueryBuilders {
        rollback(): never
        transaction<R>(fn: (tx: Tx, cursor?: any) => R | Promise<R>): Promise<R>
}

export interface Database<Tables extends Record<string, TableLike>> extends QueryBuilders {
        transaction<R>(fn: (tx: Tx, cursor?: any) => R | Promise<R>): Promise<R> & { run(extra?: unknown): Promise<unknown> }
        $count<T extends TableLike>(table: T, predicate?: SQL<boolean>): Promise<number>
        backend: unknown
        tables: Tables
}
