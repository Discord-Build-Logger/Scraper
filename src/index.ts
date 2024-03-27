import DiscordWebScraper from "~/app/discord_web";
import Discord from "~/types/discord";

export function scrapeDiscordWeb(
	releaseChannel = Discord.ReleaseChannel.canary,
) {
	const scraper = new DiscordWebScraper();

	return scraper.scrapeLatestBuild(releaseChannel);
}
