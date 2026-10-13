import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		rules: {
			// `_`-prefixed names are deliberately unused: PB's `catch (_) {}` idiom, placeholder args.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_'
				}
			],
			// Empty catch is a deliberate "ignore this failure" across hooks, tests and scripts.
			'no-empty': ['error', { allowEmptyCatch: true }],
			// `let x = null; try { x = load() } catch {}` keeps a defensive default; also
			// false-positives on `dirty = $bindable(false)` props.
			'no-useless-assignment': 'off',
			// Served at the root with no `paths.base`: resolve() would be 115 sites of
			// churn with no behaviour change. Revisit if a base path is ever set.
			'svelte/no-navigation-without-resolve': 'off',
			// Flags local, never-reactive Map/Set/URLSearchParams and the deliberate
			// `state = new Set(state)` replace-to-trigger pattern.
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{
		// PocketBase JSVM (goja) hooks + migrations: runtime idioms, not ordinary TS.
		files: ['backend/pb_hooks/**', 'backend/pb_migrations/**'],
		rules: {
			// `/// <reference path="../pb_data/types.d.ts" />` is how hooks get their types.
			'@typescript-eslint/triple-slash-reference': 'off',
			// require(`${__hooks}/x.js`) is goja's only module loading.
			'@typescript-eslint/no-require-imports': 'off'
		}
	},
	{
		// Untyped API responses and partial fixtures in specs and seed helpers.
		files: ['tests/**', '**/*.test.ts'],
		rules: { '@typescript-eslint/no-explicit-any': 'off' }
	},
	{
		// Migrations are append-only history: findings there are never actionable.
		files: ['backend/pb_migrations/**'],
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'no-empty': 'off'
		}
	},
	{
		// Node test scripts: `cond ? pass(..) : fail(..)` is the assertion idiom.
		files: ['backend/test-*.mjs'],
		rules: {
			'@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }]
		}
	}
);
