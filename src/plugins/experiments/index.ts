import type { Build, File, Plugin } from "../../types";
import { ASTParser } from "./ast";

export class ExperimentsPlugin implements Plugin {
	async handleFile(build: Build, file: File) {
		if (!file.tags.includes("filetype:javascript")) return;

		const contents = await file.blob?.text();
		if (!contents) return;

		this.getExperimentsForFile(build, contents, file.path);
	}

	/**
	 * Get the build ID and Build Time from the file contents.
	 */
	private getExperimentsForFile(
		build: Build,
		contents: string,
		filePath: string,
	) {
		if (!contents.includes("kind:") && !contents.includes("id:")) {
			return;
		}

		if (!contents.includes("defaultConfig")) return;

		try {
			// console.time("parse");
			const experiments = new ASTParser(contents).parse();
			// console.timeEnd("parse");

			for (const experiment of experiments) {
				if (build.experiments.some((exp) => exp.id === experiment.id)) {
					// This is a non-issue, as experiments are often defined in multiple files.
					// I did a diff on a lot of the experiments and they are identical.
					// console.warn(`Experiment with ID ${experiment.id} already exists in build.`);

					continue;
				}
				build.experiments.push({ ...experiment, file: filePath });
			}
		} catch (e) {
			console.error(e);
			// Do nothing...
		}
	}
}

export default ExperimentsPlugin;
