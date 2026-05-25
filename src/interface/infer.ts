import type { SQL, SqlValue, ColumnDescriptor, FileAdapter, AdapterKind, AdapterOptions, ExprMethods } from '../shared/types'

export type Operand<T> = T | SQL<T>

export interface TypedColumn<T> extends Omit<SQL<T>, keyof ExprMethods> {
        $col: ColumnDescriptor
        kind: 'sql'
        _t?: T
        primaryKey(): TypedColumn<T>
        unique(): TypedColumn<T>
        notNull(): TypedColumn<NonNullable<T>>
        default(value: T): TypedColumn<T>
        $defaultFn(fn: () => T): TypedColumn<T>
        defaultFn(fn: () => T): TypedColumn<T>
        references<U>(fn: () => SQL<U>, opts?: { onDelete?: string; onUpdate?: string }): TypedColumn<T>
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

export type ColumnsShape = Record<string, TypedColumn<any>>

type ColumnOf<S extends ColumnsShape, K extends keyof S> = S[K] extends TypedColumn<infer T> ? T : never
type NullableKeys<S extends ColumnsShape> = { [K in keyof S]: undefined extends ColumnOf<S, K> ? K : null extends ColumnOf<S, K> ? K : never }[keyof S]
type RequiredKeys<S extends ColumnsShape> = Exclude<keyof S, NullableKeys<S>>
type UnwrapSql<X> = X extends SQL<infer T> ? T : X extends TypedColumn<infer T> ? T : X

export type RowOf<S extends ColumnsShape> = { [K in keyof S]: ColumnOf<S, K> }
export type InsertRowOf<S extends ColumnsShape> = { [K in RequiredKeys<S>]: ColumnOf<S, K> } & { [K in NullableKeys<S>]?: ColumnOf<S, K> | null }
export type SchemaOf<T> = T extends Table<infer S> ? S : never
export type RowOfTable<T> = RowOf<SchemaOf<T>>
export type InsertRowOfTable<T> = InsertRowOf<SchemaOf<T>>
export type RowOfFields<F> = { [K in keyof F]: UnwrapSql<F[K]> }

export interface TableMetaTyped<S extends ColumnsShape> {
        name: string
        columns: TypedColumn<any>[]
        _schema?: S
}

export interface TableBase<S extends ColumnsShape> {
        $meta: TableMetaTyped<S>
        kind: 'sql'
        node: { type: 'table'; name: string }
        _schema?: S
}

export type Table<S extends ColumnsShape = ColumnsShape> = TableBase<S> & S

export interface DatabaseConfig {
        execute?: (ast: unknown) => unknown
        pageSize?: number
        frameCount?: number
        file?: FileAdapter
        adapter?: AdapterKind
        adapterOptions?: AdapterOptions
}

type FieldsRecord = Record<string, SQL | unknown>
type DefaultRow = { rowCount: number; changes: number }

export interface SelectBuilder<R> {
        from<T extends Table>(t: T): SelectFromBuilder<R extends unknown[] ? (R[number] extends never ? RowOfTable<T>[] : R) : RowOfTable<T>[]>
}

export interface SelectFromBuilder<R> {
        where(c?: SQL<boolean>): SelectFromBuilder<R>
        groupBy(...c: SQL[]): SelectFromBuilder<R>
        having(c?: SQL<boolean>): SelectFromBuilder<R>
        orderBy(...c: SQL[]): SelectFromBuilder<R>
        limit(n: number): SelectFromBuilder<R>
        offset(n: number): SelectFromBuilder<R>
        innerJoin<T extends Table>(table: T, on: SQL<boolean>): SelectFromBuilder<R>
        leftJoin<T extends Table>(table: T, on: SQL<boolean>): SelectFromBuilder<R>
        rightJoin<T extends Table>(table: T, on: SQL<boolean>): SelectFromBuilder<R>
        fullJoin<T extends Table>(table: T, on: SQL<boolean>): SelectFromBuilder<R>
        then<U>(resolve: (v: R) => U, reject?: (e: unknown) => unknown): Promise<U>
        catch<U>(reject: (e: unknown) => unknown): Promise<R | U>
}

export interface InsertBuilder<T extends Table, Ret> {
        values(rows: InsertRowOfTable<T> | InsertRowOfTable<T>[]): InsertBuilder<T, Ret>
        returning(): InsertBuilder<T, RowOfTable<T>[]>
        then<U>(resolve: (v: Ret) => U, reject?: (e: unknown) => unknown): Promise<U>
        catch<U>(reject: (e: unknown) => unknown): Promise<Ret | U>
}

export interface UpdateBuilder<T extends Table, Ret> {
        set(v: Partial<{ [K in keyof SchemaOf<T>]: SqlValue | RowOfTable<T>[K] }>): UpdateBuilder<T, Ret>
        where(c?: SQL<boolean>): UpdateBuilder<T, Ret>
        from<U extends Table>(t: U): UpdateBuilder<T, Ret>
        returning(): UpdateBuilder<T, RowOfTable<T>[]>
        then<U>(resolve: (v: Ret) => U, reject?: (e: unknown) => unknown): Promise<U>
        catch<U>(reject: (e: unknown) => unknown): Promise<Ret | U>
}

export interface DeleteBuilder<T extends Table, Ret> {
        where(c?: SQL<boolean>): DeleteBuilder<T, Ret>
        returning(): DeleteBuilder<T, RowOfTable<T>[]>
        then<U>(resolve: (v: Ret) => U, reject?: (e: unknown) => unknown): Promise<U>
        catch<U>(reject: (e: unknown) => unknown): Promise<Ret | U>
}

export interface QueryBuilders {
        select(): SelectBuilder<unknown[]>
        select<F extends FieldsRecord>(fields: F): SelectBuilder<RowOfFields<F>[]>
        selectDistinct(): SelectBuilder<unknown[]>
        selectDistinct<F extends FieldsRecord>(fields: F): SelectBuilder<RowOfFields<F>[]>
        insert<T extends Table>(t: T): InsertBuilder<T, DefaultRow>
        update<T extends Table>(t: T): UpdateBuilder<T, DefaultRow>
        delete<T extends Table>(t: T): DeleteBuilder<T, DefaultRow>
}

export interface Tx extends QueryBuilders {
        rollback(): never
        transaction<R>(fn: (tx: Tx) => Promise<R> | R): Promise<R>
}

type CursorRow<Tables> = Tables[keyof Tables] extends Table<infer S> ? RowOf<S> : Record<string, unknown>

export interface Database<Tables extends Record<string, Table<any>>> extends QueryBuilders {
        transaction<R>(fn: (tx: Tx) => Promise<R> | R): Promise<R>
        transaction(fn: (tx: Tx, cursor: CursorRow<Tables>) => unknown): { run(extra?: unknown): Promise<unknown> }
        $count<T extends Table<any>>(table: T, predicate?: SQL<boolean>): Promise<number>
        backend: unknown
        tables: Tables
}
