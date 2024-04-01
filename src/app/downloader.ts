import type { File } from "~/types";

export async function downloadFile(file: File): Promise<File> {
	const url = new URL(file.path, "https://discord.com").href;
	const response = await fetch(url);

	if (!response.ok) {
		// consume the body to prevent memory leaks
		await response.text().catch(() => {});

		throw new Error(`Failed to download file from ${url}`);
	}

	file.blob = await response.blob();

	return file;
}
