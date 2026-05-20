import type { SQL, SqlValue, Row, Rid, PhysicalOp } from '../shared/types'
import type { Table, Columns, DatabaseConfig, SelectAst, InsertAst, UpdateAst, DeleteAst } from './types'
import { createDatabase as createBackend } from '../backend/index'
import { compileExpr, compilePredicate, EvalCtx } from './compile'
import { planSelect, tableNameOf } from './plan'

export type { DatabaseConfig } from './types'

type Backend = ReturnType<typeof createBackend>
type ProjItem = { alias: string; expr: SQL }
type RunFn = (ast: SelectAst | InsertAst | UpdateAst | DeleteAst) => unknown

const isSqlValue = (v: unknown): v is SQL => !!v && typeof v === 'object' && (v as { kind?: string }).kind === 'sql'

const projectionOf = (fields?: Columns | Record<string, SQL>): ProjItem[] | undefined => {
        if (!fields) return undefined
        const out: ProjItem[] = []
        for (const k in fields) out.push({ alias: k, expr: (fields as Record<string, SQL>)[k] })
        return out
}

const registerTables = (backend: Backend, tables: Record<string, Table>) => {
        if (!backend?.catalog?.register) return
        for (const key in tables) {
                const meta = tables[key].$meta
                if (!meta) continue
                const def: Record<string, unknown> = {}
                for (const col of meta.columns) def[col.$col.name] = { type: col.$col.type, isPrimary: !!col.$col.primaryKey, isUnique: !!col.$col.unique, hasOrder: !!col.$col.hasOrder }
                backend.catalog.register(meta.name, def)
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

const runSelect = async (backend: Backend | null, cfg: DatabaseConfig, ast: SelectAst, ctx: EvalCtx): Promise<unknown> => {
        const { plan, proj } = planSelect(ast, ctx)
        const rows = await Promise.resolve(dispatch(backend, cfg, plan))
        if (isDispatchError(rows)) return rows
        const arr = Array.isArray(rows) ? (rows as Row[]) : []
        if (proj.hasAgg && (!ast.groupBy || ast.groupBy.length === 0)) return arr[0] ?? {}
        if (ast.limit !== undefined) return arr.slice(0, ast.limit)
        return arr
}

const runInsert = (backend: Backend | null, cfg: DatabaseConfig, ast: InsertAst): unknown => {
        const rows = ast.values ?? []
        const plan: PhysicalOp = { op: 'Insert', table: tableNameOf(ast.table), values: rows, returning: !!ast.returning }
        if (cfg.execute) return cfg.execute(plan)
        if (!backend) return { error: 'no-backend', op: 'Insert' } as DispatchError
        const rids: Rid[] = []
        for (const row of rows) {
                const rid = backend.catalog.insertRow(tableNameOf(ast.table), row)
                if (rid) rids.push(rid)
        }
        return ast.returning ? rids : { rowCount: rids.length }
}

const runUpdate = (backend: Backend | null, cfg: DatabaseConfig, ast: UpdateAst, ctx: EvalCtx): unknown => {
        const predicate = ast.where ? compilePredicate(ast.where, ctx) : () => true
        const setters: Record<string, (row: Row) => unknown> = {}
        for (const k in ast.set ?? {}) {
                const v = (ast.set as Record<string, SqlValue>)[k]
                if (isSqlValue(v)) setters[k] = compileExpr(v, ctx)
                else setters[k] = () => v
        }
        return dispatch(backend, cfg, { op: 'Update', table: tableNameOf(ast.table), predicate, setters })
}

const runDelete = (backend: Backend | null, cfg: DatabaseConfig, ast: DeleteAst, ctx: EvalCtx): unknown => {
        const predicate = ast.where ? compilePredicate(ast.where, ctx) : () => true
        return dispatch(backend, cfg, { op: 'Delete', table: tableNameOf(ast.table), predicate })
}

const makeSelect = (run: RunFn, ast: SelectAst) => {
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
                        return Promise.resolve(run(ast)).then(r, j)
                },
        }
        return b
}

const makeUpdate = (run: RunFn, t: Table) => {
        const ast: UpdateAst = { op: 'Update', table: t }
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
                then(r: (v: unknown) => unknown, j?: (e: unknown) => unknown) {
                        return Promise.resolve(run(ast)).then(r, j)
                },
        }
        return b
}

const makeDelete = (run: RunFn, t: Table) => {
        const ast: DeleteAst = { op: 'Delete', table: t }
        const b = {
                where(c?: SQL) {
                        if (c) ast.where = c
                        return b
                },
                then(r: (v: unknown) => unknown, j?: (e: unknown) => unknown) {
                        return Promise.resolve(run(ast)).then(r, j)
                },
        }
        return b
}

const wrapVal = (v: SqlValue): SQL => (v && (v as SQL).kind === 'sql' ? (v as SQL) : ({ kind: 'sql', node: { type: 'literal', value: v } } as SQL))

const attachExpr = (node: SQL['node']): SQL => {
        const self = { kind: 'sql' as const, node } as SQL
        const mk = (n: SQL['node']) => attachExpr(n)
        self.add = (v) => mk({ type: 'binop', op: '+', args: [self, wrapVal(v)] })
        self.sub = (v) => mk({ type: 'binop', op: '-', args: [self, wrapVal(v)] })
        self.mul = (v) => mk({ type: 'binop', op: '*', args: [self, wrapVal(v)] })
        self.div = (v) => mk({ type: 'binop', op: '/', args: [self, wrapVal(v)] })
        self.mod = (v) => mk({ type: 'binop', op: '%', args: [self, wrapVal(v)] })
        self.eq = (v) => mk({ type: 'binop', op: '=', args: [self, wrapVal(v)] })
        self.ne = (v) => mk({ type: 'binop', op: '!=', args: [self, wrapVal(v)] })
        self.lt = (v) => mk({ type: 'binop', op: '<', args: [self, wrapVal(v)] })
        self.lte = (v) => mk({ type: 'binop', op: '<=', args: [self, wrapVal(v)] })
        self.gt = (v) => mk({ type: 'binop', op: '>', args: [self, wrapVal(v)] })
        self.gte = (v) => mk({ type: 'binop', op: '>=', args: [self, wrapVal(v)] })
        self.toFloat = () => mk({ type: 'func', name: 'toFloat', args: [self] })
        self.toInt = () => mk({ type: 'func', name: 'toInt', args: [self] })
        self.toBool = () => mk({ type: 'func', name: 'toBool', args: [self] })
        self.at = (i) => mk({ type: 'func', name: 'at', args: [self, wrapVal(i)] })
        return self
}

const currentTupleProxy = (table: Table) => {
        const meta = table.$meta
        const handler: ProxyHandler<Record<string, unknown>> = {
                get(_t, prop) {
                        if (prop === '$meta') return meta
                        return attachExpr({ type: 'currentTuple', col: String(prop), tableName: meta.name })
                },
        }
        return new Proxy({}, handler)
}

const iterateTable = (backend: Backend, tableName: string): Row[] => {
        const rel = backend.catalog.resolve(tableName)
        if (!rel) return []
        const desc = backend.catalog.tupleDescriptor(rel)
        const rows: Row[] = []
        rel.heaps[0].scan((rid) => {
                const row: Row = { __rid: rid }
                for (const col of desc.columns) row[col.name] = col.heap.read(rid)
                rows.push(row)
        })
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
                insert: (t: Table) => makeInsert(run, t),
                update: (t: Table) => makeUpdate(run, t),
                delete: (t: Table) => makeDelete(run, t),
        })
        type Tx = ReturnType<typeof buildTx>
        type TickRunner = { run(extra?: unknown): Promise<unknown> }
        const transaction = (fn: (tx: Tx, c?: unknown) => Promise<unknown> | unknown): TickRunner => ({
                async run(extra?: unknown) {
                        if (!usesCurrentTuple(fn as (...args: unknown[]) => unknown)) return fn(buildTx())
                        const primary = Object.values(tables)[0] as Table | undefined
                        if (!primary || !backend) return extra
                        const proxy = currentTupleProxy(primary)
                        const rows = iterateTable(backend, tableNameOf(primary))
                        for (const row of rows) {
                                ctx.current = row
                                await Promise.resolve(fn(buildTx(), proxy))
                        }
                        ctx.current = null
                        return extra
                },
        })
        const api = {
                ...buildTx(),
                transaction,
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
