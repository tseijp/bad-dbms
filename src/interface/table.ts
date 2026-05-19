import { Column, Columns } from './column'
import { sql, SQL } from './sql'

export type Table = Record<string, SQL>

export const table = (id: string, schema: Columns, config?: (self: Columns) => any[]) => {
        const ret = {} as Table
        for (const key in schema) ret[key] = sql()
        return ret
}
