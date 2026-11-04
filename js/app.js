'use strict';

/* Radio Atlas frontend — vanilla JS, no deps */

var RB_APIS = [
  'https://de1.api.radio-browser.info/json',
  'https://de2.api.radio-browser.info/json',
  'https://nl1.api.radio-browser.info/json'
];
var FM_PAGE = 120;
var LANGUAGE_ALIASES = {
  arabic:['arabic','ar','arab','العربية','العربيه','عربي','عربية'],
  english:['english','en','انجليزي','انجليزيه','الانجليزيه','الانجليزية','إنجليزي','الإنجليزية'],
  french:['french','fr','francais','فرنسي','فرنسيه','الفرنسيه','الفرنسية'],
  spanish:['spanish','es','espanol','castellano','castilian','اسباني','إسباني','اسبانيه','الأسبانية'],
  german:['german','de','deutsch','deutsche','الماني','ألماني','المانيه','الألمانية'],
  portuguese:['portuguese','pt','portugues','برتغالي','برتغاليه'],
  russian:['russian','ru','russkiy','rus','русский','روسي','روسيه'],
  turkish:['turkish','tr','turkce','تركي','تركيه'],
  persian:['persian','farsi','fa','dari','فارسي','فارسی','پارسي'],
  urdu:['urdu','ur','اردو'], hindi:['hindi','hi','هندي','हिन्दी'],
  chinese:['chinese','zh','mandarin','cantonese','putonghua','中文','صيني','صينيه'],
  japanese:['japanese','ja','nihongo','日本語','ياباني','يابانيه'], korean:['korean','ko','hangul','한국어','كوري'],
  italian:['italian','it','italiano','ايطالي','إيطالي','ايطاليه'],
  dutch:['dutch','nl','nederlands','هولندي','هولنديه'],
  polish:['polish','pl','polski','بولندي'], greek:['greek','el','ellinika','ελληνικα','ελληνικά','يوناني'],
  swahili:['swahili','sw','kiswahili'],
  indonesian:['indonesian','id','in','bahasa indonesia'], malay:['malay','ms','bahasa melayu','melayu'],
  bengali:['bengali','bn','bangla','বাংলা'],
  kurdish:['kurdish','ku','kurdi','sorani','كردي','كرديه'],
  ukrainian:['ukrainian','uk','ukrainska','українська','اوكراني','أوكراني'],
  romanian:['romanian','ro','romana','روماني'],
  swedish:['swedish','sv','svenska'], norwegian:['norwegian','no','norsk'], finnish:['finnish','fi','suomi'],
  danish:['danish','da','dansk'], czech:['czech','cs','cestina'], hungarian:['hungarian','hu','magyar'],
  serbian:['serbian','sr','srpski','српски'], croatian:['croatian','hr','hrvatski'],
  bulgarian:['bulgarian','bg','bulgarski','български'],
  thai:['thai','th','ไทย'], vietnamese:['vietnamese','vi','tieng viet'],
  hebrew:['hebrew','he','ivrit','עברית','عبري','عبريه'],
  tigrinya:['tigrinya','tigrigna'], amharic:['amharic','am'], somali:['somali','so'],
  hausa:['hausa','ha'], yoruba:['yoruba','yo'], igbo:['igbo','ig'],
  zulu:['zulu','zu'], xhosa:['xhosa','xh'], wolof:['wolof'],
  fula:['fula','fulfulde','peul'], oromo:['oromo','afaan oromo'],
  filipino:['filipino','tagalog','tl','pilipino'],
  tamil:['tamil','ta','تاميلي'], telugu:['telugu','te'], marathi:['marathi','mr'],
  punjabi:['punjabi','pa'], gujarati:['gujarati','gu'], kannada:['kannada','kn'],
  malayalam:['malayalam','ml'], nepali:['nepali','ne'], sinhala:['sinhala','si'],
  pashto:['pashto','ps','pashtu','pushto','بشتو'],
  azerbaijani:['azerbaijani','az','azeri'], kazakh:['kazakh','kk'], uzbek:['uzbek','uz','ozbek'],
  georgian:['georgian','ka','kartuli'], armenian:['armenian','hy','hayeren','ارمني','أرمني'],
  albanian:['albanian','sq','shqip'], macedonian:['macedonian','mk','makedonski'],
  slovenian:['slovenian','sl','slovensko','slovene'], slovak:['slovak','sk','slovensky','slovencina'],
  bosnian:['bosnian','bs','bosanski'], lithuanian:['lithuanian','lt','lietuviu'],
  latvian:['latvian','lv','latviesu'], estonian:['estonian','et','eesti'],
  icelandic:['icelandic','is','islenska'], irish:['irish','ga','gaeilge'],
  welsh:['welsh','cy','cymraeg'], catalan:['catalan','ca','catala'],
  galician:['galician','gl','galego'], basque:['basque','eu','euskara'],
  maltese:['maltese','mt','malti'], afrikaans:['afrikaans','af'],
  luxembourgish:['luxembourgish','lb','letzebuergesch'], esperanto:['esperanto','eo'],
  amazigh:['amazigh','berber','tamazight','kabyle','tarifit','tachelhit','chleuh','أمازيغية'],
  creole:['creole','kreyol','haitian creole','pidgin'],
  quechua:['quechua','qu'], guarani:['guarani','gn'], aymara:['aymara','ay'],
  burmese:['burmese','my'], khmer:['khmer','km'], lao:['lao','lo'], mongolian:['mongolian','mn']
};
/* Every alias entry is pre-normalized (lowercase, accents stripped) and folded
   into one flat lookup so canonicalLanguage stays a single map access. */
var LANGUAGE_ALIAS_INDEX = (function () {
  var index = {};
  for (var key in LANGUAGE_ALIASES) {
    index[key] = key;
    for (var i = 0; i < LANGUAGE_ALIASES[key].length; i++) {
      index[LANGUAGE_ALIASES[key][i]] = key;
    }
  }
  return index;
})();
var LANGUAGE_LABELS = {
  ar:{arabic:'عربي',english:'إنجليزي',french:'فرنسي',spanish:'إسباني',german:'ألماني',portuguese:'برتغالي',
    italian:'إيطالي',dutch:'هولندي',russian:'روسي',turkish:'تركي',persian:'فارسي',urdu:'أردو',hindi:'هندي',
    chinese:'صيني',japanese:'ياباني',korean:'كوري',polish:'بولندي',greek:'يوناني',swahili:'سواحيلي',
    indonesian:'إندونيسي',malay:'ملايوي',bengali:'بنغالي',kurdish:'كردي',ukrainian:'أوكراني',romanian:'روماني',
    swedish:'سويدي',norwegian:'نرويجي',finnish:'فنلندي',danish:'دنماركي',czech:'تشيكي',hungarian:'مجري',
    serbian:'صربي',croatian:'كرواتي',bulgarian:'بلغاري',thai:'تايلاندي',vietnamese:'فيتنامي',hebrew:'عبري',
    tigrinya:'تجريني',amharic:'أمهري',somali:'صومالي',hausa:'هوسا',yoruba:'يوروبا',igbo:'إيبو',zulu:'زولو',
    xhosa:'خوسا',wolof:'وولوف',fula:'فولاني',oromo:'أورومو',filipino:'فلبيني',tamil:'تاميلي',telugu:'تيلوغو',
    marathi:'مراثي',punjabi:'بنجابي',gujarati:'غوجاراتي',kannada:'كانادي',malayalam:'ماليالامية',nepali:'نيبالي',
    sinhala:'سنهالي',pashto:'باشتو',azerbaijani:'أذري',kazakh:'كازاخي',uzbek:'أوزبكي',georgian:'جورجي',
    armenian:'أرميني',albanian:'ألباني',macedonian:'مقدوني',slovenian:'سلوفيني',slovak:'سلوفاكي',bosnian:'بوسني',
    lithuanian:'ليتواني',latvian:'لاتفي',estonian:'إستوني',icelandic:'آيسلندي',irish:'أيرلندي',welsh:'ويلزي',
    catalan:'كتالوني',galician:'غاليسي',basque:'باسكي',maltese:'مالطي',afrikaans:'أفريكانية',
    luxembourgish:'لوكسمبورغي',esperanto:'إسبرانتو',amazigh:'أمازيغي',creole:'كريول',quechua:'كيتشوا',
    guarani:'غواراني',aymara:'أيمارا',burmese:'بورمي',khmer:'خميري',lao:'لاوي',mongolian:'منغولي'},
  en:{}
};
function languageLabel(key) {
  var labels = LANGUAGE_LABELS[state.lang] || {};
  if (labels[key]) return labels[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}
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
var fmSearchSequence = 0;
var fmSearchDebounceTimer = null;
var fmFacetAuto = {};

function cancelFMClientRender() {
  if (fmSearchDebounceTimer !== null) {
    clearTimeout(fmSearchDebounceTimer);
    fmSearchDebounceTimer = null;
  }
}

function scheduleFMClientRender() {
  cancelFMClientRender();
  fmSearchDebounceTimer = setTimeout(function () {
    fmSearchDebounceTimer = null;
    fmClientRender();
  }, 160);
}
function canonicalLanguage(value) {
  var raw=String(value||'').trim().toLowerCase();
  if(!raw)return '';
  /* Normalize hard before matching: strip Latin combining marks (Français →
     francais, čeština → cestina, Türkçe → turkce), Arabic tashkeel, stray
     apostrophes (O'zbek → ozbek) and collapse whitespace — so every spelling
     of the same language lands on ONE canonical key instead of showing up
     as several near-duplicate entries in the language filter. */
  try { raw=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,''); } catch(e) {}
  raw=raw.replace(/[\u064B-\u065F\u0670]/g,'').replace(/['\u2018\u2019`´]/g,'').replace(/\s+/g,' ').trim();
  return LANGUAGE_ALIAS_INDEX[raw] || raw;
}
function normalizeSearchText(value) {
  var text=String(value||'').toLocaleLowerCase();
  try { text=text.normalize('NFD').replace(/[\u0300-\u036f]/g,''); } catch(e) {}
  return text.replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').trim();
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
    locale: 'ar-EG',
    dateLocale: 'ar',
    dir: 'rtl',
    app_title: '📻 راديو أطلس',
    tagline: 'دليل بحث ذكي لأجهزة الاستقبال ومحطات البث المتاحة أونلاين',
    stat_total: 'جهاز استقبال',
    stat_online: 'أونلاين الآن',
    stat_listeners: 'مستمع حاليًا',
    stat_updated: 'آخر تحديث',
    tab_fm: '📻 محطات البث',
    tab_fav: '⭐ المفضلة',
    tab_rel: '🕋 ديني',
    tab_ar: '🌍 عربي',
    tab_eg: '🇪🇬 مصر',
    tab_sdr: 'أجهزة الاستقبال SDR',
    featured_title: 'الأشهر عالميًا وعربيًا',
    home_grid_title: '🏛 الرسمية · 🇪🇬 مصر',
    search_fm_ph: 'ابحث بالاسم أو الدولة أو اللغة أو الفئة…',
    fm_search_aria:'البحث عن محطات الراديو',
    fm_search_input_aria:'ابحث باسم المحطة أو الدولة أو اللغة أو الفئة',
    search_country_aria:'ابحث عن دولة',
    select_country_aria:'اختر الدولة',
    search_language_aria:'ابحث عن لغة',
    select_language_aria:'اختر اللغة',
    search_category_aria:'ابحث عن فئة',
    select_category_aria:'اختر الفئة',
    filter_country:'الدولة',
    filter_language:'اللغة',
    filter_category:'الفئة',
    filter_rx_type:'نوع الاستقبال',
    filter_rx_type_aria:'اختر نوع الاستقبال',
    all_types:'الكل',
    kiwi_type:'KiwiSDR',
    websdr_type:'WebSDR',
    owrx_type:'OpenWebRX',
    fm_search_note:'البحث الفوري داخل الكتالوج المحمّل؛ «بحث مباشر» يجلب نتائج أحدث من المصدر.',
    search_country_ph:'ابحث عن دولة…',
    search_language_ph:'ابحث عن لغة…',
    search_tag_ph:'ابحث عن فئة…',
    all_countries: '🌍 كل الدول',
    all_languages: '🗣 كل اللغات',
    all_tags: '🏷 كل الفئات',
    live_search: 'بحث مباشر',
    clear_filters: 'مسح الفلاتر',
    install_aria: 'ثبّت التطبيق على جهازك',
    install_done: '✅ تم تثبيت التطبيق',
    install_ios_hint: 'على الآيفون: زر المشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية» لتثبيت التطبيق',
    hero_play: '▶ شغّل آخر محطة',
    hero_play_aria: 'تشغيل آخر محطة استمعت إليها',
    alive_only: 'شغالة بس',
    saver_aria: 'وضع توفير البيانات — بث بجودة أخف',
    saver_on: '✅ توفير البيانات شغال — البث بأقل جودة',
    saver_off: '🔋 توفير البيانات متوقف',
    title_playing: '{n} ▶ | راديو أطلس',
    quick_bar_aria: 'الأشهر — تشغيل سريع من أي صفحة',
    fm_hint: 'الرئيسية تعرض الأشهر والرسمية ومحطات مصر فقط — ابحث أو استخدم الفلاتر لتصفح الكتالوج الكامل (أكثر من 56 ألف محطة). زر «بحث مباشر» يستعلم لحظيًا من المصدر.',
    chip_all: '✨ الكل',
    chip_fav: '⭐ المفضلة',
    chip_arabic: '🎙 عربي',
    chip_news: '📰 أخبار',
    chip_quran: '🕌 قرآن',
    chip_sports: '⚽ رياضة',
    chip_music: '🎵 موسيقى',
    searching_live: 'جاري البحث المباشر من المصدر…',
    live_failed: 'البحث المباشر فشل — استخدم الفلترة المحلية الفورية.',
    more_btn: 'عرض المزيد — باقي {n} محطة',
    listen: '▶ استمع',
    tab_map: '🗺️ الخريطة',
    trending_title: '🔥 الأكثر سماعاً',
    resume: 'آخر محطة — دوس تشغيل للاستكمال',
    visitors: 'إجمالي الزيارات',
    you_from: 'أنت تزور من',
    stream_ok: 'استجاب للبث في فحص التحديث الأخير',
    stream_dead: 'لم يستجب في فحص التحديث الأخير — ممكن يشتغل من متصفحك',
    chip_alive: '✔ شغال',
    chip_dead: '✖ لا يستجيب',
    stream_maybe: 'سيرفرنا مأقدرنش يوصله (بلوك جغرافي أو قيود شبكة) — لكن ممكن يشتغل عندك عادي، جرّبها',
    chip_maybe: '؟ جرّبها',
    toast_tap_play:'اضغط تشغيل من مشغل الصوت لبدء البث.',
    open_official_site:'الموقع الرسمي ↗',
    fav_on: 'أضفتها للمفضلة ⭐',
    fav_off: 'شيلتها من المفضلة',
    share_aria: 'مشاركة رابط المحطة',
    random_aria: 'تشغيل محطة عشوائية من نتائج البحث الحالية',
    theme_aria: 'الوضع الداكن/الفاتح',
    fav_aria: 'أضف/أزل من المفضلة',
    doc_title: 'راديو أطلس — بث مباشر وأجهزة استقبال',
    random_station: '🎲 محطة عشوائية',
    report_aria: 'بلّغ عن محطة مش شغالة',
    history_title: 'سجل الاستماع',
    history_aria: 'تشغيل من سجل الاستماع',
    palette_aria: 'بحث سريع (Ctrl+K)',
    sources: 'المصادر:',
    offline_footer: 'تُحدَّث الإذاعات يوميًا وبيانات SDR كل ٦ ساعات.'
  },
  en: {
    locale: 'en-US',
    dateLocale: 'en',
    dir: 'ltr',
    app_title: '📻 Radio Atlas',
    tagline: 'Smart search directory for online receivers and broadcast stations',
    stat_total: 'Receivers',
    stat_online: 'Online now',
    stat_listeners: 'Current listeners',
    stat_updated: 'Updated',
    tab_fm: '📻 Broadcast stations',
    tab_fav: '⭐ Favorites',
    tab_rel: '🕋 Religious',
    tab_ar: '🌍 Arabic',
    tab_eg: '🇪🇬 Egypt',
    tab_sdr: 'SDR Receivers',
    featured_title: 'Most popular worldwide & Arabic',
    home_grid_title: '🏛 Official · 🇪🇬 Egypt',
    search_fm_ph: 'Search by station, country, language, or category…',
    fm_search_aria:'Search radio stations',
    fm_search_input_aria:'Search by station, country, language, or category',
    search_country_aria:'Search countries',
    select_country_aria:'Select a country',
    search_language_aria:'Search languages',
    select_language_aria:'Select a language',
    search_category_aria:'Search categories',
    select_category_aria:'Select a category',
    filter_rx_type_aria:'Select receiver type',
    filter_country:'Country',
    filter_language:'Language',
    filter_category:'Category',
    filter_rx_type:'Receiver type',
    all_types:'All',
    kiwi_type:'KiwiSDR',
    websdr_type:'WebSDR',
    owrx_type:'OpenWebRX',
    fm_search_note:'Instant search uses the loaded catalog; Live Search fetches fresher results from the source.',
    search_country_ph:'Search countries…',
    search_language_ph:'Search languages…',
    search_tag_ph:'Search categories…',
    all_countries: '🌍 All countries',
    all_languages: '🗣 All languages',
    all_tags: '🏷 All genres',
    live_search: 'Live search',
    clear_filters: 'Clear filters',
    install_aria: 'Install the app on your device',
    install_done: '✅ App installed',
    install_ios_hint: 'On iPhone: tap Share ⬆️ then "Add to Home Screen" to install the app',
    hero_play: '▶ Play last station',
    hero_play_aria: 'Play the last station you listened to',
    alive_only: 'Working only',
    saver_aria: 'Data saver mode — lighter stream quality',
    saver_on: '✅ Data saver on — streaming at the lowest quality',
    saver_off: '🔋 Data saver off',
    title_playing: '{n} ▶ | Radio Atlas',
    quick_bar_aria: 'Most famous — quick play from any tab',
    fm_hint: 'Home shows only the most famous, official and Egyptian stations — search or use the filters to browse the full 56k+ catalog. Live Search queries the source in real time.',
    chip_all: '✨ All',
    chip_fav: '⭐ Favorites',
    chip_arabic: '🎙 Arabic',
    chip_news: '📰 News',
    chip_quran: '🕌 Quran',
    chip_sports: '⚽ Sports',
    chip_music: '🎵 Music',
    searching_live: 'Live search in progress…',
    live_failed: 'Live search failed — use the instant local filtering.',
    more_btn: 'Show more — {n} stations left',
    listen: '▶ Listen',
    tab_map: '🗺️ Map',
    trending_title: '🔥 Trending now',
    resume: 'Last station — press play to resume',
    visitors: 'Total page views',
    you_from: 'You are visiting from',
    stream_ok: 'Responded in the latest refresh probe',
    stream_dead: 'Did not respond in the latest refresh probe — may still play in your browser',
    chip_alive: '✔ live',
    chip_dead: '✖ no reply',
    stream_maybe: 'Our probe could not reach it (geo or network block) — it may still play fine for you, give it a try',
    chip_maybe: '? Try it',
    toast_tap_play:'Press Play in the audio controls to start the stream.',
    open_official_site:'Official website ↗',
    fav_on: 'Added to favorites ⭐',
    fav_off: 'Removed from favorites',
    share_aria: 'Share station link',
    random_aria: 'Play a random station from the current results',
    theme_aria: 'Toggle dark/light theme',
    fav_aria: 'Add/remove station from favorites',
    doc_title: 'Radio Atlas — live radio & receivers',
    random_station: '🎲 Random station',
    report_aria: 'Report a broken station',
    history_title: 'Recently played',
    history_aria: 'Play from history',
    palette_aria: 'Quick search (Ctrl+K)',
    sources: 'Sources:',
    offline_footer: 'Stations refresh daily; SDR data refreshes every 6 hours.'
  }
};

/* ================= lazy modules (P1-2: app.js split into ES modules) ================= */

var RA_MODULES = {};
var RA_MODULE_PROMISES = {};
function loadModule(name) {
  if (RA_MODULES[name]) return Promise.resolve(RA_MODULES[name]);
  if (!RA_MODULE_PROMISES[name]) {
    RA_MODULE_PROMISES[name] = import('./modules/' + name + '.mjs').then(function (m) {
      if (!RA_MODULES[name]) m.boot();
      return RA_MODULES[name];
    });
    RA_MODULE_PROMISES[name].catch(function () { RA_MODULE_PROMISES[name] = null; });
  }
  return RA_MODULE_PROMISES[name];
}
function raMergeStr(pack) {
  for (var lang in pack) {
    var src = pack[lang];
    var dst = STR[lang] || (STR[lang] = {});
    for (var key in src) dst[key] = src[key];
  }
}
function raModuleCall(name, fn, a, b) {
  var m = RA_MODULES[name];
  if (m && typeof m[fn] === 'function') return m[fn](a, b);
}

/* Thin stubs: the real implementations live in the lazy modules.
   Callers across app.js keep using these names unchanged. */
function play(url, name) { loadModule('player').then(function (m) { m.play(url, name); }); }
function setMedia(name) { loadModule('player').then(function (m) { m.setMedia(name); }); }
function loadHlsLib(cb) { loadModule('player').then(function (m) { m.loadHlsLib(cb); }); }
function attachHls(url, generation, station) {
  var m = RA_MODULES.player;
  return m ? m.attachHls(url, generation, station) : false;
}
function closeAlarmModal() { raModuleCall('player', 'closeAlarmModal'); }
function openSDR(url, name) { loadModule('sdr').then(function (m) { m.openSDR(url, name); }); }
function closeSDR() { raModuleCall('sdr', 'closeSDR'); }
function openKiwiAudio(url, name) { loadModule('sdr').then(function (m) { m.openKiwiAudio(url, name); }); }
function closeKiwiAudio() { raModuleCall('sdr', 'closeKiwiAudio'); }
function renderSDR() { raModuleCall('sdr', 'renderSDR'); }
function renderWspr() { raModuleCall('sdr', 'renderWspr'); }
function renderWebSdrs() { raModuleCall('sdr', 'renderWebSdrs'); }
function renderSatnogs() { raModuleCall('sdr', 'renderSatnogs'); }
function renderSpace() { raModuleCall('sdr', 'renderSpace'); }
function renderEibi() { raModuleCall('sdr', 'renderEibi'); }
function buildBandFilter() { raModuleCall('sdr', 'buildBandFilter'); }
function renderMap() { raModuleCall('map', 'renderMap'); }
function renderFav() { raModuleCall('regions', 'renderFav'); }
function renderEG() { raModuleCall('regions', 'renderEG'); }
function renderAR() { raModuleCall('regions', 'renderAR'); }
function renderRel() { raModuleCall('regions', 'renderRel'); }
function shareStation(url, name) { loadModule('tools').then(function (m) { m.shareStation(url, name); }); }
function reportStation(url, name) { loadModule('tools').then(function (m) { m.reportStation(url, name); }); }
function playRandomStation() { loadModule('tools').then(function (m) { m.playRandomStation(); }); }
function handleShareHash() { loadModule('tools').then(function (m) { m.handleShareHash(); }); }
function paletteOpen() { loadModule('tools').then(function (m) { m.paletteOpen(); }); }
function paletteClose() { raModuleCall('tools', 'paletteClose'); }


var state = {
  lang: 'ar',
  theme: 'dark',
  favs: {},
  receivers: [],
  updated: null,
  geo: null,
  webLimits: { websdr: 150, owrx: 150, satnogs: 150 },
  filters: { q: '', band: 'all', sort: 'snr', onlineOnly: true, freeOnly: false, minSnr: 0, httpsOnly: false, rxType: 'all' },
  fm: [],
  fmFilters: { q: '', country: '', language: '', tag: '', chip: '' },
  fmLimit: FM_PAGE,
  fmLive: false,
  fmLiveRows: [],
  eibi: [],
  eibiQ: '',
  eibiBand: 'all',
  streamChecks: {},
  space: null,
  wspr: null,
  webSdrs: null,
  satnogs: null,
  landMap: null,
  mapLayers: { kiwi: true, websdr: true, owrx: true, satnogs: true, aircraft: true, visitors: true },
  grayline: true,
  currentName: '',
  activeTab: 'fm',
  aircraft: [],
  playbackStation: null,
  playbackSources: [],
  playbackIndex: 0,
  playbackGeneration: 0,
  playbackAttemptFailed: false,
  playerQueue: [],
  playerVolume: 100,
  playerMuted: false,
  dataSaver: false,
  history: [],
  palette: { results: [] }
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
  return fetch(url, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function safeHttpUrl(value) {
  try {
    var u = new URL(String(value || '').trim());
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return '';
    return u.toString();
  } catch (e) { return ''; }
}

function safeHttpsUrl(value) {
  var url = safeHttpUrl(value);
  return url && /^https:/i.test(url) ? url : '';
}

/* Cloudflare Worker relay (see proxy/README.md). Empty until the worker is
   deployed; when set it becomes the last-resort playback source for streams
   that fail direct playback (CORS or geo blocks). */
var STREAM_PROXY = '';

function proxyStreamUrl(url) {
  if (!STREAM_PROXY || !url) return '';
  return STREAM_PROXY.replace(/\/+$/, '') + '/stream?url=' + encodeURIComponent(url);
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
  var ariaEls = document.querySelectorAll('[data-i18n-aria]');
  for (var k = 0; k < ariaEls.length; k++) ariaEls[k].setAttribute('aria-label', t(ariaEls[k].getAttribute('data-i18n-aria')));
  $('lang-btn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
  document.documentElement.lang = state.lang;
  document.documentElement.dir = STR[state.lang] ? STR[state.lang].dir : 'rtl';
  document.title = t('doc_title');
}

function rebuildDynamic() {
  buildBandFilter();
  renderSDR();
  buildFMFacets();
  renderChips();
  renderFM();
  renderFav();
  renderEG();
  renderAR();
  renderRel();
  renderSpace();
  renderWspr();
  renderWebSdrs();
  renderSatnogs();
  renderHistory();
  renderMap();
  if (state.currentName && !$('player').hidden) {
    $('player-name').textContent = '▶ ' + state.currentName;
  }
  updateDocTitle();
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
  if (meta) meta.setAttribute('content', th === 'dark' ? '#0f0e13' : '#f7f2e9');
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
  renderFav();
  renderEG();
  renderAR();
  renderRel();
}

/* ================= FM / Broadcast ================= */


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
  var langItems=Object.keys(langs).map(function(k){
    return {value:k,count:langs[k],label:languageLabel(k)+' ('+langs[k]+')'};
  }).sort(function(a,b){ return b.count-a.count || a.value.localeCompare(b.value); });
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
  var q=normalizeSearchText(search.value),selected=state.fmFilters[kind]||'';
  var options=FACET_OPTIONS[kind].filter(function(item){
    return item.value===selected||!q||normalizeSearchText(item.label+' '+item.value).indexOf(q)!==-1;
  });
  var placeholder=kind==='country'?t('all_countries'):(kind==='language'?t('all_languages'):t('all_tags'));
  fillSelect(select,placeholder,options);select.value=selected;
}
function facetLiveApply(kind) {
  var search = $('fm-' + kind + '-search');
  if (!search) return;
  var q = normalizeSearchText(search.value);
  if (!q) {
    if (fmFacetAuto[kind]) { fmFacetAuto[kind] = false; state.fmFilters[kind] = ''; scheduleFMClientRender(); }
    return;
  }
  var opts = FACET_OPTIONS[kind] || [];
  var match = null;
  for (var i = 0; i < opts.length; i++) {
    var hay = opts[i].label + ' ' + opts[i].value + ' ' + (LANGUAGE_ALIASES[opts[i].value] || []).join(' ');
    if (normalizeSearchText(hay).indexOf(q) !== -1) { match = opts[i]; break; }
  }
  if (!match) {
    if (fmFacetAuto[kind]) { fmFacetAuto[kind] = false; state.fmFilters[kind] = ''; scheduleFMClientRender(); }
    return;
  }
  if (state.fmFilters[kind] !== match.value) {
    state.fmFilters[kind] = match.value;
    fmFacetAuto[kind] = true;
    var sel = $('fm-' + kind);
    if (sel) sel.value = match.value;
    scheduleFMClientRender();
  }
}

function normalizeFm(s) {
  return {
    name:s.name||'—',url:safeHttpUrl(s.url_resolved||s.url||''),cc:String(s.countrycode||s.cc||'').toUpperCase(),
    language:normalizeLanguages(s.language||''),tags:normalizeCategories(s.tags||''),official:isOfficialStation(s),
    codec:s.codec||'',bitrate:s.bitrate||0,
    fallbacks:Array.isArray(s.fallbacks)?s.fallbacks.map(safeHttpsUrl).filter(Boolean):[],
    website:safeHttpUrl(s.website||s.officialUrl||''),
    tokenEndpoint:safeHttpsUrl(s.tokenEndpoint||''),
    tokenType:s.tokenType||''
  };
}

function cardFm(s) {
  var isFav = !!state.favs[s.url];
  var heart = '<button class="fav' + (isFav ? ' active' : '') + '" type="button" title="⭐" aria-pressed="' + (isFav ? 'true' : 'false') + '" aria-label="' + esc(t('fav_aria')) + '" data-fav-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '">' + (isFav ? '❤️' : '🤍') + '</button>';
  var shareBtn = '<button class="share" type="button" title="🔗" aria-label="' + esc(t('share_aria')) + '" data-share-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '">🔗</button>';
  var reportBtn = '<button class="report" type="button" title="🚩" data-report-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '" aria-label="' + esc(t('report_aria')) + '">🚩</button>';
  var chips = '';
  if (s.cc) chips += '<span class="chip">' + flagOf(s.cc) + ' ' + esc(regionName(s.cc, s.cc)) + '</span>';
  if (s.language) chips += '<span class="chip">🗣 ' + esc(s.language.split(', ').filter(Boolean).map(languageLabel).join('، ')) + '</span>';
  var allTags=String(s.tags||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
  var isOfficial=isOfficialStation(s);
  if(isOfficial)chips+='<span class="chip official">🏛 '+esc(state.lang==='ar'?'رسمي':'Official')+'</span>';
  var check=state.streamChecks?state.streamChecks[s.url]:null;
  if(check&&check.alive)chips+='<span class="chip ok" title="'+esc(t('stream_ok'))+'">'+esc(t('chip_alive'))+'</span>';
  else if(check&&check.maybe_alive)chips+='<span class="chip maybe" title="'+esc(t('stream_maybe'))+'">'+esc(t('chip_maybe'))+'</span>';
  else if(check&&!check.alive)chips+='<span class="chip dead" title="'+esc(t('stream_dead'))+'">'+esc(t('chip_dead'))+'</span>';
  var shownTags=allTags.slice(0,3);
  shownTags.forEach(function (x) { chips += '<span class="chip tag">🏷 ' + esc(x) + '</span>'; });
  var meta = [s.codec, s.bitrate ? s.bitrate + 'kbps' : ''].filter(Boolean).join(' · ');
  var streamUrl = safeHttpUrl(s.url);
  var streamAction = streamUrl && /^https:/i.test(streamUrl)
    ? '<button class="open play" type="button" data-url="' + esc(streamUrl) + '" data-name="' + esc(s.name) + '">' + esc(t('listen')) + '</button>'
    : (streamUrl ? '<a class="open http-warning" href="' + esc(streamUrl) + '" target="_blank" rel="noopener noreferrer">HTTP — ' + esc(state.lang==='ar'?'فتح خارجي فقط':'open externally only') + '</a>' : '<span class="meta">' + esc(state.lang==='ar'?'رابط البث غير صالح':'Invalid stream URL') + '</span>');
  return '<article class="card">' +
    '<div class="card-head"><h3>' + esc(s.name) + '</h3>' + heart + shareBtn + reportBtn + '</div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
    streamAction +
    (safeHttpUrl(s.website) ? '<a class="open official-link" href="' + esc(safeHttpUrl(s.website)) + '" target="_blank" rel="noopener noreferrer">' + esc(t('open_official_site')) + '</a>' : '') +
    '</article>';
}

function filterFM() {
  var f = state.fmFilters;
  var q = normalizeSearchText(f.q);
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
      var country=regionName(s.cc,s.cc);
      var haystack=normalizeSearchText([s.name,s.language,s.tags,s.cc,country].join(' '));
      if (haystack.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function currentFMList() {
  var list = state.fmLive ? filterFM().concat(state.fmLiveRows) : filterFM();
  var seen = Object.create(null);
  list = list.filter(function (station) {
    var url = safeHttpUrl(station.url);
    if (!url) return false;
    var key = url.replace(/#.*$/, '').toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  return list.sort(function(a,b){
    if(isOfficialStation(a)!==isOfficialStation(b))return isOfficialStation(a)?-1:1;
    return 0;
  });
}

function isHomeMode() {
  var f = state.fmFilters;
  return !f.q && !f.country && !f.language && !f.tag && !f.chip && !state.fmLive;
}

/* ===== الصفحة الرئيسية: شبكة «الرسمية · مصر» — إذاعات مصر فقط ===== */
/* إصلاح PR #114: القسم كان بياخد كل الرسميين من أي دولة (BBC/France...) تحت عنوان
   «مصر» + مكررات نفس المحطة + أسماء نُتفة (X_X...) + كروت فيديو Dailymotion
   بتتصدر القابل للتشغيل. الترتيب الجديد: مصر فقط، بلا مكررات (دمج بالاسم
   المطبّع + الاحتواء)، بلا أسماء نُتفة، والقابل للتشغيل داخل التطبيق أولًا. */
function isHomeJunkName(name) {
  var n = normalizeSearchText(name);
  if (!n) return true;
  if (n.replace(/[^\u0600-\u06FFa-z0-9]/g, '').length < 3) return true;
  if (n.indexOf('_') !== -1 && n.indexOf(' ') === -1) return true;
  return false;
}
function homeNameKey(s) {
  /* مفتاح مقارنة الأسماء: تطبيع كامل + توحيد ة→ه ئ→ي ؤ→و + شيل رقم/تردد جانبي */
  var n = normalizeSearchText(s.name)
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0626/g, '\u064A')
    .replace(/\u0624/g, '\u0648');
  return n.replace(/[\s.-]*\d+(?:\.\d+)?$/, '').trim();
}
function homeList() {
  var seen = {};
  var feat = featuredList();
  for (var i = 0; i < feat.length; i++) seen[feat[i].url] = 1;
  var out = [];
  var st = state.fm || [];
  for (var j = 0; j < st.length; j++) {
    var s = st[j];
    if (seen[s.url] || s.cc !== 'EG' || isHomeJunkName(s.name)) continue;
    seen[s.url] = 1; out.push(s);
  }
  /* أفضلية الترتيب: قابل للتشغيل داخل التطبيق ← رسمي ← HTTPS ← أعلى bitrate */
  out.sort(function (a, b) {
    var da = isDmEmbed(a.url) ? 1 : 0, db = isDmEmbed(b.url) ? 1 : 0;
    if (da !== db) return da - db;
    var oa = isOfficialStation(a) ? 0 : 1, ob = isOfficialStation(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    var ha = /^https:/i.test(a.url) ? 0 : 1, hb = /^https:/i.test(b.url) ? 0 : 1;
    if (ha !== hb) return ha - hb;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });
  /* دمج المكررات: نفس الاسم بعد التطبيع، أو اسم محتوى داخل اسم مُقبل بالفعل */
  var keys = [];
  var byKey = {};
  var deduped = [];
  for (var k = 0; k < out.length; k++) {
    var it = out[k];
    var key = homeNameKey(it);
    if (!key) { deduped.push(it); continue; }
    if (byKey[key]) continue;
    var dupe = false;
    for (var m = 0; m < keys.length; m++) {
      if (keys[m].length >= 8 && (keys[m].indexOf(key) !== -1 || key.indexOf(keys[m]) !== -1)) { dupe = true; break; }
    }
    if (dupe) continue;
    byKey[key] = 1; keys.push(key); deduped.push(it);
  }
  return deduped;
}


function renderFM() {
renderFeatured();
renderQuickBar();
  var grid = $('grid-fm');
  var home = isHomeMode();
  var list = fmAliveSort(fmAliveFiltered(home ? homeList() : currentFMList()));
  state.playerQueue = list.filter(function (s) { return !!safeHttpsUrl(s.url); });
  var homeTitle = $('home-grid-title');
  if (homeTitle) homeTitle.hidden = !home;
  $('count-fm').textContent = t('stations').replace('{n}', fmtNum(list.length));
  if (!list.length) {
    grid.innerHTML = '<div class="empty">' + esc(t('no_match_fm')) + '</div>';
    return;
  }
  var shown = list.slice(0, state.fmLimit);
  var html = shown.map(cardFm).join('');
  if (list.length > state.fmLimit) {
    html += '<div class="more-wrap"><button id="fm-more" class="btn ghost" type="button">' + esc(t('more_btn').replace('{n}', fmtNum(list.length - state.fmLimit))) + '</button></div>';
  }
  grid.innerHTML = html;
}

/* ===== P1-1: differential catalog via IndexedDB ===== */
/* الزيارة الثانية بتنزل دلتا يومية صغيرة بدل الكتالوج كاملًا كل مرة.
   المصدر: data/stations.manifest.json (version/count/keep) وسلسلة
   data/stations_delta/<version>.json — الـ crawler بيكتبهم مع كل تشغيل
   بيانات ناجح. لو IndexedDB أو الشبكة فشلوا، بنرجع تلقائيًا للمسار
   القديم (head ثم الكتالوج الكامل) من غير أي كسر. */
var CATALOG_DB_NAME = 'radio-atlas-catalog';
var CATALOG_DB_STORE = 'catalog';
var CATALOG_DELTA_FALLBACK_KEEP = 3;

function stationKey(value) {
  /* توأم دالة الـ crawler station_url_key: توحيد شكل الرابط ليطابق
     المفتاح نفسه على الطرفين (سجل اختبار: tests/search.test.cjs). */
  var raw = String(value || '').trim();
  var u;
  try { u = new URL(raw); } catch (e) { return ''; }
  var scheme = u.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return '';
  if (!u.hostname || u.username || u.password) return '';
  var host = u.hostname.toLowerCase();
  if (u.port && !(scheme === 'http' && u.port === '80') && !(scheme === 'https' && u.port === '443')) {
    host += ':' + u.port;
  }
  return scheme + '://' + host + (u.pathname || '/') + (u.search || '');
}

function applyCatalogDelta(rows, delta) {
  /* تطبيق دلتا {added, updated, removed} على الصفوف المحفوظة:
     updated يعدل الصف في مكانه بنفس المفتاح، added يُلحق في النهاية،
     removed يشطب بالمفتاح. الحقول الناقصة تتعامل كفارغة. */
  var source = Array.isArray(rows) ? rows : [];
  var d = delta || {};
  var added = Array.isArray(d.added) ? d.added : [];
  var updated = Array.isArray(d.updated) ? d.updated : [];
  var removed = Array.isArray(d.removed) ? d.removed : [];
  var removedSet = {};
  var i;
  for (i = 0; i < removed.length; i++) removedSet[stationKey(removed[i])] = true;
  var byKey = {};
  for (i = 0; i < source.length; i++) byKey[stationKey(source[i].url)] = source[i];
  for (i = 0; i < updated.length; i++) {
    var upd = updated[i];
    var key = stationKey(upd && upd.url);
    if (!key || !upd) continue;
    if (byKey[key]) byKey[key] = upd;
    else source.push(upd);
  }
  var out = [];
  for (i = 0; i < source.length; i++) {
    var k = stationKey(source[i].url);
    if (removedSet[k]) continue;
    out.push(byKey[k] || source[i]);
  }
  for (i = 0; i < added.length; i++) {
    if (added[i]) out.push(added[i]);
  }
  return out;
}

function catalogDbOpen() {
  return new Promise(function (resolve, reject) {
    var request = window.indexedDB.open(CATALOG_DB_NAME, 1);
    request.onupgradeneeded = function () {
      request.result.createObjectStore(CATALOG_DB_STORE);
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error('idb open failed')); };
  });
}

function catalogDbGet(db, key) {
  return new Promise(function (resolve, reject) {
    var request = db.transaction(CATALOG_DB_STORE, 'readonly').objectStore(CATALOG_DB_STORE).get(key);
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error('idb get failed')); };
  });
}

function catalogDbPut(db, key, value) {
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(CATALOG_DB_STORE, 'readwrite');
    tx.objectStore(CATALOG_DB_STORE).put(value, key);
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error || new Error('idb put failed')); };
  });
}

function catalogIdbWrite(rows, version) {
  return catalogDbOpen().then(function (db) {
    return catalogDbPut(db, 'rows', rows).then(function () {
      return catalogDbPut(db, 'version', version);
    });
  });
}

function catalogIdbStoreFull(rows) {
  return fetchJSON('data/stations.manifest.json').then(function (manifest) {
    return catalogIdbWrite(rows, manifest && Number(manifest.version) || 0);
  }).catch(function () {
    return catalogIdbWrite(rows, 0);
  });
}

function catalogIdbRows() {
  if (!window.indexedDB) return Promise.resolve(null);
  return catalogDbOpen().then(function (db) {
    return catalogDbGet(db, 'rows').then(function (rows) {
      if (!rows || !rows.length) return null;
      return catalogDbGet(db, 'version').then(function (storedVersion) {
        var from = Number(storedVersion) || 0;
        return fetchJSON('data/stations.manifest.json').then(function (manifest) {
          if (!manifest || !manifest.version) return rows;
          var current = Number(manifest.version) || 0;
          if (!from || !current || current <= from) return rows;
          var keep = Number(manifest.keep) || CATALOG_DELTA_FALLBACK_KEEP;
          if (current - from > keep) return null;
          var chain = Promise.resolve(rows);
          for (var v = from + 1; v <= current; v++) {
            (function (version) {
              chain = chain.then(function (acc) {
                return fetchJSON('data/stations_delta/' + version + '.json').then(function (delta) {
                  return applyCatalogDelta(acc, delta);
                }, function () { return acc; });
              });
            })(v);
          }
          return chain.then(function (finalRows) {
            catalogIdbWrite(finalRows, current).catch(function () {});
            return finalRows;
          });
        }, function () { return rows; });
      });
    });
  }).catch(function () { return null; });
}

function finishStations(rows) {
  state.fm = rows.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
  state.featuredCache = null;
  buildFMFacets();
  renderFM();
  renderFav();
  renderEG();
  renderAR();
  renderRel();
  initTrending();
  initResume();
  loadStreamChecks();
  handleShareHash();
}

function loadStations() {
  return catalogIdbRows().then(function (hit) {
    if (hit) return finishStations(hit);
    return legacyLoadStations();
  });
}

function legacyLoadStations() {
  return fetchJSON('data/stations_head.json').then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      state.featuredCache = null;
      buildFMFacets();
      renderFM();
      renderFav();
      renderEG();
      renderAR();
      renderRel();
    }
  }).catch(function (e) {
    console.warn('stations head:', e);
  }).then(function () {
    return fetchJSON('data/stations.json');
  }).then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      state.featuredCache = null;
      buildFMFacets();
      catalogIdbStoreFull(data.stations).catch(function () {});
    }
  }).catch(function (e) { console.warn('stations snapshot:', e); }).then(function () {
    renderFM();
    renderFav();
    renderEG();
    renderAR();
    renderRel();
    initTrending();
    initResume();
    loadStreamChecks();
    handleShareHash();
  });
}

function loadStreamChecks() {
  fetchJSON('data/stream_checks.json').then(function (d) {
    if (d && d.results) { state.streamChecks = d.results; renderFM(); renderEG(); renderAR(); renderRel(); }
  }).catch(function () {});
}

/* ================= alive stream filters (shared by FM and the regions module) ================= */


function fmAliveFiltered(list) {
  if (!state.fmFilters || !state.fmFilters.aliveOnly || !state.streamChecks) return list;
  return list.filter(function (s) {
    var c = state.streamChecks[s.url];
    return !!(c && (c.alive || c.maybe_alive));
  });
}

function egAliveRank(s) {
  var c = state.streamChecks ? state.streamChecks[s.url] : null;
  if (c && c.alive) return 0;
  if (c && c.maybe_alive) return 1;
  if (!c) return 2;
  return 3;
}

function fmAliveSort(list) {
  if (!state.streamChecks) return list;
  var any = false;
  for (var i = 0; i < list.length; i++) {
    if (state.streamChecks[list[i].url]) { any = true; break; }
  }
  if (!any) return list;
  return list.slice().sort(function (a, b) { return egAliveRank(a) - egAliveRank(b); });
}




function flagOf(cc) {
  try {
    return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
  } catch (e) { return ''; }
}


function fmClientRender() {
  fmSearchSequence += 1;
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
  cancelFMClientRender();
  var requestId = ++fmSearchSequence;
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
      if (requestId !== fmSearchSequence) return;
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
      if (requestId !== fmSearchSequence) return;
      $('grid-fm').innerHTML = '<div class="empty">' + esc(t('live_failed')) + '</div>';
    });
}

function clearFMFilters() {
  state.fmFilters = { q: '', country: '', language: '', tag: '', chip: '' };
  $('qfm').value = '';
  fmFacetAuto = {};
  ['country','language','tag'].forEach(function(kind){$('fm-'+kind+'-search').value='';filterFacetOptions(kind);});
  $('fm-country').value = '';
  $('fm-language').value = '';
  $('fm-tag').value = '';
  var aliveBox = $('alive-only');
  if (aliveBox) aliveBox.checked = false;
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

/* ================= EasyBroadcast tokens + stream URL resolution (core; unit-tested) ================= */


var easyBroadcastTokenCache = {};
function isHlsUrl(u) {
  return /\.m3u8(?:\?|$)/i.test(u || '');
}
function appendEasyBroadcastToken(url, tokenText) {
  var values = new URLSearchParams(String(tokenText || '').trim().replace(/^\?/, ''));
  if (!values.get('token')) throw new Error('EasyBroadcast token response did not include a token');
  var signed = new URL(url);
  ['token', 'expires', 'token_path'].forEach(function (key) {
    if (values.get(key)) signed.searchParams.set(key, values.get(key));
  });
  return signed.toString();
}
function resolvePlaybackUrl(url, station) {
  if (!station || !station.tokenEndpoint || station.tokenType !== 'easy_b') return Promise.resolve(url);
  var cleanUrl = new URL(url);
  ['token', 'expires', 'token_path'].forEach(function (key) { cleanUrl.searchParams.delete(key); });
  var unsignedUrl = cleanUrl.toString();
  var cacheKey = station.tokenEndpoint + '|' + station.url;
  var cached = easyBroadcastTokenCache[cacheKey];
  if (cached && cached.tokenText && cached.expires * 1000 > Date.now() + 30000) {
    return Promise.resolve(appendEasyBroadcastToken(unsignedUrl, cached.tokenText));
  }
  if (cached && cached.promise) {
    return cached.promise.then(function (tokenText) { return appendEasyBroadcastToken(unsignedUrl, tokenText); });
  }
  var endpoint = station.tokenEndpoint + '?url=' + encodeURIComponent(station.url || unsignedUrl);
  var entry = { tokenText: '', expires: 0, promise: null };
  entry.promise = fetch(endpoint, { cache: 'no-store' }).then(function (response) {
    if (!response.ok) throw new Error('Token endpoint HTTP ' + response.status);
    return response.text();
  }).then(function (tokenText) {
    var values = new URLSearchParams(String(tokenText || '').trim().replace(/^\?/, ''));
    entry.tokenText = tokenText;
    entry.expires = Number(values.get('expires')) || 0;
    entry.promise = null;
    return tokenText;
  }).catch(function (error) {
    delete easyBroadcastTokenCache[cacheKey];
    throw error;
  });
  easyBroadcastTokenCache[cacheKey] = entry;
  return entry.promise.then(function (tokenText) { return appendEasyBroadcastToken(unsignedUrl, tokenText); });
}
function isDmEmbed(url) {
  return /dailymotion\.com\/(?:embed\/video\/|video\/|player(?:\/[a-z0-9]+)?\.html)/.test(String(url || ''));
}

/* ================= listen history ================= */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('ra-history') || '[]') || []; } catch (e) { return []; }
}

function pushHistory(url, name) {
  if (!url) return;
  state.history = state.history.filter(function (h) { return h.url !== url; });
  state.history.unshift({ url: url, name: name || '' });
  if (state.history.length > 10) state.history.length = 10;
  try { localStorage.setItem('ra-history', JSON.stringify(state.history)); } catch (e) {}
  renderHistory();
}

function renderHistory() {
  var row = $('history-row');
  if (!row) return;
  if (!state.history.length) { row.hidden = true; row.innerHTML = ''; return; }
  var chips = '';
  state.history.slice(0, 10).forEach(function (h) {
    chips += '<button class="chip history-chip" type="button" data-history-url="' + esc(h.url) + '" data-history-name="' + esc(h.name) + '" aria-label="' + esc(t('history_aria')) + '">▶ ' + esc(h.name || h.url) + '</button>';
  });
  row.innerHTML = '<span class="history-label">' + esc(t('history_title')) + '</span>' + chips;
  row.hidden = false;
}

/* ================= featured home row (most famous stations) ================= */

var FEATURED = [
  { m: ['قرآن الكريم'] },
  { m: ['محمد السادس'] },
  { m: ['مونت كارلو', 'monte carlo'] },
  { m: ['الجزيرة الصوتية'] },
  { m: ['dw عربي', 'دويتشه'] },
  { m: ['bbc arabic', 'بي بي سي'] },
  { m: ['راديو سوا', 'radio sawa'] },
  { m: ['شام'] },
  { m: ['alarabiya', 'العربية'] },
  { m: ['nile fm'] },
  { m: ['نوجوم', 'nogoum'] },
  { m: ['9090'] },
  { m: ['bbc world service'] },
  { m: ['france inter'] },
  { m: ['radio france internationale', 'rfi'] },
  { m: ['deutschlandfunk'] },
  { m: ['npo radio 1', 'npo 1'] },
  { m: ['fip'] },
  { m: ['europe 1'] },
  { m: ['radio swiss jazz'] },
  { m: ['radio paradise'] },
  { m: ['groove salad'] },
  { m: ['kbs world'] },
  { m: ['vatican', 'الفاتيكان'] }
];

function featuredList() {
  if (state.featuredCache) return state.featuredCache;
  var out = [];
  var seen = {};
  var st = state.fm || [];
  for (var i = 0; i < FEATURED.length; i++) {
    var pats = FEATURED[i].m;
    for (var j = 0; j < st.length; j++) {
      var s = st[j];
      if (seen[s.url]) continue;
      if (!safeHttpUrl(s.url) || !/^https:/i.test(s.url)) continue;
      var nm = String(s.name || '').toLowerCase();
      var hit = false;
      for (var k = 0; k < pats.length; k++) { if (nm.indexOf(pats[k].toLowerCase()) >= 0) { hit = true; break; } }
      if (!hit) continue;
      seen[s.url] = 1;
      out.push(s);
      break;
    }
  }
  state.featuredCache = out;
  return out;
}

function renderFeatured() {
  var wrap = $('featured-wrap');
  if (!wrap) return;
  var list = featuredList();
  if (!list.length) { wrap.hidden = true; return; }
  var html = '';
  for (var i = 0; i < list.length; i++) html += cardFm(list[i]);
  $('featured-row').innerHTML = html;
  wrap.hidden = false;
}


/* Modal focus bookkeeping shared by the sdr and player modules. */

var previousSDRFocus = null;
function initResume() {
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { last = null; }
  if (!last || !safeHttpsUrl(last.url)) return;
  if (isDmEmbed(last.url)) return;
  var station = stationByUrl(last.url);
  state.playbackStation = station || { name: last.name || '', url: last.url };
  state.playbackSources = [last.url].concat(state.playbackStation.fallbacks || []);
  var resumeRelay = (station && station.tokenEndpoint && station.tokenType === 'easy_b') ? '' : proxyStreamUrl(last.url);
  if (resumeRelay && state.playbackSources.indexOf(resumeRelay) === -1) {
    state.playbackSources.push(resumeRelay);
  }
  state.playbackIndex = 0;
  state.playbackGeneration += 1;
  var generation = state.playbackGeneration;
  state.currentName = last.name || '';
  var a = $('audio');
  var ext = $('player-ext');
  if (ext) { ext.href = last.url; ext.hidden = false; }
  var official = $('player-official');
  if (official) {
    official.hidden = !(state.playbackStation && state.playbackStation.website);
    if (!official.hidden) official.href = state.playbackStation.website;
  }
  $('player').hidden = false;
  $('player-name').textContent = '⏸ ' + state.currentName + ' — ' + t('resume');
  if (isHlsUrl(last.url) && (state.playbackStation.tokenEndpoint || !a.canPlayType('application/vnd.apple.mpegurl'))) {
    loadHlsLib(function (loaded) {
      if (generation !== state.playbackGeneration || !loaded || !attachHls(last.url, generation, state.playbackStation)) return;
      a.preload = 'none';
    });
  } else {
    try { a.src = last.url; a.preload = 'none'; } catch (e) {}
  }
  setMedia(state.currentName);
}

function initPlayers() {
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var shBtn = el.closest('button.share');
    if (shBtn) {
      shareStation(shBtn.getAttribute('data-share-url'), shBtn.getAttribute('data-name'));
      return;
    }
    var repBtn = el.closest('button.report');
    if (repBtn) {
      reportStation(repBtn.getAttribute('data-report-url'), repBtn.getAttribute('data-name'));
      return;
    }
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
      return;
    }
    var kw = el.closest('button.kiwi-ws');
    if (kw) {
      openKiwiAudio(kw.getAttribute('data-url'), kw.getAttribute('data-name'));
    }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.keyCode === 75)) {
      e.preventDefault();
      if ($('palette-modal').hidden) paletteOpen(); else paletteClose();
    }
  });
}

/* ================= visitor box ================= */

var visitorJsonpSequence = 0;
var ABACUS_BASE = 'https://abacus.jasoncameron.dev';
var ABACUS_NAMESPACE = 'radio-atlas';
var ABACUS_KEY = 'views';

function visitorCounterRequest(action, params, key) {
  return new Promise(function (resolve, reject) {
    var callbackName = '__radioAtlasCounter' + (++visitorJsonpSequence);
    var script = document.createElement('script');
    var settled = false;
    var query = Object.assign({}, params || {});
    query.callback = callbackName;
    var queryString = Object.keys(query).map(function (name) {
      return encodeURIComponent(name) + '=' + encodeURIComponent(String(query[name]));
    }).join('&');
    function finish(error, data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onerror = null;
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (error) reject(error); else resolve(data);
    }
    window[callbackName] = function (data) { finish(null, data); };
    script.onerror = function () { finish(new Error('Abacus request failed')); };
    var timeout = setTimeout(function () {
      finish(new Error('Abacus request timed out'));
    }, 10000);
    script.src = ABACUS_BASE + '/' + action + '/' +
      encodeURIComponent(ABACUS_NAMESPACE) + '/' +
      encodeURIComponent(key || ABACUS_KEY) + (queryString ? '?' + queryString : '');
    script.async = true;
    document.head.appendChild(script);
  });
}

function renderVisitorValue(elementId, value) {
  var el = $(elementId);
  if (!el) return;
  var number = Number(value);
  el.textContent = Number.isFinite(number) && number >= 0 ? fmtNum(number) : '—';
}

var VISITOR_CACHE_KEY = 'ra-views';
var VISITOR_CACHE_TTL = 14 * 24 * 3600 * 1000;

function visitorCachedTotal() {
  try {
    var cached = JSON.parse(localStorage.getItem(VISITOR_CACHE_KEY) || 'null');
    if (cached && Number(cached.v) >= 0 && Date.now() - Number(cached.ts || 0) < VISITOR_CACHE_TTL) {
      return Number(cached.v);
    }
  } catch (e) {}
  return null;
}

function renderVisitorFallbackBadge() {
  // Abacus down and nothing cached: show a live Moe-Counter badge
  // instead of an unavailable label.
  var el = $('visitor-counter');
  if (!el || el.getAttribute('data-fallback-badge')) return;
  el.setAttribute('data-fallback-badge', '1');
  var img = document.createElement('img');
  img.src = 'https://count.getloli.com/get/@samotech-radio-atlas';
  img.alt = 'visitors';
  img.height = 28;
  img.style.verticalAlign = 'middle';
  el.textContent = '';
  el.appendChild(img);
}

function initVisitorBox() {
  // Show the last known total instantly, then count this visit via
  // Abacus (free counting API, jasoncameron.dev) using JSONP.
  var cachedTotal = visitorCachedTotal();
  if (cachedTotal != null) renderVisitorValue('visitor-counter', cachedTotal);
  visitorCounterRequest('hit', {})
    .then(function (data) {
      var value = Number(data && data.value);
      renderVisitorValue('visitor-counter', value);
      if (value >= 0) {
        try { localStorage.setItem(VISITOR_CACHE_KEY, JSON.stringify({ v: value, ts: Date.now() })); } catch (e) {}
      }
    })
    .catch(function (error) {
      console.warn('Radio Atlas total visitor counter:', error);
      if (visitorCachedTotal() == null) renderVisitorFallbackBadge();
    });
}

/* ---- visitor geography: country-level counts on the world map ---- */

var VISITOR_GEO_CACHE_KEY = 'ra-visitor-geo';
var VISITOR_GEO_TTL = 30 * 24 * 3600 * 1000;
function visitorHeatDot(count, maxCount) {
  // Gold dot radius for the visitors map layer (0 = do not draw).
  var n = Number(count) || 0;
  var m = Number(maxCount) || 0;
  if (n <= 0 || m <= 0) return 0;
  return (2 + 6 * Math.sqrt(n / m)).toFixed(2);
}

function visitorLeadRows(vheat, limit) {
  // Top countries by visit count for the map leaderboard (pure helper).
  var rows = [];
  var src = vheat || {};
  for (var cc in src) {
    var n = Number(src[cc]) || 0;
    if (n > 0) rows.push({ cc: cc, n: n });
  }
  rows.sort(function (a, b) { return b.n - a.n; });
  return rows.slice(0, limit || 10);
}

function renderVisitorYou(cc, name, flag) {
  var el = $('visitor-you');
  if (!el) return;
  el.textContent = '';
  el.appendChild(document.createTextNode(t('you_from') + ' '));
  var b = document.createElement('b');
  b.textContent = (flag ? flag + ' ' : '') + (name || String(cc || '').toUpperCase());
  el.appendChild(b);
  el.hidden = false;
}

function countVisitorCountry(cc) {
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return;
  visitorCounterRequest('hit', {}, 'views-' + cc)
    .catch(function (error) { console.warn('Radio Atlas visitor country counter:', error); });
}

function initVisitorGeo() {
  // Detect the visitor country (ipwho.is, CORS-open) and count the visit
  // under a per-country Abacus key for the map visitors layer.
  var cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(VISITOR_GEO_CACHE_KEY) || 'null');
  } catch (e) {}
  if (cached && cached.cc && Date.now() - Number(cached.ts || 0) < VISITOR_GEO_TTL) {
    renderVisitorYou(cached.cc, cached.name, cached.flag);
    countVisitorCountry(cached.cc);
    return;
  }
  fetchJSON('https://ipwho.is/')
    .then(function (j) {
      if (!j || !j.success || !j.country_code) throw new Error('geo lookup failed');
      var cc = String(j.country_code).toUpperCase().slice(0, 2);
      var name = String(j.country || cc);
      var flag = j.flag && j.flag.emoji ? String(j.flag.emoji) : flagOf(cc);
      try { localStorage.setItem(VISITOR_GEO_CACHE_KEY, JSON.stringify({ cc: cc, name: name, flag: flag, ts: Date.now() })); } catch (e) {}
      renderVisitorYou(cc, name, flag);
      countVisitorCountry(cc);
    })
    .catch(function (error) { console.warn('Radio Atlas visitor geo:', error); });
}

var PLAY_HEAT_CACHE_KEY = 'ra-play-heat';
var PLAY_HEAT_TTL = 24 * 3600 * 1000;
var playHeatBusy = false;
var playHeatLastTry = 0;

function playCountKey(url) {
  // Stable short key for per-station play counting (host + path, no query).
  try {
    var u = new URL(url);
    return 'play-' + u.hostname.replace(/^www\./, '') + u.pathname;
  } catch (e) { return ''; }
}

function trendingList(candidates, counts, limit) {
  // Candidate stations ranked by play count (pure helper; zeros masked).
  var out = [];
  var list = candidates || [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var k = playCountKey(s && s.url);
    var n = k ? Number(counts && counts[k]) || 0 : 0;
    if (n > 0) out.push({ station: s, n: n });
  }
  out.sort(function (a, b) { return b.n - a.n; });
  return out.slice(0, limit || 10);
}

/* ================= P1-4 playback error classification (core; unit-tested) ================= */

function coarsePlaybackError(reason) {
  /* P1-4 basic error monitoring: classify a playback failure into one
     coarse kind so the daily report stays a small fixed set of counters. */
  var text = String(reason || '').toLowerCase();
  if (text.indexOf('token') !== -1) return 'token';
  if (text.indexOf('hls') !== -1) return 'hls';
  if (text === 'html audio element error') {
    try {
      var mediaError = $('audio') && $('audio').error;
      var code = mediaError && mediaError.code;
      if (code === 1) return 'abort';
      if (code === 2) return 'network';
      if (code === 3) return 'decode';
      if (code === 4) return 'src';
    } catch (e) {}
  }
  return 'other';
}
function playHeatCached() {
  try {
    var cached = JSON.parse(localStorage.getItem(PLAY_HEAT_CACHE_KEY) || 'null');
    if (cached && cached.data && Date.now() - Number(cached.ts || 0) < PLAY_HEAT_TTL) return cached.data;
  } catch (e) {}
  return null;
}

function fetchPlayHeat() {
  // Play counts for the trending shelf candidates (the featured list).
  // One JSONP get every 400ms respects the free Abacus rate limit; cached 24h.
  var cached = playHeatCached();
  if (cached) { state.playHeat = cached; renderTrending(); return; }
  if (playHeatBusy || Date.now() - playHeatLastTry < 600000) return;
  var candidates = featuredList();
  if (!candidates.length) return;
  playHeatBusy = true;
  playHeatLastTry = Date.now();
  var merged = {};
  var chain = Promise.resolve();
  candidates.forEach(function (s, i) {
    var key = playCountKey(s.url);
    if (!key) return;
    chain = chain.then(function () {
      return visitorCounterRequest('get', {}, key)
        .then(function (data) {
          var v = Number(data && data.value);
          if (Number.isFinite(v) && v > 0) merged[key] = v;
        })
        .catch(function () {});
    });
    if (i < candidates.length - 1) {
      chain = chain.then(function () { return new Promise(function (r) { setTimeout(r, 400); }); });
    }
  });
  chain.then(function () {
    playHeatBusy = false;
    state.playHeat = merged;
    try { localStorage.setItem(PLAY_HEAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: merged })); } catch (e) {}
    renderTrending();
  });
}

function renderTrending() {
  var wrap = $('trending-wrap');
  if (!wrap) return;
  var counts = state.playHeat || playHeatCached() || {};
  var rows = trendingList(featuredList(), counts, 10);
  if (!rows.length) { wrap.hidden = true; return; }
  var html = '';
  for (var i = 0; i < rows.length; i++) html += cardFm(rows[i].station);
  $('trending-row').innerHTML = html;
  wrap.hidden = false;
}

function initTrending() {
  // Called once the catalog is loaded: paint cached counts, refresh if stale.
  renderTrending();
  fetchPlayHeat();
}

/* ================= UI ================= */

function switchTab(x) {
  state.activeTab = x;
  if (x === 'sdr' || x === 'map') { loadModule(x); }
  else if (x === 'fav' || x === 'ar' || x === 'rel' || x === 'eg') { loadModule('regions'); }
  if (x === 'map') renderMap();
  ['fm', 'fav', 'ar', 'rel', 'eg', 'sdr', 'map'].forEach(function (k) {
    var tab = $('tab-' + k);
    var panel = $('panel-' + k);
    if (tab) tab.classList.toggle('active', x === k);
    if (panel) panel.hidden = x !== k;
  });
}

/* ---- PWA install hint + hero quick-play ---- */
var deferredInstallPrompt = null;
function isStandalone() {
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  return window.navigator.standalone === true;
}
function initInstallButton() {
  var btn = $('install-btn');
  if (!btn || isStandalone()) return;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) btn.hidden = false;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', function () {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      Promise.resolve(deferredInstallPrompt.userChoice).then(function (res) {
        if (res && res.outcome === 'accepted') toast(t('install_done'));
      });
      return;
    }
    toast(t('install_ios_hint'));
  });
  window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null;
    btn.hidden = true;
    toast(t('install_done'));
  });
}
function initHeroPlay() {
  var btn = $('hero-play');
  if (!btn) return;
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { last = null; }
  if (!last || !last.url || isDmEmbed(last.url)) return;
  btn.hidden = false;
  btn.addEventListener('click', function () {
    var cur = null;
    try { cur = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { cur = null; }
    if (cur && cur.url && cur.name) play(cur.url, cur.name);
    else if (last.name) play(last.url, last.name);
    else play(last.url, '');
  });
}
/* ================= v54: listener experience pack — media session, data saver, failure alternatives, quick bar ================= */

function updateDocTitle() {
  if (state.currentName && !$('player').hidden) {
    document.title = String(t('title_playing')).replace('{n}', state.currentName);
  } else {
    document.title = t('doc_title');
  }
}
function isDataSaver() { return state.dataSaver === true; }
function renderSaverBtn() {
  var btn = $('saver-btn');
  if (!btn) return;
  btn.classList.toggle('active', isDataSaver());
  btn.textContent = isDataSaver() ? '🪫' : '🔋';
}
function initSaverButton() {
  var btn = $('saver-btn');
  if (!btn) return;
  try { state.dataSaver = localStorage.getItem('ra-saver') === '1'; } catch (e) {}
  renderSaverBtn();
  btn.addEventListener('click', function () {
    state.dataSaver = !state.dataSaver;
    try { localStorage.setItem('ra-saver', state.dataSaver ? '1' : '0'); } catch (e) {}
    renderSaverBtn();
    toast(isDataSaver() ? t('saver_on') : t('saver_off'));
  });
}
function pickSaverStation(station, url) {
  if (!isDataSaver() || !station) return null;
  var curBit = Number(station.bitrate) || 0;
  if (!curBit || curBit <= 96000) return null;
  var nm = normalizeSearchText(station.name || '');
  if (!nm) return null;
  var fallback = null;
  var list = state.fm || [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (!s || s.url === url || !safeHttpsUrl(s.url) || !/^https:/i.test(s.url)) continue;
    if (normalizeSearchText(s.name || '') !== nm) continue;
    var b = Number(s.bitrate) || 0;
    if (!b || b >= curBit) continue;
    var c = state.streamChecks ? state.streamChecks[s.url] : null;
    if (c && c.alive) return s;
    if (!fallback) fallback = s;
  }
  return fallback;
}
var quickBarRenderedFor = null;
function renderQuickBar() {
  var bar = $('quick-bar');
  if (!bar) return;
  var row = $('quick-bar-row');
  if (!row) return;
  var list = featuredList().slice(0, 10);
  if (!list.length) { bar.hidden = true; return; }
  if (quickBarRenderedFor !== state.featuredCache) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<button class="qb-chip" type="button" data-qbu="' + esc(list[i].url) + '" data-qbn="' + esc(list[i].name || '') + '" title="' + esc(list[i].name || '') + '">▶ ' + esc(list[i].name || '') + '</button>';
    }
    row.innerHTML = html;
    quickBarRenderedFor = state.featuredCache;
  }
  bar.hidden = !$('player').hidden;
}

function initUI() {
  $('tab-fm').addEventListener('click', function () { switchTab('fm'); });
  $('tab-fav').addEventListener('click', function () { switchTab('fav'); });
  $('tab-ar').addEventListener('click', function () { switchTab('ar'); });
  $('tab-rel').addEventListener('click', function () { switchTab('rel'); });
  $('tab-eg').addEventListener('click', function () { switchTab('eg'); });
  $('tab-sdr').addEventListener('click', function () { switchTab('sdr'); });
  $('tab-map').addEventListener('click', function () { switchTab('map'); });

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

  $('qfm').addEventListener('input', function () {
    state.fmFilters.q = this.value;
    fmSearchSequence += 1;
    scheduleFMClientRender();
  });
  $('qfm').addEventListener('keydown',function(e){
    if(e.key==='Escape' && this.value){this.value='';state.fmFilters.q='';fmClientRender();}
  });
  $('fm-search-btn').addEventListener('click', searchFM);
  $('fm-random-btn').addEventListener('click', playRandomStation);
  var aliveOnlyBox = $('alive-only');
  if (aliveOnlyBox) aliveOnlyBox.addEventListener('change', function () {
    state.fmFilters.aliveOnly = this.checked;
    renderFM();
  });
  $('fm-clear-btn').addEventListener('click', clearFMFilters);
  $('fm-country').addEventListener('change',function(){fmFacetAuto.country=false;state.fmFilters.country=this.value;fmClientRender();});
  $('fm-language').addEventListener('change',function(){fmFacetAuto.language=false;state.fmFilters.language=this.value;fmClientRender();});
  $('fm-tag').addEventListener('change',function(){fmFacetAuto.tag=false;state.fmFilters.tag=this.value;fmClientRender();});
  ['country','language','tag'].forEach(function(kind){
    var search=$('fm-'+kind+'-search');
    if(search)search.addEventListener('input',function(){filterFacetOptions(kind);facetLiveApply(kind);});
  });
  $('grid-fm').addEventListener('click', function (e) {
    var el = e.target;
    if (el && el.closest && el.closest('#fm-more')) {
      state.fmLimit += FM_PAGE;
      renderFM();
    }
  });

  var historyRow = $('history-row');
  if (historyRow) historyRow.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.history-chip') : null;
    if (!b) return;
    play(b.getAttribute('data-history-url'), b.getAttribute('data-history-name'))
  });
  renderHistory();
  initInstallButton();
  initHeroPlay();
  initSaverButton();
  var qbRow = $('quick-bar-row');
  if (qbRow) qbRow.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.qb-chip') : null;
    if (!b) return;
    play(b.getAttribute('data-qbu'), b.getAttribute('data-qbn'));
  });
  setInterval(function () { if (state.activeTab === 'map') renderMap(); }, 60000);
}

function init() {
  state.favs = loadFavs();
  state.history = loadHistory();
  initUI();
  initPlayers();
  setTheme('dark');
  try {
    var savedTheme = localStorage.getItem('ra-theme');
    var savedLang = localStorage.getItem('ra-lang');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
    setLang(savedLang === 'en' ? 'en' : 'ar');
  } catch (e) { setLang('ar'); }
  if (window.requestIdleCallback) {
    window.requestIdleCallback(function () { loadStations(); });
  } else {
    setTimeout(loadStations, 300);
  }
  initVisitorBox();
  initVisitorGeo();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
}

document.addEventListener('DOMContentLoaded', init);









