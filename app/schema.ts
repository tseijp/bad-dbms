import { avg, count, database, desc, eq, float, gte, integer, make, max, min, sum, table, text } from '../src/interface'
import type { TypedColumn } from '../src/interface'
import { createHeap } from '../src/backend/access/heap'
import * as DB from '../src/index'
type CellColumn = TypedColumn<number | null>
type CellTable = typeof cells & Record<string, CellColumn>
type SheetRow = { rows?: number | null; cols?: number | null }
export const BASE_COLS = [...'ABCDEFGHIJ']
export const BASE_ROW_COUNT = 24
export const documents = table('documents', {
        id: integer('id').primaryKey(),
        title: text('title'),
        createdAt: integer('created_at').defaultFn(() => now()),
        updatedAt: integer('updated_at').defaultFn(() => now()),
})
export const sheets = table('sheets', {
        id: integer('id').primaryKey(),
        name: text('name'),
        index: integer('index'),
        rows: integer('rows'),
        cols: integer('cols'),
        createdAt: integer('created_at').defaultFn(() => now()),
        updatedAt: integer('updated_at').defaultFn(() => now()),
        documentId: integer('document_id').references(() => documents.id),
})
export const cells = table('cells', { id: integer('id').primaryKey(), ...Object.fromEntries(BASE_COLS.map((name) => [name, float(name).notNull()])) })
export const db = database({ documents, sheets, cells }, { adapter: 'browser' })
Object.assign(window, { db }, DB)
const cellTable = cells as unknown as CellTable
const now = () => Math.floor(Date.now() / 1000)
const backend = () => db.backend as any
const relation = () => backend().catalog.resolve('cells')
const storageId = (relId: number, forkId: number) => relId * 10000 + forkId
export const columnName = (index: number): string => {
        const code = index % 26
        const prefix = Math.floor(index / 26)
        if (prefix === 0) return String.fromCharCode(65 + code)
        return `${columnName(prefix - 1)}${String.fromCharCode(65 + code)}`
}
export const sheetCols = (count: number) => Array.from({ length: count }, (_v, index) => columnName(index))
export const newRows = (cols: string[], rows = BASE_ROW_COUNT) => Array.from({ length: rows }, (_v, i) => ({ id: i + 1, ...Object.fromEntries(cols.map((name) => [name, +(Math.random() * 100).toFixed(2)])) }))
const bindColumn = (name: string) => {
        if (cellTable[name]) return
        const column = make<number>({ type: 'column', name, dataType: 'float', tableName: 'cells' }) as CellColumn
        column.$col = { name, key: name, type: 'f32', tableName: 'cells' }
        cellTable[name] = column
        cells.$meta.columns.push(column)
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
        delete cellTable[name]
        cells.$meta.columns = cells.$meta.columns.filter((item) => item.$col?.key !== name)
        rel.heaps.splice(index, 1)
        rel.codecs.splice(index, 1)
        await backend().smgr.unlink(backend().smgr.open(storageId(rel.relId, column.forkId)), 0)
}
export const syncColumns = async (cols: string[], values: Record<string, number[]> = {}) => {
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
export const readSheet = async () => (await db.select().from(sheets).where(eq(sheets.id, 1)))[0] as SheetRow | undefined
export const writeSheet = async (rows: number, cols: number) => {
        await db.update(sheets).set({ rows, cols, updatedAt: now() }).where(eq(sheets.id, 1))
}
export const resetSheet = async () => {
        await db.delete(cells)
        await db.delete(sheets)
        await db.delete(documents)
        await syncColumns(BASE_COLS)
        await db.insert(documents).values({ id: 1, title: 'Workbook' })
        await db.insert(sheets).values({ id: 1, name: 'Sheet 1', index: 0, rows: BASE_ROW_COUNT, cols: BASE_COLS.length, documentId: 1 })
        await db.insert(cells).values(newRows(BASE_COLS) as any)
        return BASE_COLS
}
export const restoreSheet = async () => {
        const sheet = await readSheet()
        if (!sheet) return resetSheet()
        const cols = sheetCols(Number(sheet.cols ?? BASE_COLS.length))
        await syncColumns(cols)
        return cols
}
export const addSheetColumn = async (cols: string[], rows: Record<string, any>[]) => {
        const name = columnName(cols.length)
        const next = [...cols, name]
        await syncColumns(next, { [name]: rows.map(() => +(Math.random() * 100).toFixed(2)) })
        await writeSheet(rows.length, next.length)
        return next
}
export const dropSheetColumn = async (cols: string[], rows: Record<string, any>[]) => {
        if (cols.length <= 1) return cols
        const next = cols.slice(0, -1)
        await syncColumns(next)
        await writeSheet(rows.length, next.length)
        return next
}
export const saveCell = async (id: number, name: string, value: string) => {
        await db
                .update(cells)
                .set({ [name]: +value || 0 })
                .where(eq(cells.id, id))
}
export const scan = async (name: string) => {
        const column = cellTable[name]
        const [stats] = await db.select({ sum: sum(column), avg: avg(column), min: min(column), max: max(column), count: count() }).from(cells)
        const [high] = await db.select({ count: count() }).from(cells).where(gte(column, 50))
        const top = await db.select({ id: cells.id, value: column }).from(cells).orderBy(desc(column)).limit(5)
        return { stats, high, top: top.map((row) => [`${name}${Number(row.id)}`, Number(row.value).toFixed(2)] as [string, string]) }
}
export const sideOf = (reports: Awaited<ReturnType<typeof scan>>[]) => {
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
