import assert from 'node:assert/strict';
import test from 'node:test';
import logout from '../api/auth/logout.js';

function mockResponse() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    body: '',
    setHeader(key, value) {
      headers[String(key).toLowerCase()] = value;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

test('GET /api/auth/logout clears the session and sends you home', () => {
  const response = mockResponse();
  logout({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/');
  assert.match(String(response.headers['set-cookie']), /__Host-clearwater_session=/);
});

test('POST /api/auth/logout still works for same-site fetch', () => {
  const response = mockResponse();
  logout({
    method: 'POST',
    headers: { origin: 'https://cwrpvc.lol', host: 'cwrpvc.lol' },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"ok":true/);
});
