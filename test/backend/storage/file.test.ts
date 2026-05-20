import { describe, it, expect } from 'vitest'
import { createFileAdapter, createFile } from '../../../src/backend/storage/file'
import { fillBytes } from './_helpers'
describe('file', () => {
        it('reads back the exact byte sequence written at the same offset', () => {
                const file = createFile(createFileAdapter())
                const bytes = fillBytes(8, 10)
                file.write('a', 0, bytes)
                const out = file.read('a', 0, 8)
                expect(Array.from(out)).toEqual(Array.from(bytes))
        })
        it('returns zero-filled bytes past the end of the written region', () => {
                const file = createFile(createFileAdapter())
                file.write('a', 0, fillBytes(4, 1))
                const out = file.read('a', 4, 4)
                expect(Array.from(out)).toEqual([0, 0, 0, 0])
        })
        it('returns a zero-filled buffer of the requested length for unknown ids', () => {
                const file = createFile(createFileAdapter())
                const out = file.read('missing', 0, 6)
                expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0])
        })
        it('grows the underlying buffer when writing past the current end', () => {
                const file = createFile(createFileAdapter())
                file.write('a', 0, fillBytes(4, 1))
                file.write('a', 10, fillBytes(2, 200))
                const out = file.read('a', 10, 2)
                expect(Array.from(out)).toEqual([200, 201])
        })
        it('exposes the fixed 6-function API surface from createFile', () => {
                const file = createFile(createFileAdapter())
                expect(Object.keys(file).sort()).toEqual(['close', 'exists', 'read', 'size', 'sync', 'write'])
        })
        it('reports size as the highest offset+length written so far', () => {
                const file = createFile(createFileAdapter())
                file.write('a', 0, fillBytes(100, 1))
                file.write('a', 0, fillBytes(2, 9))
                expect(file.size('a')).toBe(100)
        })
        it('returns true from exists for a written id and false for an unwritten id', () => {
                const file = createFile(createFileAdapter())
                file.write('a', 0, fillBytes(1, 1))
                expect(file.exists('a')).toBe(true)
                expect(file.exists('b')).toBe(false)
        })
})
