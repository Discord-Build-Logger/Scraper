declare namespace Discord {
    enum Project {
        discord_marketing = "discord_marketing",
        discord_web = "discord_web",
        discord_ios = "discord_ios",
        discord_android = "discord_android",
        discord_developers = "discord_developers"
    }
    enum ReleaseChannel {
        stable = "stable",
        ptb = "ptb",
        canary = "canary",
        staging = "staging"
    }
    enum Environment {
        production = "production",
        development = "development"
    }
    enum Domains {
        stable = "discord.com",
        ptb = "ptb.discord.com",
        canary = "canary.discord.com",
        staging = "staging.discord.com"
    }
}
declare namespace Experiment {
    enum Type {
        none = "none",
        user = "user",
        guild = "guild"
    }
    enum Source {
        desktop = "desktop",
        android = "android",
        ios = "ios"
    }
}

interface ASTExperiment {
    kind: Experiment.Type;
    id: string;
    label: string;
    treatments: {
        id: number;
        label: string;
    }[];
}

interface File {
    path: string;
    blob?: Blob;
    tags: string[];
    [key: string]: any;
}
interface BuildExperiment extends ASTExperiment {
    file: string;
}
interface Build {
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

declare class DiscordWebScraper {
    build: Build;
    html: string;
    constructor(build: Build, html: string);
    static scrapeLatestBuild(branch: Discord.ReleaseChannel): Promise<DiscordWebScraper>;
    beginScrapingFiles(): Promise<Build>;
    private getFileLinksFromHtml;
    static IGNORED_FILENAMES: string[];
    private getFileLinksFromJs;
    private bulkDownloadFiles;
}

declare function scrapeDiscordWeb(releaseChannel?: Discord.ReleaseChannel): Promise<DiscordWebScraper>;

export { scrapeDiscordWeb };
