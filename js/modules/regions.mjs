/* =====================================================================
   Radio Atlas — regions module (favorites / Egypt / Arabic / religious panels)
   Split out of js/app.js in P1-2; loaded lazily via loadModule('regions').
   Reuses the globals of js/app.js (classic script). ES modules run in strict
   mode: every assignment below targets a declared or inherited binding.
   ===================================================================== */


var STR_REGIONS = {
  ar: {
    fav_hint: 'جميع المحطات المفضلة لديك في مكان واحد. يمكنك إدارة المفضلة من أي محطة عبر زر القلب ❤️.',
    eg_hint: 'كل إذاعات مصر من الكتالوج في مكان واحد — الاستماع مباشر من الموقع، والمحطات الرسمية والمنتقاة في الأول.',
    eg_source: 'إذاعات مصر الرسمية ↗',
    ar_hint: 'كل الإذاعات العربية من الكتالوج مجمعة حسب الدولة — الاستماع مباشر من الموقع، والمحطات الرسمية في الأول.',
    ar_count: '{n} إذاعة عربية · {c} دولة',
    ar_top: 'أول {n} محطة من {m}',
    rel_hint: 'كل المحطات الدينية من الكتالوج في مكان واحد — قرآن وبرامج دينية، والمحطات الرسمية في الأول.'
  },
  en: {
    fav_hint: 'All your favorite stations in one place. Manage favorites from any station using the heart button ❤️.',
    eg_hint: 'Every Egyptian station from the catalog in one place — plays in-app, official and curated stations first.',
    eg_source: 'Official Egyptian radio ↗',
    ar_hint: 'All Arabic radio from the catalog grouped by country — plays in-app, official stations first.',
    ar_count: '{n} Arabic stations · {c} countries',
    ar_top: 'First {n} of {m} stations',
    rel_hint: 'All religious stations from the catalog in one place — Quran and religious programming, official stations first.'
  }
};



/* ================= Egypt radio ================= */

function egStations() {
  return state.fm.filter(function (s) { return s.cc === 'EG'; });
}




function renderFav() {
  var grid = $('grid-fav');
  var favStations = [];
  for (var url in state.favs) {
    var s = stationByUrl(url);
    if (s) favStations.push(s);
  }
  $('fav-count').textContent = t('stations').replace('{n}', fmtNum(favStations.length));
  if (!favStations.length) {
    grid.innerHTML = '<div class="empty">' + esc(t('no_match_fm')) + '</div>';
    return;
  }
  var html = favStations.map(cardFm).join('');
  grid.innerHTML = html;
}
function renderEG() {
  var grid = $('grid-eg');
  if (!grid) return;
  var list = egStations();
  var count = $('eg-count');
  if (!list.length) {
    if (count) count.textContent = '';
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    return;
  }
  if (count) count.textContent = t('stations').replace('{n}', fmtNum(list.length));
  list.sort(function (a, b) {
    var oa = a.official ? 0 : 1, ob = b.official ? 0 : 1;
    if (oa !== ob) return oa - ob;
    var ra = egAliveRank(a), rb = egAliveRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name), 'ar');
  });
  grid.innerHTML = list.map(cardFm).join('');
}


/* ================= All-Arabic by country ================= */

var ARAB_COUNTRIES = [
  ['EG', 'مصر'], ['SA', 'السعودية'], ['MA', 'المغرب'], ['DZ', 'الجزائر'],
  ['TN', 'تونس'], ['AE', 'الإمارات'], ['LB', 'لبنان'], ['SY', 'سوريا'],
  ['IQ', 'العراق'], ['JO', 'الأردن'], ['QA', 'قطر'], ['YE', 'اليمن'],
  ['KW', 'الكويت'], ['BH', 'البحرين'], ['OM', 'عُمان'], ['PS', 'فلسطين'],
  ['LY', 'ليبيا'], ['SD', 'السودان'], ['SO', 'الصومال'], ['MR', 'موريتانيا'],
  ['KM', 'جزر القمر'], ['DJ', 'جيبوتي']
];
var AR_PER_COUNTRY = 30;



function arabCountryName(cc) {
  for (var i = 0; i < ARAB_COUNTRIES.length; i++) {
    if (ARAB_COUNTRIES[i][0] === cc) return ARAB_COUNTRIES[i][1];
  }
  return cc;
}

function arabStations() {
  var set = {};
  for (var i = 0; i < ARAB_COUNTRIES.length; i++) set[ARAB_COUNTRIES[i][0]] = true;
  return state.fm.filter(function (s) { return !!set[s.cc]; });
}

function renderAR() {
  var grid = $('grid-ar');
  if (!grid) return;
  var list = arabStations();
  var count = $('ar-count');
  if (!list.length) {
    if (count) count.textContent = '';
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    return;
  }
  var groups = {};
  for (var i = 0; i < list.length; i++) {
    var cc = list[i].cc;
    if (!groups[cc]) groups[cc] = [];
    groups[cc].push(list[i]);
  }
  var order = Object.keys(groups).sort(function (a, b) {
    return groups[b].length - groups[a].length;
  });
  if (count) {
    count.textContent = t('ar_count').replace('{n}', fmtNum(list.length)).replace('{c}', fmtNum(order.length));
  }
  var html = '';
  for (var g = 0; g < order.length; g++) {
    var gcc = order[g];
    groups[gcc].sort(function (a, b) {
      var oa = a.official ? 0 : 1, ob = b.official ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return String(a.name).localeCompare(String(b.name));
    });
    var shown = groups[gcc].slice(0, AR_PER_COUNTRY);
    html += '<h2 class="ma-group">' + flagOf(gcc) + ' ' + esc(regionName(gcc, arabCountryName(gcc))) + ' · ' + fmtNum(groups[gcc].length) + '</h2>';
    html += shown.map(cardFm).join('');
    if (groups[gcc].length > shown.length) {
      html += '<p class="ma-count">' + esc(t('ar_top').replace('{n}', fmtNum(shown.length)).replace('{m}', fmtNum(groups[gcc].length))) + '</p>';
    }
  }
  grid.innerHTML = html;
}



/* ================= Religious radio ================= */

function isReligiousStation(s) {
  var cats = splitList(s.tags);
  if (cats.indexOf('quran') !== -1 || cats.indexOf('religion') !== -1) return true;
  return /(قرآن|قران|دين|ديني|قبط|إنجيل|quran|quraan|koran|islam|religio|christian|bible|gospel)/i.test(String(s.name || ''));
}

function renderRel() {
  var grid = $('grid-rel');
  if (!grid) return;
  var list = state.fm.filter(isReligiousStation);
  var count = $('rel-count');
  if (!list.length) {
    if (count) count.textContent = '';
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    return;
  }
  if (count) count.textContent = t('stations').replace('{n}', fmtNum(list.length));
  list.sort(function (a, b) {
    var oa = a.official ? 0 : 1, ob = b.official ? 0 : 1;
    if (oa !== ob) return oa - ob;
    var ra = egAliveRank(a), rb = egAliveRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name), state.lang);
  });
  grid.innerHTML = list.map(cardFm).join('');
}


var API = { renderFav: renderFav, renderEG: renderEG, renderAR: renderAR, renderRel: renderRel };
var booted = false;
export function boot() {
  if (booted) return API;
  booted = true;
  RA_MODULES.regions = API;
  raMergeStr(STR_REGIONS);
  applyI18n();
  renderFav();
  renderEG();
  renderAR();
  renderRel();

  return API;
}
