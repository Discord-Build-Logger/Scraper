export namespace Discord {
	export enum Project {
		discord_marketing = "discord_marketing",
		discord_web = "discord_web",
		discord_ios = "discord_ios",
		discord_android = "discord_android",
		discord_developers = "discord_developers",
	}

	export enum ReleaseChannel {
		stable = "stable",
		ptb = "ptb",
		canary = "canary",
		staging = "staging",
	}

	export enum Environment {
		production = "production",
		development = "development",
	}

	export enum Domains {
		stable = "discord.com",
		ptb = "ptb.discord.com",
		canary = "canary.discord.com",
		staging = "staging.discord.com",
	}
}

export namespace Experiment {
	export enum Type {
		none = "none",
		user = "user",
		guild = "guild",
	}

	export enum Source {
		desktop = "desktop",
		android = "android",
		ios = "ios",
	}
}

export default Discord;
