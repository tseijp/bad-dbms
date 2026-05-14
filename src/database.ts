import { Columns } from './column'
import { SQL } from './interface/sql'
import { Table } from './table'

export const database = (config: any) => {
        return {
                select(fields?: Columns) {
                        return {
                                from(table: Table) {
                                        return {
                                                where(sql: SQL) {
                                                        return {
                                                                async limit(limit: number) {
                                                                        return []
                                                                },
                                                        }
                                                },
                                        }
                                },
                        }
                },
        }
}
