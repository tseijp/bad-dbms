import './style.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { addColumn, BASE_COLS, cells, db, dropColumn, resetSheet, restoreSheet, saveCell, scan, scanStats } from './schema'
import { finder } from 'opfs-finder'
const sideOf = (cols: string[], stats: Awaited<ReturnType<typeof scanStats>>, reports: Awaited<ReturnType<typeof scan>>[]) => {
        const count = Number(stats.count) * cols.length
        let sum = 0
        let high = 0
        const top: { name: string; value: number }[] = []
        for (const name of cols) sum += Number(stats[`sum${name}`])
        for (const report of reports) {
                high += Number(report.high?.count ?? 0)
                for (const row of report.top) top.push({ name: `${report.name}${Number(row.id)}`, value: Number(row.value) })
        }
        top.sort((a, b) => b.value - a.value)
        return {
                'all cells': [
                        { name: 'count', value: count },
                        { name: 'sum', value: sum.toFixed(1) },
                        { name: 'avg', value: (sum / count).toFixed(2) },
                        { name: 'min', value: Math.min(...cols.map((name) => Number(stats[`min${name}`]))).toFixed(1) },
                        { name: 'max', value: Math.max(...cols.map((name) => Number(stats[`max${name}`]))).toFixed(1) },
                        { name: 'where >=50', value: high },
                ],
                'top 5 cells': top.slice(0, 5).map(({ name, value }) => ({ name, value: value.toFixed(2) })),
        }
}
function App() {
        const [rows, setRows] = useState<Record<string, any>[]>([])
        const [cols, setCols] = useState(BASE_COLS)
        const [side, setSide] = useState<Record<string, { name: string; value: string | number }[]>>({ 'all cells': [], 'top 5 cells': [] })
        const refresh = async (nextCols = cols) => {
                setRows(await db.select().from(cells))
                setSide(sideOf(nextCols, await scanStats(nextCols), await Promise.all(nextCols.map(scan))))
        }
        const reset = async () => {
                const next = await resetSheet()
                setCols(next)
                await refresh(next)
        }
        const add = async () => {
                const next = await addColumn(cols, rows)
                setCols(next)
                await refresh(next)
        }
        const drop = async () => {
                const next = await dropColumn(cols, rows)
                setCols(next)
                await refresh(next)
        }
        const save = async (id: number, name: string, value: string) => {
                await saveCell(id, name, value)
                await refresh()
        }
        useEffect(() => {
                void restoreSheet().then(async (next) => {
                        setCols(next)
                        await refresh(next)
                })
        }, [])
        return (
                <main className="min-h-screen bg-slate-50 p-6">
                        <header className="mx-auto mb-4 flex max-w-[1200px] justify-between">
                                <h1 className="text-2xl font-bold text-slate-900">bad-dbms sheet</h1>
                                <div className="flex gap-2">
                                        <button className="rounded border px-3 py-2" onClick={() => finder()}>
                                                Open finder
                                        </button>
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
                                                                        <input
                                                                                key={name}
                                                                                defaultValue={Number(row[name] ?? 0).toFixed(1)}
                                                                                onBlur={(event) => save(Number(row.id), name, event.target.value)}
                                                                                onKeyDown={(event) => {
                                                                                        if (event.key === 'Enter') event.currentTarget.blur()
                                                                                }}
                                                                                className={`w-full border-t border-l border-slate-200 px-2 py-1 text-right text-sm outline-0 focus:bg-blue-50 ${Number(row[name] ?? 0) >= 50 ? 'bg-green-50 text-green-700' : 'bg-white text-slate-700'}`}
                                                                        />
                                                                ))}
                                                        </div>
                                                ))}
                                        </div>
                                </div>
                                <aside className="flex flex-col gap-2 text-sm">
                                        {Object.entries(side).map(([title, rows]) => (
                                                <div key={title} className="rounded border bg-white p-3">
                                                        <h2 className="mb-2 font-bold">{title}</h2>
                                                        {rows.map((row) => (
                                                                <div key={row.name} className="flex justify-between border-t border-slate-100 py-1 first:border-0">
                                                                        <span className="text-slate-500">{row.name}</span>
                                                                        <strong>{row.value}</strong>
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
