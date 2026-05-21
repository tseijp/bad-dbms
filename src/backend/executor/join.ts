import type { Row, JoinRow, JoinPredicate, JoinKind } from '../../shared/types'
import type { RowIterator } from '../types'
export const makeNestedLoopJoin = (left: RowIterator, right: RowIterator, rightName: string, predicate: JoinPredicate, kind: JoinKind = 'inner'): RowIterator => {
        const rightBuf: JoinRow[] = []
        while (true) {
                const r = right.next()
                if (r === null) break
                rightBuf.push(r as JoinRow)
        }
        right.close()
        const keepLeft = kind === 'left' || kind === 'full'
        const keepRight = kind === 'right' || kind === 'full'
        const rightMatched = new Array<boolean>(rightBuf.length).fill(false)
        const out: JoinRow[] = []
        const leftKeys = new Set<string>()
        const nulled = (keys: Iterable<string>): JoinRow => {
                const o: JoinRow = {}
                for (const k of keys) o[k] = null
                return o
        }
        let leftRow = left.next()
        while (leftRow !== null) {
                const lj = leftRow as JoinRow
                for (const k in lj) leftKeys.add(k)
                let matched = false
                for (let j = 0; j < rightBuf.length; j++) {
                        const joined: JoinRow = { ...lj, ...rightBuf[j] }
                        if (!predicate(joined)) continue
                        out.push(joined)
                        rightMatched[j] = true
                        matched = true
                }
                if (!matched && keepLeft) out.push({ ...lj, [rightName]: null })
                leftRow = left.next()
        }
        left.close()
        if (keepRight)
                for (let j = 0; j < rightBuf.length; j++) {
                        if (rightMatched[j]) continue
                        out.push({ ...nulled(leftKeys), ...rightBuf[j] })
                }
        let i = 0
        return { next: () => (i < out.length ? out[i++] : null) as Row | null, close: () => {} }
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
