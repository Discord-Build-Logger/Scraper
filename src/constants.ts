export const HTML_URL_REGEX = /(?:src|href)=(?:"|')(.+?)(?:"|')/g;
export const HTML_GLOBAL_ENV_REGEX = />window\.GLOBAL_ENV\s?=\s?(\{.+?\});</gs;
export const JS_URL_REGEX = /"((?:\d+?\.)?\w+?\.js)"/g;
