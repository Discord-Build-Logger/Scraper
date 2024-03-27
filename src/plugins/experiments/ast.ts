import assert from "node:assert";
import * as walker from "estree-walker";
import * as oxc from "oxc-parser";
import { Experiment } from "~/types/discord";

export interface ASTExperiment {
	kind: Experiment.Type;
	id: string;
	label: string;
	treatments: {
		id: number;
		label: string;
	}[];
}

/*
	==Problems==

	1. MemberExpressions - stuff like `"id": o.Z.FOO` is too hard to parse. Needs runtime evaluation.

	2. CallExpressions - ones like .concat() or .map(), etc.
	They sometimes reference other variables too, so also needs runtime evaluation.

	3. 2020-01_in_app_reporting - Uses the old register function...
*/

export class ASTParser {
	private readonly expFields = ["kind", "id", "label"];
	private readonly ignoreFields = ["defaultConfig", "config"];

	private script: string;

	constructor(script: string) {
		this.script = script;
	}

	public parse() {
		const list: ASTExperiment[] = [];

		const ast = oxc.parseSync(this.script);

		const state = this;
		walker.walk(JSON.parse(ast.program), {
			enter(node: any, _parent, _prop, _index) {
				if (node.type !== "ObjectExpression") return;

				if (state.isExperiment(node)) {
					try {
						const exp: ASTExperiment = state.astToJSValue(node);
						state.validateASTExperiment(exp);

						list.push(exp);
					} catch (ex: any) {
						console.error(
							"[ScriptASTParser] Failed to parse",
							state.script.substring(node.start, node.end),
							ex.message,
						);
					}
				}
			},
		});

		list.forEach((exp) => this.deflateMemory(exp));
		return list;
	}

	// node.js keeps the entire original string in memory as long as any slice of it is still around (and the slice is a "sliced string")
	// which causes quite a memory leak, so we forcefully de-reference those here
	private deflateMemory(exp: ASTExperiment) {
		exp.id = Buffer.from(exp.id).toString();
		exp.label = Buffer.from(exp.label).toString();
		exp.treatments.forEach((x) => {
			x.label = Buffer.from(x.label).toString();
		});
	}

	private validateASTExperiment(exp: ASTExperiment) {
		assert(
			exp.kind === Experiment.Type.guild ||
				exp.kind === Experiment.Type.user ||
				exp.kind === Experiment.Type.none,
			"Invalid experiment type",
		);
		assert(typeof exp.id === "string", "Invalid experiment id");
		assert(typeof exp.label === "string", "Invalid experiment title");
		assert(
			typeof exp.treatments === "object",
			"Invalid experiment treatments object",
		);
		assert(
			exp.treatments.every(
				(treatment) =>
					typeof treatment.id === "number" &&
					typeof treatment.label === "string",
			),
			"Invalid experiment treatments data",
		);
	}

	private hasProperty(node: any, name: string) {
		if (node.type !== "ObjectExpression") throw new Error("Not an object");

		return node.properties.some((prop: any) => {
			if (!prop.key) return false;

			if (prop.key.type === "Identifier") {
				return prop.key.name === name;
			}

			if (prop.key.type === "Literal") {
				return prop.key.value === name;
			}

			return false;
		});
	}

	private isEnumExpression(node: any): boolean {
		if (node.type !== "MemberExpression") return false;

		if (node.object.type === "MemberExpression" && !node.computed) {
			return this.isEnumExpression(node.object);
		}

		if (node.object.type === "Identifier" && !node.computed) {
			return node.property.type === "Identifier";
		}

		return false;
	}

	private isExperiment(node: any) {
		return this.expFields.every((prop) => this.hasProperty(node, prop));
	}

	private astToJSValue(node: any): any {
		if (
			node.type === "Literal" ||
			node.type === "StringLiteral" ||
			node.type === "NumericLiteral"
		) {
			return node.value;
		}

		if (node.type === "ObjectExpression") {
			const obj: Record<string, any> = {};

			for (const prop of node.properties) {
				if (!prop.key) continue;

				let name: string;
				if (prop.key.type === "Identifier") name = prop.key.name;
				else if (
					prop.key.type === "Literal" ||
					prop.key.type === "StringLiteral" ||
					prop.key.type === "NumericLiteral"
				) {
					name = prop.key.value;
				} else {
					continue;
				}

				if (this.ignoreFields.includes(name)) continue;
				obj[name] = this.astToJSValue(prop.value);
			}

			return obj;
		}

		if (node.type === "ArrayExpression") {
			return node.elements.map((elem: any) => this.astToJSValue(elem));
		}

		if (node.type === "Identifier") {
			//return node.name
		}

		if (node.type === "UnaryExpression" && node.operator === "!") {
			return !this.astToJSValue(node.argument);
		}

		if (this.isEnumExpression(node)) {
			//return node.property.name
		}

		throw new Error(`Unsupported node type ${node.type}`);
		//return this.script.substring(node.start, node.end)
	}
}
