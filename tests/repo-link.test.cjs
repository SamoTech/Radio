'use strict';
/* Repo link in the site footer: the Radio Atlas site links visibly to its
   public source repository, following the footer's existing external-link
   conventions (new tab, rel=noopener, bilingual static text like the
   country-browse line, so no STR key is needed). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const REPO_URL = 'https://github.com/SamoTech/Radio';

function footer() {
  const html = fs.readFileSync('index.html', 'utf8');
  const start = html.indexOf('<footer>');
  const end = html.indexOf('</footer>');
  assert.ok(start > 0 && end > start, 'index.html must have a footer');
  return html.slice(start, end);
}

test('footer links visibly to the public source repository', () => {
  assert.ok(footer().includes('href="' + REPO_URL + '"'),
    'footer must link to ' + REPO_URL);
});

test('repo link follows the footer external-link convention', () => {
  const link = footer().match(/<a [^>]*href="https:\/\/github\.com\/SamoTech\/Radio"[^>]*>/);
  assert.ok(link, 'repo link must be an anchor in the footer');
  assert.ok(link[0].includes('target="_blank"'), 'repo link must open in a new tab');
  assert.ok(link[0].includes('rel="noopener"'), 'repo link must use rel=noopener');
});

test('service worker version matches the documented current version', () => {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const m = sw.match(/var CACHE = 'radio-atlas-v(\d+)'/);
  assert.ok(m, 'sw.js must declare a versioned cache');
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.ok(readme.includes('Service Worker v' + m[1] + '.'),
    'README must state the current SW version v' + m[1]);
});
