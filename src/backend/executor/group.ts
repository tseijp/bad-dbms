import type { Row, AggSpec, SortKey } from '../../shared/types'
import type { RowIterator } from '../types'
import { isNullish } from './expr'
// aggregate and sort operators: the blocking nodes that consume their whole
// child before emitting.
interface AggState {
        count: number
        sum: number
        val: unknown
        seen: Set<unknown>
}
const initAgg = (_kind: string): AggState => ({ count: 0, sum: 0, val: undefined, seen: new Set() })
const updateAgg = (state: AggState, kind: string, v: unknown, distinct: boolean) => {
        if (kind === 'count') {
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
        if (kind === 'min') return void (state.val = state.val === undefined ? v : Math.min(state.val as number, v as number))
        if (kind === 'max') return void (state.val = state.val === undefined ? v : Math.max(state.val as number, v as number))
}
// Drizzle contract: sum / avg resolve to a string decimal (null over no rows);
// count stays numeric; min / max keep the column type; empty min / max is null.
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
export const makeAggregate = (child: RowIterator, groupBy: string[], aggs: AggSpec[]): RowIterator => {
        const groups = new Map<string, AggGroup>()
        const order: string[] = []
        while (true) {
                const r = child.next()
                if (r === null) break
                const k = groupBy.map((g) => r[g]).join('|')
                let g = groups.get(k)
                if (!g) {
                        g = { key: groupBy.map((gb) => r[gb]), states: aggs.map((a) => initAgg(a.kind)) }
                        groups.set(k, g)
                        order.push(k)
                }
                for (let i = 0; i < aggs.length; i++) updateAgg(g.states[i], aggs[i].kind, r[aggs[i].field], !!aggs[i].distinct)
        }
        child.close()
        const out: Row[] = []
        for (const k of order) {
                const g = groups.get(k) as AggGroup
                const row: Row = {}
                for (let i = 0; i < groupBy.length; i++) row[groupBy[i]] = g.key[i]
                for (let i = 0; i < aggs.length; i++) row[aggs[i].name] = finalAgg(g.states[i], aggs[i].kind)
                out.push(row)
        }
        if (groupBy.length === 0 && out.length === 0 && aggs.length > 0) {
                const row: Row = {}
                for (let i = 0; i < aggs.length; i++) row[aggs[i].name] = finalAgg(initAgg(aggs[i].kind), aggs[i].kind)
                out.push(row)
        }
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}
// SQL ordering: NULL sorts before every non-null value. Under an ascending
// sort NULL comes first; the desc flip in makeSort then places it last.
// A numeric string (sum / avg are string-typed) sorts by its numeric value.
const orderKey = (v: unknown): unknown => (typeof v === 'string' && v !== '' && !isNaN(Number(v)) ? Number(v) : v)
const cmpValue = (a: unknown, b: unknown): number => {
        const an = a === null || a === undefined
        const bn = b === null || b === undefined
        if (an || bn) return an && bn ? 0 : an ? -1 : 1
        const av = orderKey(a)
        const bv = orderKey(b)
        if ((av as number) < (bv as number)) return -1
        if ((av as number) > (bv as number)) return 1
        return 0
}
export const makeSort = (child: RowIterator, keys: SortKey[]): RowIterator => {
        const buf: Row[] = []
        while (true) {
                const r = child.next()
                if (r === null) break
                buf.push(r)
        }
        child.close()
        buf.sort((a, b) => {
                for (const k of keys) {
                        const av = k.eval ? k.eval(a) : a[k.field]
                        const bv = k.eval ? k.eval(b) : b[k.field]
                        const c = cmpValue(av, bv)
                        if (c !== 0) return k.dir === 'desc' ? -c : c
                }
                return 0
        })
        let i = 0
        const next = () => (i < buf.length ? buf[i++] : null)
        return { next, close: () => {} }
}
