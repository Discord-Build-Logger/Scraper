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
	private getFileLinksFromJs(body: string): File[] {
		const links: File[] = [];
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
						chunkHash = `${chunkID}${chunkHash}`
						isChunk = true
					} else {
						console.log(_chunkID, _chunkHash)
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
					console.log(`ChunkID: ${chunkID}, Hash: ${chunkHash}`)
					captured.push({
						id: chunkID,
						hash: chunkHash
					})
				}
			},
		})

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
		} = {
				branch: Discord.ReleaseChannel.canary,
				recursive: true,
				ignoreFiles: [],
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

		for (const result of downloaded) {
			const body = await result.blob?.text();
			if (!body) continue;

			const links = this.getFileLinksFromJs(body);

			// Filter out files we've already downloaded
			const filteredLinks = links.filter(
				(link) => !opts.ignoreFiles.includes(link.path),
			);

			const nestedDownloads = await this.bulkDownloadFiles(
				filteredLinks,
				opts,
			).catch(console.error);

			if (!nestedDownloads) {
				continue;
			}

			downloaded = [...downloaded, ...nestedDownloads];
		}

		return downloaded;
	}
}

export default DiscordWebScraper;
