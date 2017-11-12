
'use strict';

(function ExtensionRouterClosure() {
  var VIEWER_URL = chrome.extension.getURL('launcher/launcher.html');
  var CRX_BASE_URL = chrome.extension.getURL('/');

  var schemes = [
    'http',
    'https',
    'ftp',
    'file',
    'chrome-extension',
    'blob',
    'data',
    // Chromium OS
    'filesystem',
    // Chromium OS, shorthand for filesystem:<origin>/external/
    'drive'
  ];

  /**
   * @param {string} url The URL prefixed with chrome-extension://.../
   * @return {string|undefined} The percent-encoded URL of the (slax) file.
   */
  function parseExtensionURL(url) {
    url = url.substring(CRX_BASE_URL.length);
    // Find the (url-encoded) colon and verify that the scheme is whitelisted.
    var schemeIndex = url.search(/:|%3A/i);
    if (schemeIndex === -1) {
      return;
    }
    var scheme = url.slice(0, schemeIndex).toLowerCase();
    if (schemes.indexOf(scheme) >= 0) {
      url = url.split('#')[0];
      if (url.charAt(schemeIndex) === ':') {
        url = encodeURIComponent(url);
      }
      return url;
    }
  }

  // TODO(rob): Use declarativeWebRequest once declared URL-encoding is
  //            supported, see http://crbug.com/273589
  //            (or rewrite the query string parser in viewer.js to get it to
  //             recognize the non-URL-encoded slax URL.)
  chrome.webRequest.onBeforeRequest.addListener(function(details) {
    // This listener converts chrome-extension://.../http://...slax to
    // chrome-extension://.../launcher/launcher.html?file=http%3A%2F%2F...slax
    var url = parseExtensionURL(details.url);
    if (url) {
      url = VIEWER_URL + '?file=' + url;
      var i = details.url.indexOf('#');
      if (i > 0) {
        url += details.url.slice(i);
      }
      console.log('Redirecting ' + details.url + ' to ' + url);
      return { redirectUrl: url, };
    }
  }, {
    types: ['main_frame', 'sub_frame'],
    urls: schemes.map(function(scheme) {
      // Format: "chrome-extension://[EXTENSIONID]/<scheme>*"
      return CRX_BASE_URL + scheme + '*';
    }),
  }, ['blocking']);

  // When session restore is used, viewer pages may be loaded before the
  // webRequest event listener is attached (= page not found).
  // Or the extension could have been crashed (OOM), leaving a sad tab behind.
  // Reload these tabs.
  chrome.tabs.query({
    url: CRX_BASE_URL + '*:*',
  }, function(tabsFromLastSession) {
    for (var i = 0; i < tabsFromLastSession.length; ++i) {
      chrome.tabs.reload(tabsFromLastSession[i].id);
    }
  });
  console.log('Set up extension URL router.');

  Object.keys(localStorage).forEach(function(key) {
    // The localStorage item is set upon unload by chromecom.js.
    var parsedKey = /^unload-(\d+)-(true|false)-(.+)/.exec(key);
    if (parsedKey) {
      var timeStart = parseInt(parsedKey[1], 10);
      var isHidden = parsedKey[2] === 'true';
      var url = parsedKey[3];
      if (Date.now() - timeStart < 3000) {
        // Is it a new item (younger than 3 seconds)? Assume that the extension
        // just reloaded, so restore the tab (work-around for crbug.com/511670).
        chrome.tabs.create({
          url: chrome.runtime.getURL('restoretab.html') +
            '?' + encodeURIComponent(url) +
            '#' + encodeURIComponent(localStorage.getItem(key)),
          active: !isHidden,
        });
      }
      localStorage.removeItem(key);
    }
  });
})();
