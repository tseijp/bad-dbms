import type { SQL } from './sql'
import type { Table } from './table'
import type { Columns } from './column'
import { createDatabase as createBackend } from '../backend/index'
import { compileExpr, compilePredicate, EvalCtx } from './compile'
import { planSelect, tableNameOf } from './plan'

export interface DatabaseConfig {
        execute?: (ast: any) => any
        tables?: Record<string, Table>
        pageSize?: number
        frameCount?: number
        ringCount?: number
        fileAdapter?: any
}

const projectionOf = (fields?: Columns | Record<string, SQL>) => {
        if (!fields) return undefined
        const out: Array<{ alias: string; expr: any }> = []
        for (const k in fields) out.push({ alias: k, expr: (fields as any)[k] })
        return out
}

const registerTables = (backend: any, tables: Record<string, Table>) => {
        if (!backend?.catalog?.register) return
        for (const key in tables) {
                const t = tables[key] as any
                const meta = t.$meta
                if (!meta) continue
                const def: any = {}
                for (const col of meta.columns) def[col.$col.name] = { type: col.$col.type, isPrimary: !!col.$col.primaryKey, isUnique: !!col.$col.unique, hasOrder: !!col.$col.hasOrder }
                backend.catalog.register(meta.name, def)
        }
}

const generateInitRows = (table: any, count: number): any[] => {
        const meta = table.$meta
        const orderCols = meta.columns.filter((c: any) => c.$col.hasOrder)
        const rows: any[] = []
        if (orderCols.length === 2) {
                const [cx, cy] = orderCols
                const [, wMax] = cx.$col.orderRange
                const [, hMax] = cy.$col.orderRange
                for (let i = 0; i < count; i++) {
                        const x = i % wMax
                        const y = Math.floor(i / wMax) % hMax
                        const row: any = { [cx.$col.name]: x, [cy.$col.name]: y }
                        for (const c of meta.columns) {
                                if (c.$col.hasOrder) continue
                                row[c.$col.name] = c.$col.defaultFn ? c.$col.defaultFn() : c.$col.defaultValue ?? 0
                        }
                        rows.push(row)
                }
                return rows
        }
        for (let i = 0; i < count; i++) {
                const row: any = {}
                for (const c of meta.columns) {
                        if (c.$col.hasOrder) row[c.$col.name] = i % (c.$col.orderRange?.[1] ?? count)
                        else row[c.$col.name] = c.$col.defaultFn ? c.$col.defaultFn() : c.$col.defaultValue ?? 0
                }
                rows.push(row)
        }
        return rows
}

const initAll = (backend: any, tables: Record<string, Table>, count: number) => {
        registerTables(backend, tables)
        for (const key in tables) {
                const t = tables[key]
                const rows = generateInitRows(t, count)
                for (const row of rows) backend.catalog.insertRow(tableNameOf(t), row)
        }
}

const runSelect = async (backend: any, cfg: DatabaseConfig, ast: any, ctx: EvalCtx) => {
        const { plan, proj } = planSelect(ast, ctx)
        const rows = await Promise.resolve(cfg.execute ? cfg.execute(plan) : backend.execute(plan))
        const arr = Array.isArray(rows) ? rows : []
        if (proj.hasAgg && (!ast.groupBy || ast.groupBy.length === 0)) return arr[0] ?? {}
        if (ast.limit !== undefined) return arr.slice(0, ast.limit)
        return arr
}

const runInsert = (backend: any, ast: any) => {
        const rows = ast.values ?? []
        const rids: any[] = []
        for (const row of rows) rids.push(backend.catalog.insertRow(tableNameOf(ast.table), row))
        return ast.returning ? rids : { rowCount: rids.length }
}

const runUpdate = (backend: any, cfg: DatabaseConfig, ast: any, ctx: EvalCtx) => {
        const predicate = ast.where ? compilePredicate(ast.where, ctx) : () => true
        const setters: Record<string, (row: any) => any> = {}
        for (const k in ast.set ?? {}) {
                const v = ast.set[k]
                if (v && v.kind === 'sql') setters[k] = compileExpr(v, ctx)
                else setters[k] = () => v
        }
        const plan = { op: 'Update', table: tableNameOf(ast.table), predicate, setters }
        return cfg.execute ? cfg.execute(plan) : backend.execute(plan)
}

const runDelete = (backend: any, cfg: DatabaseConfig, ast: any, ctx: EvalCtx) => {
        const predicate = ast.where ? compilePredicate(ast.where, ctx) : () => true
        const plan = { op: 'Delete', table: tableNameOf(ast.table), predicate }
        return cfg.execute ? cfg.execute(plan) : backend.execute(plan)
}

const makeSelect = (run: (ast: any) => any, ast: any) => {
        const b: any = {
                from(t: Table) { ast.table = t; return b },
                where(c?: SQL) { if (c) ast.where = c; return b },
                groupBy(...cols: any[]) { ast.groupBy = cols; return b },
                orderBy(...cols: any[]) { ast.orderBy = cols; return b },
                limit(n: number) { ast.limit = n; return b },
                offset(n: number) { ast.offset = n; return b },
                toAST() { return ast },
                then(r: any, j: any) { return Promise.resolve(run(ast)).then(r, j) },
        }
        return b
}

const makeInsert = (run: (ast: any) => any, t: Table) => {
        const ast: any = { op: 'Insert', table: t }
        const b: any = {
                values(rows: any) { ast.values = Array.isArray(rows) ? rows : [rows]; return b },
                returning(f?: any) { ast.returning = f ?? true; return b },
                then(r: any, j: any) { return Promise.resolve(run(ast)).then(r, j) },
        }
        return b
}

const makeUpdate = (run: (ast: any) => any, t: Table) => {
        const ast: any = { op: 'Update', table: t }
        const b: any = {
                set(v: Record<string, any>) { ast.set = v; return b },
                from(o: Table) { ast.from = o; return b },
                where(c?: SQL) { if (c) ast.where = c; return b },
                then(r: any, j: any) { return Promise.resolve(run(ast)).then(r, j) },
        }
        return b
}

const makeDelete = (run: (ast: any) => any, t: Table) => {
        const ast: any = { op: 'Delete', table: t }
        const b: any = {
                where(c?: SQL) { if (c) ast.where = c; return b },
                then(r: any, j: any) { return Promise.resolve(run(ast)).then(r, j) },
        }
        return b
}

const attachExpr = (node: any): any => {
        const self: any = { kind: 'sql', node }
        const wrapVal = (v: any) => (v && v.kind === 'sql' ? v : { kind: 'sql', node: { type: 'literal', value: v } })
        const mk = (n: any) => attachExpr(n)
        const ops: Array<[string, string]> = [['add', '+'], ['sub', '-'], ['mul', '*'], ['div', '/'], ['mod', '%'], ['eq', '='], ['ne', '!='], ['lt', '<'], ['lte', '<='], ['gt', '>'], ['gte', '>=']]
        for (const [m, op] of ops) self[m] = (v: any) => mk({ type: 'binop', op, args: [self, wrapVal(v)] })
        for (const f of ['toFloat', 'toInt', 'toBool']) self[f] = () => mk({ type: 'func', name: f, args: [self] })
        self.at = (i: any) => mk({ type: 'func', name: 'at', args: [self, wrapVal(i)] })
        return self
}

const currentTupleProxy = (table: Table) => {
        const meta = (table as any).$meta
        const handler: ProxyHandler<any> = {
                get(_t, prop: string) {
                        if (prop === '$meta') return meta
                        if (prop === '__isCurrent') return true
                        return attachExpr({ type: 'currentTuple', col: String(prop), tableName: meta.name })
                },
        }
        return new Proxy({}, handler)
}

const iterateTable = (backend: any, tableName: string): any[] => {
        const rel = backend.catalog.resolve(tableName)
        if (!rel) return []
        const desc = backend.catalog.tupleDescriptor(rel)
        const rows: any[] = []
        rel.heaps[0].scan((rid: any) => {
                const row: any = { __rid: rid }
                for (const col of desc.columns) row[col.name] = col.heap.read(rid)
                rows.push(row)
        })
        return rows
}

export const database = (config?: DatabaseConfig | Record<string, Table>) => {
        const isTablesOnly = !!config && !(config as DatabaseConfig).execute && !(config as DatabaseConfig).tables && !(config as DatabaseConfig).pageSize && !(config as DatabaseConfig).fileAdapter
        const cfg: DatabaseConfig = isTablesOnly ? { tables: config as any } : ((config as DatabaseConfig) ?? {})
        const backend = cfg.execute ? null : createBackend({ pageSize: cfg.pageSize, frameCount: cfg.frameCount, ringCount: cfg.ringCount, fileAdapter: cfg.fileAdapter })
        const ctx: EvalCtx = { current: null, params: null }
        const tables = cfg.tables ?? {}
        if (backend) registerTables(backend, tables)
        const adapters: any[] = []
        const run = (ast: any): any => {
                if (ast.op === 'Select') return runSelect(backend, cfg, ast, ctx)
                if (ast.op === 'Insert') return runInsert(backend, ast)
                if (ast.op === 'Update') return runUpdate(backend, cfg, ast, ctx)
                if (ast.op === 'Delete') return runDelete(backend, cfg, ast, ctx)
                return cfg.execute ? cfg.execute(ast) : backend.execute(ast)
        }
        const buildTx = () => ({
                select: (fields?: Columns | Record<string, SQL>) => makeSelect(run, { op: 'Select', projection: projectionOf(fields) }),
                insert: (t: Table) => makeInsert(run, t),
                update: (t: Table) => makeUpdate(run, t),
                delete: (t: Table) => makeDelete(run, t),
        })
        const transaction = (fn: (tx: any, c: any) => Promise<any> | any) => {
                const primary = Object.values(tables)[0] as Table | undefined
                return {
                        async run(extra?: any) {
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
                }
        }
        const api: any = {
                ...buildTx(),
                transaction,
                use(adapter: any) { adapters.push(adapter); return api },
                async all(n: number) {
                        if (backend) initAll(backend, tables, n)
                        return api
                },
                then(resolve: any) { return Promise.resolve(api).then(resolve) },
                backend,
                tables,
                adapters,
        }
        return api
}

export type Database = ReturnType<typeof database>
