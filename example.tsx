import './example.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { avg, count, database, desc, eq, float, gte, integer, make, max, min, sum, table } from './src/interface'
import { createHeap } from './src/backend/access/heap'
import * as DB from './src/index'

Object.assign(window, DB)

const BASE_COLS = [...'ABCDEFGHIJ']
const ROW_COUNT = 24
const columnShape = (cols: string[]) => Object.fromEntries(cols.map((name) => [name, float(name).notNull()]))

const cellValues = table('cell_values', {
        id: integer('id').primaryKey(),
        ...columnShape(BASE_COLS),
})

const db = database({ cellValues }, { adapter: 'memory' })
Object.assign(window, { db }, DB)

const backend = () => db.backend as any
const relation = () => backend().catalog.resolve('cell_values')
const storageRelId = (relId: number, forkId: number) => relId * 10000 + forkId
const columnNameOf = (index: number): string => {
        const code = index % 26
        const prefix = Math.floor(index / 26)
        if (prefix === 0) return String.fromCharCode(65 + code)
        return `${columnNameOf(prefix - 1)}${String.fromCharCode(65 + code)}`
}
const seedRows = (cols: string[]) =>
        Array.from({ length: ROW_COUNT }, (_, row) => ({
                id: row + 1,
                ...Object.fromEntries(cols.map((name) => [name, +(Math.random() * 100).toFixed(2)])),
        }))

const insertColumn = async (name: string, values: number[]) => {
        const tableRef = cellValues as any
        if (!tableRef[name]) {
                const column = make({ type: 'column', name, dataType: 'float', tableName: 'cell_values' }) as any
                column.$col = { name, key: name, type: 'f32', tableName: 'cell_values' }
                tableRef[name] = column
                tableRef.$meta.columns.push(column)
        }
        const rel = relation()
        const forkId = 10 + rel.columns.length
        const heap = createHeap({ buffer: backend().buffer, smgr: backend().smgr, fsm: backend().fsm, relId: storageRelId(rel.relId, forkId), valueSize: 4, valueType: 'f32' })
        rel.columns.push({ name, type: 'f32', byteSize: 4, forkId, isPrimary: false, isUnique: false, notNull: false, isText: false })
        rel.heaps.push(heap)
        rel.codecs.push({ strings: [], intern: new Map(), nulls: new Set() })
        for (const value of values) await heap.insert(value)
}
const deleteColumn = async (name: string) => {
        const tableRef = cellValues as any
        delete tableRef[name]
        tableRef.$meta.columns = tableRef.$meta.columns.filter((column: any) => column.$col?.key !== name)
        const rel = relation()
        const index = rel.columns.findIndex((column: any) => column.name === name)
        if (index < 0) return
        const [column] = rel.columns.splice(index, 1)
        rel.heaps.splice(index, 1)
        rel.codecs.splice(index, 1)
        await backend().smgr.unlink(backend().smgr.open(storageRelId(rel.relId, column.forkId)), 0)
}
const resetColumns = async () => {
        const extra = relation()
                .columns.map((column: any) => column.name)
                .filter((name: string) => !['id', ...BASE_COLS].includes(name))
        for (const name of extra) await deleteColumn(name)
}
const analyze = async (name: string) => {
        const column = (cellValues as any)[name]
        const [stats] = await db.select({ sum: sum(column), avg: avg(column), min: min(column), max: max(column), count: count() }).from(cellValues)
        const [high] = await db.select({ count: count() }).from(cellValues).where(gte(column, 50))
        const top = (await db.select({ id: cellValues.id, value: column }).from(cellValues).orderBy(desc(column)).limit(5)) as Record<string, any>[]
        return { stats, high, top: top.map((row) => ({ name: `${name}${Number(row.id)}`, value: Number(row.value) })) }
}

function App() {
        const [rows, setRows] = useState<Record<string, any>[]>([])
        const [cols, setCols] = useState(BASE_COLS)
        const [metrics, setMetrics] = useState<[string, string | number | undefined][]>([])
        const [top, setTop] = useState<{ name: string; value: number }[]>([])
        const refresh = async (nextCols = cols) => {
                const reports = await Promise.all(nextCols.map(analyze))
                const totalCount = reports.reduce((total, report) => total + Number(report.stats.count), 0)
                const totalSum = reports.reduce((total, report) => total + Number(report.stats.sum), 0)
                setRows((await db.select().from(cellValues)) as Record<string, any>[])
                setMetrics([
                        ['count', totalCount],
                        ['sum', totalSum.toFixed(1)],
                        ['avg', (totalSum / totalCount).toFixed(2)],
                        ['min', Math.min(...reports.map((report) => Number(report.stats.min))).toFixed(1)],
                        ['max', Math.max(...reports.map((report) => Number(report.stats.max))).toFixed(1)],
                        ['where >=50', reports.reduce((total, report) => total + Number(report.high?.count ?? 0), 0)],
                ])
                setTop(
                        reports
                                .flatMap((report) => report.top)
                                .sort((a, b) => b.value - a.value)
                                .slice(0, 5),
                )
        }
        const reseed = async () => {
                await resetColumns()
                await db.delete(cellValues)
                await db.insert(cellValues).values(seedRows(BASE_COLS))
                setCols(BASE_COLS)
                await refresh(BASE_COLS)
        }
        const addColumn = async () => {
                const name = columnNameOf(cols.length)
                const nextCols = [...cols, name]
                await insertColumn(
                        name,
                        rows.map(() => +(Math.random() * 100).toFixed(2)),
                )
                setCols(nextCols)
                await refresh(nextCols)
        }
        const dropColumn = async () => {
                if (cols.length <= 1) return
                const nextCols = cols.slice(0, -1)
                await deleteColumn(cols[cols.length - 1])
                setCols(nextCols)
                await refresh(nextCols)
        }
        const commit = async (id: number, name: string, value: string) => {
                await db
                        .update(cellValues)
                        .set({ [name]: +value || 0 })
                        .where(eq(cellValues.id, id))
                await refresh()
        }
        const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key !== 'Enter') return
                event.currentTarget.blur()
        }
        useEffect(() => {
                void reseed()
        }, [])
        return (
                <main className="min-h-screen bg-slate-50 p-6">
                        <header className="mx-auto mb-4 flex max-w-[1200px] justify-between">
                                <h1 className="text-2xl font-bold text-slate-900">bad-dbms sheet</h1>
                                <div className="flex gap-2">
                                        <button className="rounded border px-3 py-2" onClick={reseed}>
                                                Reseed
                                        </button>
                                        <button className="rounded border px-3 py-2" onClick={addColumn}>
                                                Insert column
                                        </button>
                                        <button className="rounded border px-3 py-2" onClick={dropColumn}>
                                                Drop column
                                        </button>
                                </div>
                        </header>
                        <div className="mx-auto grid max-w-[1200px] grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
                                <div className="overflow-auto rounded border bg-white">
                                        <div className="grid" style={{ minWidth: `${44 + cols.length * 96}px`, gridTemplateColumns: `44px repeat(${cols.length},96px)` }}>
                                                <div className="bg-slate-100" />
                                                {cols.map((name) => (
                                                        <div key={name} className="grid place-items-center bg-slate-100 py-2 text-xs font-bold text-slate-600">
                                                                {name}
                                                        </div>
                                                ))}
                                                {rows.map((row, index) => (
                                                        <div key={row.id} className="contents">
                                                                <div className="grid place-items-center bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</div>
                                                                {cols.map((name) => (
                                                                        <input key={`${row.id}-${name}-${row[name]}`} defaultValue={Number(row[name] ?? 0).toFixed(1)} onBlur={(event) => commit(Number(row.id), name, event.target.value)} onKeyDown={blurOnEnter} className={`w-full border-t border-l border-slate-200 px-2 py-1 text-right text-sm outline-0 focus:bg-blue-50 ${Number(row[name] ?? 0) >= 50 ? 'bg-green-50 text-green-700' : 'bg-white text-slate-700'}`} />
                                                                ))}
                                                        </div>
                                                ))}
                                        </div>
                                </div>
                                <aside className="flex flex-col gap-2 text-sm">
                                        <div className="rounded border bg-white p-3">
                                                <h2 className="mb-2 font-bold">all cells</h2>
                                                {metrics.map(([name, value]) => (
                                                        <div key={name} className="flex justify-between border-t border-slate-100 py-1 first:border-0">
                                                                <span className="text-slate-500">{name}</span>
                                                                <strong>{value}</strong>
                                                        </div>
                                                ))}
                                        </div>
                                        <div className="rounded border bg-white p-3">
                                                <h2 className="mb-2 font-bold">top 5 cells</h2>
                                                {top.map((row) => (
                                                        <div key={row.name} className="flex justify-between border-t border-slate-100 py-1 first:border-0">
                                                                <span className="text-slate-500">{row.name}</span>
                                                                <strong>{row.value.toFixed(2)}</strong>
                                                        </div>
                                                ))}
                                        </div>
                                </aside>
                        </div>
                </main>
        )
}

createRoot(document.getElementById('root')!).render(<App />)
