module.exports = {
	moduleFileExtensions: ['ts', 'js'],
	// the sources import each other with .js extensions, as Node16 module resolution requires
	moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: 'tsconfig.json',
				// 151001: TypeScript 6 always has esModuleInterop on. 151002: ts-jest only supports Node16-style module kinds with
				// isolatedModules
				diagnostics: { ignoreCodes: [6133, 151001, 151002] },
			},
		],
	},
	testMatch: ['**/__tests__/**/*.spec.(ts|js)'],
	testPathIgnorePatterns: ['integrationTests'],
	testEnvironment: 'node',
	collectCoverageFrom: [
		'**/src/**/*.{ts,js}',
		'!**/node_modules/**',
		'!**/__tests__/**',
		'!**/__mocks__/**',
		'!**/src/copy/**',
		'!**/dist/**',
		'!**/src/types/**',
	],
	coverageProvider: 'v8',
	coverageDirectory: './coverage/',
}
