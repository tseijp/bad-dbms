const tableNameOf = (t: any) => (typeof t === 'string' ? t : t && t.$meta ? t.$meta.name : t && t.name ? t.name : String(t))

const buildRow = (desc: any, rid: any) => {
        const row: any = { __rid: rid }
        for (const col of desc.columns) row[col.name] = col.heap.read(rid)
        return row
}

const collectRids = (firstHeap: any) => {
        const rids: any[] = []
        firstHeap.scan((rid: any) => void rids.push(rid))
        return rids
}

const evalBinop = (op: string, a: any, b: any): any => {
        if (op === '+') return a + b
        if (op === '-') return a - b
        if (op === '*') return a * b
        if (op === '/') return b === 0 ? 0 : a / b
        if (op === '%') return b === 0 ? 0 : a % b
        if (op === '=') return a === b
        if (op === '!=') return a !== b
        if (op === '<') return a < b
        if (op === '<=') return a <= b
        if (op === '>') return a > b
        if (op === '>=') return a >= b
        if (op === 'and') return !!a && !!b
        if (op === 'or') return !!a || !!b
        if (op === 'in') return Array.isArray(b) ? b.includes(a) : false
        return undefined
}

const evalUnop = (op: string, v: any): any => {
        if (op === 'not') return !v
        if (op === 'isNull') return v === null || v === undefined
        if (op === 'isNotNull') return v !== null && v !== undefined
        return v
}

const evalFunc = (name: string, args: any[]): any => {
        if (name === 'toFloat') return Number(args[0])
        if (name === 'toInt') return args[0] | 0
        if (name === 'toBool') return !!args[0]
        if (name === 'between') return args[0] >= args[1] && args[0] <= args[2]
        if (name === 'at') return args[0]
        return undefined
}

export const evalNode = (node: any, row: any, ctx?: any): any => {
        if (node === null || node === undefined) return node
        if (typeof node !== 'object') return node
        const n = node.node ? node.node : node
        if (!n || !n.type) return n
        const t = n.type
        if (t === 'literal') return n.value
        if (t === 'raw') return n.value
        if (t === 'identifier') return n.name
        if (t === 'column') return row ? row[n.name] : undefined
        if (t === 'currentTuple') return ctx ? ctx[n.col ?? n.columnName] : undefined
        if (t === 'binop') {
                if (n.left !== undefined && n.right !== undefined) return evalBinop(n.op, evalNode(n.left, row, ctx), evalNode(n.right, row, ctx))
                const args = (n.args || []).map((a: any) => evalNode(a, row, ctx))
                if (n.op === 'and') return args.every((x: any) => !!x)
                if (n.op === 'or') return args.some((x: any) => !!x)
                return evalBinop(n.op, args[0], args[1])
        }
        if (t === 'unop') {
                const arg = n.arg !== undefined ? evalNode(n.arg, row, ctx) : evalNode((n.args || [])[0], row, ctx)
                return evalUnop(n.op, arg)
        }
        if (t === 'func') return evalFunc(n.name, (n.args || []).map((a: any) => evalNode(a, row, ctx)))
        if (t === 'list') return (n.items || []).map((a: any) => evalNode(a, row, ctx))
        if (t === 'order') return evalNode(n.col, row, ctx)
        if (t === 'placeholder') return ctx ? ctx[n.name] : undefined
        return undefined
}

const compilePredicate = (pred: any): ((row: any) => boolean) => {
        if (!pred) return () => true
        if (typeof pred === 'function') return pred
        return (row: any) => !!evalNode(pred, row)
}

const compileSetter = (expr: any): ((row: any) => any) => {
        if (typeof expr === 'function') return expr
        if (expr && expr.kind === 'sql') return (row: any) => evalNode(expr, row)
        if (expr && expr.type) return (row: any) => evalNode(expr, row)
        return () => expr
}

const makeSeqScan = (catalog: any, ast: any) => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        if (!rel) return { next: () => null, close: () => {} }
        const desc = catalog.tupleDescriptor(rel)
        const rids = collectRids(rel.heaps[0])
        let i = 0
        const next = () => {
                if (i >= rids.length) return null
                return buildRow(desc, rids[i++])
        }
        return { next, close: () => {} }
}

const makeIndexScan = (catalog: any, ast: any) => {
        const rel = catalog.resolve(tableNameOf(ast.table))
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
        const next = () => (i >= rids.length ? null : buildRow(desc, rids[i++]))
        return { next, close: () => {} }
}

const makeFilter = (child: any, predicate: any) => {
        const fn = compilePredicate(predicate)
        const next = () => {
                while (true) {
                        const r = child.next()
                        if (r === null) return null
                        if (fn(r)) return r
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
        const fn = typeof predicate === 'function' ? predicate : (l: any, r: any) => !!evalNode(predicate, { ...l, ...r })
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
                                if (fn(curLeft, r)) return { ...curLeft, ...r }
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
        if (groupBy.length === 0 && out.length === 0 && aggs.length > 0) {
                const row: any = {}
                for (let i = 0; i < aggs.length; i++) row[aggs[i].name] = finalAgg(initAgg(aggs[i].kind), aggs[i].kind)
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

const makeUpdate = (catalog: any, ast: any) => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        if (!rel) return { next: () => null, close: () => {} }
        const desc = catalog.tupleDescriptor(rel)
        const pred = compilePredicate(ast.predicate ?? ast.where)
        const setters = ast.setters ?? ast.set ?? {}
        const compiled: any = {}
        for (const k of Object.keys(setters)) compiled[k] = compileSetter(setters[k])
        const rids = collectRids(rel.heaps[0])
        let updated = 0
        for (const rid of rids) {
                const row = buildRow(desc, rid)
                if (!pred(row)) continue
                for (const k of Object.keys(compiled)) {
                        const colIdx = rel.columns.findIndex((c: any) => c.name === k)
                        if (colIdx < 0) continue
                        const newVal = compiled[k](row)
                        rel.heaps[colIdx].update(rid, newVal)
                }
                updated++
        }
        const out = [{ updated }]
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}

const makeDelete = (catalog: any, ast: any) => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        if (!rel) return { next: () => null, close: () => {} }
        const desc = catalog.tupleDescriptor(rel)
        const pred = compilePredicate(ast.predicate ?? ast.where)
        const rids = collectRids(rel.heaps[0])
        let deleted = 0
        for (const rid of rids) {
                const row = buildRow(desc, rid)
                if (!pred(row)) continue
                for (let i = 0; i < rel.heaps.length; i++) rel.heaps[i].delete(rid)
                deleted++
        }
        const out = [{ deleted }]
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}

const makeInsert = (catalog: any, ast: any) => {
        const name = tableNameOf(ast.table)
        const rows = ast.values || []
        const rids: any[] = []
        for (const row of rows) {
                const rid = catalog.insertRow(name, row)
                if (rid) rids.push(rid)
        }
        const out = ast.returning ? [{ rowCount: rids.length, rids }] : [{ rowCount: rids.length }]
        let i = 0
        const next = () => (i < out.length ? out[i++] : null)
        return { next, close: () => {} }
}

const build = (catalog: any, ast: any): any => {
        if (!ast || !ast.op) return { next: () => null, close: () => {} }
        if (ast.op === 'SeqScan') return makeSeqScan(catalog, ast)
        if (ast.op === 'IndexScan') return makeIndexScan(catalog, ast)
        if (ast.op === 'Filter') return makeFilter(build(catalog, ast.child), ast.predicate)
        if (ast.op === 'Projection') return makeProjection(build(catalog, ast.child), ast.fields)
        if (ast.op === 'NestedLoopJoin') return makeNestedLoopJoin(build(catalog, ast.left), build(catalog, ast.right), ast.predicate)
        if (ast.op === 'HashJoin') return makeHashJoin(build(catalog, ast.left), build(catalog, ast.right), ast.leftKey, ast.rightKey)
        if (ast.op === 'Aggregate') return makeAggregate(build(catalog, ast.child), ast.groupBy, ast.aggs)
        if (ast.op === 'Sort') return makeSort(build(catalog, ast.child), ast.keys)
        if (ast.op === 'Update') return makeUpdate(catalog, ast)
        if (ast.op === 'Delete') return makeDelete(catalog, ast)
        if (ast.op === 'Insert') return makeInsert(catalog, ast)
        if (ast.op === 'Select') return makeSelectLogical(catalog, ast)
        return { next: () => null, close: () => {} }
}

const makeSelectLogical = (catalog: any, ast: any) => {
        const seq: any = { op: 'SeqScan', table: ast.table }
        let cur: any = build(catalog, seq)
        if (ast.where) cur = makeFilter(cur, ast.where)
        const proj = ast.projection
        const aggs: any[] = []
        const plainFields: string[] = []
        const renames: Array<{ from: string; to: string }> = []
        if (proj && Array.isArray(proj)) {
                for (const p of proj) {
                        const expr = p.expr
                        const node = expr && expr.node ? expr.node : expr
                        if (node && node.type === 'aggregate') {
                                const argNode = (node.args || [])[0]
                                const inner = argNode && argNode.node ? argNode.node : argNode
                                const field = inner && inner.name ? inner.name : '*'
                                aggs.push({ name: p.alias, kind: node.name, field })
                        } else if (node && node.type === 'column') {
                                plainFields.push(node.name)
                                if (p.alias && p.alias !== node.name) renames.push({ from: node.name, to: p.alias })
                        }
                }
        }
        if (aggs.length > 0) cur = makeAggregate(cur, ast.groupBy ?? [], aggs)
        else if (plainFields.length > 0) cur = makeProjection(cur, plainFields)
        if (ast.orderBy && Array.isArray(ast.orderBy) && ast.orderBy.length > 0) {
                const keys = ast.orderBy.map((o: any) => {
                        const n = o && o.node ? o.node : o
                        const dir = n && n.dir ? n.dir : 'asc'
                        const colNode = n && n.col ? (n.col.node ? n.col.node : n.col) : n
                        const field = colNode && colNode.name ? colNode.name : String(colNode)
                        return { field, dir }
                })
                cur = makeSort(cur, keys)
        }
        const limit = ast.limit
        const offset = ast.offset ?? 0
        let produced = 0
        let skipped = 0
        const inner = cur
        const next = () => {
                while (true) {
                        const r = inner.next()
                        if (r === null) return null
                        if (skipped < offset) {
                                skipped++
                                continue
                        }
                        if (limit !== undefined && produced >= limit) return null
                        produced++
                        if (renames.length > 0) {
                                const out: any = { ...r }
                                for (const ren of renames) out[ren.to] = r[ren.from]
                                return out
                        }
                        return r
                }
        }
        return { next, close: () => inner.close() }
}

export const createExecutor = (deps: any) => {
        const { catalog } = deps
        const execute = (ast: any) => build(catalog, ast)
        return { execute }
}

export type Executor = ReturnType<typeof createExecutor>
