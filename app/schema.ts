import { count, database, desc, eq, float, gte, integer, max, min, sum, table, text } from '../src/interface'
import * as DB from '../src/index'
export const BASE_COLS = [...'ABCDEFGHIJ']
const BASE_ROW_COUNT = 24
const documents = table('documents', {
        id: integer('id').primaryKey(),
        title: text('title'),
        createdAt: integer('created_at').defaultFn(() => now()),
        updatedAt: integer('updated_at').defaultFn(() => now()),
})
const sheets = table('sheets', {
        id: integer('id').primaryKey(),
        name: text('name'),
        index: integer('index'),
        rows: integer('rows'),
        cols: integer('cols'),
        createdAt: integer('created_at').defaultFn(() => now()),
        updatedAt: integer('updated_at').defaultFn(() => now()),
        documentId: integer('document_id').references(() => documents.id),
})
export const cells = table<DB.ColumnsShape>('cells', { id: integer('id').primaryKey() })
export const db = database({ documents, sheets, cells }, { adapter: 'browser' })
Object.assign(window, { db }, DB)
const now = () => Math.floor(Date.now() / 1000)
const random = () => +(Math.random() * 100).toFixed(2)
const colName = (index: number): string => {
        const code = index % 26
        const prefix = Math.floor(index / 26)
        if (prefix === 0) return String.fromCharCode(65 + code)
        return `${colName(prefix - 1)}${String.fromCharCode(65 + code)}`
}
const cellCols = () => cells.$meta.columns.map((col) => col.$col.key ?? col.$col.name).filter((name) => name !== 'id')
const syncColumns = async (cols: string[]) => {
        for (const name of cellCols()) if (!cols.includes(name)) await db.alter(cells).dropColumn(name)
        for (const name of cols) if (!cells[name]) await db.alter(cells).addColumn(float(name))
}
const writeSheet = async (rows: number, cols: number) => {
        await db.update(sheets).set({ rows, cols, updatedAt: now() }).where(eq(sheets.id, 1))
}
export const resetSheet = async () => {
        await db.delete(cells)
        await db.delete(sheets)
        await db.delete(documents)
        await syncColumns(BASE_COLS)
        await db.insert(documents).values({ id: 1, title: 'Workbook' })
        await db.insert(sheets).values({ id: 1, name: 'Sheet 1', index: 0, rows: BASE_ROW_COUNT, cols: BASE_COLS.length, documentId: 1 })
        await db.insert(cells).values(Array.from({ length: BASE_ROW_COUNT }, (_v, i) => ({ id: i + 1, ...Object.fromEntries(BASE_COLS.map((name) => [name, random()])) })) as any)
        return BASE_COLS
}
export const restoreSheet = async () => {
        const [sheet] = await db.select().from(sheets).where(eq(sheets.id, 1))
        if (!sheet) return resetSheet()
        const cols = Array.from({ length: Number(sheet.cols ?? BASE_COLS.length) }, (_v, index) => colName(index))
        await syncColumns(cols)
        return cols
}
export const addColumn = async (cols: string[], rows: Record<string, any>[]) => {
        const name = colName(cols.length)
        const next = [...cols, name]
        await db.alter(cells).addColumn(float(name))
        for (const row of rows) await db.update(cells).set({ [name]: random() }).where(eq(cells.id, Number(row.id)))
        await writeSheet(rows.length, next.length)
        return next
}
export const dropColumn = async (cols: string[], rows: Record<string, any>[]) => {
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
export const scanStats = async (cols: string[]) => {
        const fields: Record<string, any> = { count: count() }
        for (const name of cols) {
                fields[`sum${name}`] = sum(cells[name])
                fields[`min${name}`] = min(cells[name])
                fields[`max${name}`] = max(cells[name])
        }
        const [stats] = await db.select(fields).from(cells)
        return stats
}
export const scan = async (name: string) => {
        const col = cells[name]
        const [high] = await db.select({ count: count() }).from(cells).where(gte(col, 50))
        const top = await db.select({ id: cells.id, value: col }).from(cells).orderBy(desc(col)).limit(5)
        return { name, high, top }
}
