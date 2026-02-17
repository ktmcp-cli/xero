import Conf from 'conf';

const config = new Conf({
  projectName: 'xero-cli',
  schema: {
    clientId: {
      type: 'string',
      default: ''
    },
    clientSecret: {
      type: 'string',
      default: ''
    },
    accessToken: {
      type: 'string',
      default: ''
    },
    refreshToken: {
      type: 'string',
      default: ''
    },
    tokenExpiry: {
      type: 'number',
      default: 0
    },
    tenantId: {
      type: 'string',
      default: ''
    }
  }
});

export function getConfig(key) {
  return config.get(key);
}

export function setConfig(key, value) {
  config.set(key, value);
}

export function getAllConfig() {
  return config.store;
}

export function clearConfig() {
  config.clear();
}

export function isConfigured() {
  const clientId = config.get('clientId');
  const clientSecret = config.get('clientSecret');
  return !!(clientId && clientSecret);
}

export function hasValidToken() {
  const accessToken = config.get('accessToken');
  const tokenExpiry = config.get('tokenExpiry');
  if (!accessToken) return false;
  // Consider token valid if it expires more than 60 seconds from now
  return tokenExpiry > Date.now() + 60000;
}

export default config;
