export * from './expressions/conditions'
export * from './expressions/select'
export * from './functions/aggregate'
export * from './functions/vector'

export type NodeType =
        | 'column'
        | 'literal'
        | 'placeholder'
        | 'binop'
        | 'unop'
        | 'func'
        | 'aggregate'
        | 'subquery'
        | 'raw'
        | 'identifier'
        | 'list'
        | 'order'
        | 'table'

export interface SqlNode {
        type: NodeType
        [k: string]: any
}

export interface SQL<T = unknown> {
        kind: 'sql'
        node: SqlNode
        _t?: T
        toFloat?: () => SQL
        toInt?: () => SQL
        add?: (other: any) => SQL
        sub?: (other: any) => SQL
        mul?: (other: any) => SQL
        div?: (other: any) => SQL
}

export interface Placeholder {
        kind: 'sql'
        node: SqlNode
}

export type SQLChunk = string | number | boolean | null | SQLChunk[] | SQL | Placeholder

export type Encoder = any

const attach = (sql: SQL): SQL => {
        sql.toFloat = () => attach({ kind: 'sql', node: { type: 'func', name: 'toFloat', args: [sql] } })
        sql.toInt = () => attach({ kind: 'sql', node: { type: 'func', name: 'toInt', args: [sql] } })
        sql.add = (other: any) => attach({ kind: 'sql', node: { type: 'binop', op: '+', args: [sql, wrap(other)] } })
        sql.sub = (other: any) => attach({ kind: 'sql', node: { type: 'binop', op: '-', args: [sql, wrap(other)] } })
        sql.mul = (other: any) => attach({ kind: 'sql', node: { type: 'binop', op: '*', args: [sql, wrap(other)] } })
        sql.div = (other: any) => attach({ kind: 'sql', node: { type: 'binop', op: '/', args: [sql, wrap(other)] } })
        return sql
}

const make = (node: SqlNode): SQL => attach({ kind: 'sql', node })

export const isSQL = (v: any): v is SQL => !!v && typeof v === 'object' && v.kind === 'sql'

export const wrap = (v: any): SQL => {
        if (isSQL(v)) return v as SQL
        return make({ type: 'literal', value: v })
}

export const raw = (str: string): SQL => make({ type: 'raw', value: str })

export const identifier = (name: string): SQL => make({ type: 'identifier', name })

export const placeholder = (name: string): Placeholder => make({ type: 'placeholder', name }) as Placeholder

export const param = <T>(value: T, encoder?: Encoder): SQL => make({ type: 'literal', value, encoder })

export const empty = (): SQL => make({ type: 'raw', value: '' })

export const fromList = (list: SQLChunk[]): SQL => make({ type: 'list', items: list.map(wrap) })

export const join = (chunks: SQLChunk[], separator?: SQLChunk): SQL => {
        const items: SQL[] = []
        const sep = separator === undefined ? undefined : wrap(separator)
        for (let i = 0; i < chunks.length; i++) {
                if (i > 0 && sep) items.push(sep)
                items.push(wrap(chunks[i]))
        }
        return make({ type: 'list', items })
}

export const sql = (strings: TemplateStringsArray | SQLChunk[], ...values: SQLChunk[]): SQL => {
        const parts: SQL[] = []
        const arr = Array.isArray(strings) ? strings : Array.from(strings as any)
        for (let i = 0; i < arr.length; i++) {
                const s = String(arr[i])
                if (s.length > 0) parts.push(raw(s))
                if (i < values.length) parts.push(wrap(values[i]))
        }
        return make({ type: 'list', items: parts })
}
