import './example.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { avg, count, database, desc, eq, float, gte, integer, make, max, min, sum, table } from './src/interface'
import { createHeap } from './src/backend/access/heap'
import * as DB from './src/index'

Object.assign(window, DB)

const TABLE = 'cell_values'
const ROW_COUNT = 24
const BASE_COLS = [...'ABCDEFGHIJ']
const cellValues = table(TABLE, { id: integer('id').primaryKey(), ...Object.fromEntries(BASE_COLS.map((name) => [name, float(name).notNull()])) })
const db = database({ cellValues }, { adapter: 'browser' })
Object.assign(window, { db }, DB)

const backend = () => db.backend as any
const relation = () => backend().catalog.resolve(TABLE)
const storageId = (relId: number, forkId: number) => relId * 10000 + forkId
const newRows = (cols: string[]) => Array.from({ length: ROW_COUNT }, (_, i) => ({ id: i + 1, ...Object.fromEntries(cols.map((name) => [name, +(Math.random() * 100).toFixed(2)])) }))
const columnName = (index: number): string => {
        const code = index % 26
        const prefix = Math.floor(index / 26)
        if (prefix === 0) return String.fromCharCode(65 + code)
        return `${columnName(prefix - 1)}${String.fromCharCode(65 + code)}`
}
const bindColumn = (name: string) => {
        if ((cellValues as any)[name]) return
        const column = make({ type: 'column', name, dataType: 'float', tableName: TABLE }) as any
        column.$col = { name, key: name, type: 'f32', tableName: TABLE }
        ;(cellValues as any)[name] = column
        ;(cellValues as any).$meta.columns.push(column)
}
const addColumnHeap = async (name: string, values: number[]) => {
        bindColumn(name)
        const rel = relation()
        const forkId = 10 + rel.columns.length
        const heap = createHeap({ buffer: backend().buffer, smgr: backend().smgr, fsm: backend().fsm, relId: storageId(rel.relId, forkId), valueSize: 4, valueType: 'f32' })
        rel.columns.push({ name, type: 'f32', byteSize: 4, forkId, isPrimary: false, isUnique: false, notNull: false, isText: false })
        rel.heaps.push(heap)
        rel.codecs.push({ strings: [], intern: new Map(), nulls: new Set() })
        for (const value of values) await heap.insert(value)
}
const dropColumnHeap = async (name: string) => {
        const rel = relation()
        const index = rel.columns.findIndex((column: any) => column.name === name)
        if (index < 0) return
        const [column] = rel.columns.splice(index, 1)
        delete (cellValues as any)[name]
        cellValues.$meta.columns = cellValues.$meta.columns.filter((item: any) => item.$col?.key !== name)
        rel.heaps.splice(index, 1)
        rel.codecs.splice(index, 1)
        await backend().smgr.unlink(backend().smgr.open(storageId(rel.relId, column.forkId)), 0)
}
const syncColumns = async (cols: string[], values: Record<string, number[]> = {}) => {
        for (const name of relation()
                .columns.map((column: any) => column.name)
                .filter((name: string) => name !== 'id')) {
                if (cols.includes(name)) continue
                await dropColumnHeap(name)
        }
        for (const name of cols) {
                if (relation().columns.some((column: any) => column.name === name)) continue
                await addColumnHeap(name, values[name] ?? [])
        }
}
const scan = async (name: string) => {
        const column = (cellValues as any)[name]
        const [stats] = await db.select({ sum: sum(column), avg: avg(column), min: min(column), max: max(column), count: count() }).from(cellValues)
        const [high] = await db.select({ count: count() }).from(cellValues).where(gte(column, 50))
        const top = await db.select({ id: cellValues.id, value: column }).from(cellValues).orderBy(desc(column)).limit(5)
        return { stats, high, top: top.map((row) => [`${name}${Number(row.id)}`, Number(row.value).toFixed(2)] as [string, string]) }
}
const sideOf = (reports: Awaited<ReturnType<typeof scan>>[]) => {
        const total = reports.reduce((acc, report) => ({ count: acc.count + Number(report.stats.count), sum: acc.sum + Number(report.stats.sum), high: acc.high + Number(report.high?.count ?? 0) }), { count: 0, sum: 0, high: 0 })
        return {
                'all cells': [
                        ['count', total.count],
                        ['sum', total.sum.toFixed(1)],
                        ['avg', (total.sum / total.count).toFixed(2)],
                        ['min', Math.min(...reports.map((r) => Number(r.stats.min))).toFixed(1)],
                        ['max', Math.max(...reports.map((r) => Number(r.stats.max))).toFixed(1)],
                        ['where >=50', total.high],
                ] as [string, string | number][],
                'top 5 cells': reports
                        .flatMap((report) => report.top)
                        .sort((a, b) => Number(b[1]) - Number(a[1]))
                        .slice(0, 5),
        }
}
const Cell = ({ row, name, save }: { row: Record<string, any>; name: string; save: (id: number, name: string, value: string) => void }) => (
        <input
                key={`${row.id}-${name}-${row[name]}`}
                defaultValue={Number(row[name] ?? 0).toFixed(1)}
                onBlur={(event) => save(Number(row.id), name, event.target.value)}
                onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                }}
                className={`w-full border-t border-l border-slate-200 px-2 py-1 text-right text-sm outline-0 focus:bg-blue-50 ${Number(row[name] ?? 0) >= 50 ? 'bg-green-50 text-green-700' : 'bg-white text-slate-700'}`}
        />
)
const Card = ({ title, rows }: { title: string; rows: [string, string | number][] }) => (
        <div className="rounded border bg-white p-3">
                <h2 className="mb-2 font-bold">{title}</h2>
                {rows.map(([name, value]) => (
                        <div key={name} className="flex justify-between border-t border-slate-100 py-1 first:border-0">
                                <span className="text-slate-500">{name}</span>
                                <strong>{value}</strong>
                        </div>
                ))}
        </div>
)

function App() {
        const [rows, setRows] = useState<Record<string, any>[]>([])
        const [cols, setCols] = useState(BASE_COLS)
        const [side, setSide] = useState<Record<string, [string, string | number][]>>({ 'all cells': [], 'top 5 cells': [] })
        const refresh = async (nextCols = cols) => {
                setRows(await db.select().from(cellValues))
                setSide(sideOf(await Promise.all(nextCols.map(scan))))
        }
        const reset = async () => {
                await db.delete(cellValues)
                await syncColumns(BASE_COLS)
                await db.insert(cellValues).values(newRows(BASE_COLS))
                setCols(BASE_COLS)
                await refresh(BASE_COLS)
        }
        const add = async () => {
                const name = columnName(cols.length)
                const next = [...cols, name]
                await syncColumns(next, { [name]: rows.map(() => +(Math.random() * 100).toFixed(2)) })
                setCols(next)
                await refresh(next)
        }
        const drop = async () => {
                if (cols.length <= 1) return
                const next = cols.slice(0, -1)
                await syncColumns(next)
                setCols(next)
                await refresh(next)
        }
        const save = async (id: number, name: string, value: string) => {
                await db
                        .update(cellValues)
                        .set({ [name]: +value || 0 })
                        .where(eq(cellValues.id, id))
                await refresh()
        }
        useEffect(() => {
                if (location.hash) return void refresh(BASE_COLS)
                location.hash = '#xxx'
                void reset()
        }, [])
        return (
                <main className="min-h-screen bg-slate-50 p-6">
                        <header className="mx-auto mb-4 flex max-w-[1200px] justify-between">
                                <h1 className="text-2xl font-bold text-slate-900">bad-dbms sheet</h1>
                                <div className="flex gap-2">
                                        <button className="rounded border px-3 py-2" onClick={reset}>
                                                Reseed
                                        </button>
                                        <button className="rounded border px-3 py-2" onClick={add}>
                                                Insert column
                                        </button>
                                        <button className="rounded border px-3 py-2" onClick={drop}>
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
                                                                        <Cell key={name} row={row} name={name} save={save} />
                                                                ))}
                                                        </div>
                                                ))}
                                        </div>
                                </div>
                                <aside className="flex flex-col gap-2 text-sm">
                                        {Object.entries(side).map(([title, rows]) => (
                                                <Card key={title} title={title} rows={rows} />
                                        ))}
                                </aside>
                        </div>
                </main>
        )
}

createRoot(document.getElementById('root')!).render(<App />)
