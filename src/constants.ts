export const HTML_URL_REGEX = /(?:src|href)=(?:"|')(.+?)(?:"|')/g;
export const HTML_GLOBAL_ENV_REGEX = />window\.GLOBAL_ENV\s?=\s?(\{.+?\});</gs;

const JS_URL_REGEX__RSPACK = /"(?<hash>(?:[\de]+?\.)?\w+?\.js)"/g;

// TODO: This is ridiculous, should I give up and use AST?
// AST is probably worse for performance, but this regex is a crime against humanity.
const JS_URL_REGEX__27_03_2024_RSPACK_group1 =
	/"(?<id>[\de]+)"===\w\?(?:""\+\w\+)?"(:?[\de]+)?(?<hash>\.\w+?\.js)":?/g;

const JS_URL_REGEX__27_03_2024_RSPACK_group2 =
	/\.js":""\+\(({(?:[\de]+:"\w+",?)+})\)/g;

const JS_URL_REGEX__27_03_2024_RSPACK_group2_inner = /[\de]+:"(?<hash>\w+)",?/g;

export const JS_URL_REGEXES = {
	rspack: JS_URL_REGEX__RSPACK,
	rspack_27_03_2024_g1: JS_URL_REGEX__27_03_2024_RSPACK_group1,
	rspack_27_03_2024_g2: JS_URL_REGEX__27_03_2024_RSPACK_group2,
	rspack_27_03_2024_g2_inner: JS_URL_REGEX__27_03_2024_RSPACK_group2_inner,
};
