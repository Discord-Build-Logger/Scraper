import type { Build, File, Plugin } from "~/types";
import ExperimentsPlugin from "./experiments";
import Metadata from "./metadata";

const plugins: Plugin[] = [new Metadata(), new ExperimentsPlugin()];

/**
 * Loop through all plugins and mutate the file.
 */
export async function handleFile(build: Build, file: File) {
	for (const plugin of plugins) {
		await plugin.handleFile?.(build, file);
	}
}

export async function handleBuild(build: Build) {
	for (const plugin of plugins) {
		await plugin.handleBuild?.(build);
	}
}
