import {expect, test} from 'bun:test';
import {ASTMatcher, type ASTNode} from '../../src/scan/patterns/ast-matcher.ts';
import {buildAstFromSource} from '../../src/scan/patterns/ast-parser.ts';

const sampleAst: ASTNode = {
	type: 'Program',
	body: [
		{
			type: 'CallExpression',
			callee: {type: 'Identifier', name: 'eval'},
			loc: {start: {line: 2, column: 17}},
		},
		{
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				object: {type: 'Identifier', name: 'String'},
				property: {type: 'Identifier', name: 'fromCharCode'},
			},
			loc: {start: {line: 3, column: 18}},
		},
		{
			type: 'MemberExpression',
			object: {type: 'Identifier', name: 'process'},
			property: {type: 'Identifier', name: 'env'},
			loc: {start: {line: 4, column: 10}},
		},
	],
};

test('ast matcher parseSelector rejects invalid selectors', () => {
	expect(() => ASTMatcher.parseSelector('')).toThrow(/Invalid AST selector/);
});

test('ast matcher finds CallExpression by callee name', () => {
	const nodes = ASTMatcher.findNodes(sampleAst, "CallExpression[callee.name='eval']");
	expect(nodes).toHaveLength(1);
	expect(nodes[0]?.loc?.start.line).toBe(2);
});

test('ast matcher finds chained CallExpression callee members', () => {
	const nodes = ASTMatcher.findNodes(
		sampleAst,
		"CallExpression[callee.object.name='String'][callee.property.name='fromCharCode']",
	);
	expect(nodes).toHaveLength(1);
	expect(nodes[0]?.loc?.start.line).toBe(3);
});

test('ast matcher finds MemberExpression property chains', () => {
	const nodes = ASTMatcher.findNodes(
		sampleAst,
		"MemberExpression[object.name='process'][property.name='env']",
	);
	expect(nodes).toHaveLength(1);
	expect(nodes[0]?.loc?.start.line).toBe(4);
});

test('buildAstFromSource extracts eval and process.env nodes', () => {
	const source = `
const x = eval("1");
const secret = process.env.API_KEY;
const s = String.fromCharCode(65);
`;
	const ast = buildAstFromSource(source);
	const evalHits = ASTMatcher.findNodes(ast, "CallExpression[callee.name='eval']");
	const envHits = ASTMatcher.findNodes(
		ast,
		"MemberExpression[object.name='process'][property.name='env']",
	);
	const obfuscated = ASTMatcher.findNodes(
		ast,
		"CallExpression[callee.object.name='String'][callee.property.name='fromCharCode']",
	);

	expect(evalHits.length).toBeGreaterThan(0);
	expect(envHits.length).toBeGreaterThan(0);
	expect(obfuscated.length).toBeGreaterThan(0);
});
