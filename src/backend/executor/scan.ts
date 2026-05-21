import type { SeqScanOp, NamedScanOp, IndexScanOp, Row, ProjectorSpec } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator, Rid } from '../types'
import { tableNameOf, buildRow, collectRids, EMPTY_ITER, compilePredicate, stripRid, PredInput } from './utils'
export const createSeqScan = (catalog: Catalog, ast: SeqScanOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const rids = collectRids(rel.heaps[0])
        let i = 0
        const next = () => {
                if (i >= rids.length) return null
                return buildRow(catalog, rel, rids[i++])
        }
        return { next, close: () => {} }
}
export const createNamedScan = (catalog: Catalog, ast: NamedScanOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const rids = collectRids(rel.heaps[0])
        let i = 0
        const next = () => {
                if (i >= rids.length) return null
                return { [ast.name]: stripRid(buildRow(catalog, rel, rids[i++])) } as Row
        }
        return { next, close: () => {} }
}
export const createIndexScan = (catalog: Catalog, ast: IndexScanOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const idx = catalog.findIndex(rel, ast.indexName)
        if (!idx) return EMPTY_ITER
        const range = ast.range ?? {}
        const start = range.start ?? -2147483648
        const end = range.end ?? 2147483647
        const rids: Rid[] = []
        if (idx.kind === 'nbtree' && 'forward' in idx.handle) idx.handle.forward(start, end, (rid: Rid) => void rids.push(rid))
        else if ('lookup' in idx.handle) idx.handle.lookup(start, (rid: Rid) => void rids.push(rid))
        let i = 0
        const next = () => (i >= rids.length ? null : buildRow(catalog, rel, rids[i++]))
        return { next, close: () => {} }
}
export const createFilter = (child: RowIterator, predicate: PredInput): RowIterator => {
        const fn = compilePredicate(predicate)
        const next = () => {
                while (true) {
                        const r = child.next()
                        if (r === null) return null
                        if (fn(r)) return r
                }
        }
        return { next, close: () => child.close() }
}
export const createProjection = (child: RowIterator, fields: string[], projectors?: ProjectorSpec[]): RowIterator => {
        const next = () => {
                const r = child.next()
                if (r === null) return null
                const out: Row = {}
                if (projectors && projectors.length > 0) {
                        for (const p of projectors) out[p.alias] = p.eval(r)
                        return out
                }
                for (const f of fields) out[f] = r[f]
                return out
        }
        return { next, close: () => child.close() }
}
