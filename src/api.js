import axios from 'axios';
import { getConfig, setConfig, hasValidToken } from './config.js';

const XERO_BASE_URL = 'https://api.xero.com/api.xro/2.0';
const XERO_AUTH_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken() {
  const clientId = getConfig('clientId');
  const clientSecret = getConfig('clientSecret');
  const refreshToken = getConfig('refreshToken');

  if (!refreshToken) {
    throw new Error('No refresh token available. Please run: xero auth login');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await axios.post(XERO_AUTH_URL, new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }), {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    setConfig('accessToken', access_token);
    if (refresh_token) setConfig('refreshToken', refresh_token);
    setConfig('tokenExpiry', Date.now() + (expires_in * 1000));

    return access_token;
  } catch (error) {
    const msg = error.response?.data?.error_description || error.message;
    throw new Error(`Token refresh failed: ${msg}`);
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
async function getAccessToken() {
  if (hasValidToken()) {
    return getConfig('accessToken');
  }

  // Try to refresh
  return await refreshAccessToken();
}

/**
 * Exchange authorization code for tokens (OAuth 2.0 Authorization Code flow)
 */
export async function exchangeCodeForTokens(code, redirectUri) {
  const clientId = getConfig('clientId');
  const clientSecret = getConfig('clientSecret');

  if (!clientId || !clientSecret) {
    throw new Error('Client ID and secret not configured. Run: xero config set --client-id <id> --client-secret <secret>');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await axios.post(XERO_AUTH_URL, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    }), {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    setConfig('accessToken', access_token);
    setConfig('refreshToken', refresh_token);
    setConfig('tokenExpiry', Date.now() + (expires_in * 1000));

    return response.data;
  } catch (error) {
    const msg = error.response?.data?.error_description || error.message;
    throw new Error(`Token exchange failed: ${msg}`);
  }
}

/**
 * Get tenant connections
 */
export async function getConnections() {
  const token = await getAccessToken();

  try {
    const response = await axios.get(XERO_CONNECTIONS_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Make an authenticated API request
 */
async function apiRequest(method, endpoint, data = null, params = null) {
  const token = await getAccessToken();
  const tenantId = getConfig('tenantId');

  if (!tenantId) {
    throw new Error('No tenant ID configured. Please run: xero auth login');
  }

  const config = {
    method,
    url: `${XERO_BASE_URL}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Xero-tenant-id': tenantId,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };

  if (params) config.params = params;
  if (data) config.data = data;

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

function handleApiError(error) {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    if (status === 401) {
      throw new Error('Authentication failed. Your token may have expired. Run: xero auth login');
    } else if (status === 403) {
      throw new Error('Access forbidden. Check your API permissions.');
    } else if (status === 404) {
      throw new Error('Resource not found.');
    } else if (status === 429) {
      throw new Error('Rate limit exceeded. Please wait before retrying.');
    } else {
      const message = data?.Detail || data?.Message || data?.message || JSON.stringify(data);
      throw new Error(`API Error (${status}): ${message}`);
    }
  } else if (error.request) {
    throw new Error('No response from Xero API. Check your internet connection.');
  } else {
    throw error;
  }
}

// ============================================================
// INVOICES
// ============================================================

export async function listInvoices({ status, limit = 50 } = {}) {
  const params = { page: 1 };
  if (status) params.Statuses = status;
  if (limit) params.pageSize = Math.min(limit, 100);

  const data = await apiRequest('GET', '/Invoices', null, params);
  return data.Invoices || [];
}

export async function getInvoice(invoiceId) {
  const data = await apiRequest('GET', `/Invoices/${invoiceId}`);
  return (data.Invoices || [])[0] || null;
}

export async function createInvoice({ contactId, lineItems, type = 'ACCREC', status = 'DRAFT', dueDate }) {
  const body = {
    Type: type,
    Status: status,
    Contact: { ContactID: contactId },
    LineItems: lineItems,
    ...(dueDate && { DueDate: dueDate })
  };

  const data = await apiRequest('POST', '/Invoices', { Invoices: [body] });
  return (data.Invoices || [])[0] || null;
}

// ============================================================
// CONTACTS
// ============================================================

export async function listContacts({ search } = {}) {
  const params = {};
  if (search) params.SearchTerm = search;

  const data = await apiRequest('GET', '/Contacts', null, params);
  return data.Contacts || [];
}

export async function getContact(contactId) {
  const data = await apiRequest('GET', `/Contacts/${contactId}`);
  return (data.Contacts || [])[0] || null;
}

export async function createContact({ name, email, phone }) {
  const body = {
    Name: name,
    ...(email && { EmailAddress: email }),
    ...(phone && {
      Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: phone }]
    })
  };

  const data = await apiRequest('POST', '/Contacts', { Contacts: [body] });
  return (data.Contacts || [])[0] || null;
}

// ============================================================
// ACCOUNTS
// ============================================================

export async function listAccounts() {
  const data = await apiRequest('GET', '/Accounts');
  return data.Accounts || [];
}

// ============================================================
// PAYMENTS
// ============================================================

export async function listPayments() {
  const data = await apiRequest('GET', '/Payments');
  return data.Payments || [];
}

// ============================================================
// BANK TRANSACTIONS
// ============================================================

export async function listBankTransactions({ accountId } = {}) {
  const params = {};
  if (accountId) params.BankAccountID = accountId;

  const data = await apiRequest('GET', '/BankTransactions', null, params);
  return data.BankTransactions || [];
}
