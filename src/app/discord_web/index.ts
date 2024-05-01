import { downloadFile } from "~/app/downloader";
import {
	HTML_GLOBAL_ENV_REGEX,
	HTML_URL_REGEX,
	JS_URL_REGEXES,
} from "~/constants";
import { handleBuild, handleFile } from "~/plugins";
import type { Build, File } from "~/types";
import Discord from "../../types/discord";
import * as walker from "estree-walker";
import { parseSync } from "oxc-parser"


export type CapturedModule = {
	id: number,
	hash: string,
}

export enum CaptureMethod {
	AST,
	Regex
}

export class DiscordWebScraper {
	constructor(
		public build: Build,
		public html: string,
	) { }

	static async scrapeLatestBuild(
		branch: Discord.ReleaseChannel,
	): Promise<DiscordWebScraper> {
		console.time(`Time taken to fetch latest build root for ${branch}`);
		const url = new URL("/app", `https://${Discord.Domains[branch]}`);

		const response = await fetch(url);

		if (!response.ok) {
			// consume the body to prevent memory leaks
			await response.text().catch(() => { });
			throw new Error(`Failed to fetch Discord build from ${url}`);
		}

		const buildHash = response.headers.get("x-build-id");
		const lastModified = response.headers.get("last-modified");

		if (!buildHash || !lastModified) {
			// consume the body to prevent memory leaks
			await response.text().catch(() => { });
			throw new Error(`Failed to fetch Discord build metadata from ${url}`);
		}

		const html = await response.text();

		let global_env: Record<string, any> = {};
		try {
			global_env = new Function(
				`return${HTML_GLOBAL_ENV_REGEX.exec(html)?.[1]}`,
			)();
		} catch (e) {
			console.error("Failed to parse global env:", e);
		}

		HTML_GLOBAL_ENV_REGEX.lastIndex = 0;

		const build: Build = {
			build_hash: buildHash,
			build_number: 0,
			build_date: new Date(lastModified),
			release_channels: {
				[branch]: new Date(lastModified),
			},
			environment: Discord.Environment.production,
			GLOBAL_ENV: global_env,
			experiments: [],
			files: [],
			plugins: {},
		};

		return new DiscordWebScraper(build, html);
	}

	async beginScrapingFiles(): Promise<Build> {
		console.time(
			`Time taken to download all build files for ${this.build.build_hash}`,
		);
		const files = await this.bulkDownloadFiles(
			this.getFileLinksFromHtml(this.html),
		);
		console.timeEnd(
			`Time taken to download all build files for ${this.build.build_hash}`,
		);

		for (const file of files) {
			await handleFile(this.build, file);

			// Clear the blob from memory
			file.blob = undefined;
		}

		this.build.files = files;

		await handleBuild(this.build);

		return this.build;
	}

	private getFileLinksFromHtml(body: string): File[] {
		const matches = body.matchAll(HTML_URL_REGEX);
		HTML_URL_REGEX.lastIndex = 0;

		const links: File[] = [];

		for (const asset of Array.from(matches)) {
			const url = asset[1];
			if (!url.startsWith("/assets/")) continue;
			if (links.some((link) => link.path === url)) continue;

			const tag = (() => {
				if (url.endsWith(".js")) return "filetype:javascript";
				if (url.endsWith(".css")) return "filetype:css";
				if (url.endsWith(".ico")) return "filetype:favicon";
				if (url.endsWith(".map")) return "filetype:sourcemap";
				return "filetype:other";
			})();

			links.push({ path: url, tags: [tag, "file:root-file"] });
		}

		return links;
	}

	private static readonly IGNORED_FILENAMES = ["NW.js", "Node.js", "bn.js", "hash.js", "utf8str", "t61str", "ia5str", "iso646str"];
	private static readonly REQUIRED_STRINGS = [".js"];

	private isChunkLoader(body: string): boolean {
		return DiscordWebScraper.REQUIRED_STRINGS.every((field) => {
			return body.match(new RegExp(field, "g"));
		})
	}

	private captureModulesAST(body: string): CapturedModule[] {
		const captured: CapturedModule[] = [];
		const ast = parseSync(body);

		walker.walk(JSON.parse(ast.program), {
			enter: (node: any, parent: any) => {
				if (parent === null) { return; }
				let isChunk = false
				let chunkID: number | undefined = undefined;
				let chunkHash: string | undefined = undefined;

				if (node.type === "ConditionalExpression") {
					const test = node.test
					const consequent = node.consequent

					if (test === undefined) { return; }
					if (consequent === undefined) { return; }
					if (test.type !== "BinaryExpression" || consequent.type !== "BinaryExpression") { return; }
					const testLeft = test.left
					const consequentRight = consequent.right
					if (consequentRight.type !== "StringLiteral") { return; }

					const _chunkID: string = testLeft.value
					const _chunkHash: string = consequentRight.value

					const isChunkHash = _chunkHash.endsWith(".js") === true

					if (isChunkHash === true) {
						chunkID = Number.parseInt(_chunkID)
						chunkHash = `${_chunkID}${_chunkHash}`
						isChunk = true
					} else {
					}
				}

				if (node.type === "ObjectProperty") {
					const key = node?.key
					const value = node?.value

					const _chunkID = key?.value
					const isChunkIDNum = Number.isInteger(_chunkID) === true
					const _chunkHash = value?.value

					// why would we parse numbers..
					if (typeof _chunkHash !== "string") {
						return;
					}

					if (isChunkIDNum !== true) {
						return;
					}

					if (_chunkHash !== undefined) {
						if (_chunkHash.endsWith(".js")) {
							chunkID = Number.parseInt(_chunkID)
							chunkHash = `${_chunkHash}`
							isChunk = true
						}
					}
				}

				if (parent.type === "ObjectExpression") {
					const key = node.key
					const value = node.value

					if (key === undefined) { return; }
					if (value === undefined) { return; }

					const _chunkID = key.value
					const isChunkIDNum = Number.isInteger(_chunkID) === true
					const _chunkHash: string = value.value

					if (typeof (_chunkHash) !== "string") {
						return;
					}

					const isHash = DiscordWebScraper.IGNORED_FILENAMES.includes(_chunkHash) !== true
						&& _chunkHash.startsWith("F") !== true
						&& _chunkHash.endsWith(".js") !== true
						&& JS_URL_REGEXES.regex_url_hash.test(_chunkHash)

					const isChunkFile = _chunkHash !== undefined
						&& isChunkIDNum === true
						&& isHash === true

					if (isChunkFile === true) {
						chunkID = Number.parseInt(_chunkID)
						chunkHash = _chunkHash
						isChunk = true
					}
				}

				if (isChunk === true && chunkID !== undefined && chunkHash !== undefined) {
					captured.push({
						id: chunkID,
						hash: chunkHash,
					})
				}
			},
		})

		return captured;
	}

	private captureModulesRegex(body: string): CapturedModule[] {
		const captured: RegExpMatchArray[] = [];
		// The latest links regex
		let matches = body.matchAll(JS_URL_REGEXES.rspack_27_03_2024_g1);
		JS_URL_REGEXES.rspack_27_03_2024_g1.lastIndex = 0;

		// biome-ignore lint/suspicious/noConfusingLabels: The code becomes horrifying if I don't do this...
		checkMatches: {
			if (matches) {
				const matches2 = body.matchAll(JS_URL_REGEXES.rspack_27_03_2024_g2);
				JS_URL_REGEXES.rspack_27_03_2024_g2.lastIndex = 0;

				if (!matches2) break checkMatches;

				const inner = matches2
					.next()
					.value?.[1].matchAll(JS_URL_REGEXES.rspack_27_03_2024_g2_inner);
				JS_URL_REGEXES.rspack_27_03_2024_g2_inner.lastIndex = 0;

				if (!inner) break checkMatches;

				captured.push(...(Array.from(matches) as RegExpMatchArray[]));
				captured.push(...(Array.from(inner) as RegExpMatchArray[]));
			}
		}

		// If it fails, try an older regex
		if (!matches) {
			matches = body.matchAll(JS_URL_REGEXES.rspack);
			JS_URL_REGEXES.rspack.lastIndex = 0;

			captured.push(...(Array.from(matches) as RegExpMatchArray[]));
		}

		return captured.map((captured) => {
			const { id, hash } = captured.groups ?? {}
			const module: CapturedModule = {
				id: parseInt(id),
				hash: hash,
			}

			return module
		});
	}

	private getFileLinksFromJs(body: string, captureMethod: CaptureMethod): File[] {
		if (!this.isChunkLoader(body)) {
			return []
		}

		const links: File[] = []
		let captured;

		if (captureMethod == CaptureMethod.AST) {
			captured = this.captureModulesAST(body);
		} else {
			captured = this.captureModulesRegex(body);
		}

		for (const asset of captured) {
			const { id, hash } = asset ?? {};

			let url = `${id ?? ""}${hash}`;
			if (!url.endsWith(".js")) url += ".js";

			if (DiscordWebScraper.IGNORED_FILENAMES.includes(url)) {
				continue;
			}

			if (links.some((link) => link.path === url)) {
				continue;
			}

			links.push({
				path: `/assets/${url}`,
				tags: ["filetype:javascript", "file:webpack-module"],
			});
		}

		return links;
	}

	private async bulkDownloadFiles(
		files: File[],
		opts: {
			branch: Discord.ReleaseChannel;
			recursive: boolean;
			ignoreFiles: string[];
			captureMethod?: CaptureMethod
		} = {
				branch: Discord.ReleaseChannel.canary,
				recursive: true,
				ignoreFiles: [],
				captureMethod: CaptureMethod.AST
			},
	): Promise<File[]> {
		let downloaded: File[] = [];
		const filesToDownload = files.filter(
			(file) => !opts.ignoreFiles.includes(file.path),
		);

		const downloads = await Promise.allSettled(
			filesToDownload.map(downloadFile),
		);

		// We want to avoid downloading/parsing the same file multiple times
		opts.ignoreFiles.push(...filesToDownload.map((file) => file.path));

		for (const result of downloads) {
			if (result.status === "fulfilled") {
				downloaded.push(result.value);
			}
		}

		if (!opts.recursive) return downloaded;

		Promise.allSettled(downloaded.map(async (result) => {
			const body = await result.blob?.text();
			if (!body) return;

			const links = this.getFileLinksFromJs(body, opts.captureMethod ?? CaptureMethod.AST);

			// Filter out files we've already downloaded
			const filteredLinks = links.filter(
				(link) => !opts.ignoreFiles.includes(link.path),
			);

			const nestedDownloads = await this.bulkDownloadFiles(
				filteredLinks,
				opts,
			).catch(console.error);

			if (!nestedDownloads) {
				return;
			}

			console.log(downloaded.length, nestedDownloads.length)
			downloaded = [...downloaded, ...nestedDownloads];
		}))

		return downloaded;
	}
}

export default DiscordWebScraper;
