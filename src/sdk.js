// ServiceNow REST API client

import { errAuth, errAPI, errNetwork } from './errors.js';

const DEFAULT_TIMEOUT = 30000;

export class SDKClient {
  constructor(baseURL, authProvider, opts = {}) {
    this.baseURL = baseURL.replace(/\/$/, '');
    this.authProvider = authProvider;
    this.timeout = opts.timeout || DEFAULT_TIMEOUT;
  }

  async _setAuth(req) {
    if (!this.authProvider) {
      throw errAuth('No authentication configured');
    }
    const creds = await this.authProvider.getCredentials();
    if (!creds) {
      throw errAuth('No valid credentials');
    }
    switch (creds.auth_method) {
      case 'basic':
        req.headers.set('Authorization', 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64'));
        break;
      case 'token':
      case 'oauth':
        req.headers.set('Authorization', `Bearer ${creds.access_token}`);
        break;
      default:
        if (creds.username && creds.password) {
          req.headers.set('Authorization', 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64'));
        } else if (creds.access_token) {
          req.headers.set('Authorization', `Bearer ${creds.access_token}`);
        } else {
          throw errAuth('No valid credentials');
        }
    }
  }

  async request(endpoint, opts = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const req = new Request(endpoint, {
        ...opts,
        signal: controller.signal,
      });
      req.headers.set('Accept', 'application/json');
      if (opts.body && typeof opts.body === 'string') {
        req.headers.set('Content-Type', 'application/json');
      }
      await this._setAuth(req);

      const resp = await fetch(req);
      const body = await resp.text();

      if (!resp.ok) {
        throw errAPI(resp.status, body || resp.statusText);
      }

      if (resp.status === 204 || body === '') {
        return null;
      }

      return JSON.parse(body);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw errNetwork(new Error('Request timed out'));
      }
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
        throw errNetwork(err);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async list(table, params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = `${this.baseURL}/api/now/table/${table}${query ? '?' + query : ''}`;
    const result = await this.request(endpoint, { method: 'GET' });
    return result?.result || [];
  }

  async get(table, sysID) {
    const endpoint = `${this.baseURL}/api/now/table/${table}/${sysID}`;
    const result = await this.request(endpoint, { method: 'GET' });
    return result?.result || null;
  }

  async create(table, data) {
    const endpoint = `${this.baseURL}/api/now/table/${table}`;
    const result = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result?.result || null;
  }

  async update(table, sysID, data) {
    const endpoint = `${this.baseURL}/api/now/table/${table}/${sysID}`;
    const result = await this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return result?.result || null;
  }

  async delete(table, sysID) {
    const endpoint = `${this.baseURL}/api/now/table/${table}/${sysID}`;
    await this.request(endpoint, { method: 'DELETE' });
  }

  async aggregateCount(table, queryStr) {
    const params = new URLSearchParams();
    params.set('sysparm_count', 'true');
    if (queryStr) params.set('sysparm_query', queryStr);
    const endpoint = `${this.baseURL}/api/now/stats/${table}?${params.toString()}`;
    const result = await this.request(endpoint, { method: 'GET' });
    const stats = result?.result?.stats;
    if (!stats) return 0;

    let statsMap = stats;
    if (typeof stats === 'string') {
      try { statsMap = JSON.parse(stats); } catch { return 0; }
    }

    if (statsMap.count != null) {
      const v = statsMap.count;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = parseInt(v, 10);
        return isNaN(n) ? 0 : n;
      }
    }

    for (const value of Object.values(statsMap)) {
      if (value && typeof value === 'object' && value.count != null) {
        const v = value.count;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const n = parseInt(v, 10);
          return isNaN(n) ? 0 : n;
        }
      }
    }

    return 0;
  }
}
