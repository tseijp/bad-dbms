import type { Row } from '../../shared/types'
import type { RowIterator } from '../types'
import { evalNode } from './expr'
// join operators: nested-loop for arbitrary predicates, hash for equi-joins.
export const makeNestedLoopJoin = (left: RowIterator, right: RowIterator, predicate: unknown): RowIterator => {
        const fn = typeof predicate === 'function' ? (predicate as (l: Row, r: Row) => boolean) : (l: Row, r: Row) => !!evalNode(predicate, { ...l, ...r })
        const rightBuf: Row[] = []
        while (true) {
                const r = right.next()
                if (r === null) break
                rightBuf.push(r)
        }
        right.close()
        let curLeft: Row | null = null
        let j = 0
        const next = () => {
                while (true) {
                        if (curLeft === null) {
                                curLeft = left.next()
                                if (curLeft === null) return null
                                j = 0
                        }
                        while (j < rightBuf.length) {
                                const r = rightBuf[j++]
                                if (fn(curLeft, r)) return { ...curLeft, ...r }
                        }
                        curLeft = null
                }
        }
        return { next, close: () => left.close() }
}
export const makeHashJoin = (left: RowIterator, right: RowIterator, leftKey: string, rightKey: string): RowIterator => {
        const table = new Map<unknown, Row[]>()
        while (true) {
                const r = left.next()
                if (r === null) break
                const k = r[leftKey]
                const arr = table.get(k) ?? []
                arr.push(r)
                table.set(k, arr)
        }
        left.close()
        const queue: Row[] = []
        const next = () => {
                while (queue.length === 0) {
                        const r = right.next()
                        if (r === null) return null
                        const match = table.get(r[rightKey])
                        if (!match) continue
                        for (const m of match) queue.push({ ...m, ...r })
                }
                return queue.shift() ?? null
        }
        return { next, close: () => right.close() }
}
