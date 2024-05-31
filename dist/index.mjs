import assert from 'node:assert';
import * as walker from 'estree-walker';
import * as oxc from 'oxc-parser';

async function downloadFile(file) {
  const url = new URL(file.path, "https://discord.com").href;
  const response = await fetch(url);
  if (!response.ok) {
    await response.text().catch(() => {
    });
    throw new Error(`Failed to download file from ${url}`);
  }
  file.blob = await response.blob();
  return file;
}

const HTML_URL_REGEX = /(?:src|href)=(?:"|')(.+?)(?:"|')/g;
const HTML_GLOBAL_ENV_REGEX = />window\.GLOBAL_ENV\s?=\s?(\{.+?\});</gs;
const JS_URL_REGEX__RSPACK = /"(?<hash>(?:[\de]+?\.)?\w+?\.js)"/g;
const JS_URL_REGEX__27_03_2024_RSPACK_group1 = /"(?<id>[\de]+)"===\w\?(?:""\+\w\+)?"(:?[\de]+)?(?<hash>\.\w+?\.js)":?/g;
const JS_URL_REGEX__27_03_2024_RSPACK_group2 = /\.js":""\+\(({(?:[\de]+:"\w+",?)+})\)/g;
const JS_URL_REGEX__27_03_2024_RSPACK_group2_inner = /[\de]+:"(?<hash>\w+)",?/g;
const JS_URL_REGEXES = {
  rspack: JS_URL_REGEX__RSPACK,
  rspack_27_03_2024_g1: JS_URL_REGEX__27_03_2024_RSPACK_group1,
  rspack_27_03_2024_g2: JS_URL_REGEX__27_03_2024_RSPACK_group2,
  rspack_27_03_2024_g2_inner: JS_URL_REGEX__27_03_2024_RSPACK_group2_inner
};

var Discord;
((Discord2) => {
  ((Project2) => {
    Project2["discord_marketing"] = "discord_marketing";
    Project2["discord_web"] = "discord_web";
    Project2["discord_ios"] = "discord_ios";
    Project2["discord_android"] = "discord_android";
    Project2["discord_developers"] = "discord_developers";
  })(Discord2.Project || (Discord2.Project = {}));
  ((ReleaseChannel2) => {
    ReleaseChannel2["stable"] = "stable";
    ReleaseChannel2["ptb"] = "ptb";
    ReleaseChannel2["canary"] = "canary";
    ReleaseChannel2["staging"] = "staging";
  })(Discord2.ReleaseChannel || (Discord2.ReleaseChannel = {}));
  ((Environment2) => {
    Environment2["production"] = "production";
    Environment2["development"] = "development";
  })(Discord2.Environment || (Discord2.Environment = {}));
  ((Domains2) => {
    Domains2["stable"] = "discord.com";
    Domains2["ptb"] = "ptb.discord.com";
    Domains2["canary"] = "canary.discord.com";
    Domains2["staging"] = "staging.discord.com";
  })(Discord2.Domains || (Discord2.Domains = {}));
})(Discord || (Discord = {}));
var Experiment;
((Experiment2) => {
  ((Type2) => {
    Type2["none"] = "none";
    Type2["user"] = "user";
    Type2["guild"] = "guild";
  })(Experiment2.Type || (Experiment2.Type = {}));
  ((Source2) => {
    Source2["desktop"] = "desktop";
    Source2["android"] = "android";
    Source2["ios"] = "ios";
  })(Experiment2.Source || (Experiment2.Source = {}));
})(Experiment || (Experiment = {}));
var Discord$1 = Discord;

class ASTParser {
  expFields = ["kind", "id", "label"];
  ignoreFields = ["defaultConfig", "config"];
  script;
  constructor(script) {
    this.script = script;
  }
  parse() {
    const list = [];
    const ast = oxc.parseSync(this.script);
    const state = this;
    walker.walk(JSON.parse(ast.program), {
      enter(node, _parent, _prop, _index) {
        if (node.type !== "ObjectExpression")
          return;
        if (state.isExperiment(node)) {
          try {
            const exp = state.astToJSValue(node);
            state.validateASTExperiment(exp);
            list.push(exp);
          } catch (ex) {
            console.error(
              "[ScriptASTParser] Failed to parse",
              state.script.substring(node.start, node.end),
              ex.message
            );
          }
        }
      }
    });
    list.forEach((exp) => this.deflateMemory(exp));
    return list;
  }
  // node.js keeps the entire original string in memory as long as any slice of it is still around (and the slice is a "sliced string")
  // which causes quite a memory leak, so we forcefully de-reference those here
  deflateMemory(exp) {
    exp.id = Buffer.from(exp.id).toString();
    exp.label = Buffer.from(exp.label).toString();
    exp.treatments.forEach((x) => {
      x.label = Buffer.from(x.label).toString();
    });
  }
  validateASTExperiment(exp) {
    assert(
      exp.kind === Experiment.Type.guild || exp.kind === Experiment.Type.user || exp.kind === Experiment.Type.none,
      "Invalid experiment type"
    );
    assert(typeof exp.id === "string", "Invalid experiment id");
    assert(typeof exp.label === "string", "Invalid experiment title");
    assert(
      typeof exp.treatments === "object",
      "Invalid experiment treatments object"
    );
    assert(
      exp.treatments.every(
        (treatment) => typeof treatment.id === "number" && typeof treatment.label === "string"
      ),
      "Invalid experiment treatments data"
    );
  }
  hasProperty(node, name) {
    if (node.type !== "ObjectExpression")
      throw new Error("Not an object");
    return node.properties.some((prop) => {
      if (!prop.key)
        return false;
      if (prop.key.type === "Identifier") {
        return prop.key.name === name;
      }
      if (prop.key.type === "Literal") {
        return prop.key.value === name;
      }
      return false;
    });
  }
  isEnumExpression(node) {
    if (node.type !== "MemberExpression")
      return false;
    if (node.object.type === "MemberExpression" && !node.computed) {
      return this.isEnumExpression(node.object);
    }
    if (node.object.type === "Identifier" && !node.computed) {
      return node.property.type === "Identifier";
    }
    return false;
  }
  isExperiment(node) {
    return this.expFields.every((prop) => this.hasProperty(node, prop));
  }
  astToJSValue(node) {
    if (node.type === "Literal" || node.type === "StringLiteral" || node.type === "NumericLiteral") {
      return node.value;
    }
    if (node.type === "ObjectExpression") {
      const obj = {};
      for (const prop of node.properties) {
        if (!prop.key)
          continue;
        let name;
        if (prop.key.type === "Identifier")
          name = prop.key.name;
        else if (prop.key.type === "Literal" || prop.key.type === "StringLiteral" || prop.key.type === "NumericLiteral") {
          name = prop.key.value;
        } else {
          continue;
        }
        if (this.ignoreFields.includes(name))
          continue;
        obj[name] = this.astToJSValue(prop.value);
      }
      return obj;
    }
    if (node.type === "ArrayExpression") {
      return node.elements.map((elem) => this.astToJSValue(elem));
    }
    if (node.type === "Identifier") ;
    if (node.type === "UnaryExpression" && node.operator === "!") {
      return !this.astToJSValue(node.argument);
    }
    if (this.isEnumExpression(node)) ;
    throw new Error(`Unsupported node type ${node.type}`);
  }
}

class ExperimentsPlugin {
  async handleFile(build, file) {
    if (!file.tags.includes("filetype:javascript"))
      return;
    const contents = await file.blob?.text();
    if (!contents)
      return;
    this.getExperimentsForFile(build, contents, file.path);
  }
  /**
   * Get the build ID and Build Time from the file contents.
   */
  getExperimentsForFile(build, contents, filePath) {
    if (!contents.includes("kind:") && !contents.includes("id:")) {
      return;
    }
    if (!contents.includes("defaultConfig"))
      return;
    try {
      const experiments = new ASTParser(contents).parse();
      for (const experiment of experiments) {
        if (build.experiments.some((exp) => exp.id === experiment.id)) {
          continue;
        }
        build.experiments.push({ ...experiment, file: filePath });
      }
    } catch (e) {
      console.error(e);
    }
  }
}

class MetadataPlugin {
  static BUILT_AT_REGEX = /built_at:"(\d+?)"/;
  static BUILD_NUMBER_REGEX = /build_number:"(\d+?)"/;
  async handleFile(build, file) {
    const contents = await file.blob?.text();
    if (!contents)
      return;
    this.getTags(file, contents);
    this.getBuildInfo(build, contents);
  }
  async handleBuild(build) {
    build.GLOBAL_ENV.HTML_TIMESTAMP = build.build_date.getTime();
  }
  /**
   * Get the build ID and Build Time from the file contents.
   */
  getBuildInfo(build, contents) {
    const build_number = MetadataPlugin.BUILD_NUMBER_REGEX.exec(contents);
    if (build_number) {
      build.build_number = Number.parseInt(build_number[1]);
    }
    const built_at = MetadataPlugin.BUILT_AT_REGEX.exec(contents);
    if (built_at) {
      build.build_date = new Date(Number.parseInt(built_at[1]));
    }
  }
  /**
   * Get tags for the file.
   */
  getTags(file, contents) {
    if (contents.includes(`DISCORD_DESC_SHORT:"Imagine a place"`)) {
      file.tags.push("metadata:i18n");
      file.tags.push("metadata:i18n:english");
    }
  }
}

const plugins = [new MetadataPlugin(), new ExperimentsPlugin()];
async function handleFile(build, file) {
  for (const plugin of plugins) {
    await plugin.handleFile?.(build, file);
  }
}
async function handleBuild(build) {
  for (const plugin of plugins) {
    await plugin.handleBuild?.(build);
  }
}

class DiscordWebScraper {
  constructor(build, html) {
    this.build = build;
    this.html = html;
  }
  static async scrapeLatestBuild(branch) {
    console.time(`Time taken to fetch latest build root for ${branch}`);
    const url = new URL("/app", `https://${Discord$1.Domains[branch]}`);
    const response = await fetch(url);
    if (!response.ok) {
      await response.text().catch(() => {
      });
      throw new Error(`Failed to fetch Discord build from ${url}`);
    }
    const buildHash = response.headers.get("x-build-id");
    const lastModified = response.headers.get("last-modified");
    if (!buildHash || !lastModified) {
      await response.text().catch(() => {
      });
      throw new Error(`Failed to fetch Discord build metadata from ${url}`);
    }
    const html = await response.text();
    let global_env = {};
    try {
      global_env = new Function(
        `return${HTML_GLOBAL_ENV_REGEX.exec(html)?.[1]}`
      )();
    } catch (e) {
      console.error("Failed to parse global env:", e);
    }
    HTML_GLOBAL_ENV_REGEX.lastIndex = 0;
    const build = {
      build_hash: buildHash,
      build_number: 0,
      build_date: new Date(lastModified),
      release_channels: {
        [branch]: new Date(lastModified)
      },
      environment: Discord$1.Environment.production,
      GLOBAL_ENV: global_env,
      experiments: [],
      files: [],
      plugins: {}
    };
    console.timeEnd(`Time taken to fetch latest build root for ${branch}`);
    return new DiscordWebScraper(build, html);
  }
  async beginScrapingFiles() {
    console.time(
      `Time taken to download all build files for ${this.build.build_hash}`
    );
    const files = await this.bulkDownloadFiles(
      this.getFileLinksFromHtml(this.html)
    );
    console.timeEnd(
      `Time taken to download all build files for ${this.build.build_hash}`
    );
    for (const file of files) {
      await handleFile(this.build, file);
      file.blob = void 0;
    }
    this.build.files = files;
    await handleBuild(this.build);
    return this.build;
  }
  getFileLinksFromHtml(body) {
    const matches = body.matchAll(HTML_URL_REGEX);
    HTML_URL_REGEX.lastIndex = 0;
    const links = [];
    for (const asset of Array.from(matches)) {
      const url = asset[1];
      if (!url.startsWith("/assets/"))
        continue;
      if (links.some((link) => link.path === url))
        continue;
      const tag = (() => {
        if (url.endsWith(".js"))
          return "filetype:javascript";
        if (url.endsWith(".css"))
          return "filetype:css";
        if (url.endsWith(".ico"))
          return "filetype:favicon";
        if (url.endsWith(".map"))
          return "filetype:sourcemap";
        return "filetype:other";
      })();
      links.push({ path: url, tags: [tag, "file:root-file"] });
    }
    return links;
  }
  static IGNORED_FILENAMES = ["NW.js", "Node.js", "bn.js", "hash.js"];
  getFileLinksFromJs(body) {
    const captured = [];
    let matches = body.matchAll(JS_URL_REGEXES.rspack_27_03_2024_g1);
    JS_URL_REGEXES.rspack_27_03_2024_g1.lastIndex = 0;
    checkMatches: {
      if (matches) {
        const matches2 = body.matchAll(JS_URL_REGEXES.rspack_27_03_2024_g2);
        JS_URL_REGEXES.rspack_27_03_2024_g2.lastIndex = 0;
        if (!matches2)
          break checkMatches;
        const inner = matches2.next().value?.[1].matchAll(JS_URL_REGEXES.rspack_27_03_2024_g2_inner);
        JS_URL_REGEXES.rspack_27_03_2024_g2_inner.lastIndex = 0;
        if (!inner)
          break checkMatches;
        captured.push(...Array.from(matches));
        captured.push(...Array.from(inner));
      }
    }
    if (!matches) {
      matches = body.matchAll(JS_URL_REGEXES.rspack);
      JS_URL_REGEXES.rspack.lastIndex = 0;
      captured.push(...Array.from(matches));
    }
    const links = [];
    for (const asset of captured) {
      const { id, hash } = asset.groups ?? {};
      let url = `${id ?? ""}${hash}`;
      if (!url.endsWith(".js"))
        url += ".js";
      if (DiscordWebScraper.IGNORED_FILENAMES.includes(url)) {
        continue;
      }
      if (links.some((link) => link.path === url)) {
        continue;
      }
      links.push({
        path: `/assets/${url}`,
        tags: ["filetype:javascript", "file:webpack-module"]
      });
    }
    return links;
  }
  async bulkDownloadFiles(files, opts = {
    branch: Discord$1.ReleaseChannel.canary,
    recursive: true,
    ignoreFiles: []
  }) {
    let downloaded = [];
    const filesToDownload = files.filter(
      (file) => !opts.ignoreFiles.includes(file.path)
    );
    const downloads = await Promise.allSettled(
      filesToDownload.map(downloadFile)
    );
    opts.ignoreFiles.push(...filesToDownload.map((file) => file.path));
    for (const result of downloads) {
      if (result.status === "fulfilled") {
        downloaded.push(result.value);
      }
    }
    if (!opts.recursive)
      return downloaded;
    for (const result of downloaded) {
      const body = await result.blob?.text();
      if (!body)
        continue;
      const links = this.getFileLinksFromJs(body);
      const filteredLinks = links.filter(
        (link) => !opts.ignoreFiles.includes(link.path)
      );
      const nestedDownloads = await this.bulkDownloadFiles(
        filteredLinks,
        opts
      ).catch(console.error);
      if (!nestedDownloads) {
        continue;
      }
      downloaded = [...downloaded, ...nestedDownloads];
    }
    return downloaded;
  }
}

function scrapeDiscordWeb(releaseChannel = Discord$1.ReleaseChannel.canary) {
  return DiscordWebScraper.scrapeLatestBuild(releaseChannel);
}

export { scrapeDiscordWeb };
