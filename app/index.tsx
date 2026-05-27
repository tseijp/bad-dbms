import './style.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { addSheetColumn, BASE_COLS, cells, db, dropSheetColumn, resetSheet, restoreSheet, saveCell, scan, sideOf } from './schema'
function App() {
        const [rows, setRows] = useState<Record<string, any>[]>([])
        const [cols, setCols] = useState(BASE_COLS)
        const [side, setSide] = useState<Record<string, [string, string | number][]>>({ 'all cells': [], 'top 5 cells': [] })
        const refresh = async (nextCols = cols) => {
                setRows(await db.select().from(cells))
                setSide(sideOf(await Promise.all(nextCols.map(scan))))
        }
        const reset = async () => {
                const next = await resetSheet()
                setCols(next)
                await refresh(next)
        }
        const add = async () => {
                const next = await addSheetColumn(cols, rows)
                setCols(next)
                await refresh(next)
        }
        const drop = async () => {
                const next = await dropSheetColumn(cols, rows)
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
                                                        {rows.map(([name, value]) => (
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
