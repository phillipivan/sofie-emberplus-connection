import { generateEslintConfig } from '@sofie-automation/code-standard-preset/eslint/main.mjs'

const baseConfig = await generateEslintConfig({
	ignores: ['node_modules', '/dist', '/scratch', '/build', 'package-lock.json', '/lib', '/coverage'],
	testRunner: 'jest',
})

const customConfig = [
	...baseConfig,

	{
		rules: {
			'jest/expect-expect': 'off',
		},
	},

	// No `any` in the library's code (the preset turns the rule off). Tests and mocks still use it, to reach private
	// members and build malformed input.
	{
		files: ['src/**/*.ts'],
		ignores: ['src/**/__tests__/**', 'src/**/__mocks__/**', 'src/**/*.spec.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'error',
		},
	},
]

export default customConfig
