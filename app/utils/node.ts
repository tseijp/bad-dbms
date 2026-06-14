import { each, is, merge } from './utils'
import type { Merge } from './utils'
export type HTMLMap = HTMLElementTagNameMap
export type HTMLTag = keyof HTMLMap
export type HTMLNode<T extends HTMLTag = HTMLTag> = HTMLMap[T] | string | number | null | undefined
export type Component<T extends HTMLTag, P = {}, Child = HTMLMap[T]> = (props: P) => Child
export type Props<T extends HTMLTag> = Merge<HTMLMap[T]> & {
        key?: string
        ref?: (el: HTMLMap[T]) => void
        children?: HTMLNode | HTMLNode[]
        className?: string
}
const urlProps = new Set(['href', 'src', 'action', 'formAction', 'poster', 'data', 'cite'])
const docProps = new Set(['innerHTML', 'outerHTML', 'srcdoc'])
const isUnsafe = (value: unknown) => is.str(value) && /^(javascript|vbscript|data):/i.test(value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, ''))
export const append = <El extends Node>(child: Node | string | number | null | undefined, el: El) => {
        if (is.num(child)) child = child.toString()
        if (is.str(child)) child = document.createTextNode(child)
        if (child) el.appendChild(child)
}
export const remove = <El extends Node>(child: Node, el: El) => {
        el.removeChild(child)
}
function create<T extends HTMLTag>(type: T, props?: Props<T>, ...args: HTMLNode[]): HTMLMap[T]
function create<T extends HTMLTag, P = {}, Child = HTMLMap[T]>(type: Component<T, P, Child>, props?: P, ...args: HTMLNode[]): Child
function create(type: any, props: any, ...args: HTMLNode[]) {
        if (!props) props = {}
        const { key, ref, children, style, ...other } = props
        if (!args.length) args = is.arr(children) ? children : [children]
        if (is.fun(type)) {
                merge(props, { children: args })
                return type(props)
        }
        const el = document.createElement(type)
        merge(el, other, (key, value) => {
                if (docProps.has(key)) return true
                if (urlProps.has(key) && isUnsafe(value)) return true
                if (key.includes('-')) {
                        el.setAttribute(key, String(value))
                        return true
                }
                return false
        })
        if (style) merge(el.style, style)
        each(args.flat(), (c) => append(c, el))
        if (ref) ref(el)
        return el
}
type IntrinsicElementMap = {
        [T in HTMLTag]: Props<T>
}
declare global {
        namespace JSX {
                interface Element extends HTMLElement {}
                interface IntrinsicElements extends IntrinsicElementMap {}
        }
}
export { create }
export default create
