export type Merge<T extends object> = Partial<{
        [K in keyof T]: T[K] extends object ? Merge<T[K]> : T[K]
}>
const blocked = new Set(['__proto__', 'constructor', 'prototype'])
export const merge = <T extends object>(a: Merge<T>, b: Merge<T>, ignore?: (key: string, value: unknown) => boolean) => {
        for (const key in b) {
                if (blocked.has(key) || ignore?.(key, b[key])) continue
                if (is.obj(a[key]) && is.obj(b[key])) merge(a[key], b[key], ignore)
                else a[key] = b[key]
        }
}
export const is = {
        arr: Array.isArray,
        bol: (a: unknown): a is boolean => typeof a === 'boolean',
        str: (a: unknown): a is string => typeof a === 'string',
        num: (a: unknown): a is number => typeof a === 'number',
        fun: (a: unknown): a is Function => typeof a === 'function',
        und: (a: unknown): a is undefined => typeof a === 'undefined',
        nul: (a: unknown): a is null => a === null,
        set: (a: unknown): a is Set<unknown> => a instanceof Set,
        map: (a: unknown): a is Map<unknown, unknown> => a instanceof Map,
        obj: (a: unknown): a is object => !!a && a.constructor.name === 'Object',
        nan: (a: unknown): a is number => typeof a === 'number' && Number.isNaN(a),
}
export const isServer = () => {
        return typeof window === 'undefined'
}
/**
 * each
 */
type EachFn<Value, Key, This> = (this: This, value: Value, key: Key) => void
type Eachable<Value = any, Key = any, This = any> = {
        forEach(cb: EachFn<Value, Key, This>, ctx?: This): void
}
export const each = <Value, Key, This>(obj: Eachable<Value, Key, This>, fn: EachFn<Value, Key, This>) => obj.forEach(fn)
export const flush = <Value extends Function, Key, This>(obj: Eachable<Value, Key, This>, ...args: any[]) => {
        each(obj, (f) => f(...args))
}
export const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'
