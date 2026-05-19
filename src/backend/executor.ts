const buildRow = (desc: any, rid: any) => {
        const row: any = { __rid: rid }
        for (const col of desc.columns) {
                row[col.name] = col.heap.read(rid)
        }
        return row
}

const collectRids = (firstHeap: any) => {
        const rids: any[] = []
        firstHeap.scan((rid: any) => {
                rids.push(rid)
        })
        return rids
}

const makeSeqScan = (catalog: any, ast: any) => {
        const rel = catalog.resolve(ast.table)
        if (!rel) return { next: () => null, close: () => {} }
        const desc = catalog.tupleDescriptor(rel)
        const rids = collectRids(rel.heaps[0])
        let i = 0
        const next = () => {
                if (i >= rids.length) return null
                const rid = rids[i++]
                return buildRow(desc, rid)
        }
        return { next, close: () => {} }
}

const makeIndexScan = (catalog: any, ast: any) => {
        const rel = catalog.resolve(ast.table)
        if (!rel) return { next: () => null, close: () => {} }
        const desc = catalog.tupleDescriptor(rel)
        const idx = catalog.findIndex(rel, ast.indexName)
        if (!idx) return { next: () => null, close: () => {} }
        const range = ast.range ?? {}
        const start = range.start ?? -2147483648
        const end = range.end ?? 2147483647
        const rids: any[] = []
        if (idx.kind === 'nbtree') idx.handle.forward(start, end, (rid: any) => void rids.push(rid))
        else idx.handle.lookup(start, (rid: any) => void rids.push(rid))
        let i = 0
        const next = () => {
                if (i >= rids.length) return null
                return buildRow(desc, rids[i++])
        }
        return { next, close: () => {} }
}

const makeFilter = (child: any, predicate: any) => {
        const next = () => {
                while (true) {
                        const r = child.next()
                        if (r === null) return null
                        if (predicate(r)) return r
                }
        }
        return { next, close: () => child.close() }
}

const makeProjection = (child: any, fields: string[]) => {
        const next = () => {
                const r = child.next()
                if (r === null) return null
                const out: any = {}
                for (const f of fields) out[f] = r[f]
                return out
        }
        return { next, close: () => child.close() }
}

const makeNestedLoopJoin = (left: any, right: any, predicate: any) => {
        const rightBuf: any[] = []
        while (true) {
                const r = right.next()
                if (r === null) break
                rightBuf.push(r)
        }
        right.close()
        let curLeft: any = null
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
                                if (predicate(curLeft, r)) return { ...curLeft, ...r }
                        }
                        curLeft = null
                }
        }
        return { next, close: () => left.close() }
}

const makeHashJoin = (left: any, right: any, leftKey: string, rightKey: string) => {
        const table = new Map<any, any[]>()
        while (true) {
                const r = left.next()
                if (r === null) break
                const k = r[leftKey]
                const arr = table.get(k) ?? []
                arr.push(r)
                table.set(k, arr)
        }
        left.close()
        let queue: any[] = []
        const next = () => {
                while (queue.length === 0) {
                        const r = right.next()
                        if (r === null) return null
                        const match = table.get(r[rightKey])
                        if (!match) continue
                        for (const m of match) queue.push({ ...m, ...r })
                }
                return queue.shift()
        }
        return { next, close: () => right.close() }
}

const initAgg = (kind: string) => {
        if (kind === 'count') return { count: 0 }
        if (kind === 'sum' || kind === 'avg') return { sum: 0, count: 0 }
        if (kind === 'min') return { val: Infinity }
        if (kind === 'max') return { val: -Infinity }
        return {}
}

const updateAgg = (state: any, kind: string, v: any) => {
        if (kind === 'count') return void state.count++
        if (kind === 'sum') return void (state.sum += v)
        if (kind === 'avg') return void ((state.sum += v), state.count++)
        if (kind === 'min') return void (state.val = Math.min(state.val, v))
        if (kind === 'max') return void (state.val = Math.max(state.val, v))
}

const finalAgg = (state: any, kind: string) => {
        if (kind === 'count') return state.count
        if (kind === 'sum') return state.sum
        if (kind === 'avg') return state.count > 0 ? state.sum / state.count : 0
        return state.val
}

const makeAggregate = (child: any, groupBy: string[], aggs: any[]) => {
        const groups = new Map<string, any>()
        while (true) {
                const r = child.next()
                if (r === null) break
                const k = groupBy.map((g) => r[g]).join('|')
                let g = groups.get(k)
                if (!g) {
                        g = { key: groupBy.map((gb) => r[gb]), states: aggs.map((a) => initAgg(a.kind)) }
                        groups.set(k, g)
                }
                for (let i = 0; i < aggs.length; i++) updateAgg(g.states[i], aggs[i].kind, r[aggs[i].field])
        }
        child.close()
        const out: any[] = []
        for (const g of groups.values()) {
                const row: any = {}
                for (let i = 0; i < groupBy.length; i++) row[groupBy[i]] = g.key[i]
                for (let i = 0; i < aggs.length; i++) row[aggs[i].name] = finalAgg(g.states[i], aggs[i].kind)
                out.push(row)
        }
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}

const makeSort = (child: any, keys: any[]) => {
        const buf: any[] = []
        while (true) {
                const r = child.next()
                if (r === null) break
                buf.push(r)
        }
        child.close()
        buf.sort((a, b) => {
                for (const k of keys) {
                        const av = a[k.field]
                        const bv = b[k.field]
                        if (av < bv) return k.dir === 'desc' ? 1 : -1
                        if (av > bv) return k.dir === 'desc' ? -1 : 1
                }
                return 0
        })
        let i = 0
        const next = () => (i < buf.length ? buf[i++] : null)
        return { next, close: () => {} }
}

const build = (catalog: any, ast: any): any => {
        if (ast.op === 'SeqScan') return makeSeqScan(catalog, ast)
        if (ast.op === 'IndexScan') return makeIndexScan(catalog, ast)
        if (ast.op === 'Filter') return makeFilter(build(catalog, ast.child), ast.predicate)
        if (ast.op === 'Projection') return makeProjection(build(catalog, ast.child), ast.fields)
        if (ast.op === 'NestedLoopJoin') return makeNestedLoopJoin(build(catalog, ast.left), build(catalog, ast.right), ast.predicate)
        if (ast.op === 'HashJoin') return makeHashJoin(build(catalog, ast.left), build(catalog, ast.right), ast.leftKey, ast.rightKey)
        if (ast.op === 'Aggregate') return makeAggregate(build(catalog, ast.child), ast.groupBy, ast.aggs)
        if (ast.op === 'Sort') return makeSort(build(catalog, ast.child), ast.keys)
        return { next: () => null, close: () => {} }
}

export const createExecutor = (deps: any) => {
        const { catalog } = deps
        const execute = (ast: any) => build(catalog, ast)
        return { execute }
}

export type Executor = ReturnType<typeof createExecutor>
