import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/**/__tests__/**/*.spec.ts'],
		// describe, it, expect and vi without importing them, as with jest
		globals: true,
		environment: 'node',
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/__tests__/**', 'src/**/__mocks__/**', 'src/types/**'],
			reporter: ['text', 'json', 'lcov', 'clover'],
			reportsDirectory: './coverage',
		},
	},
})
