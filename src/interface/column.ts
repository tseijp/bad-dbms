import { SQL } from './sql'

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
                secoundaryKey() {
                        return ret
                },
                unique() {
                        return ret
                },
                notNull() {
                        return ret
                },
                default(value: any) {
                        return ret
                },
                defaultFn(fn: () => string) {
                        return ret
                },
                references(fn: () => SQL, { onDelete }: { onDelete: string }) {
                        return ret
                },
        }
        return ret
}

export type Column = ReturnType<typeof column>
export type Columns = Record<string, Column>
export const text = column.bind(null, 'text')
export const integer = column.bind(null, 'int')
