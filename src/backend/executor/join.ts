import type { Row, JoinRow, JoinPredicate, JoinKind } from '../../shared/types'
import type { RowIterator } from '../types'
export const createNestedLoopJoin = (left: RowIterator, right: RowIterator, rightName: string, predicate: JoinPredicate, kind: JoinKind = 'inner'): RowIterator => {
        const _rightBuf: JoinRow[] = []
        while (true) {
                const r = right.next()
                if (r === null) break
                _rightBuf.push(r as JoinRow)
        }
        right.close()
        const _rightMatched = new Array<boolean>(_rightBuf.length).fill(false)
        const _out: JoinRow[] = []
        const _leftKeys = new Set<string>()
        let _leftRow = left.next()
        while (_leftRow !== null) {
                const lj = _leftRow as JoinRow
                for (const k in lj) _leftKeys.add(k)
                let matched = false
                for (let j = 0; j < _rightBuf.length; j++) {
                        const joined: JoinRow = { ...lj, ..._rightBuf[j] }
                        if (!predicate(joined)) continue
                        _out.push(joined)
                        _rightMatched[j] = true
                        matched = true
                }
                if (!matched && (kind === 'left' || kind === 'full')) _out.push({ ...lj, [rightName]: null })
                _leftRow = left.next()
        }
        left.close()
        if (kind === 'right' || kind === 'full')
                for (let j = 0; j < _rightBuf.length; j++) {
                        if (_rightMatched[j]) continue
                        const nulled: JoinRow = {}
                        for (const k of _leftKeys) nulled[k] = null
                        _out.push({ ...nulled, ..._rightBuf[j] })
                }
        let _i = 0
        return {
                next() {
                        return (_i < _out.length ? _out[_i++] : null) as Row | null
                },
                close() {},
        }
}
