/* Sign-in for the Brocare tools: username + password, checked against the
   PBKDF2-SHA256 fingerprints in users.js. Needs users.js loaded first.
   A signed-in session lasts 12 hours on that device, then asks again.
   This is a lock on a static site: it keeps the tools behind a login screen,
   but anyone reading the page source can still see the code and the tariffs. */
(function () {
  'use strict';
  var KEY = 'brocare.session', HOURS = 12, ROUNDS = 310000;

  function hexToBytes(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function bytesToHex(b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }

  async function fingerprint(password, saltHex) {
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: ROUNDS }, key, 256);
    return bytesToHex(bits);
  }
  function users() { return window.BROCARE_USERS || {}; }

  window.BrocareAuth = {
    /* the signed-in person, with their current details from users.js, or null */
    current: function () {
      try {
        var s = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (!s || s.exp < Date.now() || !users()[s.user]) return null;
        var u = users()[s.user];
        return { user: s.user, name: u.name, first: u.name.split(' ')[0], whatsapp: u.whatsapp, email: u.email };
      } catch (e) { return null; }
    },
    signIn: async function (username, password) {
      var id = String(username || '').trim().toLowerCase(), u = users()[id];
      /* the same work and the same answer whether the username exists or not */
      var probe = await fingerprint(String(password || ''), (u && u.salt) || '00000000000000000000000000000000');
      if (!u || !u.hash || probe !== u.hash) return null;
      localStorage.setItem(KEY, JSON.stringify({ user: id, exp: Date.now() + HOURS * 3600e3 }));
      return this.current();
    },
    signOut: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
    /* tool pages: anyone not signed in goes to the sign-in, then comes back here */
    gate: function (hubUrl) {
      if (this.current()) return;
      /* a brand demo has no Brocare sign-in. window.BROCARE_BRAND is set only by brands/<key>.js,
         a file that exists only on a server that has that brand: ?brand=x on the public site loads nothing. */
      if (window.BROCARE_BRAND && window.BROCARE_BRAND.demo === true) return;
      document.documentElement.style.visibility = 'hidden';
      location.replace(hubUrl + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash));
    }
  };
})();
