import type { SQL, SqlValue, Row, PhysicalOp } from '../shared/types'
import type { Table, Columns, DatabaseConfig, SelectAst, InsertAst, UpdateAst, DeleteAst, JoinKind, ProjItem } from './types'
import { createBackend } from '../backend/index'
import { compileExpr, compilePredicate, EvalCtx } from './compile'
import { planSelect } from './plan'
import { tableNameOf, stripRid } from '../shared/helper'
type Backend = ReturnType<typeof createBackend>
type AnyAst = SelectAst | InsertAst | UpdateAst | DeleteAst
type RunFn = (ast: AnyAst) => unknown
const isSqlValue = (v: unknown): v is SQL => !!v && typeof v === 'object' && (v as { kind?: string }).kind === 'sql'
const projectionOf = (fields?: Columns | Record<string, SQL>): ProjItem[] | undefined => {
        if (!fields) return undefined
        return Object.keys(fields).map((k) => ({ alias: k, expr: (fields as Record<string, SQL>)[k] }))
}
const propertyKeyOf = (table: Table, col: Table['$meta']['columns'][number]): string => {
        const rec = table as unknown as Record<string, unknown>
        for (const k in rec) if (k !== '$meta' && k !== 'kind' && k !== 'node' && rec[k] === col) return k
        return col.$col.name
}
const referenceOf = (col: Table['$meta']['columns'][number]) => {
        const ref = col.$col.references
        const tc = (ref?.fn() as { $col?: { name?: string; tableName?: string } } | undefined)?.$col
        if (!ref || !tc?.tableName || !tc.name) return undefined
        return { table: tc.tableName, column: tc.name, onDelete: ref.onDelete }
}
const registerTables = (backend: Backend, tables: Record<string, Table>) => {
        for (const key in tables) {
                const meta = tables[key].$meta
                if (!meta) continue
                const def: Record<string, unknown> = {}
                for (const col of meta.columns) {
                        const c = col.$col
                        const k = propertyKeyOf(tables[key], col)
                        def[k] = { key: k, name: c.name, type: c.type, isPrimary: !!c.primaryKey, isUnique: !!c.unique, hasOrder: !!c.hasOrder, notNull: !!c.notNull || !!c.primaryKey, isText: c.tag === 'str', defaultValue: c.defaultValue, defaultFn: c.defaultFn, references: referenceOf(col) }
                }
                backend.catalog.register(meta.name, def as Parameters<Backend['catalog']['register']>[1])
        }
}
const generateInitRows = (table: Table, count: number): Row[] => {
        const cols = table.$meta.columns
        const ordered = cols.filter((c) => c.$col.hasOrder)
        const wMax = ordered[0]?.$col.orderRange?.[1] ?? count
        const hMax = ordered[1]?.$col.orderRange?.[1] ?? count
        const rows: Row[] = []
        for (let i = 0; i < count; i++) {
                const row: Row = {}
                for (const c of cols) {
                        if (!c.$col.hasOrder) row[c.$col.name] = c.$col.defaultFn ? c.$col.defaultFn() : (c.$col.defaultValue ?? 0)
                        else if (ordered.length === 2) row[c.$col.name] = c === ordered[0] ? i % wMax : Math.floor(i / wMax) % hMax
                        else row[c.$col.name] = i % (c.$col.orderRange?.[1] ?? count)
                }
                rows.push(row)
        }
        return rows
}
const compileSetters = (set: Record<string, SqlValue> | undefined, ctx: EvalCtx): Record<string, (row: Row) => unknown> => {
        const out: Record<string, (row: Row) => unknown> = {}
        for (const k in set ?? {}) {
                const v = (set as Record<string, SqlValue>)[k]
                out[k] = isSqlValue(v) ? compileExpr(v, ctx) : () => v
        }
        return out
}
const resolveConflictSet = (set: Record<string, SqlValue> | undefined, ctx: EvalCtx): Record<string, unknown> | undefined => {
        if (!set) return undefined
        const out: Record<string, unknown> = {}
        for (const k in set) {
                const v = set[k]
                out[k] = isSqlValue(v) ? compileExpr(v, ctx)({}) : v
        }
        return out
}
const ROLLBACK = Symbol('rollback')
const isRollback = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { __rollback?: symbol }).__rollback === ROLLBACK
type Thenable<A, M> = M & { toAST(): A; then(r: (v: any) => any, j?: (e: unknown) => unknown): Promise<any>; catch(j: (e: unknown) => unknown): Promise<any> }
const builder = <A extends AnyAst, M>(run: RunFn, ast: A, methods: (ast: A, self: () => any) => M): Thenable<A, M> => {
        let promise: Promise<unknown> | null = null
        const fire = () => (promise ??= Promise.resolve(run(ast)))
        const self: Thenable<A, M> = {
                ...methods(ast, () => self),
                toAST: () => ast,
                then: (r, j) => fire().then(r, j),
                catch: (j) => fire().catch(j),
        }
        return self
}
export const database = (tables: Record<string, Table>, config: DatabaseConfig = {}) => {
        const backend: Backend | null = config.execute ? null : createBackend({ pageSize: config.pageSize, frameCount: config.frameCount, ringCount: config.ringCount, fileAdapter: config.fileAdapter })
        const _ctx: EvalCtx = { current: null, params: null }
        const adapters: unknown[] = []
        if (backend) registerTables(backend, tables)
        const _dispatch = (plan: PhysicalOp): unknown => (config.execute ? config.execute(plan) : backend ? backend.execute(plan) : [])
        const _rowsOf = async (plan: PhysicalOp): Promise<Row[]> => {
                const r = await Promise.resolve(_dispatch(plan))
                return (Array.isArray(r) ? (r as Row[]) : []).map(stripRid)
        }
        const _run: RunFn = async (ast) => {
                if (ast.op === 'Select') return _rowsOf(planSelect(ast, _ctx).plan)
                const table = tableNameOf(ast.table)
                if (ast.op === 'Insert') {
                        const values = ast.values ?? []
                        const conflict = ast.conflict ? { action: ast.conflict.action, set: resolveConflictSet(ast.conflict.set, _ctx) } : undefined
                        const plan: PhysicalOp = { op: 'Insert', table, values, returning: !!ast.returning, conflict }
                        if (ast.returning) return _rowsOf(plan)
                        const r = await Promise.resolve(_dispatch(plan))
                        return (Array.isArray(r) ? r[0] : r) ?? { rowCount: 0, changes: 0 }
                }
                const predicate = ast.where ? compilePredicate(ast.where, _ctx) : () => true
                const plan: PhysicalOp = ast.op === 'Update' ? { op: 'Update', table, predicate, setters: compileSetters(ast.set, _ctx), returning: !!ast.returning } : { op: 'Delete', table, predicate, returning: !!ast.returning }
                const rows = await _rowsOf(plan)
                if (ast.returning) return rows
                return rows[0] ?? { rowCount: 0 }
        }
        const _select = (ast: SelectAst, b: () => any) => {
                const join = (kind: JoinKind) => (table: Table, on: SQL) => ((ast.joins ??= []).push({ kind, table, on }), b())
                const set = <K extends keyof SelectAst>(k: K, v: SelectAst[K]) => (v !== undefined && (ast[k] = v), b())
                return {
                        from: (t: Table) => set('table', t),
                        where: (c?: SQL) => set('where', c),
                        groupBy: (...c: SQL[]) => set('groupBy', c),
                        having: (c?: SQL) => set('having', c),
                        orderBy: (...c: SQL[]) => set('orderBy', c),
                        limit: (n: number) => set('limit', n),
                        offset: (n: number) => set('offset', n),
                        innerJoin: join('inner'),
                        leftJoin: join('left'),
                        rightJoin: join('right'),
                        fullJoin: join('full'),
                }
        }
        const _buildTx = () => ({
                select: (f?: Columns | Record<string, SQL>) => builder(_run, { op: 'Select', projection: projectionOf(f) } as SelectAst, _select),
                selectDistinct: (f?: Columns | Record<string, SQL>) => builder(_run, { op: 'Select', projection: projectionOf(f), distinct: true } as SelectAst, _select),
                insert: (t: Table) =>
                        builder(_run, { op: 'Insert', table: t } as InsertAst, (ast, b) => ({
                                values: (rows: Record<string, number> | Record<string, number>[]) => ((ast.values = Array.isArray(rows) ? rows : [rows]), b()),
                                returning: () => ((ast.returning = true), b()),
                                onConflictDoNothing: () => ((ast.conflict = { action: 'nothing' }), b()),
                                onConflictDoUpdate: (cfg: { set: Record<string, SqlValue> }) => ((ast.conflict = { action: 'update', set: cfg?.set }), b()),
                        })),
                update: (t: Table) =>
                        builder(_run, { op: 'Update', table: t } as UpdateAst, (ast, b) => ({
                                set: (v: Record<string, SqlValue>) => ((ast.set = v), b()),
                                from: (o: Table) => ((ast.from = o), b()),
                                where: (c?: SQL) => (c && (ast.where = c), b()),
                                returning: () => ((ast.returning = true), b()),
                        })),
                delete: (t: Table) =>
                        builder(_run, { op: 'Delete', table: t } as DeleteAst, (ast, b) => ({
                                where: (c?: SQL) => (c && (ast.where = c), b()),
                                returning: () => ((ast.returning = true), b()),
                        })),
        })
        type Tx = ReturnType<typeof _buildTx> & { rollback(): never; transaction<T>(fn: (tx: Tx) => Promise<T> | T): Promise<T> }
        const _runScope = async <T>(fn: (tx: Tx) => Promise<T> | T): Promise<T> => {
                const snap = backend ? backend.catalog.snapshot() : null
                try {
                        return await Promise.resolve(fn(_txHandle()))
                } catch (e) {
                        if (backend && snap) backend.catalog.restore(snap)
                        if (isRollback(e)) return undefined as T
                        throw e
                }
        }
        const _txHandle = (): Tx =>
                ({
                        ..._buildTx(),
                        rollback: () => {
                                throw { __rollback: ROLLBACK }
                        },
                        transaction: _runScope,
                }) as Tx
        const _currentTupleProxy = (table: Table) =>
                new Proxy(
                        {},
                        {
                                get: (_t, prop) => {
                                        if (prop === '$meta') return table.$meta
                                        const cur = _ctx.current
                                        const key = String(prop)
                                        if (cur && key in cur) return cur[key]
                                        return cur?.[table.$meta.columns.find((c) => c.$col.name === key)?.$col.name ?? key]
                                },
                        },
                )
        const _tickRunner = (fn: (tx: Tx, c?: unknown) => unknown) => ({
                async run(extra?: unknown) {
                        const primary = Object.values(tables)[0] as Table | undefined
                        if (!primary || !backend) return extra
                        const rel = backend.catalog.find(tableNameOf(primary))
                        const proxy = _currentTupleProxy(primary)
                        const rows: Row[] = []
                        rel?.heaps[0].scan((rid) => void rows.push(backend.catalog.readRow(rel, rid)))
                        for (const row of rows) {
                                _ctx.current = row
                                await Promise.resolve(fn(_txHandle(), proxy))
                        }
                        _ctx.current = null
                        return extra
                },
        })
        function transaction<R>(fn: (tx: Tx) => Promise<R> | R): Promise<R>
        function transaction(fn: (tx: Tx, c: unknown) => unknown): ReturnType<typeof _tickRunner>
        function transaction(fn: (tx: Tx, c?: unknown) => unknown): unknown {
                return (fn as Function).length >= 2 ? _tickRunner(fn) : _runScope(fn as (tx: Tx) => unknown)
        }
        const api = {
                ..._buildTx(),
                transaction,
                $count: async (table: Table, predicate?: SQL): Promise<number> => {
                        const rel = backend?.catalog.find(tableNameOf(table))
                        if (!rel) return 0
                        const pred = predicate ? compilePredicate(predicate, _ctx) : () => true
                        let n = 0
                        rel.heaps[0].scan((rid) => void (pred(backend!.catalog.readRow(rel, rid)) && n++))
                        return n
                },
                use: (adapter: unknown) => (adapters.push(adapter), api),
                all: (n: number) =>
                        Promise.resolve().then(() => {
                                if (config.execute) config.execute({ op: 'InitAll', tables, count: n, adapters })
                                else if (backend) for (const key in tables) for (const row of generateInitRows(tables[key], n)) backend.catalog.insertRow(tableNameOf(tables[key]), row)
                                return api
                        }),
                backend,
                tables,
                adapters,
        }
        return api
}
export type Database = ReturnType<typeof database>
