import type { Build, File, Plugin } from "~/types";

export class MetadataPlugin implements Plugin {
	private static BUILT_AT_REGEX = /built_at:"(\d+?)"/;
	private static BUILD_NUMBER_REGEX = /build_number:"(\d+?)"/;

	async handleFile(build: Build, file: File) {
		const contents = await file.blob?.text();
		if (!contents) return;

		this.getTags(file, contents);

		this.getBuildInfo(build, contents);
	}

	async handleBuild(build: Build) {
		// Update the HTML_TIMESTAMP to use the build_at value.
		build.GLOBAL_ENV.HTML_TIMESTAMP = build.build_date.getTime();
	}

	/**
	 * Get the build ID and Build Time from the file contents.
	 */
	private getBuildInfo(build: Build, contents: string) {
		const build_number = MetadataPlugin.BUILD_NUMBER_REGEX.exec(contents);
		if (build_number) {
			build.build_number = Number.parseInt(build_number[1]);
		}

		const built_at = MetadataPlugin.BUILT_AT_REGEX.exec(contents);
		if (built_at) {
			build.build_date = new Date(Number.parseInt(built_at[1]));
		}
	}

	/**
	 * Get tags for the file.
	 */
	private getTags(file: File, contents: string) {
		if (contents.includes(`DISCORD_DESC_SHORT:"Imagine a place"`)) {
			file.tags.push("metadata:i18n");
			file.tags.push("metadata:i18n:english");
		}
	}
}

export default MetadataPlugin;
