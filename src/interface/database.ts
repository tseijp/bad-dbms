import type { SQL, SqlValue, Row, PhysicalOp, ColumnType } from '../shared/types'
import type { Table, Columns, DatabaseConfig, SelectAst, InsertAst, UpdateAst, DeleteAst, JoinClause, ProjItem } from './types'
import { createDatabase as createBackend } from '../backend/index'
import { compileExpr, compilePredicate, EvalCtx } from './compile'
import { planSelect, tableNameOf } from './plan'
export type { DatabaseConfig } from './types'
type Backend = ReturnType<typeof createBackend>
type RunFn = (ast: SelectAst | InsertAst | UpdateAst | DeleteAst) => unknown
const isSqlValue = (v: unknown): v is SQL => !!v && typeof v === 'object' && (v as { kind?: string }).kind === 'sql'
const projectionOf = (fields?: Columns | Record<string, SQL>): ProjItem[] | undefined => {
        if (!fields) return undefined
        const out: ProjItem[] = []
        for (const k in fields) out.push({ alias: k, expr: (fields as Record<string, SQL>)[k] })
        return out
}
interface ColDef {
        key: string
        name: string
        type: ColumnType
        isPrimary: boolean
        isUnique: boolean
        hasOrder: boolean
        notNull: boolean
        isText: boolean
        defaultValue?: unknown
        defaultFn?: () => unknown
        references?: { table: string; column: string; onDelete?: string }
}
const propertyKeyOf = (table: Table, col: Table['$meta']['columns'][number]): string => {
        const rec = table as unknown as Record<string, unknown>
        for (const k in rec) {
                if (k === '$meta' || k === 'kind' || k === 'node') continue
                if (rec[k] === col) return k
        }
        return col.$col.name
}
const resolveReference = (col: Table['$meta']['columns'][number]): ColDef['references'] => {
        const ref = col.$col.references
        if (!ref) return undefined
        const target = ref.fn() as { $col?: { name?: string; tableName?: string } }
        const tc = target?.$col
        if (!tc || !tc.tableName || !tc.name) return undefined
        return { table: tc.tableName, column: tc.name, onDelete: ref.onDelete }
}
const columnDefsOf = (table: Table): Record<string, ColDef> => {
        const def: Record<string, ColDef> = {}
        for (const col of table.$meta.columns) {
                const c = col.$col
                def[propertyKeyOf(table, col)] = {
                        key: propertyKeyOf(table, col),
                        name: c.name,
                        type: c.type,
                        isPrimary: !!c.primaryKey,
                        isUnique: !!c.unique,
                        hasOrder: !!c.hasOrder,
                        notNull: !!c.notNull || !!c.primaryKey,
                        isText: c.tag === 'str',
                        defaultValue: c.defaultValue,
                        defaultFn: c.defaultFn,
                        references: resolveReference(col),
                }
        }
        return def
}
const registerTables = (backend: Backend, tables: Record<string, Table>) => {
        if (!backend?.catalog?.register) return
        for (const key in tables) {
                const meta = tables[key].$meta
                if (!meta) continue
                backend.catalog.register(meta.name, columnDefsOf(tables[key]))
        }
}
const generateInitRows = (table: Table, count: number): Row[] => {
        const meta = table.$meta
        const orderCols = meta.columns.filter((c) => c.$col.hasOrder)
        const rows: Row[] = []
        const fillRest = (row: Row, skipOrder: boolean) => {
                for (const c of meta.columns) {
                        if (skipOrder && c.$col.hasOrder) continue
                        row[c.$col.name] = c.$col.defaultFn ? c.$col.defaultFn() : (c.$col.defaultValue ?? 0)
                }
        }
        if (orderCols.length === 2) {
                const wMax = orderCols[0].$col.orderRange?.[1] ?? count
                const hMax = orderCols[1].$col.orderRange?.[1] ?? count
                for (let i = 0; i < count; i++) {
                        const row: Row = { [orderCols[0].$col.name]: i % wMax, [orderCols[1].$col.name]: Math.floor(i / wMax) % hMax }
                        fillRest(row, true)
                        rows.push(row)
                }
                return rows
        }
        for (let i = 0; i < count; i++) {
                const row: Row = {}
                for (const c of meta.columns) {
                        if (c.$col.hasOrder) row[c.$col.name] = i % (c.$col.orderRange?.[1] ?? count)
                        else row[c.$col.name] = c.$col.defaultFn ? c.$col.defaultFn() : (c.$col.defaultValue ?? 0)
                }
                rows.push(row)
        }
        return rows
}
const initAll = (backend: Backend, tables: Record<string, Table>, count: number) => {
        registerTables(backend, tables)
        for (const key in tables) {
                const rows = generateInitRows(tables[key], count)
                for (const row of rows) backend.catalog.insertRow(tableNameOf(tables[key]), row)
        }
}
export interface DispatchError {
        error: 'no-backend'
        op: string
}
const dispatch = (backend: Backend | null, cfg: DatabaseConfig, plan: PhysicalOp): unknown => {
        if (cfg.execute) return cfg.execute(plan)
        if (backend) return backend.execute(plan)
        return { error: 'no-backend', op: plan.op } as DispatchError
}
const isDispatchError = (v: unknown): v is DispatchError => !!v && typeof v === 'object' && (v as DispatchError).error === 'no-backend'
const stripRid = (row: Row): Row => {
        if (!row || typeof row !== 'object' || !('__rid' in row)) return row
        const out: Row = {}
        for (const k in row) if (k !== '__rid') out[k] = row[k]
        return out
}
const runSelect = async (backend: Backend | null, cfg: DatabaseConfig, ast: SelectAst, ctx: EvalCtx): Promise<unknown> => {
        const { plan } = planSelect(ast, ctx)
        const rows = await Promise.resolve(dispatch(backend, cfg, plan))
        if (isDispatchError(rows)) return rows
        return (Array.isArray(rows) ? (rows as Row[]) : []).map(stripRid)
}
const runInsert = async (backend: Backend | null, cfg: DatabaseConfig, ast: InsertAst): Promise<unknown> => {
        const rows = ast.values ?? []
        const plan: PhysicalOp = { op: 'Insert', table: tableNameOf(ast.table), values: rows, returning: !!ast.returning }
        if (cfg.execute) return cfg.execute(plan)
        if (!backend) return { error: 'no-backend', op: 'Insert' } as DispatchError
        const rids = backend.catalog.insertRows(tableNameOf(ast.table), rows)
        return ast.returning ? rids : { rowCount: rids.length }
}
const runUpdate = async (backend: Backend | null, cfg: DatabaseConfig, ast: UpdateAst, ctx: EvalCtx): Promise<unknown> => {
        const predicate = ast.where ? compilePredicate(ast.where, ctx) : () => true
        const setters: Record<string, (row: Row) => unknown> = {}
        for (const k in ast.set ?? {}) {
                const v = (ast.set as Record<string, SqlValue>)[k]
                if (isSqlValue(v)) setters[k] = compileExpr(v, ctx)
                else setters[k] = () => v
        }
        const rows = await Promise.resolve(dispatch(backend, cfg, { op: 'Update', table: tableNameOf(ast.table), predicate, setters, returning: !!ast.returning }))
        if (isDispatchError(rows)) return rows
        const arr = Array.isArray(rows) ? (rows as Row[]) : []
        if (ast.returning) return arr.map(stripRid)
        return (arr[0] as Row) ?? { rowCount: 0, changes: 0 }
}
const runDelete = async (backend: Backend | null, cfg: DatabaseConfig, ast: DeleteAst, ctx: EvalCtx): Promise<unknown> => {
        const predicate = ast.where ? compilePredicate(ast.where, ctx) : () => true
        const rows = await Promise.resolve(dispatch(backend, cfg, { op: 'Delete', table: tableNameOf(ast.table), predicate, returning: !!ast.returning }))
        if (isDispatchError(rows)) return rows
        const arr = Array.isArray(rows) ? (rows as Row[]) : []
        if (ast.returning) return arr.map(stripRid)
        return (arr[0] as Row) ?? { rowCount: 0, deleted: 0 }
}
const makeSelect = (run: RunFn, ast: SelectAst) => {
        const addJoin = (kind: JoinClause['kind'], table: Table, on: SQL) => {
                ast.joins = ast.joins ?? []
                ast.joins.push({ kind, table, on })
                return b
        }
        const b = {
                from(t: Table) {
                        ast.table = t
                        return b
                },
                where(c?: SQL) {
                        if (c) ast.where = c
                        return b
                },
                groupBy(...cols: SQL[]) {
                        ast.groupBy = cols
                        return b
                },
                having(c?: SQL) {
                        if (c) ast.having = c
                        return b
                },
                orderBy(...cols: SQL[]) {
                        ast.orderBy = cols
                        return b
                },
                limit(n: number) {
                        ast.limit = n
                        return b
                },
                offset(n: number) {
                        ast.offset = n
                        return b
                },
                innerJoin(table: Table, on: SQL) {
                        return addJoin('inner', table, on)
                },
                leftJoin(table: Table, on: SQL) {
                        return addJoin('left', table, on)
                },
                rightJoin(table: Table, on: SQL) {
                        return addJoin('right', table, on)
                },
                fullJoin(table: Table, on: SQL) {
                        return addJoin('full', table, on)
                },
                toAST() {
                        return ast
                },
                then(r: (v: unknown) => unknown, j?: (e: unknown) => unknown) {
                        return Promise.resolve(run(ast)).then(r, j)
                },
        }
        return b
}
const makeInsert = (run: RunFn, t: Table) => {
        const ast: InsertAst = { op: 'Insert', table: t }
        let promise: Promise<unknown> | null = null
        const fire = () => (promise ?? (promise = Promise.resolve(run(ast))))
        const b = {
                values(rows: Record<string, number> | Record<string, number>[]) {
                        ast.values = Array.isArray(rows) ? rows : [rows]
                        return b
                },
                returning() {
                        ast.returning = true
                        return b
                },
                then(r: (v: unknown) => unknown, j?: (e: unknown) => unknown) {
                        return fire().then(r, j)
                },
                catch(j: (e: unknown) => unknown) {
                        return fire().catch(j)
                },
        }
        return b
}
const makeUpdate = (run: RunFn, t: Table) => {
        const ast: UpdateAst = { op: 'Update', table: t }
        let promise: Promise<unknown> | null = null
        const fire = () => (promise ?? (promise = Promise.resolve(run(ast))))
        const b = {
                set(v: Record<string, SqlValue>) {
                        ast.set = v
                        return b
                },
                from(o: Table) {
                        ast.from = o
                        return b
                },
                where(c?: SQL) {
                        if (c) ast.where = c
                        return b
                },
                returning() {
                        ast.returning = true
                        return b
                },
                then(r: (v: unknown) => unknown, j?: (e: unknown) => unknown) {
                        return fire().then(r, j)
                },
                catch(j: (e: unknown) => unknown) {
                        return fire().catch(j)
                },
        }
        return b
}
const makeDelete = (run: RunFn, t: Table) => {
        const ast: DeleteAst = { op: 'Delete', table: t }
        let promise: Promise<unknown> | null = null
        const fire = () => (promise ?? (promise = Promise.resolve(run(ast))))
        const b = {
                where(c?: SQL) {
                        if (c) ast.where = c
                        return b
                },
                returning() {
                        ast.returning = true
                        return b
                },
                then(r: (v: unknown) => unknown, j?: (e: unknown) => unknown) {
                        return fire().then(r, j)
                },
                catch(j: (e: unknown) => unknown) {
                        return fire().catch(j)
                },
        }
        return b
}
const currentTupleProxy = (table: Table, ctx: EvalCtx) => {
        const meta = table.$meta
        const handler: ProxyHandler<Record<string, unknown>> = {
                get(_t, prop) {
                        if (prop === '$meta') return meta
                        const key = String(prop)
                        const cur = ctx.current
                        if (cur && key in cur) return cur[key]
                        const col = meta.columns.find((c) => c.$col.name === key)
                        return col ? cur?.[col.$col.name] : undefined
                },
        }
        return new Proxy({}, handler)
}
const iterateTable = (backend: Backend, tableName: string): Row[] => {
        const rel = backend.catalog.find(tableName)
        if (!rel) return []
        const rows: Row[] = []
        rel.heaps[0].scan((rid) => void rows.push(backend.catalog.readRow(rel, rid)))
        return rows
}
const isConfig = (v: unknown): v is DatabaseConfig => {
        if (!v || typeof v !== 'object') return false
        const c = v as DatabaseConfig
        return !!(c.execute || c.pageSize || c.fileAdapter || c.frameCount || c.ringCount || c.tables)
}
const normalizeArgs = (a?: unknown, b?: unknown): DatabaseConfig => {
        if (!a) return {}
        if (isConfig(a)) return b ? { ...a, tables: b as Record<string, Table> } : a
        const cfg = isConfig(b) ? b : {}
        return { ...cfg, tables: a as Record<string, Table> }
}
const usesCurrentTuple = (fn: (...args: unknown[]) => unknown) => fn.length >= 2
export const database = (schemaOrConfig?: DatabaseConfig | Record<string, Table>, maybeConfig?: DatabaseConfig | Record<string, Table>) => {
        const cfg = normalizeArgs(schemaOrConfig, maybeConfig)
        const backend: Backend | null = cfg.execute ? null : createBackend({ pageSize: cfg.pageSize, frameCount: cfg.frameCount, ringCount: cfg.ringCount, fileAdapter: cfg.fileAdapter })
        const ctx: EvalCtx = { current: null, params: null }
        const tables = cfg.tables ?? {}
        if (backend) registerTables(backend, tables)
        const adapters: unknown[] = []
        const run: RunFn = (ast) => {
                if (ast.op === 'Select') return runSelect(backend, cfg, ast, ctx)
                if (ast.op === 'Insert') return runInsert(backend, cfg, ast)
                if (ast.op === 'Update') return runUpdate(backend, cfg, ast, ctx)
                if (ast.op === 'Delete') return runDelete(backend, cfg, ast, ctx)
                return undefined
        }
        const buildTx = () => ({
                select: (fields?: Columns | Record<string, SQL>) => makeSelect(run, { op: 'Select', projection: projectionOf(fields) }),
                selectDistinct: (fields?: Columns | Record<string, SQL>) => makeSelect(run, { op: 'Select', projection: projectionOf(fields), distinct: true }),
                insert: (t: Table) => makeInsert(run, t),
                update: (t: Table) => makeUpdate(run, t),
                delete: (t: Table) => makeDelete(run, t),
        })
        type TxApi = ReturnType<typeof buildTx>
        type Tx = TxApi & { rollback(): never; transaction<T>(fn: (inner: Tx) => Promise<T> | T): Promise<T> }
        type TickRunner = { run(extra?: unknown): Promise<unknown> }
        const ROLLBACK = Symbol('rollback')
        const isRollback = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { __rollback?: symbol }).__rollback === ROLLBACK
        const runScope = async <T>(fn: (tx: Tx) => Promise<T> | T): Promise<T> => {
                const snap = backend ? backend.catalog.snapshot() : null
                const tx = buildTxHandle()
                type Settled = { ok: true; value: T } | { ok: false; error: unknown }
                const settled: Settled = await Promise.resolve(fn(tx)).then(
                        (value: T): Settled => ({ ok: true, value }),
                        (error: unknown): Settled => ({ ok: false, error }),
                )
                if (settled.ok) return settled.value
                if (backend && snap) backend.catalog.restore(snap)
                if (isRollback(settled.error)) return undefined as T
                throw settled.error
        }
        const buildTxHandle = (): Tx => {
                const base = buildTx()
                const handle = {
                        ...base,
                        rollback(): never {
                                throw { __rollback: ROLLBACK }
                        },
                        transaction<T>(fn: (inner: Tx) => Promise<T> | T): Promise<T> {
                                return runScope(fn)
                        },
                } as Tx
                return handle
        }
        const runCallback = <R>(fn: (tx: Tx) => Promise<R> | R): Promise<R> => runScope(fn)
        function transaction<R>(fn: (tx: Tx) => Promise<R> | R): Promise<R>
        function transaction(fn: (tx: Tx, c: unknown) => Promise<unknown> | unknown): TickRunner
        function transaction(fn: (tx: Tx, c?: unknown) => Promise<unknown> | unknown): Promise<unknown> | TickRunner {
                if (!usesCurrentTuple(fn as (...args: unknown[]) => unknown)) return runCallback(fn as (tx: Tx) => unknown)
                return tickRunner(fn)
        }
        const tickRunner = (fn: (tx: Tx, c?: unknown) => Promise<unknown> | unknown): TickRunner => ({
                async run(extra?: unknown) {
                        const primary = Object.values(tables)[0] as Table | undefined
                        if (!primary || !backend) return extra
                        const proxy = currentTupleProxy(primary, ctx)
                        const rows = iterateTable(backend, tableNameOf(primary))
                        for (const row of rows) {
                                ctx.current = row
                                await Promise.resolve(fn(buildTxHandle(), proxy))
                        }
                        ctx.current = null
                        return extra
                },
        })
        const $count = async (table: Table, predicate?: SQL): Promise<number> => {
                if (!backend) return 0
                const rel = backend.catalog.find(tableNameOf(table))
                if (!rel) return 0
                const pred = predicate ? compilePredicate(predicate, ctx) : () => true
                let n = 0
                rel.heaps[0].scan((rid) => {
                        if (pred(backend.catalog.readRow(rel, rid))) n++
                })
                return n
        }
        const api = {
                ...buildTx(),
                transaction,
                $count,
                use(adapter: unknown) {
                        adapters.push(adapter)
                        return api
                },
                all(n: number) {
                        return Promise.resolve().then(() => {
                                if (cfg.execute) cfg.execute({ op: 'InitAll', tables, count: n, adapters })
                                else if (backend) initAll(backend, tables, n)
                                return api
                        })
                },
                backend,
                tables,
                adapters,
        }
        return api
}
export type Database = ReturnType<typeof database>
