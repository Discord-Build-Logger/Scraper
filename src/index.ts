import DiscordWebScraper from "./app/discord_web";
import Discord from "./types/discord";

export function scrapeDiscordWeb(
	releaseChannel = Discord.ReleaseChannel.canary,
): Promise<DiscordWebScraper> {
	return DiscordWebScraper.scrapeLatestBuild(releaseChannel);
}
