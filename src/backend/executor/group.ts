import type { Row, AggSpec, SortKey } from '../../shared/types'
import type { RowIterator } from '../types'
import { isNullish } from './utils'
interface AggState {
        count: number
        sum: number
        val: unknown
        seen: Set<unknown>
}
const initAgg = (_kind: string): AggState => ({ count: 0, sum: 0, val: undefined, seen: new Set() })
const orderKey = (v: unknown): unknown => (typeof v === 'string' && v !== '' && !isNaN(Number(v)) ? Number(v) : v)
const cmpValue = (a: unknown, b: unknown): number => {
        const an = a === null || a === undefined
        const bn = b === null || b === undefined
        if (an || bn) return an && bn ? 0 : an ? -1 : 1
        const av = orderKey(a)!
        const bv = orderKey(b)!
        if (av < bv) return -1
        if (av > bv) return 1
        return 0
}
const updateAgg = (state: AggState, kind: string, v: unknown, distinct: boolean, hasField: boolean) => {
        if (kind === 'count') {
                if (hasField && isNullish(v)) return
                if (!distinct) return void state.count++
                if (isNullish(v) || state.seen.has(v)) return
                state.seen.add(v)
                return void state.count++
        }
        if (isNullish(v)) return
        if (kind === 'sum' || kind === 'avg') {
                if (distinct) {
                        if (state.seen.has(v)) return
                        state.seen.add(v)
                }
                state.sum += Number(v)
                return void state.count++
        }
        if (kind === 'min') return void (state.val = state.val === undefined || cmpValue(v, state.val) < 0 ? v : state.val)
        if (kind === 'max') return void (state.val = state.val === undefined || cmpValue(v, state.val) > 0 ? v : state.val)
}
const finalAgg = (state: AggState, kind: string): unknown => {
        if (kind === 'count') return state.count
        if (kind === 'sum') return state.count > 0 ? String(state.sum) : null
        if (kind === 'avg') return state.count > 0 ? String(state.sum / state.count) : null
        if (kind === 'min' || kind === 'max') return state.val === undefined ? null : state.val
        return null
}
interface AggGroup {
        key: unknown[]
        states: AggState[]
}
export const createAggregate = async (child: RowIterator, groupBy: string[], aggs: AggSpec[]): Promise<RowIterator> => {
        const _groups = new Map<string, AggGroup>()
        const _order: string[] = []
        while (true) {
                const r = await child.next()
                if (r === null) break
                const k = groupBy.map((g) => r[g]).join('|')
                let g = _groups.get(k)
                if (!g) {
                        g = { key: groupBy.map((gb) => r[gb]), states: aggs.map((a) => initAgg(a.kind)) }
                        _groups.set(k, g)
                        _order.push(k)
                }
                for (let i = 0; i < aggs.length; i++) updateAgg(g.states[i], aggs[i].kind, r[aggs[i].field], !!aggs[i].distinct, !!aggs[i].field)
        }
        child.close()
        const _out: Row[] = []
        for (const k of _order) {
                const g = _groups.get(k)!
                const row: Row = {}
                for (let i = 0; i < groupBy.length; i++) row[groupBy[i]] = g.key[i]
                for (let i = 0; i < aggs.length; i++) row[aggs[i].name] = finalAgg(g.states[i], aggs[i].kind)
                _out.push(row)
        }
        if (groupBy.length === 0 && _out.length === 0 && aggs.length > 0) {
                const row: Row = {}
                for (let i = 0; i < aggs.length; i++) row[aggs[i].name] = finalAgg(initAgg(aggs[i].kind), aggs[i].kind)
                _out.push(row)
        }
        let _i = 0
        return {
                async next() {
                        return _i < _out.length ? _out[_i++] : null
                },
                close() {},
        }
}
export const createSort = async (child: RowIterator, keys: SortKey[]): Promise<RowIterator> => {
        const _buf: Row[] = []
        while (true) {
                const r = await child.next()
                if (r === null) break
                _buf.push(r)
        }
        child.close()
        _buf.sort((a, b) => {
                for (const k of keys) {
                        const av = k.eval ? k.eval(a) : a[k.field]
                        const bv = k.eval ? k.eval(b) : b[k.field]
                        const c = cmpValue(av, bv)
                        if (c !== 0) return k.dir === 'desc' ? -c : c
                }
                return 0
        })
        let _i = 0
        return {
                async next() {
                        return _i < _buf.length ? _buf[_i++] : null
                },
                close() {},
        }
}
export const createDistinct = (child: RowIterator): RowIterator => {
        const _seen = new Set<string>()
        return {
                async next() {
                        while (true) {
                                const r = await child.next()
                                if (r === null) return null
                                let k = ''
                                for (const key of Object.keys(r).sort()) k += key + ' ' + String(r[key]) + ' '
                                if (_seen.has(k)) continue
                                _seen.add(k)
                                return r
                        }
                },
                close() {
                        child.close()
                },
        }
}
export const createLimit = (child: RowIterator, limit?: number, offset = 0): RowIterator => {
        let _skipped = 0
        let _produced = 0
        return {
                async next() {
                        while (true) {
                                if (limit !== undefined && _produced >= limit) return null
                                const r = await child.next()
                                if (r === null) return null
                                if (_skipped < offset) {
                                        _skipped++
                                        continue
                                }
                                _produced++
                                return r
                        }
                },
                close() {
                        child.close()
                },
        }
}
