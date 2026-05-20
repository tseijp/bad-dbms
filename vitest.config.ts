import { defineConfig } from 'vitest/config'

export default defineConfig({
        test: {
                include: ['**/*.test.ts'],
                exclude: ['node_modules/**', 'dist/**'],
                coverage: {
                        provider: 'v8',
                        include: ['src/**/*.ts', 'src/**/*.tsx'],
                        exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/types.ts'],
                        reporter: ['text', 'json', 'html'],
                        reportsDirectory: './logs/coverage',
                },
        },
})
