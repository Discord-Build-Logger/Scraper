import fs from "node:fs";
import { downloadFile } from "~/app/downloader";
import {
	HTML_GLOBAL_ENV_REGEX,
	HTML_URL_REGEX,
	JS_URL_REGEX,
} from "~/constants";
import { handleBuild, handleFile } from "~/plugins";
import type { Build, File } from "~/types";
import Discord from "../../types/discord";

export class DiscordWebScraper {
	async scrapeLatestBuild(branch: Discord.ReleaseChannel) {
		console.time(`Time taken to fetch latest build root for ${branch}`);
		const url = new URL("/app", `https://${Discord.Domains[branch]}`);

		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`Failed to fetch Discord build from ${url}`);
		}

		const buildHash = response.headers.get("x-build-id");
		const lastModified = response.headers.get("last-modified");

		if (!buildHash || !lastModified) {
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

		console.time(`Time taken to download all build files for ${buildHash}`);
		const files = await this.bulkDownloadFiles(this.getFileLinksFromHtml(html));
		console.timeEnd(`Time taken to download all build files for ${buildHash}`);

		for (const file of files) {
			await handleFile(build, file);

			// Clear the blob from memory
			file.blob = undefined;
		}

		build.files = files;

		await handleBuild(build);

		fs.writeFileSync("./out.json", JSON.stringify(build, null, 2));

		console.timeEnd(`Time taken to fetch latest build root for ${branch}`);
		console.log(build.files.length);
	}

	private getFileLinksFromHtml(body: string): File[] {
		const matches = body.matchAll(HTML_URL_REGEX);

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

	static IGNORED_FILENAMES = ["NW.js", "Node.js", "bn.js", "hash.js"];
	private getFileLinksFromJs(body: string): File[] {
		const matches = body.matchAll(JS_URL_REGEX);

		const links: File[] = [];

		for (const asset of Array.from(matches)) {
			const url = asset[1];
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
