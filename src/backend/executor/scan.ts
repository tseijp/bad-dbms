import type { SeqScanOp, NamedScanOp, Row, ProjectorSpec } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator } from '../types'
import { tableNameOf, buildRow, collectRids, compilePredicate, stripRid, PredInput } from './utils'
export const createSeqScan = (catalog: Catalog, ast: SeqScanOp): RowIterator => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _rids = collectRids(_rel.heaps[0])
        let _i = 0
        return {
                next() {
                        return _i >= _rids.length ? null : buildRow(catalog, _rel, _rids[_i++])
                },
                close() {},
        }
}
export const createNamedScan = (catalog: Catalog, ast: NamedScanOp): RowIterator => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _rids = collectRids(_rel.heaps[0])
        let _i = 0
        return {
                next() {
                        return _i >= _rids.length ? null : ({ [ast.name]: stripRid(buildRow(catalog, _rel, _rids[_i++])) } as Row)
                },
                close() {},
        }
}
export const createFilter = (child: RowIterator, predicate: PredInput): RowIterator => {
        const _fn = compilePredicate(predicate)
        return {
                next() {
                        while (true) {
                                const r = child.next()
                                if (r === null) return null
                                if (_fn(r)) return r
                        }
                },
                close() {
                        child.close()
                },
        }
}
export const createProjection = (child: RowIterator, fields: string[], projectors?: ProjectorSpec[]): RowIterator => ({
        next() {
                const r = child.next()
                if (r === null) return null
                const out: Row = {}
                if (projectors && projectors.length > 0) {
                        for (const p of projectors) out[p.alias] = p.eval(r)
                        return out
                }
                for (const f of fields) out[f] = r[f]
                return out
        },
        close() {
                child.close()
        },
})
