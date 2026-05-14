import { SQL } from './interface/sql'

interface Config {
        mode?: string
        onDelete?: string
        primaryKey?: boolean
        unique?: boolean
        notNull?: boolean
        default?: any
        defaultFn?: any
}

export const column = (type: string, id: string, config: Config = {}) => {
        const ret = {
                primaryKey() {
                        config.primaryKey = true
                        return ret
                },
                unique() {
                        config.unique = true
                        return ret
                },
                notNull() {
                        config.notNull = true
                        return ret
                },
                default(value: any) {
                        config.default = value
                        return ret
                },
                defaultFn(fn: () => string) {
                        config.defaultFn = fn
                        return ret
                },
                references(fn: () => SQL, { onDelete }: { onDelete: string }) {
                        config.onDelete = onDelete
                        return ret
                },
        }
        return ret
}

export type Column = ReturnType<typeof column>
export type Columns = Record<string, Column>
export const text = column.bind(null, 'text')
export const integer = column.bind(null, 'int')
