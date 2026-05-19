import type { SQL } from './sql'
import type { Table } from './table'
import type { Column, Columns } from './column'

export interface DatabaseConfig {
        execute?: (ast: any) => Promise<any>
        tables?: Record<string, Table>
}

const colName = (c: any): string => (c && c.$col ? c.$col.name : c && c.node ? c.node.name : String(c))

const projection = (fields?: Columns | Record<string, SQL>) => {
        if (!fields) return undefined
        const out: Array<{ alias: string; expr: any }> = []
        for (const k in fields) out.push({ alias: k, expr: (fields as any)[k] })
        return out
}

const runExec = (cfg: DatabaseConfig, ast: any): Promise<any> => {
        if (cfg.execute) return cfg.execute(ast)
        return Promise.resolve({ ast })
}

const makeSelect = (cfg: DatabaseConfig, ast: any) => {
        const builder: any = {
                from(t: Table) {
                        ast.table = t
                        return builder
                },
                where(cond: SQL | undefined) {
                        if (cond) ast.where = cond
                        return builder
                },
                groupBy(...cols: any[]) {
                        ast.groupBy = cols
                        return builder
                },
                orderBy(...cols: any[]) {
                        ast.orderBy = cols
                        return builder
                },
                limit(n: number) {
                        ast.limit = n
                        return builder
                },
                offset(n: number) {
                        ast.offset = n
                        return builder
                },
                toAST() {
                        return ast
                },
                then(resolve: any, reject: any) {
                        return runExec(cfg, ast).then(resolve, reject)
                },
        }
        return builder
}

const makeInsert = (cfg: DatabaseConfig, t: Table) => {
        const ast: any = { op: 'Insert', table: t }
        const builder: any = {
                values(rows: any) {
                        ast.values = Array.isArray(rows) ? rows : [rows]
                        return builder
                },
                returning(fields?: any) {
                        ast.returning = fields || true
                        return builder
                },
                then(resolve: any, reject: any) {
                        return runExec(cfg, ast).then(resolve, reject)
                },
        }
        return builder
}

const makeUpdate = (cfg: DatabaseConfig, t: Table) => {
        const ast: any = { op: 'Update', table: t }
        const builder: any = {
                set(values: Record<string, any>) {
                        ast.set = values
                        return builder
                },
                from(other: Table) {
                        ast.from = other
                        return builder
                },
                where(cond: SQL | undefined) {
                        if (cond) ast.where = cond
                        return builder
                },
                then(resolve: any, reject: any) {
                        return runExec(cfg, ast).then(resolve, reject)
                },
        }
        return builder
}

const makeDelete = (cfg: DatabaseConfig, t: Table) => {
        const ast: any = { op: 'Delete', table: t }
        const builder: any = {
                where(cond: SQL | undefined) {
                        if (cond) ast.where = cond
                        return builder
                },
                then(resolve: any, reject: any) {
                        return runExec(cfg, ast).then(resolve, reject)
                },
        }
        return builder
}

const makeTx = (cfg: DatabaseConfig) => ({
        select: (fields?: Columns | Record<string, SQL>) => makeSelect(cfg, { op: 'Select', projection: projection(fields) }),
        insert: (t: Table) => makeInsert(cfg, t),
        update: (t: Table) => makeUpdate(cfg, t),
        delete: (t: Table) => makeDelete(cfg, t),
})

export const database = (config?: DatabaseConfig | Record<string, Table>) => {
        const cfg: DatabaseConfig = config && (config as any).execute === undefined && !(config as any).tables ? { tables: config as any } : (config as DatabaseConfig) || {}
        const adapters: any[] = []
        const api: any = {
                select(fields?: Columns | Record<string, SQL>) {
                        return makeSelect(cfg, { op: 'Select', projection: projection(fields) })
                },
                insert(t: Table) {
                        return makeInsert(cfg, t)
                },
                update(t: Table) {
                        return makeUpdate(cfg, t)
                },
                delete(t: Table) {
                        return makeDelete(cfg, t)
                },
                transaction(fn: (tx: any, ctx?: any) => Promise<void> | void) {
                        const tx = makeTx(cfg)
                        const wrapped = {
                                run: (ctx?: any) => Promise.resolve(fn(tx, ctx)),
                        }
                        return wrapped
                },
                use(adapter: any) {
                        adapters.push(adapter)
                        return api
                },
                async all(n: number) {
                        const ast = { op: 'InitAll', count: n, tables: cfg.tables || {}, adapters }
                        return runExec(cfg, ast)
                },
                _resolveColumn: colName,
        }
        return api
}

export type Database = ReturnType<typeof database>
