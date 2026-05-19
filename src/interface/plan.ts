import { colNameOf, compilePredicate, EvalCtx } from './compile'

const tableNameOf = (t: any): string => (t?.$meta ? t.$meta.name : t?.node?.name ?? '')

export interface ProjInfo {
        fields: Array<{ alias: string; field: string }>
        aggs: any[]
        hasAgg: boolean
}

export const buildProjection = (projection: any): ProjInfo => {
        const fields: Array<{ alias: string; field: string }> = []
        const aggs: any[] = []
        if (!projection) return { fields, aggs, hasAgg: false }
        for (const p of projection) {
                const node = p.expr?.node ?? p.expr
                if (node?.type === 'aggregate') {
                        const arg = node.args[0]?.node ?? node.args[0]
                        const field = arg && arg.type === 'column' ? arg.name : ''
                        aggs.push({ name: p.alias, kind: node.name, field })
                        continue
                }
                if (node?.type === 'column') {
                        fields.push({ alias: p.alias, field: node.name })
                        continue
                }
                fields.push({ alias: p.alias, field: p.alias })
        }
        return { fields, aggs, hasAgg: aggs.length > 0 }
}

export const planSelect = (ast: any, ctx: EvalCtx) => {
        const tableName = tableNameOf(ast.table)
        let plan: any = { op: 'SeqScan', table: tableName }
        if (ast.where) plan = { op: 'Filter', child: plan, predicate: compilePredicate(ast.where, ctx) }
        const proj = buildProjection(ast.projection)
        if (proj.hasAgg) {
                const groupBy = (ast.groupBy ?? []).map(colNameOf)
                plan = { op: 'Aggregate', child: plan, groupBy, aggs: proj.aggs }
                const out = [...groupBy, ...proj.aggs.map((a: any) => a.name)]
                if (out.length > 0) plan = { op: 'Projection', child: plan, fields: out }
        } else if (proj.fields.length > 0) plan = { op: 'Projection', child: plan, fields: proj.fields.map((f) => f.field) }
        if (ast.orderBy?.length > 0) {
                const keys = ast.orderBy.map((o: any) => {
                        const node = o?.node ?? o
                        if (node?.type === 'order') return { field: colNameOf(node.col), dir: node.dir }
                        return { field: colNameOf(o), dir: 'asc' }
                })
                plan = { op: 'Sort', child: plan, keys }
        }
        return { plan, proj, tableName }
}

export { tableNameOf }
