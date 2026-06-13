import './style.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { finder } from 'opfs-finder'
import { database, eq, float, integer, table } from '../src/interface'
import * as DB from '../src/index'
type Row = Record<string, any>
type StatGroup = readonly [string, readonly (readonly [string, string | number])[]]
const BASECOLCOUNT = 9
const sheets = table('sheets', { id: integer('id').primaryKey(), cols: integer('cols') })
const cells = table<DB.ColumnsShape>('cells', { id: integer('id').primaryKey() })
const db = database({ sheets, cells }, { adapter: 'browser' })
Object.assign(window, { db }, DB)
const range = (count: number) => [...new Array(count).keys()]
const sheetId = Number(new URLSearchParams(location.search).get('q')) || 1
const random = () => +(Math.random() * 100).toFixed(2)
const colName = (index: number): string => {
        const code = index % 26
        const prefix = Math.floor(index / 26)
        if (prefix === 0) return String.fromCharCode(65 + code)
        return `${colName(prefix - 1)}${String.fromCharCode(65 + code)}`
}
const colsOf = (count: number) => range(count).map(colName)
const numberOf = (row: Row, name: string) => Number(row[name] ?? 0)
const updateCell = (id: number, value: Row) => db.update(cells).set(value).where(eq(cells.id, id))
const syncColumns = async (prevCols: string[], nextCols: string[]) => {
        const prev = new Set(prevCols)
        const next = new Set(nextCols)
        for (const name of prevCols) if (!next.has(name)) await db.alter(cells).dropColumn(name)
        for (const name of nextCols) if (!prev.has(name)) await db.alter(cells).addColumn(float(name))
}
const resetSheet = async () => {
        const [sheet] = await db.select().from(sheets).where(eq(sheets.id, sheetId))
        const prev = range(sheet?.cols ?? 0).map(colName)
        const baseCols = colsOf(BASECOLCOUNT)
        await db.delete(cells)
        await db.delete(sheets).where(eq(sheets.id, sheetId))
        await syncColumns(prev, baseCols)
        await db.insert(sheets).values({ id: sheetId, cols: baseCols.length })
        await db.insert(cells).values(range(23).map((id) => ({ id: id + 1, ...Object.fromEntries(baseCols.map((name) => [name, random()])) })))
        return baseCols
}
const restoreSheet = async () => {
        const [sheet] = await db.select().from(sheets).where(eq(sheets.id, sheetId))
        if (!sheet) return resetSheet()
        const cols = colsOf(sheet.cols ?? BASECOLCOUNT)
        await syncColumns([], cols)
        return cols
}
const resizeSheet = async (cols: string[], rows: Row[], size: number) => {
        if (size < 1) return cols
        const next = colsOf(size)
        await syncColumns(cols, next)
        for (const row of rows) if (size > cols.length) await updateCell(Number(row.id), { [next.at(-1)!]: random() })
        await db.update(sheets).set({ cols: next.length }).where(eq(sheets.id, sheetId))
        return next
}
const statsOf = (cols: string[], rows: Row[]): readonly StatGroup[] => {
        const values = rows.flatMap((row) => cols.map((name) => ({ name: `${name}${Number(row.id)}`, value: numberOf(row, name) })))
        const sum = values.reduce((total, cell) => total + cell.value, 0)
        const sorted = values.slice().sort((a, b) => b.value - a.value)
        return [
                [
                        'all cells',
                        [
                                ['count', values.length],
                                ['sum', sum.toFixed(1)],
                                ['avg', (sum / values.length || 0).toFixed(2)],
                                ['min', (sorted.at(-1)?.value ?? 0).toFixed(1)],
                                ['max', (sorted[0]?.value ?? 0).toFixed(1)],
                                ['where >=50', values.filter((cell) => cell.value >= 50).length],
                        ],
                ],
                ['top 5 cells', sorted.slice(0, 5).map(({ name, value }) => [name, value.toFixed(2)])],
        ]
}
const cellText = (value: unknown) => {
        if (value === null || value === undefined) return '0.0'
        if (typeof value === 'number') return value.toFixed(1)
        return String(value)
}
function App() {
        const [rows, setRows] = useState<Row[]>([])
        const [cols, setCols] = useState(() => colsOf(BASECOLCOUNT))
        const refresh = async () => setRows(await db.select().from(cells))
        const load = async (next: Promise<string[]>) => {
                setCols(await next)
                await refresh()
        }
        useEffect(() => void load(restoreSheet()), [])
        return (
                <main className="min-h-screen bg-slate-50 p-6">
                        <header className="mx-auto mb-4 flex max-w-[1200px] justify-between">
                                <h1 className="text-2xl font-bold text-slate-900">bad-dbms sheet</h1>
                                <div className="flex gap-2">
                                        {(
                                                [
                                                        ['Open finder', () => void finder()],
                                                        ['Reseed', () => load(resetSheet())],
                                                        ['Insert column', () => load(resizeSheet(cols, rows, cols.length + 1))],
                                                        ['Drop column', () => load(resizeSheet(cols, rows, cols.length - 1))],
                                                ] as const
                                        ).map(([label, action]) => (
                                                <button key={label} className="rounded border px-3 py-2" onClick={action}>
                                                        {label}
                                                </button>
                                        ))}
                                </div>
                        </header>
                        <div className="mx-auto grid max-w-[1200px] grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
                                <div className="overflow-auto rounded border bg-white">
                                        <table className="border-collapse table-fixed" style={{ minWidth: `${44 + cols.length * 96}px` }}>
                                                <thead>
                                                        <tr className="bg-slate-100 text-xs font-bold text-slate-600">
                                                                <th className="w-11" />
                                                                {cols.map((name) => (
                                                                        <th key={name} className="w-24 py-2">
                                                                                {name}
                                                                        </th>
                                                                ))}
                                                        </tr>
                                                </thead>
                                                <tbody>
                                                        {rows.map((row, index) => (
                                                                <tr key={row.id}>
                                                                        <th className="bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</th>
                                                                        {cols.map((name) => (
                                                                                <td key={name} className="border-t border-l border-slate-200">
                                                                                        <input
                                                                                                value={cellText(row[name])}
                                                                                                onChange={(event) => setRows((rows) => rows.map((next) => (Number(next.id) === Number(row.id) ? { ...next, [name]: event.target.value } : next)))}
                                                                                                onBlur={async (event) => {
                                                                                                        await updateCell(Number(row.id), { [name]: +event.target.value || 0 })
                                                                                                        await refresh()
                                                                                                }}
                                                                                                onKeyDown={(event) => {
                                                                                                        if (event.key === 'Enter') event.currentTarget.blur()
                                                                                                }}
                                                                                                className={`w-full px-2 py-1 text-right text-sm outline-0 focus:bg-blue-50 ${numberOf(row, name) >= 50 ? 'bg-green-50 text-green-700' : 'bg-white text-slate-700'}`}
                                                                                        />
                                                                                </td>
                                                                        ))}
                                                                </tr>
                                                        ))}
                                                </tbody>
                                        </table>
                                </div>
                                <aside className="flex flex-col gap-2 text-sm">
                                        {statsOf(cols, rows).map(([title, stats]) => (
                                                <div key={title} className="rounded border bg-white p-3">
                                                        <h2 className="mb-2 font-bold">{title}</h2>
                                                        {stats.map(([name, value]) => (
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
