import './example.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { database, desc, eq, gte, avg, max, min, sum, count, float, integer, table } from './src/interface'
import * as DB from './src/index'
Object.assign(window, DB)
const cells = table('cells', {
        id: integer('id').primaryKey(),
        row: integer('row').notNull(),
        col: integer('col').notNull(),
        value: float('value').notNull(),
})
const db = database({ cells }, { adapter: 'memory' })
Object.assign(window, { db }, DB)
const A = [...'ABCDEFGHIJ']
const seed = () => Array.from({ length: 60 }, (_, i) => ({ id: i + 1, row: (i / 10) | 0, col: i % 10, value: +(Math.random() * 100).toFixed(2) }))
function App() {
        const [rows, setRows] = useState<{ id: number; row: number; col: number; value: number }[]>([])
        const [agg, setAgg] = useState<Record<string, number>>({})
        const [top, setTop] = useState<typeof rows>([])
        const refresh = async () => {
                setRows(await db.select().from(cells))
                setTop(await db.select().from(cells).orderBy(desc(cells.value)).limit(5))
                const [a] = await db.select({ s: sum(cells.value), a: avg(cells.value), m: min(cells.value), x: max(cells.value), n: count() }).from(cells)
                const [b] = await db.select({ n: count() }).from(cells).where(gte(cells.value, 50))
                setAgg({ n: +a.n, s: +a.s, a: +a.a, m: +a.m, x: +a.x, hi: +(b?.n ?? 0) })
        }
        const reseed = async () => {
                await db.delete(cells)
                await db.insert(cells).values(seed())
                await refresh()
        }
        useEffect(() => {
                void reseed()
        }, [])
        const grid = Array.from({ length: 6 }, (_, r) => Array.from({ length: 10 }, (_, c) => rows.find((x) => x.row === r && x.col === c)?.value ?? 0))
        const commit = async (r: number, c: number, raw: string) => {
                const id = r * 10 + c + 1
                await db
                        .update(cells)
                        .set({ value: +raw || 0 })
                        .where(eq(cells.id, id))
                await refresh()
        }
        const BTN = 'rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-bold text-blue-700 hover:bg-blue-200'
        const CARD = 'rounded-lg border border-slate-300 bg-white p-3'
        return (
                <main className="min-h-screen bg-slate-50 p-6">
                        <header className="mx-auto mb-4 flex max-w-[1200px] justify-between">
                                <h1 className="text-2xl font-bold text-slate-900">bad-dbms demo</h1>
                                <div className="flex gap-2">
                                        <button className={BTN} onClick={reseed}>
                                                Reseed
                                        </button>
                                        <button className={BTN} onClick={() => db.delete(cells).then(refresh)}>
                                                Clear
                                        </button>
                                </div>
                        </header>
                        <div className="mx-auto grid max-w-[1200px] grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
                                <div className={`${CARD} overflow-auto p-0`}>
                                        <div className="grid min-w-[700px]" style={{ gridTemplateColumns: `40px repeat(10,1fr)` }}>
                                                <div className="bg-slate-100" />
                                                {A.map((l) => (
                                                        <div key={l} className="grid place-items-center bg-slate-100 py-2 text-xs font-bold text-slate-600">
                                                                {l}
                                                        </div>
                                                ))}
                                                {grid.map((line, r) => (
                                                        <div key={r} className="contents">
                                                                <div className="grid place-items-center bg-slate-100 text-xs font-bold text-slate-600">{r + 1}</div>
                                                                {line.map((v, c) => (
                                                                        <input key={`${c}-${v}`} defaultValue={v.toFixed(1)} onBlur={(e) => commit(r, c, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className={`w-full border-t border-l border-slate-200 px-2 py-1 text-right text-sm outline-0 focus:bg-blue-50 focus:shadow-[inset_0_0_0_2px_#2563eb] ${v >= 50 ? 'bg-green-50 text-green-700' : 'bg-white text-slate-700'}`} />
                                                                ))}
                                                        </div>
                                                ))}
                                        </div>
                                </div>
                                <aside className="flex flex-col gap-2 text-sm">
                                        <div className={CARD}>
                                                <h2 className="mb-2 font-bold">aggregate</h2>
                                                {[
                                                        ['count', agg.n],
                                                        ['sum', agg.s?.toFixed(1)],
                                                        ['avg', agg.a?.toFixed(2)],
                                                        ['min', agg.m?.toFixed(1)],
                                                        ['max', agg.x?.toFixed(1)],
                                                        ['where ≥50', agg.hi],
                                                ].map(([k, v]) => (
                                                        <div key={k} className="flex justify-between border-t border-slate-100 py-1 first:border-0">
                                                                <span className="text-slate-500">{k}</span>
                                                                <strong>{v}</strong>
                                                        </div>
                                                ))}
                                        </div>
                                        <div className={CARD}>
                                                <h2 className="mb-2 font-bold">top 5 (orderBy desc)</h2>
                                                {top.map((r) => (
                                                        <div key={r.id} className="flex justify-between border-t border-slate-100 py-1 first:border-0">
                                                                <span className="text-slate-500">
                                                                        {A[r.col]}
                                                                        {r.row + 1}
                                                                </span>
                                                                <strong>{r.value.toFixed(2)}</strong>
                                                        </div>
                                                ))}
                                        </div>
                                </aside>
                        </div>
                </main>
        )
}
createRoot(document.getElementById('root')!).render(<App />)
