import type { Build, File, Plugin } from "~/types";
import Metadata from "../app/metadata";
import ExperimentsPlugin from "./experiments";

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
