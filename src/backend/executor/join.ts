import type { Row, JoinPredicate, JoinKind } from '../../shared/types'
import type { RowIterator } from '../types'
export const makeNestedLoopJoin = (left: RowIterator, right: RowIterator, predicate: JoinPredicate, kind: JoinKind = 'inner'): RowIterator => {
        const rightBuf: Row[] = []
        while (true) {
                const r = right.next()
                if (r === null) break
                rightBuf.push(r)
        }
        right.close()
        const keepLeft = kind === 'left' || kind === 'full'
        const keepRight = kind === 'right' || kind === 'full'
        const rightMatched = new Array<boolean>(rightBuf.length).fill(false)
        const out: Row[] = []
        let leftRow: Row | null = left.next()
        while (leftRow !== null) {
                let matched = false
                for (let j = 0; j < rightBuf.length; j++) {
                        if (!predicate(leftRow, rightBuf[j])) continue
                        out.push({ ...leftRow, ...rightBuf[j] })
                        rightMatched[j] = true
                        matched = true
                }
                if (!matched && keepLeft) out.push({ ...leftRow })
                leftRow = left.next()
        }
        left.close()
        if (keepRight) for (let j = 0; j < rightBuf.length; j++) if (!rightMatched[j]) out.push({ ...rightBuf[j] })
        let i = 0
        return { next: () => (i < out.length ? out[i++] : null), close: () => {} }
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
