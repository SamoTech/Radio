# 📻 Radio Atlas — راديو أطلس

> ⭐ **الموقع الرسمي:** <https://samotech.github.io/Radio/>

دليل بحث ذكي لأجهزة الاستقبال (SDR) ومحطات البث الإذاعي أونلاين في مكان واحد — بتقنية PWA بدون مكتبات خارجية. أكثر من 62,000 محطة من كل العالم + 830 جهاز KiwiSDR حول العالم + قوائم EIBI + WSPR + WebSDR/OpenWebRX.

## 🌍 نظرة عامة

| البند | التفاصيل |
|---|---|
| 📡 الموقع | [https://samotech.github.io/Radio/](https://samotech.github.io/Radio/) |
| 📻 محطات البث | أكثر من 62,000 محطة من كل العالم + قوائم منسقة للمحطات العربية (~1,301 محطة في 21 دولة) + المحطات المصرية (62 محطة) |
| 🌍 أجهزة الاستقبال | ~830 جهاز KiwiSDR حول العالم |
| 🔭 التغطية | الفحص والتحليل لأكثر من 50,000 محطة + 6 مصادر بيانات خارجية |
| 🎨 التقنية | HTML + CSS + Vanilla JS بدون مكتبات + Python stdlib للـ crawler + GitHub Pages |
| 🌐 اللغات | عربي (RTL) + English (LTR) |

## 📡 الميزات الرئيسية

### 📻 محطات البث

- كتالوج كامل من Radio-Browser (كل المحطات غير المكسورة ~62,286، ترتيب: سمعية/عربية/IPRD + الكتالوج الكامل) + في البحث المباشر في FM tab أيضا
- بحث فوري في ~9MB JSON (لا حاجة للإنترنت بعد التحميل الأول)
- فلترة حسب الدولة/اللغة/الفئة (FACET_OPTIONS + filterFacetOptions(kind) — يحتفظ بالخيار المحدد أثناء التصفية)
- LANGUAGE_ALIASES canonicalizes ~35 languages incl. Arabic variants
- CORE_CATEGORIES consolidates genres to 20 with ar/en labels
- normalizeSearchText() normalizes NFD diacritics + alef variants (أإآ→ا, ى→ي)
- isOfficialStation() → officials sorted first in results
- local search matches name/language/tags/cc/localized country name (Intl.DisplayNames)

### 🌍 تبويب عربي
- تبويب مستقل «🌍 عربي» يعرض جميع المحطات العربية في 22 دولة عربية
- ترتيبا حسب الدولة مع الأعلام وعدد المحطات
- المحطات الرسمية أولا + ترتيب حسب الاسم
- حد أقصى 30 محطة لكل دولة مع ملاحظة «أول N محطة من M»

### 🇪🇬 تبويب مصر
- عرض جميع محطات البث المصرية
- الترتيبا: المحطات الرسمية أولا + حسب الحالة (alive-rank)
- رابط للموقع الرسمي (maspero.eg)

### 🔭 أجهزة الاستقبال SDR

- **KiwiSDR**: 817-834 جهاز حول العالم (AetherSDR CDN mirror، CORS-open، hourly)
  - الحالة (أونلاين/غير متصل)
  - SNR
  - عدد المستخدمين
  - الموقع الجغرافي + هوائي
  - ext_api (للاتصال المباشر)
- **WebSDR/OpenWebRX**: قواميس من receiverbook.de + morria/multi-sdr
  - فلترة حسب النوع
  - عرض على الخريطة
  - استماع داخل التطبيق (HTTPS فقط)
- **WSPR**: نشاط الانتشار الراديوي (db1.wspr.live)
  - أحزمة التردد
  - المسافات القصوى
  - أفضل المسارات
- **EIBI**: جدول البث القصير للموجات (eibispace.de)
  - 3000 إدخال كحد أقصى
  - فلترة حسب التردد والوقت
  - البحث في الجدول

### ⚡ ميزات إضافية

- **البحث المباشر**: بحث فوري في كتالوج Radio-Browser عبر API
- **المفضلة**: حفظ المحطات المفضلة في localStorage
- **استئناف الاستماع**: استئناف آخر محطة استمعت إليها
- **Media Session API**: متوافق مع أجهزة التحكم الخارجية
- **PWA**: تثبيت على الهاتف كتطبيق مستقل
- **الوضع الداكن/الفاتح**: تبديل سهل
- **الترجمة**: عربي/إنجليزي كامل
- **الاشتراكات**: توست عند حدوث خطأ في البث
- **الروابط العميقة**: #play=URL لفتح محطة مباشرة
- **المشاركة**: زر مشاركة لكل محطة
- **الإبلاغ**: زر للإبلاغ عن محطة معطلة
- **عشوائي**: زر لاختيار محطة عشوائية

## 🛠 التقنيات المستخدمة

### Frontend
- **HTML5 + CSS3 + Vanilla JavaScript** (بدون مكتبات خارجية)
- **Service Worker** (sw.js v22) لـ caching و offline
- **HLS.js** (1.6.10) لدعم HLS
- **hls.js CDN**: jsdelivr → unpkg fallback

### Backend (Crawler)
- **Python 3 + stdlib فقط** (لا dependencies خارجية)
- **Radio-Browser API** (de1/de2/nl1)
- **AetherSDR CDN** (KiwiSDR mirror)
- **NOAA SWPC** (Kp, F10.7)
- **WSPR.live** (ClickHouse)
- **EiBi** (eibispace.de)
- **IPRD** (iprd-org/iprd)

### Hosting
- **GitHub Pages** (static hosting)
- **GitHub Actions** (CI/CD + data refresh)

## 📁 هيكل المشروع

```
Radio/
├── index.html          # الصفحة الرئيسية
├── js/
│   └── app.js          # منطق التطبيق الرئيسي (~85KB)
├── css/
│   └── styles.css      # أنماط CSS
├── sw.js               # Service Worker (v22)
├── manifest.webmanifest # PWA Manifest
├── offline.html        # صفحة offline
├── robots.txt          # robots.txt
├── sitemap.xml         # sitemap
├── countries/          # صفحات الدول (SEO)
│   ├── index.html
│   ├── eg.html
│   ├── sa.html
│   └── ...
├── data/               # بيانات المحطات
│   ├── stations.json   # ~12MB (62,286 محطة)
│   ├── kiwisdr.json    # ~830 جهاز
│   ├── space_weather.json
│   ├── eibi.json       # ~142KB
│   ├── wspr.json
│   ├── web_sdrs.json
│   └── stream_checks.json
├── scripts/            # نصوص Python
│   ├── update_data.py  # crawler رئيسي
│   ├── official_stations.json
│   ├── arabic_stations.json
│   └── generate_icons.py
└── tests/              # اختبارات
    ├── test_crawler.py
    ├── test_country_pages.py
    └── test_wspr_sources.py
```

## 🚀 كيفية التثبيت والتشغيل محليا

```bash
git clone https://github.com/SamoTech/Radio.git
cd Radio
python scripts/update_data.py all       # تحديث كل البيانات
python scripts/update_data.py stations  # تحديث المحطات + فلترة البث
python scripts/update_data.py sdr       # تحديث أجهزة SDR + الطقس الفضائي + EIBI
python -m http.server 8000
# افتح http://localhost:8000
```

الـ crawler يعتمد على Python stdlib فقط — لا يحتاج لأي مكتبات خارجية.

## ⚙ الآلية

كل 6 ساعات:
1. **التحديث**: البيانات (KiwiSDR + الطقس الفضائي + EIBI + WSPR + WebSDR) تتحديث كل 6 ساعات
2. **التحقق**: يتم فحص syntax لـ app.js (node --check)
3. **النشر**: يتم نشر البيانات على GitHub Pages

(.github/workflows/update-data.yml + deploy.yml)

## ✅ الحالة الحالية

| الميزة | الحالة |
|---|---|
| ✅ MVP | دليل KiwiSDR + محطات FM + تشغل خارجي + crawler + Pages |
| ✅ الميزة 2 | صوت KiwiSDR تجريبي عبر WebSocket (مطلوب ext_api) — بديل OpenWebRX |
| ✅ WebSDR | دمج WebSDR + OpenWebRX |
| ✅ WSPR | نشاط الانتشار الراديوي + أفضل المسارات |
| ✅ EIBI | جدول البث القصير للموجات |

## 🎯 الخارطة المستقبلية

### 🔜 على قائمة الانتظار
- **الخريطة التفاعلية**: عرض المحطات وأجهزة SDR على الخريطة (Leaflet.js)
- **دعم البودكاست**: دمج مع Listen API أو PodcastIndex
- **تحليلات**: إضافة Google Analytics أو Plausible
- **Heatmap**: إضافة Microsoft Clarity لتتبع سلوك المستخدمين

### 💡 أفكار مستقبلية
- **نظام تسجيل** (اختياري): حفظ المفضلة على السحابة + التاريخ + إحصائيات
- ** leaderboard**: أفضل الدول/المحطات من حيث الاستماع
- **WSPRnet**: دمج مع WSPRnet
- **SatNOGS**: تتبع الأقمار الصناعية
- **AIS/ADS-B**: تتبع الطائرات والسفن

## ⚠ قيود معروفة

- **المحطات المصرية (maspero.eg)**: الموقع الرسمي يحجب الوصول الآلي — روابط البث المباشرة غير متاحة حاليا
- **Sham FM (SY)**: https://radioshamfm.grtvstream.com:8400/; تعطي كود 0 من US CI runners (geo-gate) لكن jina-verified live — محفوظة عمدا، تظهر علامة dead badge لكن من المحتمل أن تعمل من MENA
- **MBC/Qatar streamlock**: كود 0/502 — محفوظة عمدا (قد تكون geo-gated لمستخدمي MENA; crawler يعمل على US runners)
- **العداد**: Abacus (ns: radio-atlas, key: views, admin: 67c46ff9-4f23-43e8-b729-546225e283dc)
- **البيانات**: raw.githubusercontent يعرض cache لمدة ~5 دقائق — التحقق من التحديثات عبر cache-buster query

## 📚 مصادر البيانات المفيدة

- **Radio-Browser**: [https://de1.api.radio-browser.info/json/stations/search](https://de1.api.radio-browser.info/json/stations/search)
- **AetherSDR KiwiSDR Mirror**: [https://cdn.aethersdr.com/kiwi.json](https://cdn.aethersdr.com/kiwi.json)
- **NOAA SWPC**: [https://services.swpc.noaa.gov/json/](https://services.swpc.noaa.gov/json/)
- **WSPR.live**: [https://db1.wspr.live/](https://db1.wspr.live/)
- **EiBi**: [http://eibispace.de/](http://eibispace.de/)
- **IPRD**: [https://github.com/iprd-org/iprd](https://github.com/iprd-org/iprd)
- **alondrilich radio-playlists**: [https://alondrilich.github.io/radio-playlists/](https://alondrilich.github.io/radio-playlists/)
- **junguler m3u-radio-music-playlists**: [https://github.com/junguler/m3u-radio-music-playlists](https://github.com/junguler/m3u-radio-music-playlists)

## 🔒 سياسة المحتوى

- **استبعاد إسرائيل (IL)**: المحطات الإسرائيلية مستبعدة بشكل دائم من الكتالوج (crawler-side skip + client-side filter)
- **المحطات غير الآمنة (HTTP)**: لا يتم عرضها في iframes (mixed content policy)
- **المحطات المكررة**: يتم إزالة التكرارات بواسطة URL

## 🤝 المساهمة

- أي تعليق على branch من فصل + Pull Request + دمج squash
- رسائل commits بتقليد conventional: feat / fix / chore / docs
- البياتات لا تفصل عن الكود — crawler يعمل في نفس الملف
- المحطات الرسمية لا تفصل عن الكتالوج — يتم دمجها دائما في الأعلى
- **لا تستخدم backticks** أو `${` في الكود

## 📊 إحصائيات

- **عدد المحطات**: ~62,286 محطة (Radio-Browser + IPRD + official + arabic)
- **أجهزة KiwiSDR**: ~830 جهاز
- **أجهزة WebSDR/OpenWebRX**: ~400 جهاز
- **EIBI**: ~3000 إدخال
- **WSPR**: ~200,000 نقطه في 72 ساعة

## 🎨 التصميم

- **RTL Support**: دعم كامل للغة العربية
- **Responsive**: متوافق مع جميع الأحجام
- **Dark Mode**: وضع داكن/فاتح
- **PWA**: تثبيت على الهاتف

---
**SamoTech/Radio** — Cairo 🇪🇬
