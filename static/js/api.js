// Thin API wrapper — attaches PIN header to every request
const API = (() => {
  let _pin = '';

  function setPin(pin) { _pin = pin; }
  function getPin() { return _pin; }

  async function request(method, path, body = null, isForm = false) {
    const headers = { 'X-App-Pin': _pin };
    let fetchBody = null;

    if (body && !isForm) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(body);
    } else if (isForm) {
      fetchBody = body; // FormData
    }

    const res = await fetch(path, { method, headers, body: fetchBody });
    if (res.status === 401) throw new Error('PIN_INVALID');
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Request failed');
    }
    return res.json();
  }

  return {
    setPin, getPin,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    postForm: (path, formData) => request('POST', path, formData, true),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  };
})();
