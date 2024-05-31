import type { ASTExperiment } from "../plugins/experiments/ast";
import type Discord from "./discord";

export interface Plugin {
	/** Runs on every file for a build. */
	handleFile?(build: Build, file: File): Promise<void>;
	/** Runs at the end of the scraper process */
	handleBuild?(build: Build): Promise<void>;
}

export interface File {
	path: string;
	blob?: Blob;
	tags: string[];
	[key: string]: any;
}

export interface BuildExperiment extends ASTExperiment {
	file: string;
}

export interface Build {
	build_hash: string;
	build_number: number;
	build_date: Date;
	release_channels: Partial<Record<Discord.ReleaseChannel, Date>>;
	environment: Discord.Environment;
	GLOBAL_ENV: Record<string, any>;
	experiments: BuildExperiment[];
	files: File[];
	/** Plugins can dump additional information inside here. */
	plugins: Record<string, any>;
}
