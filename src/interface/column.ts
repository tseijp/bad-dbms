import type { SQL } from './sql'
export interface ColumnConfig {
        primaryKey?: boolean
        unique?: boolean
        notNull?: boolean
        defaultValue?: any
        defaultFn?: () => any
        hasOrder?: boolean
        orderRange?: [number, number]
        references?: { fn: () => SQL; onDelete?: string }
        tag?: 'str'
}
export interface ColumnDescriptor extends ColumnConfig {
        name: string
        type: string
        tableName?: string
}
export interface Column extends Record<string, any> {
        kind: 'sql'
        node: any
        $col: ColumnDescriptor
}
const wrapVal = (v: any): any => (v && v.kind === 'sql' ? v : { kind: 'sql', node: { type: 'literal', value: v } })
const mkBinop = (op: string, l: any, r: any): SQL => ({ kind: 'sql', node: { type: 'binop', op, args: [l, wrapVal(r)] } })
const mkFunc = (name: string, args: any[]): SQL => ({ kind: 'sql', node: { type: 'func', name, args: args.map(wrapVal) } })
const attachExprMethods = (self: any) => {
        self.add = (v: any) => attachExprMethods(mkBinop('+', self, v))
        self.sub = (v: any) => attachExprMethods(mkBinop('-', self, v))
        self.mul = (v: any) => attachExprMethods(mkBinop('*', self, v))
        self.div = (v: any) => attachExprMethods(mkBinop('/', self, v))
        self.mod = (v: any) => attachExprMethods(mkBinop('%', self, v))
        self.eq = (v: any) => attachExprMethods(mkBinop('=', self, v))
        self.ne = (v: any) => attachExprMethods(mkBinop('!=', self, v))
        self.lt = (v: any) => attachExprMethods(mkBinop('<', self, v))
        self.lte = (v: any) => attachExprMethods(mkBinop('<=', self, v))
        self.gt = (v: any) => attachExprMethods(mkBinop('>', self, v))
        self.gte = (v: any) => attachExprMethods(mkBinop('>=', self, v))
        self.toFloat = () => attachExprMethods(mkFunc('toFloat', [self]))
        self.toInt = () => attachExprMethods(mkFunc('toInt', [self]))
        self.toBool = () => attachExprMethods(mkFunc('toBool', [self]))
        self.at = (i: any) => attachExprMethods(mkFunc('at', [self, i]))
        return self
}
export const wrapExpr = (s: SQL): any => attachExprMethods(s)
export const column = (type: string, name?: string, config: ColumnConfig = {}): Column => {
        const _desc: ColumnDescriptor = { name: name ?? '', type, ...config }
        const self: any = { kind: 'sql', node: { type: 'column', name: _desc.name, dataType: type }, $col: _desc }
        self.primaryKey = () => {
                _desc.primaryKey = true
                return self
        }
        self.unique = () => {
                _desc.unique = true
                return self
        }
        self.notNull = () => {
                _desc.notNull = true
                return self
        }
        self.default = (value: any) => {
                _desc.defaultValue = value
                return self
        }
        self.$defaultFn = (fn: () => any) => {
                _desc.defaultFn = fn
                return self
        }
        self.defaultFn = self.$defaultFn
        self.references = (fn: () => SQL, opts?: { onDelete?: string }) => {
                _desc.references = { fn, onDelete: opts?.onDelete }
                return self
        }
        self.order = (min: number, max: number) => {
                _desc.hasOrder = true
                _desc.orderRange = [min, max]
                return self
        }
        attachExprMethods(self)
        return self as Column
}
export type Columns<Key extends string = string> = Record<Key, Column>
export const text = (name?: string, config?: ColumnConfig) => column('u32', name, { ...config, tag: 'str' })
export const integer = (name?: string, config?: ColumnConfig) => column('i32', name, config)
export const float = (name?: string, config?: ColumnConfig) => column('f32', name, config)
export const uint = (name?: string, config?: ColumnConfig) => column('u32', name, config)
