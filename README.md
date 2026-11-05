# 📻 Radio Atlas — راديو أطلس

> ⭐ **الموقع الرسمي:** <https://samotech.github.io/Radio/>
>
> ⚖️ **الوثائق هي المصدر الوحيد للحقيقة:** [AGENTS.md — قواعد عمل الوكلاء والعملاء](AGENTS.md) · [ROADMAP.md — خارطة الطريق الحاكمة](ROADMAP.md)

دليل بحث ذكي لأجهزة الاستقبال (SDR) ومحطات البث الإذاعي أونلاين في مكان واحد — بتقنية PWA بدون مكتبات خارجية. أكثر من 50,000 محطة من كل العالم + 830 جهاز KiwiSDR حول العالم + قوائم EIBI + WSPR + WebSDR/OpenWebRX.

## 🌍 نظرة عامة

| البند | التفاصيل |
|---|---|
| 📡 الموقع | [https://samotech.github.io/Radio/](https://samotech.github.io/Radio/) |
| 📻 محطات البث | أكثر من 50,000 محطة من كل العالم + قوائم منسقة للمحطات العربية (~1,301 محطة في 21 دولة) + المحطات المصرية (62 محطة) |
| 🌍 أجهزة الاستقبال | ~830 جهاز KiwiSDR حول العالم |
| 🔭 التغطية | الفحص والتحليل لأكثر من 50,000 محطة + 6 مصادر بيانات خارجية |
| 🎨 التقنية | HTML + CSS + Vanilla JS بدون مكتبات + Python stdlib للـ crawler + GitHub Pages |
| 🌐 اللغات | عربي (RTL) + English (LTR) |

## 📡 الميزات الرئيسية

### 📻 محطات البث

- كتالوج كامل من Radio-Browser (كل المحطات غير المكسورة (أكثر من 50,000)، ترتيب: سمعية/عربية/IPRD + الكتالوج الكامل) + في البحث المباشر في FM tab أيضا
- بحث فوري في الكتالوج الكامل (~13MB) بعد التحميل الأول — مع ملف إقلاع خفيف stations_head (~530KB) يعرض أول 2500 محطة فورًا، وزياراتك التالية تُحدَّث تفاضليًا بكيلوبايتات عبر IndexedDB
- فلترة حسب الدولة/اللغة/الفئة (FACET_OPTIONS + filterFacetOptions(kind) — يحتفظ بالخيار المحدد أثناء التصفية)
- LANGUAGE_ALIASES + LANGUAGE_LABELS: تطبيع ~75 لغة (لكنتات لاتينية + تشكيل عربي + فواصل عُليا) + دمج المرادفات في مدخل واحد مرتّب بالعدد + أسماء معرّبة
- CORE_CATEGORIES consolidates genres to 20 with ar/en labels
- normalizeSearchText() normalizes NFD diacritics + alef variants (أإآ→ا, ى→ي)
- isOfficialStation() → officials sorted first in results
- الصفحة الرئيسية: شبكة «🏛 الرسمية · 🇪🇬 مصر» = إذاعات مصر فقط — بلا رسميين أجانب، دمج المكررات بالاسم المطبّع، استبعاد الأسماء النُتفة، والقابل للتشغيل داخل التطبيق قبل كروت فيديو Dailymotion
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
- **🔥 الأكثر سماعاً**: شريط أعلى المحطات مرتب بعدّادات تشغيل حقيقية
- **🌍 خريطة الزوار**: طبقة ذهبية على الخريطة + لوحة «أكثر البلاد زيارةً»
- **⌨️ لوحة الأوامر**: بحث سريع من أي مكان
- **🔋 توفير البيانات**: وضع خفيف للشبكات الضعيفة
- **🪶 تحميل كسول (P1-2)**: المشغل وSDR والخريطة والأقسام الإقليمية وحدات ES منفصلة (js/modules/*.mjs) تُحمّل عند أول استخدام فقط
- **🔎 صفحات SEO للأنواع واللغات (P2-2)**: صفحات هبوط ثابتة (genres/ + languages/) مولدة آليًا من الكتالوج في كل تحديث محطات — بجانب صفحات الدول (countries/)

## 🛠 التقنيات المستخدمة

### Frontend
- **HTML5 + CSS3 + Vanilla JavaScript** (بدون مكتبات خارجية)
- **Service Worker** (sw.js v66) لـ caching و offline
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
├── index.html           # الصفحة الرئيسية
├── README.md            # نظرة عامة على المنتج (هذا الملف)
├── ROADMAP.md           # ⚖️ خارطة الطريق الحاكمة — الفجوات والمخاطر والتوصيات
├── AGENTS.md            # ⚖️ قواعد عمل الوكلاء والعملاء — التخصصات والحدود
├── js/
│   ├── app.js           # نواة التطبيق: الكتالوج/FM/i18n/التمهيد (~79KB)
│   └── modules/         # وحدات ES Modules بتحميل كسول عند أول استخدام (P1-2)
│       ├── sdr.mjs      # KiwiSDR + WSPR + WebSDR + الفضاء + EIBI (~32KB)
│       ├── map.mjs      # الخريطة التفاعلية + طبقة الزوار (~15KB)
│       ├── player.mjs   # المشغل: HLS + المنبه + EQ + Media Session (~29KB)
│       ├── regions.mjs  # المفضلة + مصر + عربي + الديني (~7KB)
│       └── tools.mjs    # لوحة الأوامر + المشاركة + الإبلاغ + عشوائي (~8KB)
├── css/
│   └── styles.css       # أنماط CSS
├── sw.js                # Service Worker (v66)
├── manifest.webmanifest # PWA Manifest
├── offline.html         # صفحة offline
├── robots.txt           # robots.txt
├── sitemap.xml          # sitemap
├── countries/           # صفحات الدول (SEO)
│   ├── index.html
│   ├── eg.html
│   ├── sa.html
│   └── ...
├── genres/             # صفحات الأنواع الموسيقية (SEO — P2-2)
│   ├── index.html
│   ├── news.html
│   └── ...
├── languages/          # صفحات اللغات (SEO — P2-2)
│   ├── index.html
│   ├── arabic.html
│   └── ...
├── data/                # بيانات المحطات (مخرجات الـ crawler)
│   ├── stations.json    # ~13.4MB (أكثر من 50,000 محطة)
│   ├── stations_head.json # ~530KB (إقلاع سريع — أول 2500 محطة)
│   ├── stations.manifest.json # رجل حال الكتالوج (نسخة/عدد/keep) للتحديث التفاضلي
│   ├── stations_delta/  # دلتا يومية (تُحفظ آخر 3) — الزيارة الثانية بكيلوبايتات
│   ├── kiwisdr.json     # ~830 جهاز
│   ├── web_sdrs.json / satnogs.json / land_map.json
│   ├── space_weather.json
│   ├── eibi.json        # ~138KB
│   ├── wspr.json
│   ├── stream_checks.json  # فحوصات الحياة (شغّال / جرّبها / ميت)
│   ├── error_report.json   # تقرير أخطاء التشغيل اليومي (عدّادات خشنة)
│   └── discovered_streams.json
├── scripts/             # Python stdlib فقط
│   ├── update_data.py   # crawler رئيسي (طبقات جلب خمس)
│   ├── official_stations.json
│   ├── arabic_stations.json
│   └── generate_icons.py
├── proxy/               # Cloudflare Worker relay (فك الحجب الجغرافي)
│   ├── worker.js
│   ├── wrangler.toml
│   └── README.md        # دليل النشر بالعربي
└── tests/
    ├── test_crawler.py
    ├── test_country_pages.py
    ├── test_wspr_sources.py
    └── search.test.cjs  # اختبارات الواجهة (node --test)
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

الجدولة:
1. **التحديث**: KiwiSDR + الطقس الفضائي + EIBI + WSPR + WebSDR كل 6 ساعات — والمحطات وفحوصات الحياة (شغّال / «جرّبها» / ميت) يوميًا
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

## 🎯 خارطة الطريق

> 📌 **الخارطة الكاملة المفصلة — الفجوات (16) + المخاطر (11) + التوصيات بالمراحل والأولويات وتعريف الاكتمال — في [ROADMAP.md](ROADMAP.md): الوثيقة الحاكمة للتخطيط.**

- ✅ **منجز مؤخرًا:** الخريطة التفاعلية + طبقة الزوار + لوحة «أكثر البلاد زيارةً» · شريط 🔥 الأكثر سماعاً · طبقات الجلب الخمس في الـ crawler + تصنيف «جرّبها» · relay جاهز في proxy/ · فلتر اللغات المنقح (~75 لغة) · حوكمة P0 (قفل البروكسي + بوابة مزامنة الوثائق) · مراقبة أخطاء التشغيل الأساسية · كتالوج تفاضلي عبر IndexedDB (الزيارة الثانية بكيلوبايتات) · تقسيم app.js لوحدات ES Modules بتحميل كسول (التحميل الابتدائي أقل من النصف: ~79KB بدل ~149KB) · تنقية شبكة «الرسمية · مصر» في الصفحة الرئيسية (مصر فقط + دمج المكررات + استبعاد الأسماء النُتفة) · جولة وصولية كاملة + بوابة Lighthouse Accessibility ≥ 90 في Validate · صفحات SEO للأنواع واللغات (genres/ + languages/ مولدة آليًا من الكتالوج) — sw v66
- ⏳ **الأولوية الجارية (P0-1):** نشر البروكسي الجديد (المقفول) وفق [proxy/README.md](proxy/README.md) → إرسال workers.dev URL → تفعيل STREAM_PROXY (القفل تم في PR #109)
- 💡 **أفكار مؤجلة:** دعم البودكاست · نظام تسجيل سحابي للمفضلة · AIS/ADS-B

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

## 🤝 المساهمة وقواعد العمل

> ⚖️ الوثائق هي المصدر الوحيد للحقيقة: [AGENTS.md](AGENTS.md) — القواعد القطعية وأدوار الوكلاء المتخصصة وقواعد العميل وبروتوكول التنفيذ · [ROADMAP.md](ROADMAP.md) — الخطة والحالة.

- كل تغيير: فرع من main → PR → Validate خضراء → squash-merge. **ممنوع الدفع المباشر لـ main نهائيًا**
- رسائل commits بتقليد conventional: feat / fix / chore / docs — وكل PR يذكر بند ROADMAP المنفذ
- كل تغيير كود يرافقه اختباراته + تحديث الوثائق المتأثرة في نفس الـ PR
- البيانات لا تفصل عن الكود — الـ crawler ومخرجاته في نفس المستودع، والمحطات الرسمية تدمج أعلى النتائج دائمًا
- **لا تستخدم backticks أو ${ في js/app.js** (أسلوب الكود القائم)

## 📊 إحصائيات

- **عدد المحطات**: أكثر من 50,000 محطة (Radio-Browser + IPRD + official + arabic + community playlists + Dailymotion)
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



