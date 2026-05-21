import type { SeqScanOp, NamedScanOp, IndexScanOp, Row, ProjectorSpec } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator, Rid } from '../types'
import { tableNameOf, buildRow, collectRids, EMPTY_ITER, compilePredicate, stripRid, PredInput } from './utils'
export const createSeqScan = (catalog: Catalog, ast: SeqScanOp): RowIterator => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _rids = collectRids(_rel.heaps[0])
        let _i = 0
        return {
                next() {
                        if (_i >= _rids.length) return null
                        return buildRow(catalog, _rel, _rids[_i++])
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
                        if (_i >= _rids.length) return null
                        return { [ast.name]: stripRid(buildRow(catalog, _rel, _rids[_i++])) } as Row
                },
                close() {},
        }
}
export const createIndexScan = (catalog: Catalog, ast: IndexScanOp): RowIterator => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _idx = catalog.findIndex(_rel, ast.indexName)
        if (!_idx) return EMPTY_ITER
        const _range = ast.range ?? {}
        const _start = _range.start ?? -2147483648
        const _end = _range.end ?? 2147483647
        const _rids: Rid[] = []
        if (_idx.kind === 'nbtree' && 'forward' in _idx.handle) _idx.handle.forward(_start, _end, (rid: Rid) => void _rids.push(rid))
        else if ('lookup' in _idx.handle) _idx.handle.lookup(_start, (rid: Rid) => void _rids.push(rid))
        let _i = 0
        return {
                next() {
                        return _i >= _rids.length ? null : buildRow(catalog, _rel, _rids[_i++])
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
export const createProjection = (child: RowIterator, fields: string[], projectors?: ProjectorSpec[]): RowIterator => {
        return {
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
        }
}
