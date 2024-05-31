import Discord from "../types/discord";

import DiscordWebScraper from "./discord_web";

export function scrape(
	project: Discord.Project,
	releaseChannel = Discord.ReleaseChannel.canary,
) {
	switch (project) {
		case Discord.Project.discord_web: {
			return DiscordWebScraper.scrapeLatestBuild(releaseChannel);
		}
		default: {
			throw new Error(`Project ${project} is not supported yet.`);
		}
	}
}
