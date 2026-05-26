import './example.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { avg, count, database, desc, eq, float, gte, integer, make, max, min, sum, table, text } from './src/interface'
import { createHeap } from './src/backend/access/heap'
import * as DB from './src/index'
Object.assign(window, DB)
const BASE_COLS = [...'ABCDEFGHIJ']
const ROW_COUNT = 24
const SHEET_ID = 1
const colShape = (cols: string[]) => Object.fromEntries(cols.map((c) => [c, float(c).notNull()]))
const sheets = table('sheets', {
        id: integer('id').primaryKey(),
        name: text('name').notNull(),
        rows: integer('rows').notNull(),
        cols: integer('cols').notNull(),
})
const columns = table('columns', {
        id: integer('id').primaryKey(),
        name: text('name').notNull(),
        index: integer('index').notNull(),
        width: integer('width').notNull(),
        sheetId: integer('sheet_id').references(() => sheets.id),
})
const rows = table('rows', {
        id: integer('id').primaryKey(),
        index: integer('index').notNull(),
        height: integer('height').notNull(),
        sheetId: integer('sheet_id').references(() => sheets.id),
})
const cellValues = table('cell_values', {
        id: integer('id').primaryKey(),
        sheetId: integer('sheet_id').references(() => sheets.id),
        ...colShape(BASE_COLS),
})
const db = database({ sheets, columns, rows, cellValues }, { adapter: 'memory' })
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
const sheetRows = (cols: string[]) =>
        Array.from({ length: ROW_COUNT }, (_, i) => ({
                id: i + 1,
                sheetId: SHEET_ID,
                ...Object.fromEntries(cols.map((c) => [c, +(Math.random() * 100).toFixed(2)])),
        }))
const metadata = (cols: string[]) => ({
        columns: cols.map((name, i) => ({ id: i + 1, name, index: i, width: 96, sheetId: SHEET_ID })),
        rows: Array.from({ length: ROW_COUNT }, (_, i) => ({ id: i + 1, index: i, height: 28, sheetId: SHEET_ID })),
})
const addQueryColumn = (name: string) => {
        if ((cellValues as any)[name]) return
        const col = make({ type: 'column', name, dataType: 'float', tableName: 'cell_values' }) as any
        col.$col = { name, key: name, type: 'f32', tableName: 'cell_values' }
        ;(cellValues as any)[name] = col
        ;(cellValues as any).$meta.columns.push(col)
}
const removeQueryColumn = (name: string) => {
        delete (cellValues as any)[name]
        ;(cellValues as any).$meta.columns = (cellValues as any).$meta.columns.filter((c: any) => c.$col?.key !== name)
}
const addStorageColumn = async (name: string, values: number[]) => {
        const rel = relation()
        const forkId = 10 + rel.columns.length
        const heap = createHeap({ buffer: backend().buffer, smgr: backend().smgr, fsm: backend().fsm, relId: storageRelId(rel.relId, forkId), valueSize: 4, valueType: 'f32' })
        rel.columns.push({ name, type: 'f32', byteSize: 4, forkId, isPrimary: false, isUnique: false, notNull: false, isText: false })
        rel.heaps.push(heap)
        rel.codecs.push({ strings: [], intern: new Map(), nulls: new Set() })
        for (const value of values) await heap.insert(value)
}
const removeStorageColumn = async (name: string) => {
        const rel = relation()
        const index = rel.columns.findIndex((c: any) => c.name === name)
        if (index < 0) return
        const [col] = rel.columns.splice(index, 1)
        rel.heaps.splice(index, 1)
        rel.codecs.splice(index, 1)
        await backend().smgr.unlink(backend().smgr.open(storageRelId(rel.relId, col.forkId)), 0)
}
const resetAddedColumns = async () => {
        const names = relation()
                .columns.map((c: any) => c.name)
                .filter((name: string) => !['id', 'sheetId', ...BASE_COLS].includes(name))
        for (const name of names) {
                await removeStorageColumn(name)
                removeQueryColumn(name)
        }
}
function App() {
        const [data, setData] = useState<Record<string, any>[]>([])
        const [cols, setCols] = useState(BASE_COLS)
        const [stats, setStats] = useState<Record<string, number>>({})
        const [top, setTop] = useState<{ name: string; value: number }[]>([])
        const column = (name: string) => (cellValues as any)[name]
        const analyzeColumn = async (name: string) => {
                const col = column(name)
                const [a] = await db.select({ sum: sum(col), avg: avg(col), min: min(col), max: max(col), count: count() }).from(cellValues)
                const [b] = await db.select({ count: count() }).from(cellValues).where(gte(col, 50))
                const rows = (await db.select({ id: cellValues.id, value: col }).from(cellValues).orderBy(desc(col)).limit(5)) as Record<string, any>[]
                return { sum: +a.sum, avg: +a.avg, min: +a.min, max: +a.max, count: +a.count, high: +(b?.count ?? 0), top: rows.map((r) => ({ name: `${name}${Number(r.id)}`, value: Number(r.value) })) }
        }
        const refresh = async (targetCols = cols) => {
                const items = await Promise.all(targetCols.map(analyzeColumn))
                const countValue = items.reduce((acc, item) => acc + item.count, 0)
                const sumValue = items.reduce((acc, item) => acc + item.sum, 0)
                setData((await db.select().from(cellValues)) as Record<string, any>[])
                setStats({ count: countValue, sum: sumValue, avg: sumValue / countValue, min: Math.min(...items.map((i) => i.min)), max: Math.max(...items.map((i) => i.max)), high: items.reduce((acc, item) => acc + item.high, 0) })
                setTop(items.flatMap((item) => item.top).sort((a, b) => b.value - a.value).slice(0, 5))
        }
        const reseed = async () => {
                await resetAddedColumns()
                await db.delete(sheets)
                await db.delete(columns)
                await db.delete(rows)
                await db.delete(cellValues)
                await db.insert(sheets).values({ id: SHEET_ID, name: 'Sheet1', rows: ROW_COUNT, cols: BASE_COLS.length })
                await db.insert(columns).values(metadata(BASE_COLS).columns)
                await db.insert(rows).values(metadata(BASE_COLS).rows)
                await db.insert(cellValues).values(sheetRows(BASE_COLS))
                setCols(BASE_COLS)
                await refresh(BASE_COLS)
        }
        const addColumn = async () => {
                const name = columnNameOf(cols.length)
                const nextCols = [...cols, name]
                addQueryColumn(name)
                await addStorageColumn(name, data.map(() => +(Math.random() * 100).toFixed(2)))
                await db.insert(columns).values({ id: nextCols.length, name, index: cols.length, width: 96, sheetId: SHEET_ID })
                await db.update(sheets).set({ cols: nextCols.length }).where(eq(sheets.id, SHEET_ID))
                setCols(nextCols)
                await refresh(nextCols)
        }
        const dropColumn = async () => {
                if (cols.length <= 1) return
                const name = cols[cols.length - 1]
                const nextCols = cols.slice(0, -1)
                await removeStorageColumn(name)
                removeQueryColumn(name)
                await db.delete(columns).where(eq(columns.index, nextCols.length))
                await db.update(sheets).set({ cols: nextCols.length }).where(eq(sheets.id, SHEET_ID))
                setCols(nextCols)
                await refresh(nextCols)
        }
        const commit = async (id: number, name: string, value: string) => {
                await db.update(cellValues).set({ [name]: +value || 0 }).where(eq(cellValues.id, id))
                await refresh()
        }
        useEffect(() => {
                void reseed()
        }, [])
        const metricRows = { count: stats.count, sum: stats.sum?.toFixed(1), avg: stats.avg?.toFixed(2), min: stats.min?.toFixed(1), max: stats.max?.toFixed(1), 'where >=50': stats.high }
        return (
                <main className="min-h-screen bg-slate-50 p-6">
                        <header className="mx-auto mb-4 flex max-w-[1200px] justify-between">
                                <h1 className="text-2xl font-bold text-slate-900">bad-dbms sheet</h1>
                                <div className="flex gap-2">
                                        {[
                                                ['Reseed', reseed],
                                                ['Insert column', addColumn],
                                                ['Drop column', dropColumn],
                                        ].map(([label, action]) => (
                                                <button key={String(label)} className="rounded border px-3 py-2" onClick={action as () => void}>
                                                        {label as string}
                                                </button>
                                        ))}
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
                                                {data.map((row, rowIndex) => (
                                                        <div key={row.id} className="contents">
                                                                <div className="grid place-items-center bg-slate-100 text-xs font-bold text-slate-600">{rowIndex + 1}</div>
                                                                {cols.map((name) => (
                                                                        <input key={`${row.id}-${name}-${row[name]}`} defaultValue={Number(row[name] ?? 0).toFixed(1)} onBlur={(e) => commit(Number(row.id), name, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className={`w-full border-t border-l border-slate-200 px-2 py-1 text-right text-sm outline-0 focus:bg-blue-50 ${Number(row[name] ?? 0) >= 50 ? 'bg-green-50 text-green-700' : 'bg-white text-slate-700'}`} />
                                                                ))}
                                                        </div>
                                                ))}
                                        </div>
                                </div>
                                <aside className="flex flex-col gap-2 text-sm">
                                        {[
                                                ['all cells', Object.entries(metricRows)],
                                                ['top 5 cells', top.map((r) => [r.name, r.value.toFixed(2)])],
                                        ].map(([title, rows]) => (
                                                <div key={String(title)} className="rounded border bg-white p-3">
                                                        <h2 className="mb-2 font-bold">{title as string}</h2>
                                                        {(rows as [string, unknown][]).map(([name, value]) => (
                                                                <div key={name} className="flex justify-between border-t border-slate-100 py-1 first:border-0">
                                                                        <span className="text-slate-500">{name}</span>
                                                                        <strong>{value}</strong>
                                                                </div>
                                                        ))}
                                                </div>
                                        ))}
                                </aside>
                        </div>
                </main>
        )
}
createRoot(document.getElementById('root')!).render(<App />)
