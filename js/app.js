'use strict';

/* Radio Atlas frontend — vanilla JS, no deps */

var RB_APIS = [
  'https://de1.api.radio-browser.info/json',
  'https://de2.api.radio-browser.info/json',
  'https://nl1.api.radio-browser.info/json'
];
var FM_PAGE = 120;
var LANGUAGE_ALIASES = {
  arabic:['arabic','ar','العربية','عربي','arab'], english:['english','en','انجليزي','إنجليزي','الانجليزية','الإنجليزية'],
  french:['french','fr','فرنسي','فرنسية'], spanish:['spanish','es','español','اسباني','إسباني'],
  german:['german','de','deutsch','الماني','ألماني'], portuguese:['portuguese','pt','português','برتغالي'],
  russian:['russian','ru','русский','روسي'], turkish:['turkish','tr','türkçe','تركي'],
  persian:['persian','farsi','fa','فارسي','فارسی'], urdu:['urdu','ur','اردو'], hindi:['hindi','hi','हिन्दी','هندي'],
  chinese:['chinese','zh','中文','صيني'], japanese:['japanese','ja','日本語','ياباني'], korean:['korean','ko','한국어','كوري'],
  italian:['italian','it','italiano','ايطالي','إيطالي'], dutch:['dutch','nl','nederlands','هولندي'],
  polish:['polish','pl','polski','بولندي'], greek:['greek','el','ελληνικά','يوناني'], swahili:['swahili','sw','kiswahili'],
  indonesian:['indonesian','id','bahasa indonesia'], malay:['malay','ms','bahasa melayu'], bengali:['bengali','bn','বাংলা'],
  kurdish:['kurdish','ku','كردي'], ukrainian:['ukrainian','uk','українська'], romanian:['romanian','ro','română'],
  swedish:['swedish','sv','svenska'], norwegian:['norwegian','no','norsk'], finnish:['finnish','fi','suomi'],
  danish:['danish','da','dansk'], czech:['czech','cs','čeština'], hungarian:['hungarian','hu','magyar'],
  serbian:['serbian','sr','српски'], croatian:['croatian','hr','hrvatski'], bulgarian:['bulgarian','bg','български'],
  thai:['thai','th','ไทย'], vietnamese:['vietnamese','vi','tiếng việt']
};
var CORE_CATEGORIES = [
  ['news',['news','اخبار','أخبار']],['music',['music','موسيقى','musique']],['talk',['talk','speech','spoken','حوار']],
  ['sports',['sport','sports','football','كرة','رياضة']],['quran',['quran','quraan','koran','قرآن']],
  ['religion',['religion','religious','islam','islamic','دين']],['classical',['classical','كلاسيك']],
  ['pop',['pop','بوب']],['rock',['rock','روك']],['jazz',['jazz','جاز']],['culture',['culture','ثقافة']],
  ['education',['education','educational','تعليم']],['business',['business','finance','اقتصاد']],
  ['weather',['weather','طقس']],['children',['children','kids','أطفال']],['oldies',['oldies','retro','قديم']],
  ['dance',['dance','electronic','دانس']],['folk',['folk','traditional','تراث','شعبي']],
  ['world',['world','international','عالمي']],['traffic',['traffic','ترافيك','مرور']]
];
var CATEGORY_LABELS = {
  ar:{news:'أخبار',music:'موسيقى',talk:'حوارات',sports:'رياضة',quran:'قرآن',religion:'ديني',classical:'كلاسيكي',pop:'بوب',rock:'روك',jazz:'جاز',culture:'ثقافة',education:'تعليم',business:'اقتصاد',weather:'طقس',children:'أطفال',oldies:'أغاني قديمة',dance:'رقص وإلكتروني',folk:'تراث وشعبي',world:'عالمي',traffic:'مرور'},
  en:{news:'News',music:'Music',talk:'Talk',sports:'Sports',quran:'Quran',religion:'Religion',classical:'Classical',pop:'Pop',rock:'Rock',jazz:'Jazz',culture:'Culture',education:'Education',business:'Business',weather:'Weather',children:'Children',oldies:'Oldies',dance:'Dance / Electronic',folk:'Folk',world:'World',traffic:'Traffic'}
};
var FACET_OPTIONS = {country:[],language:[],tag:[]};
function canonicalLanguage(value) {
  var raw=String(value||'').trim().toLowerCase();
  if(!raw)return '';
  for(var key in LANGUAGE_ALIASES) if(LANGUAGE_ALIASES[key].indexOf(raw)!==-1)return key;
  return raw.replace(/\s+/g,' ');
}
function normalizeLanguages(value) {
  var seen={};
  return String(value||'').split(/[,;|]/).map(canonicalLanguage).filter(function(v){
    if(!v||seen[v])return false;seen[v]=true;return true;
  }).join(', ');
}
function normalizeCategories(value) {
  var raw=String(value||'').split(/[,;|]/).map(function(x){return x.trim().toLowerCase();});
  return CORE_CATEGORIES.filter(function(entry){
    return raw.some(function(tag){return entry[1].indexOf(tag)!==-1;});
  }).map(function(entry){return entry[0];}).join(', ');
}
function isOfficialStation(s) {
  return s.official===true || /(^|[,;])\s*(official|رسمي)\s*([,;]|$)/i.test(String(s.tags||''));
}
var CHIP_TAGS = {
  news: ['news', 'كل الأخبار', 'أخبار'],
  quran: ['quran', 'quraan', 'koran', 'islam', 'islamic', 'religion', 'religious', 'قرآن', 'دين'],
  sports: ['sport', 'sports', 'football', 'كرة', 'رياضة'],
  music: ['music', 'موسيقى']
};

var STR = {
  ar: {
    locale: 'ar-EG', dateLocale: 'ar', dir: 'rtl',
    doc_title: 'راديو أطلس — دليل الاستقبال العالمي',
    app_title: '📻 راديو أطلس',
    tagline: 'دليل بحث ذكي لأجهزة الاستقبال ومحطات البث المتاحة أونلاين',
    stat_total: 'جهاز استقبال', stat_online: 'أونلاين الآن', stat_listeners: 'مستمع حاليًا', stat_updated: 'آخر تحديث',
    tab_fm: '📻 محطات البث', tab_sdr: 'أجهزة الاستقبال SDR',
    search_fm_ph: 'ابحث عن محطة: اسم، لغة، فئة… (فوري)', search_country_ph:'ابحث عن دولة…', search_language_ph:'ابحث عن لغة…', search_tag_ph:'ابحث عن فئة…',
    all_countries: '🌍 كل الدول', all_languages: '🗣 كل اللغات', all_tags: '🏷 كل الفئات',
    live_search: 'بحث مباشر', clear_filters: 'مسح الفلاتر',
    fm_hint: 'الكتالوج الكامل لكل محطات Radio-Browser المتاحة مخزن في التطبيق — البحث والتصنيف فوري. زر «بحث مباشر» يستعلم لحظيًا من المصدر.',
    chip_all: '✨ الكل', chip_fav: '⭐ المفضلة', chip_arabic: '🎙 عربي', chip_news: '📰 أخبار', chip_quran: '🕌 قرآن', chip_sports: '⚽ رياضة', chip_music: '🎵 موسيقى',
    search_sdr_ph: 'ابحث: اسم، بلد، نداء…',
    all_bands: 'كل النطاقات', sort_snr: 'الأفضل SNR', sort_free: 'أكبر مساحة فاضية', sort_users: 'الأقل ازدحامًا', sort_name: 'الاسم',
    online_only: 'أونلاين فقط', free_only: 'فيه مكان فاضي', snr_min: 'SNR ≥',
    sdr_hint: '🎧 الاستماع داخل التطبيق متاح لأجهزة HTTPS فقط (قيود أمان المتصفح) — الأجهزة التي على HTTP تفتح في نافذة جديدة.',
    no_band: 'غير محدد', no_data: 'لا توجد بيانات بعد.',
    no_match: 'مفيش نتائج مطابقة — جرب تخفف الفلاتر.',
    no_match_fm: 'مفيش محطات مطابقة — جرب فلتر أخف أو كلمة تانية.',
    searching_live: 'جاري البحث المباشر من المصدر…',
    live_failed: 'البحث المباشر فشل — استخدم الفلترة المحلية الفورية.',
    more_btn: 'عرض المزيد — باقي {n} محطة', results: '{n} نتيجة', stations: '{n} محطة',
    listen: '▶ استمع', listen_in_app: '🎧 استمع داخل التطبيق', open_ext: 'افتح الجهاز ↗', open_ext2: 'فتح خارجي ↗', close: '✕ إغلاق',
    resume: 'آخر محطة — دوس تشغيل للاستكمال',
    space_title: 'حالة النطاقات (بيانات NOAA SWPC)', updated_at: 'آخر تحديث',
    cond_good: 'الظروف مستقرة — النطاقات العليا (14–28 MHz) غالبًا مفتوحة.',
    cond_unstable: 'اضطراب متوسط — استقبل النطاقات المنخفضة (3–10 MHz).',
    cond_storm: 'عاصفة مغناطيسية — النطاقات العليا مغلقة والمسارات القطبية مشوشة.',
    eibi_title: 'بث موجات قصيرة على الهواء الآن',
    eibi_hint: 'من جدول EIBI — ترددات تُبث الآن (UTC). قرّب التردد على أي جهاز استقبال بالأسفل لسماعه.',
    eibi_ph: 'ابحث في البث الحالي: اسم، تردد…', onair: 'بث على الهواء',
    more_eibi: 'تُعرض أول 60 نتيجة — دقّق البحث لعرض المزيد.',
    visitors: 'إجمالي الزيارات', you_from: 'أنت تزور من',
    toast_broken: 'المحطة مش شغالة حاليًا 😕', fav_on: 'أضفتها للمفضلة ⭐', fav_off: 'شيلتها من المفضلة',
    sources: 'المصادر:', offline_footer: 'تُحدَّث البيانات تلقائيًا كل ٣٠ دقيقة.'
  },
  en: {
    locale: 'en-US', dateLocale: 'en', dir: 'ltr',
    doc_title: 'Radio Atlas — Global Reception Directory',
    app_title: '📻 Radio Atlas',
    tagline: 'Smart search directory for online receivers and broadcast stations',
    stat_total: 'Receivers', stat_online: 'Online now', stat_listeners: 'Current listeners', stat_updated: 'Updated',
    tab_fm: '📻 Broadcast stations', tab_sdr: 'SDR Receivers',
    search_fm_ph: 'Search a station: name, language, genre… (instant)', search_country_ph:'Search countries…', search_language_ph:'Search languages…', search_tag_ph:'Search categories…',
    all_countries: '🌍 All countries', all_languages: '🗣 All languages', all_tags: '🏷 All genres',
    live_search: 'Live search', clear_filters: 'Clear filters',
    fm_hint: 'The full Radio-Browser catalog is stored in the app — search and filtering are instant. Live search queries the source in real time.',
    chip_all: '✨ All', chip_fav: '⭐ Favorites', chip_arabic: '🎙 Arabic', chip_news: '📰 News', chip_quran: '🕌 Quran', chip_sports: '⚽ Sports', chip_music: '🎵 Music',
    search_sdr_ph: 'Search: name, country, callsign…',
    all_bands: 'All bands', sort_snr: 'Best SNR', sort_free: 'Most free slots', sort_users: 'Least crowded', sort_name: 'Name',
    online_only: 'Online only', free_only: 'Has a free slot', snr_min: 'SNR ≥',
    sdr_hint: '🎧 In-app listening works for HTTPS receivers only (browser security) — HTTP receivers open in a new window.',
    no_band: 'Unspecified', no_data: 'No data yet.',
    no_match: 'No matching results — try lighter filters.',
    no_match_fm: 'No matching stations — try a lighter filter or another keyword.',
    searching_live: 'Live search in progress…',
    live_failed: 'Live search failed — use the instant local filtering.',
    more_btn: 'Show more — {n} stations left', results: '{n} results', stations: '{n} stations',
    listen: '▶ Listen', listen_in_app: '🎧 Listen in app', open_ext: 'Open receiver ↗', open_ext2: 'Open externally ↗', close: '✕ Close',
    resume: 'Last station — press play to resume',
    space_title: 'Band conditions (NOAA SWPC data)', updated_at: 'Updated',
    cond_good: 'Conditions are stable — high bands (14–28 MHz) are likely open.',
    cond_unstable: 'Moderate disturbance — favor lower bands (3–10 MHz).',
    cond_storm: 'Geomagnetic storm — high bands closed, polar paths disturbed.',
    eibi_title: 'Shortwave broadcasts on air now',
    eibi_hint: 'From the EIBI schedule — frequencies broadcasting now (UTC). Tune one on any receiver below to listen.',
    eibi_ph: 'Search the current broadcast: name, frequency…', onair: 'on air',
    more_eibi: 'Showing the first 60 — refine your search to see more.',
    visitors: 'Total visits', you_from: 'You are visiting from',
    toast_broken: 'This station is not working right now 😕', fav_on: 'Added to favorites ⭐', fav_off: 'Removed from favorites',
    sources: 'Sources:', offline_footer: 'Data refreshes automatically every 30 minutes.'
  }
};

var state = {
  lang: 'ar',
  theme: 'dark',
  favs: {},
  receivers: [],
  updated: null,
  filters: { q: '', band: 'all', sort: 'snr', onlineOnly: true, freeOnly: false, minSnr: 0 },
  fm: [],
  fmFilters: { q: '', country: '', language: '', tag: '', chip: '' },
  fmLimit: FM_PAGE,
  fmLive: false,
  fmLiveRows: [],
  eibi: [],
  eibiQ: '',
  space: null,
  currentName: ''
};

function $(id) { return document.getElementById(id); }

function t(key) {
  var d = STR[state.lang] || STR.ar;
  if (d[key] != null) return d[key];
  if (STR.ar[key] != null) return STR.ar[key];
  return key;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fetchJSON(url) {
  return fetch(url, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function fmtNum(n) {
  try { return Number(n).toLocaleString(STR[state.lang].locale); } catch (e) { return String(n); }
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(STR[state.lang].dateLocale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch (e) { return String(iso); }
}

/* ================= i18n / theme ================= */

function applyI18n() {
  var els = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-i18n'));
  var phs = document.querySelectorAll('[data-i18n-ph]');
  for (var j = 0; j < phs.length; j++) phs[j].placeholder = t(phs[j].getAttribute('data-i18n-ph'));
  $('lang-btn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
  document.title = t('doc_title');
}

function rebuildDynamic() {
  buildBandFilter();
  renderSDR();
  buildFMFacets();
  renderChips();
  renderFM();
  renderSpace();
  renderEibi();
  if (state.currentName && !$('player').hidden) {
    $('player-name').textContent = '▶ ' + state.currentName;
  }
}

function setLang(l) {
  state.lang = l;
  try { localStorage.setItem('ra-lang', l); } catch (e) {}
  document.documentElement.lang = l;
  document.documentElement.dir = STR[l] ? STR[l].dir : 'rtl';
  applyI18n();
  rebuildDynamic();
}

function setTheme(th) {
  state.theme = th;
  try { localStorage.setItem('ra-theme', th); } catch (e) {}
  document.documentElement.setAttribute('data-theme', th);
  $('theme-btn').textContent = th === 'dark' ? '☀️' : '🌙';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', th === 'dark' ? '#0b1220' : '#f2f5fb');
}

/* ================= toast ================= */

var toastTimer = null;
function toast(msg) {
  var el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
}

/* ================= favorites ================= */

function loadFavs() {
  try { return JSON.parse(localStorage.getItem('ra-favs') || '{}') || {}; } catch (e) { return {}; }
}

function saveFavs() {
  try { localStorage.setItem('ra-favs', JSON.stringify(state.favs)); } catch (e) {}
}

function stationByUrl(url) {
  for (var i = 0; i < state.fm.length; i++) {
    if (state.fm[i].url === url) return state.fm[i];
  }
  return null;
}

function toggleFav(s) {
  if (state.favs[s.url]) {
    delete state.favs[s.url];
    toast(t('fav_off'));
  } else {
    state.favs[s.url] = { name: s.name, cc: s.cc, language: s.language, tags: s.tags, url: s.url };
    toast(t('fav_on'));
  }
  saveFavs();
  renderFM();
}

/* ================= KiwiSDR ================= */

function normalizeRx(r) {
  var url = r.url || '';
  return {
    name: r.name || '—',
    url: url,
    https: /^https:/i.test(url),
    online: !!r.online,
    users: Number(r.users) || 0,
    maxUsers: Number(r.max_users) || 0,
    snr: r.snr == null ? null : Number(r.snr),
    gps: !!r.gps,
    band: r.band || '',
    loc: r.loc || '',
    antenna: r.antenna || ''
  };
}

function loadKiwi() {
  return fetchJSON('data/kiwisdr.json').then(function (data) {
    if (data && Array.isArray(data.receivers)) {
      state.receivers = data.receivers.map(normalizeRx);
      state.updated = data.updated;
    }
  }).catch(function (e) {
    console.warn('kiwisdr snapshot:', e);
  }).then(function () {
    renderStats();
    buildBandFilter();
    renderSDR();
  });
}

function renderStats() {
  var total = state.receivers.length;
  var online = 0, listeners = 0;
  state.receivers.forEach(function (r) {
    if (r.online) { online++; listeners += r.users; }
  });
  $('stat-total').textContent = fmtNum(total);
  $('stat-online').textContent = fmtNum(online);
  $('stat-listeners').textContent = fmtNum(listeners);
  $('stat-updated').textContent = fmtDate(state.updated);
}

function buildBandFilter() {
  var sel = $('band');
  var bands = {};
  state.receivers.forEach(function (r) {
    var b = r.band || t('no_band');
    bands[b] = (bands[b] || 0) + 1;
  });
  var keys = Object.keys(bands).sort(function (a, b) { return bands[b] - bands[a]; });
  sel.innerHTML = '<option value="all">' + esc(t('all_bands')) + '</option>' + keys.map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(k) + ' (' + bands[k] + ')</option>';
  }).join('');
  sel.value = state.filters.band;
}

function applyFilters() {
  var f = state.filters;
  var q = f.q.trim().toLowerCase();
  var list = state.receivers.filter(function (r) {
    if (f.onlineOnly && !r.online) return false;
    if (f.band !== 'all' && (r.band || t('no_band')) !== f.band) return false;
    if (f.freeOnly && !(r.maxUsers > 0 && r.users < r.maxUsers)) return false;
    if (f.minSnr > 0 && !(r.snr != null && r.snr >= f.minSnr)) return false;
    if (q) {
      var hay = (r.name + ' ' + r.url + ' ' + r.band + ' ' + r.loc + ' ' + r.antenna).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  list.sort(function (a, b) {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (f.sort === 'name') return a.name.localeCompare(b.name, state.lang);
    if (f.sort === 'free') return (b.maxUsers - b.users) - (a.maxUsers - a.users);
    if (f.sort === 'users') return a.users - b.users;
    var sa = a.snr == null ? -1 : a.snr;
    var sb = b.snr == null ? -1 : b.snr;
    return sb - sa;
  });
  return list;
}

function cardRx(r) {
  var cls = 'card' + (r.online ? '' : ' off');
  var snr = r.snr == null ? '—' : r.snr + ' dB';
  var users = r.users + '/' + (r.maxUsers || '?');
  var chips = '';
  if (r.band) chips += '<span class="chip">' + esc(r.band) + '</span>';
  if (r.loc) chips += '<span class="chip">📍 ' + esc(r.loc) + '</span>';
  if (r.gps) chips += '<span class="chip gps">📡 GPS</span>';
  var action = '';
  if (r.url) {
    action = r.https
      ? '<button class="open play-sdr" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '">' + esc(t('listen_in_app')) + '</button>'
      : '<a class="open" target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(t('open_ext')) + '</a>';
  }
  return '<article class="' + cls + '">' +
    '<div class="card-head"><span class="dot ' + (r.online ? 'on' : 'off') + '"></span>' +
    '<h3>' + esc(r.name) + '</h3></div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    '<div class="meta"><span>👥 ' + users + '</span><span class="snr">📶 SNR ' + snr + '</span></div>' +
    (r.antenna ? '<div class="meta antenna" title="' + esc(r.antenna) + '">🛰 ' + esc(r.antenna) + '</div>' : '') +
    action +
    '</article>';
}

function renderSDR() {
  var grid = $('grid-sdr');
  if (!state.receivers.length) {
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    $('count-sdr').textContent = '';
    return;
  }
  var list = applyFilters();
  $('count-sdr').textContent = t('results').replace('{n}', fmtNum(list.length));
  grid.innerHTML = list.length ? list.map(cardRx).join('')
    : '<div class="empty">' + esc(t('no_match')) + '</div>';
}

/* ================= FM / Broadcast ================= */

function flagOf(cc) {
  if (!cc || !/^[a-zA-Z]{2}$/.test(cc)) return '';
  var a = cc.toUpperCase();
  try {
    return String.fromCodePoint(0x1F1E6 + a.charCodeAt(0) - 65, 0x1F1E6 + a.charCodeAt(1) - 65);
  } catch (e) { return ''; }
}

function regionName(cc, fallback) {
  if (!cc) return fallback;
  try {
    var dn = new Intl.DisplayNames([state.lang], { type: 'region' });
    var n = dn.of(cc.toUpperCase());
    return n && n !== cc.toUpperCase() ? n : fallback;
  } catch (e) { return fallback; }
}

function fillSelect(sel, placeholder, items) {
  sel.innerHTML = '<option value="">' + esc(placeholder) + '</option>' + items.map(function (it) {
    return '<option value="' + esc(it.value) + '">' + esc(it.label) + '</option>';
  }).join('');
}

function splitList(v) {
  return String(v || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
}

function buildFMFacets() {
  var countries={},langs={},categories={};
  state.fm.forEach(function(s){
    if(s.cc)countries[s.cc]=(countries[s.cc]||0)+1;
    splitList(s.language).forEach(function(l){var c=canonicalLanguage(l);if(c)langs[c]=(langs[c]||0)+1;});
    splitList(normalizeCategories(s.tags)).forEach(function(tag){categories[tag]=(categories[tag]||0)+1;});
  });
  var countryItems=Object.keys(countries).map(function(k){
    var name=regionName(k,k);return {value:k,name:name,label:flagOf(k)+' '+name+' ('+countries[k]+')'};
  }).sort(function(a,b){return a.name.localeCompare(b.name,state.lang);});
  var langItems=Object.keys(langs).sort(function(a,b){return a.localeCompare(b,state.lang);})
    .map(function(k){return {value:k,label:k.charAt(0).toUpperCase()+k.slice(1)+' ('+langs[k]+')'};});
  var labels=CATEGORY_LABELS[state.lang]||CATEGORY_LABELS.en;
  var tagItems=CORE_CATEGORIES.filter(function(entry){return categories[entry[0]]>0;})
    .map(function(entry){return {value:entry[0],label:labels[entry[0]]+' ('+categories[entry[0]]+')'};});
  FACET_OPTIONS={country:countryItems,language:langItems,tag:tagItems};
  fillSelect($('fm-country'),t('all_countries'),countryItems);
  fillSelect($('fm-language'),t('all_languages'),langItems);
  fillSelect($('fm-tag'),t('all_tags'),tagItems);
  filterFacetOptions('country');filterFacetOptions('language');filterFacetOptions('tag');
}
function filterFacetOptions(kind) {
  var search=$('fm-'+kind+'-search'),select=$('fm-'+kind);
  if(!search||!select)return;
  var q=search.value.trim().toLocaleLowerCase(),selected=state.fmFilters[kind]||'';
  var options=FACET_OPTIONS[kind].filter(function(item){
    return item.value===selected||!q||item.label.toLocaleLowerCase().indexOf(q)!==-1||item.value.toLocaleLowerCase().indexOf(q)!==-1;
  });
  var placeholder=kind==='country'?t('all_countries'):(kind==='language'?t('all_languages'):t('all_tags'));
  fillSelect(select,placeholder,options);select.value=selected;
}
function normalizeFm(s) {
  return {
    name:s.name||'—',url:s.url_resolved||s.url||'',cc:String(s.countrycode||s.cc||'').toUpperCase(),
    language:normalizeLanguages(s.language||''),tags:normalizeCategories(s.tags||''),official:isOfficialStation(s),
    codec:s.codec||'',bitrate:s.bitrate||0
  };
}

function cardFm(s) {
  var isFav = !!state.favs[s.url];
  var heart = '<button class="fav' + (isFav ? ' active' : '') + '" type="button" title="⭐" data-fav-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '">' + (isFav ? '❤️' : '🤍') + '</button>';
  var chips = '';
  if (s.cc) chips += '<span class="chip">' + flagOf(s.cc) + ' ' + esc(regionName(s.cc, s.cc)) + '</span>';
  if (s.language) chips += '<span class="chip">🗣 ' + esc(s.language) + '</span>';
  var allTags=String(s.tags||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
  var isOfficial=isOfficialStation(s);
  if(isOfficial)chips+='<span class="chip official">🏛 '+esc(state.lang==='ar'?'رسمي':'Official')+'</span>';
  var shownTags=allTags.slice(0,3);
  shownTags.forEach(function (x) { chips += '<span class="chip tag">🏷 ' + esc(x) + '</span>'; });
  var meta = [s.codec, s.bitrate ? s.bitrate + 'kbps' : ''].filter(Boolean).join(' · ');
  return '<article class="card">' +
    '<div class="card-head"><h3>' + esc(s.name) + '</h3>' + heart + '</div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
    '<button class="open play" type="button" data-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '">' + esc(t('listen')) + '</button>' +
    '</article>';
}

function filterFM() {
  var f = state.fmFilters;
  var q = f.q.trim().toLowerCase();
  return state.fm.filter(function (s) {
    if (f.country && s.cc !== f.country) return false;
    if (f.language && splitList(s.language).indexOf(f.language) === -1) return false;
    if (f.tag && splitList(s.tags).indexOf(f.tag) === -1) return false;
    if (f.chip === 'fav' && !state.favs[s.url]) return false;
    if (f.chip === 'arabic') {
      var langA = (s.language || '').toLowerCase();
      var tagsA = splitList(s.tags);
      if (langA.indexOf('arabic') === -1 && tagsA.indexOf('عربي') === -1 && tagsA.indexOf('arabic') === -1) return false;
    }
    if (f.chip && CHIP_TAGS[f.chip]) {
      var tags = splitList(s.tags);
      var hit = false;
      var wanted = CHIP_TAGS[f.chip];
      for (var i = 0; i < wanted.length; i++) {
        if (tags.indexOf(wanted[i]) !== -1) { hit = true; break; }
      }
      if (!hit) return false;
    }
    if (q) {
      if ((s.name + ' ' + s.language + ' ' + s.tags).toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  });
}

function currentFMList() {
  var list=state.fmLive?state.fmLiveRows.slice():filterFM();
  return list.sort(function(a,b){
    if(isOfficialStation(a)!==isOfficialStation(b))return isOfficialStation(a)?-1:1;
    return 0;
  });
}

function renderFM() {
  var grid = $('grid-fm');
  var list = currentFMList();
  if (!list.length) {
    grid.innerHTML = '<div class="empty">' + esc(t('no_match_fm')) + '</div>';
    $('count-fm').textContent = '';
    return;
  }
  var shown = list.slice(0, state.fmLimit);
  var html = shown.map(cardFm).join('');
  if (list.length > state.fmLimit) {
    html += '<div class="more-wrap"><button id="fm-more" class="btn ghost" type="button">' + esc(t('more_btn').replace('{n}', fmtNum(list.length - state.fmLimit))) + '</button></div>';
  }
  grid.innerHTML = html;
  $('count-fm').textContent = t('stations').replace('{n}', fmtNum(list.length));
}

function loadStations() {
  return fetchJSON('data/stations.json').then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      buildFMFacets();
    }
  }).catch(function (e) { console.warn('stations snapshot:', e); }).then(renderFM);
}

function fmClientRender() {
  state.fmLive = false;
  state.fmLiveRows = [];
  state.fmLimit = FM_PAGE;
  renderChips();
  renderFM();
}

function fetchRB(params) {
  var i = 0;
  function attempt() {
    return fetch(RB_APIS[i] + '/stations/search?' + params.join('&')).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (err) {
      i += 1;
      if (i >= RB_APIS.length) throw err;
      return attempt();
    });
  }
  return attempt();
}

function searchFM() {
  var f = state.fmFilters;
  if (!(f.q || f.country || f.language || f.tag || f.chip === 'arabic' || (f.chip && CHIP_TAGS[f.chip]))) { fmClientRender(); return; }
  $('grid-fm').innerHTML = '<div class="empty">' + esc(t('searching_live')) + '</div>';
  var params = ['limit=200', 'hidebroken=true', 'order=clickcount', 'reverse=true'];
  if (f.q) params.push('name=' + encodeURIComponent(f.q));
  if (f.country) params.push('countrycode=' + encodeURIComponent(f.country));
  if (f.language) params.push('language=' + encodeURIComponent(f.language));
  if (f.tag) params.push('tagList=' + encodeURIComponent(f.tag));
  if (f.chip === 'arabic') params.push('language=arabic');
  if (f.chip && CHIP_TAGS[f.chip]) params.push('tagList=' + encodeURIComponent(CHIP_TAGS[f.chip][0]));
  fetchRB(params)
    .then(function (rows) {
      state.fmLive = true;
      state.fmLiveRows = rows
        .filter(function (s) { return (s.url_resolved || s.url) && (s.countrycode || '').toUpperCase() !== 'IL'; })
        .map(normalizeFm);
      if (f.chip === 'fav') {
        state.fmLiveRows = state.fmLiveRows.filter(function (s) { return !!state.favs[s.url]; });
      }
      state.fmLimit = FM_PAGE;
      renderChips();
      renderFM();
    })
    .catch(function () {
      $('grid-fm').innerHTML = '<div class="empty">' + esc(t('live_failed')) + '</div>';
    });
}

function clearFMFilters() {
  state.fmFilters = { q: '', country: '', language: '', tag: '', chip: '' };
  $('qfm').value = '';
  ['country','language','tag'].forEach(function(kind){$('fm-'+kind+'-search').value='';filterFacetOptions(kind);});
  $('fm-country').value = '';
  $('fm-language').value = '';
  $('fm-tag').value = '';
  fmClientRender();
}

/* ================= quick chips ================= */

function renderChips() {
  var chips = document.querySelectorAll('.qchip');
  for (var i = 0; i < chips.length; i++) {
    var c = chips[i];
    var k = c.getAttribute('data-chip');
    var active = (k === 'all') ? state.fmFilters.chip === '' : state.fmFilters.chip === k;
    c.classList.toggle('active', active);
  }
}

/* ================= space weather ================= */

function loadSpace() {
  fetchJSON('data/space_weather.json').then(function (d) {
    if (d && (d.kp != null || d.f107 != null)) { state.space = d; renderSpace(); }
  }).catch(function () {});
  fetchJSON('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json').then(function (rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    for (var i = rows.length - 1; i >= 0; i--) {
      var v = rows[i] && (rows[i].kp_index != null ? rows[i].kp_index : rows[i].estimated_kp);
      if (v != null) {
        if (!state.space) state.space = {};
        state.space.kp = Number(v);
        state.space.updated = new Date().toISOString();
        renderSpace();
        return;
      }
    }
  }).catch(function () {});
}

function renderSpace() {
  var p = $('space-panel');
  if (!state.space) { p.hidden = true; return; }
  p.hidden = false;
  $('space-upd').textContent = t('updated_at') + ': ' + fmtDate(state.space.updated);
  var vals = '';
  if (state.space.kp != null) vals += '<span class="chip">🧲 Kp ' + state.space.kp + '</span>';
  if (state.space.f107 != null) vals += '<span class="chip">☀️ F10.7 ' + state.space.f107 + ' sfu</span>';
  $('space-values').innerHTML = vals;
  var kp = state.space.kp;
  var cond = kp == null ? '' : (kp < 4 ? t('cond_good') : (kp < 6 ? t('cond_unstable') : t('cond_storm')));
  $('space-cond').textContent = cond;
}

/* ================= EIBI on-air ================= */

function loadEibi() {
  fetchJSON('data/eibi.json').then(function (d) {
    if (d && Array.isArray(d.rows) && d.rows.length) { state.eibi = d.rows; renderEibi(); }
  }).catch(function () {});
}

function eibiRow(x) {
  var freq = (x.f / 1000).toFixed(3) + ' MHz';
  return '<div class="eibi-row"><span class="eibi-time">' + esc(x.s + '–' + x.e + ' UTC') + '</span><strong>' + freq + '</strong><span class="eibi-name">' + esc(x.n || '') + '</span></div>';
}

function renderEibi() {
  var p = $('eibi-panel');
  if (!state.eibi.length) { p.hidden = true; return; }
  p.hidden = false;
  var q = state.eibiQ.trim().toLowerCase();
  var rows = state.eibi.filter(function (x) {
    if (!q) return true;
    return ((x.n || '') + ' ' + x.f).toLowerCase().indexOf(q) !== -1;
  });
  $('eibi-count').textContent = fmtNum(rows.length) + ' ' + t('onair');
  var html = rows.slice(0, 60).map(eibiRow).join('');
  if (rows.length > 60) html += '<div class="hint" style="text-align:center">' + esc(t('more_eibi')) + '</div>';
  $('eibi-list').innerHTML = html || ('<div class="hint">' + esc(t('no_match')) + '</div>');
}

/* ================= players ================= */

function setMedia(name) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: name || 'Radio Atlas',
      artist: 'Radio Atlas — راديو أطلس',
      album: 'Radio Atlas'
    });
  } catch (e) {}
}

var hls = null;
function isHlsUrl(u) {
  return /\.m3u8(\?|$)/i.test(u || '');
}
function destroyHls() {
  if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
}
function loadHlsLib(cb) {
  if (window.Hls) { cb(); return; }
  if (loadHlsLib.queue) { loadHlsLib.queue.push(cb); return; }
  loadHlsLib.queue = [cb];
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
  s.onload = function () {
    var q = loadHlsLib.queue || [];
    loadHlsLib.queue = null;
    for (var i = 0; i < q.length; i++) q[i]();
  };
  s.onerror = s.onload;
  document.head.appendChild(s);
}
function attachHls(url, autostart) {
  var a = $('audio');
  if (window.Hls && window.Hls.isSupported()) {
    destroyHls();
    a.removeAttribute('src');
    hls = new window.Hls({ autoStartLoad: !!autostart });
    hls.__raStarted = !!autostart;
    hls.on(window.Hls.Events.ERROR, function (evt, data) {
      if (data && data.fatal) toast(t('toast_broken'));
    });
    hls.loadSource(url);
    hls.attachMedia(a);
  } else {
    a.src = url;
  }
}
function play(url, name) {
  state.currentName = name || '';
  $('player').hidden = false;
  $('player-name').textContent = '▶ ' + (name || '');
  var a = $('audio');
  destroyHls();
  var ext = $('player-ext');
  if (ext) { ext.href = url; ext.hidden = false; }
  if (isHlsUrl(url) && !a.canPlayType('application/vnd.apple.mpegurl')) {
    loadHlsLib(function () {
      attachHls(url, true);
      a.play().catch(function () {});
    });
  } else {
    a.src = url;
    a.play().catch(function () {});
  }
  try { localStorage.setItem('ra-last', JSON.stringify({ url: url, name: name || '' })); } catch (e) {}
  setMedia(name || '');
}

function openSDR(url, name) {
  $('sdr-modal-name').textContent = '🎧 ' + (name || '');
  $('sdr-open-ext').href = url;
  $('sdr-frame').src = url;
  $('sdr-modal').hidden = false;
}

function closeSDR() {
  $('sdr-frame').src = 'about:blank';
  $('sdr-modal').hidden = true;
}

function initResume() {
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { last = null; }
  if (!last || !last.url) return;
  state.currentName = last.name || '';
  var a = $('audio');
  if (isHlsUrl(last.url) && !a.canPlayType('application/vnd.apple.mpegurl')) {
    loadHlsLib(function () { attachHls(last.url, false); });
  } else {
    try { a.src = last.url; } catch (e) {}
    a.preload = 'none';
  }
  var ext = $('player-ext');
  if (ext) { ext.href = last.url; ext.hidden = false; }
  $('player').hidden = false;
  $('player-name').textContent = '⏸ ' + state.currentName + ' — ' + t('resume');
  setMedia(state.currentName);
}

function initPlayers() {
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var fav = el.closest('button.fav');
    if (fav) {
      var url = fav.getAttribute('data-fav-url');
      var s = stationByUrl(url);
      if (!s) s = { name: fav.getAttribute('data-name') || '', url: url, cc: '', language: '', tags: '' };
      toggleFav(s);
      return;
    }
    var p = el.closest('button.play');
    if (p) {
      play(p.getAttribute('data-url'), p.getAttribute('data-name'));
      return;
    }
    var sdr = el.closest('button.play-sdr');
    if (sdr) {
      openSDR(sdr.getAttribute('data-url'), sdr.getAttribute('data-name'));
    }
  });
  $('player-close').addEventListener('click', function () {
    var a = $('audio');
    a.pause();
    a.removeAttribute('src');
    destroyHls();
    var ext = $('player-ext');
    if (ext) ext.hidden = true;
    $('player').hidden = true;
  });
  $('sdr-modal-close').addEventListener('click', closeSDR);
  $('audio').addEventListener('error', function () {
    if ($('audio').getAttribute('src')) toast(t('toast_broken'));
  });
  $('audio').addEventListener('play', function () {
    if (hls && !hls.__raStarted) {
      hls.__raStarted = true;
      try { hls.startLoad(); } catch (e) {}
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('sdr-modal').hidden) closeSDR();
    }
  });
}

/* ================= visitor box ================= */

function initVisitorBox() {
  // CounterAPI.com increments the global page-view counter through its embed script.
  // The external provider may process request metadata; the app does not request city-level IP data.
  var mount=$('visitor-counter');
  if(mount)mount.setAttribute('data-counter-ready','true');
}

/* ================= UI ================= */

function switchTab(x) {
  var fm = x === 'fm';
  $('tab-fm').classList.toggle('active', fm);
  $('tab-sdr').classList.toggle('active', !fm);
  $('panel-fm').hidden = !fm;
  $('panel-sdr').hidden = fm;
}

function initUI() {
  $('tab-fm').addEventListener('click', function () { switchTab('fm'); });
  $('tab-sdr').addEventListener('click', function () { switchTab('sdr'); });

  $('theme-btn').addEventListener('click', function () {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
  $('lang-btn').addEventListener('click', function () {
    setLang(state.lang === 'ar' ? 'en' : 'ar');
  });

  $('quick-chips').addEventListener('click', function (e) {
    var c = e.target && e.target.closest ? e.target.closest('.qchip') : null;
    if (!c) return;
    var k = c.getAttribute('data-chip');
    if (k === 'all') { state.fmFilters.chip = ''; }
    else if (state.fmFilters.chip === k) { state.fmFilters.chip = ''; }
    else { state.fmFilters.chip = k; }
    state.fmLive = false;
    state.fmLiveRows = [];
    state.fmLimit = FM_PAGE;
    renderChips();
    renderFM();
  });

  var fmTimer = null;
  $('qfm').addEventListener('input', function () {
    clearTimeout(fmTimer);
    var v = this.value;
    fmTimer = setTimeout(function () { state.fmFilters.q = v; fmClientRender(); }, 200);
  });
  $('fm-search-btn').addEventListener('click', searchFM);
  $('fm-clear-btn').addEventListener('click', clearFMFilters);
  $('fm-country').addEventListener('change',function(){state.fmFilters.country=this.value;fmClientRender();});
  $('fm-language').addEventListener('change',function(){state.fmFilters.language=this.value;fmClientRender();});
  $('fm-tag').addEventListener('change',function(){state.fmFilters.tag=this.value;fmClientRender();});
  ['country','language','tag'].forEach(function(kind){
    var search=$('fm-'+kind+'-search');
    if(search)search.addEventListener('input',function(){filterFacetOptions(kind);});
  });
  $('grid-fm').addEventListener('click', function (e) {
    var el = e.target;
    if (el && el.closest && el.closest('#fm-more')) {
      state.fmLimit += FM_PAGE;
      renderFM();
    }
  });

  var eibiTimer = null;
  $('eibi-q').addEventListener('input', function () {
    clearTimeout(eibiTimer);
    var v = this.value;
    eibiTimer = setTimeout(function () { state.eibiQ = v; renderEibi(); }, 200);
  });

  var qTimer = null;
  $('q').addEventListener('input', function () {
    clearTimeout(qTimer);
    var v = this.value;
    qTimer = setTimeout(function () { state.filters.q = v; renderSDR(); }, 150);
  });
  $('band').addEventListener('change', function () { state.filters.band = this.value; renderSDR(); });
  $('sort').addEventListener('change', function () { state.filters.sort = this.value; renderSDR(); });
  $('online-only').addEventListener('change', function () { state.filters.onlineOnly = this.checked; renderSDR(); });
  $('free-only').addEventListener('change', function () { state.filters.freeOnly = this.checked; renderSDR(); });
  $('minsnr').addEventListener('change', function () { state.filters.minSnr = Number(this.value) || 0; renderSDR(); });
}

function init() {
  state.favs = loadFavs();
  initUI();
  initPlayers();
  setTheme('dark');
  try {
    var savedTheme = localStorage.getItem('ra-theme');
    var savedLang = localStorage.getItem('ra-lang');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
    setLang(savedLang === 'en' ? 'en' : 'ar');
  } catch (e) { setLang('ar'); }
  loadKiwi();
  loadSpace();
  loadEibi();
  if (window.requestIdleCallback) {
    window.requestIdleCallback(function () { loadStations(); });
  } else {
    setTimeout(loadStations, 300);
  }
  initResume();
  initVisitorBox();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
}

document.addEventListener('DOMContentLoaded', init);
