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
]

export default customConfig
