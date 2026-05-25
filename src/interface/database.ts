import type { SQL, SqlValue, Row, PhysicalOp, Rid } from '../shared/types'
import type { Table, Columns, DatabaseConfig, SelectAst, InsertAst, UpdateAst, DeleteAst, JoinKind } from './types'
import { createBackend } from '../backend/index'
import { createMemoryAdapter } from '../backend/adapter/memory'
import { createAdapter } from '../backend/adapter'
import { compileExpr, compilePredicate, EvalCtx } from './compile'
import { planSelect } from './plan'
import { tableNameOf, stripRid } from '../shared/helper'
import type { Database as TypedDatabase } from './infer'
type Backend = ReturnType<typeof createBackend>
type AnyAst = SelectAst | InsertAst | UpdateAst | DeleteAst
type RunFn = (ast: AnyAst) => unknown
const isSqlValue = (v: unknown): v is SQL => !!v && typeof v === 'object' && (v as { kind?: string }).kind === 'sql'
const projectionOf = (fields?: Columns | Record<string, SQL>) => (fields ? Object.keys(fields).map((k) => ({ alias: k, expr: (fields as Record<string, SQL>)[k] })) : undefined)
const referenceOf = (c: { references?: { fn: () => SQL; onDelete?: string } }) => {
        const tc = (c.references?.fn() as { $col?: { key?: string; name?: string; tableName?: string } } | undefined)?.$col
        if (!c.references || !tc?.tableName) return undefined
        return { table: tc.tableName, column: tc.key ?? tc.name ?? '', onDelete: c.references.onDelete }
}
const registerTables = (backend: Backend, tables: Record<string, Table>) => {
        for (const key in tables) {
                const meta = tables[key].$meta
                if (!meta) continue
                const def: Record<string, unknown> = {}
                for (const col of meta.columns) {
                        const c = col.$col
                        const k = c.key ?? c.name
                        def[k] = { name: k, type: c.type, isPrimary: !!c.primaryKey, isUnique: !!c.unique, notNull: !!c.notNull || !!c.primaryKey, isText: c.tag === 'str', defaultValue: c.defaultValue, defaultFn: c.defaultFn, references: referenceOf(c) }
                }
                backend.catalog.register(meta.name, def as Parameters<Backend['catalog']['register']>[1])
        }
}
const compileSetters = (set: Record<string, SqlValue> | undefined, ctx: EvalCtx): Record<string, (row: Row) => unknown> => {
        const out: Record<string, (row: Row) => unknown> = {}
        for (const k in set ?? {}) {
                const v = (set as Record<string, SqlValue>)[k]
                out[k] = isSqlValue(v) ? compileExpr(v, ctx) : () => v
        }
        return out
}
const ROLLBACK = Symbol('rollback')
const isRollback = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { __rollback?: symbol }).__rollback === ROLLBACK
type Thenable<M> = M & { then(r: (v: any) => any, j?: (e: unknown) => unknown): Promise<any>; catch(j: (e: unknown) => unknown): Promise<any> }
const builder = <A extends AnyAst, M>(run: RunFn, ast: A, methods: (ast: A, self: () => any) => M): Thenable<M> => {
        let _promise: Promise<unknown> | null = null
        const _fire = () => (_promise ??= Promise.resolve(run(ast)))
        const self: Thenable<M> = {
                ...methods(ast, () => self),
                then(r, j) {
                        return _fire().then(r, j)
                },
                catch(j) {
                        return _fire().catch(j)
                },
        }
        return self
}
const _database = (tables: Record<string, Table>, { execute, pageSize, frameCount, file, adapter, adapterOptions }: DatabaseConfig = {}) => {
        let backend: Backend | null = null
        if (!execute) {
                let storage = file ?? createMemoryAdapter()
                if (!file && adapter) {
                        const p = createAdapter(adapter, adapterOptions)
                        storage = {
                                async get(k) {
                                        return (await p).get(k)
                                },
                                async put(k, b) {
                                        return (await p).put(k, b)
                                },
                                async delete(k) {
                                        return (await p).delete(k)
                                },
                                async list(pre) {
                                        return (await p).list(pre)
                                },
                        }
                }
                backend = createBackend({ file: storage, pageSize, frameCount })
        }
        const _ctx: EvalCtx = { current: null, params: null }
        if (backend) registerTables(backend, tables)
        const _rowsOf = async (plan: PhysicalOp): Promise<Row[]> => {
                let result: unknown = []
                if (execute) result = execute(plan)
                else if (backend) result = backend.execute(plan)
                const r = await Promise.resolve(result)
                return (Array.isArray(r) ? (r as Row[]) : []).map(stripRid)
        }
        const _run: RunFn = async (ast) => {
                if (ast.op === 'Select') return _rowsOf(planSelect(ast, _ctx).plan)
                const table = tableNameOf(ast.table)
                let plan: PhysicalOp
                if (ast.op === 'Insert') {
                        plan = { op: 'Insert', table, values: ast.values ?? [], returning: !!ast.returning }
                } else {
                        const predicate = ast.where ? compilePredicate(ast.where, _ctx) : () => true
                        if (ast.op === 'Update') {
                                plan = { op: 'Update', table, predicate, setters: compileSetters(ast.set, _ctx), returning: !!ast.returning }
                        } else {
                                plan = { op: 'Delete', table, predicate, returning: !!ast.returning }
                        }
                }
                const rows = await _rowsOf(plan)
                if (ast.returning) return rows
                return rows[0] ?? { rowCount: 0, changes: 0 }
        }
        const _select = (ast: SelectAst, b: () => any) => {
                const join = (kind: JoinKind) => (table: Table, on: SQL) => ((ast.joins ??= []).push({ kind, table, on }), b())
                const set = <K extends keyof SelectAst>(k: K, v: SelectAst[K]) => (v !== undefined && (ast[k] = v), b())
                return {
                        from(t: Table) {
                                return set('table', t)
                        },
                        where(c?: SQL) {
                                return set('where', c)
                        },
                        groupBy(...c: SQL[]) {
                                return set('groupBy', c)
                        },
                        having(c?: SQL) {
                                return set('having', c)
                        },
                        orderBy(...c: SQL[]) {
                                return set('orderBy', c)
                        },
                        limit(n: number) {
                                return set('limit', n)
                        },
                        offset(n: number) {
                                return set('offset', n)
                        },
                        innerJoin: join('inner'),
                        leftJoin: join('left'),
                        rightJoin: join('right'),
                        fullJoin: join('full'),
                }
        }
        const _buildTx = () => ({
                select(f?: Columns | Record<string, SQL>) {
                        return builder(_run, { op: 'Select', projection: projectionOf(f) } as SelectAst, _select)
                },
                selectDistinct(f?: Columns | Record<string, SQL>) {
                        return builder(_run, { op: 'Select', projection: projectionOf(f), distinct: true } as SelectAst, _select)
                },
                insert(t: Table) {
                        return builder(_run, { op: 'Insert', table: t } as InsertAst, (ast, b) => ({
                                values(rows: Record<string, number> | Record<string, number>[]) {
                                        ast.values = Array.isArray(rows) ? rows : [rows]
                                        return b()
                                },
                                returning() {
                                        ast.returning = true
                                        return b()
                                },
                        }))
                },
                update(t: Table) {
                        return builder(_run, { op: 'Update', table: t } as UpdateAst, (ast, b) => ({
                                set(v: Record<string, SqlValue>) {
                                        ast.set = v
                                        return b()
                                },
                                where(c?: SQL) {
                                        if (c) ast.where = c
                                        return b()
                                },
                                returning() {
                                        ast.returning = true
                                        return b()
                                },
                        }))
                },
                delete(t: Table) {
                        return builder(_run, { op: 'Delete', table: t } as DeleteAst, (ast, b) => ({
                                where(c?: SQL) {
                                        if (c) ast.where = c
                                        return b()
                                },
                                returning() {
                                        ast.returning = true
                                        return b()
                                },
                        }))
                },
        })
        type Tx = ReturnType<typeof _buildTx> & { rollback(): never; transaction<T>(fn: (tx: Tx) => Promise<T> | T): Promise<T> }
        const _runScope = async <T>(fn: (tx: Tx) => Promise<T> | T): Promise<T> => {
                const snap = backend ? await backend.catalog.snapshot() : null
                try {
                        return await Promise.resolve(fn(_txHandle()))
                } catch (e) {
                        if (backend && snap) await backend.catalog.restore(snap)
                        if (isRollback(e)) return undefined as T
                        throw e
                }
        }
        const _txHandle = (): Tx =>
                ({
                        ..._buildTx(),
                        rollback() {
                                throw { __rollback: ROLLBACK }
                        },
                        transaction(fn) {
                                return _runScope(fn)
                        },
                }) as Tx
        function transaction<R>(fn: (tx: Tx) => Promise<R> | R): Promise<R>
        function transaction(fn: (tx: Tx, c: unknown) => unknown): { run(extra?: unknown): Promise<unknown> }
        function transaction(fn: (tx: Tx, c?: unknown) => unknown): unknown {
                if ((fn as Function).length < 2) return _runScope(fn as (tx: Tx) => unknown)
                return {
                        async run(extra?: unknown) {
                                const primary = Object.values(tables)[0] as Table | undefined
                                if (!primary || !backend) return extra
                                const rel = backend.catalog.find(tableNameOf(primary))
                                const rows: Row[] = []
                                if (rel) await rel.heaps[0].scan(async (rid: Rid) => void rows.push(await backend.catalog.readRow(rel, rid)))
                                for (const row of rows) {
                                        _ctx.current = row
                                        await Promise.resolve(
                                                fn(
                                                        _txHandle(),
                                                        new Proxy(
                                                                {},
                                                                {
                                                                        get(_t, prop) {
                                                                                if (prop === '$meta') return primary.$meta
                                                                                const cur = _ctx.current
                                                                                const key = String(prop)
                                                                                return cur && key in cur ? cur[key] : undefined
                                                                        },
                                                                },
                                                        ),
                                                ),
                                        )
                                }
                                _ctx.current = null
                                return extra
                        },
                }
        }
        return {
                ..._buildTx(),
                transaction,
                async $count(table: Table, predicate?: SQL): Promise<number> {
                        const rel = backend?.catalog.find(tableNameOf(table))
                        if (!rel) return 0
                        const pred = predicate ? compilePredicate(predicate, _ctx) : () => true
                        let n = 0
                        await rel.heaps[0].scan(async (rid: Rid) => void (pred(await backend!.catalog.readRow(rel, rid)) && n++))
                        return n
                },
                backend,
                tables,
        }
}
export const database = _database as unknown as <T extends Record<string, Table<any>>>(tables: T, config?: DatabaseConfig) => TypedDatabase<T>
export type Database = ReturnType<typeof database>
