const LOG_LEVELS = {
  debug: 1,
  log: 2,
  info: 3,
  warn: 4,
  error: 5,
};


let currentLogLevel = "warn"; // default fallback

const urlParams = new URLSearchParams(window.location.search);
const levelFromURL = urlParams.get("loglevel");

if (levelFromURL) {
  currentLogLevel = levelFromURL;
}

const noop = () => {};

const Logger = {
  debug: noop,
  log: noop,
  info: noop,
  warn: noop,
  error: noop,
};

setLogLevel(currentLogLevel)


export function setLogLevel(level) {
  const levelValue = LOG_LEVELS[level];

  if (levelValue === undefined) {
    console.warn(`[Logger]: Unknown log level "${level}"`);
    return;
  }

  currentLogLevel = levelValue;
  console.info(`[Logger]: Log level set to "${level}"`);

  Logger.debug = levelValue <= LOG_LEVELS.debug ? (...args) => console.debug('[DEBUG]:', ...args) : noop;
  Logger.log   = levelValue <= LOG_LEVELS.log   ? (...args) => console.log('[LOG]:', ...args)     : noop;
  Logger.info  = levelValue <= LOG_LEVELS.info  ? (...args) => console.info('[INFO]:', ...args)   : noop;
  Logger.warn  = levelValue <= LOG_LEVELS.warn  ? (...args) => console.warn('[WARN]:', ...args)   : noop;
  Logger.error = levelValue <= LOG_LEVELS.error ? (...args) => console.error('[ERROR]:', ...args) : noop;
}

export default Logger;