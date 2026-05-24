import type { SeqScanOp, NamedScanOp, Row, ProjectorSpec } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator } from '../types'
import { tableNameOf, buildRow, collectRids, compilePredicate, stripRid, PredInput } from './utils'
export const createSeqScan = async (catalog: Catalog, ast: SeqScanOp): Promise<RowIterator> => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _rids = await collectRids(_rel.heaps[0])
        let _i = 0
        return {
                async next() {
                        return _i >= _rids.length ? null : await buildRow(catalog, _rel, _rids[_i++])
                },
                close() {},
        }
}
export const createNamedScan = async (catalog: Catalog, ast: NamedScanOp): Promise<RowIterator> => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _rids = await collectRids(_rel.heaps[0])
        let _i = 0
        return {
                async next() {
                        if (_i >= _rids.length) return null
                        const row = await buildRow(catalog, _rel, _rids[_i++])
                        return { [ast.name]: stripRid(row) } as Row
                },
                close() {},
        }
}
export const createFilter = (child: RowIterator, predicate: PredInput): RowIterator => {
        const _fn = compilePredicate(predicate)
        return {
                async next() {
                        while (true) {
                                const r = await child.next()
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
        async next() {
                const r = await child.next()
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
