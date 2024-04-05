export const HTML_URL_REGEX = /(?:src|href)=(?:"|')(.+?)(?:"|')/g;
export const HTML_GLOBAL_ENV_REGEX = />window\.GLOBAL_ENV\s?=\s?(\{.+?\});</gs;

// :fear:
const JS_URL_REGEX__HASH = /^(?=.*?\d)(?=.*?[a-zA-Z])[a-zA-Z\d]+$/;
export const JS_URL_REGEXES = {
	regex_url_hash: JS_URL_REGEX__HASH,
};
