# 📻 Radio Atlas — راديو أطلس

> ⭐ **الموقع الرسمي:** <https://samotech.github.io/Radio/>
>
> ⚖️ **الوثائق هي المصدر الوحيد للحقيقة:** [AGENTS.md — قواعد عمل الوكلاء والعملاء](AGENTS.md) · [ROADMAP.md — خارطة الطريق الحاكمة](ROADMAP.md)

راديو أطلس تطبيق ويب PWA عربي/إنجليزي يجمع محطات الإنترنت وأجهزة استقبال SDR حقيقية في تجربة واحدة. الواجهة Static على GitHub Pages، ومشغّل KiwiSDR يستخدم وسيط Cloudflare مستقلًا لأجهزة HTTP؛ OpenWebRX المدعوم يعمل عبر HTTPS/WSS مباشرة. النواة Vanilla JavaScript، مع HLS.js للبث المتوافق، وPython لتحديث الكتالوج.

**لأي AI أو مطوّر جديد:** ابدأ من [دليل استلام المشروع](docs/AI_HANDOVER.md)، ثم [الحالة الحالية](docs/PROJECT_STATUS.md). قواعد العمل في [AGENTS.md](AGENTS.md) وخطة الأولويات في [ROADMAP.md](ROADMAP.md).

## 🌍 نظرة عامة

| البند | التفاصيل |
|---|---|
| 📡 الموقع | [https://samotech.github.io/Radio/](https://samotech.github.io/Radio/) |
| 💻 الكود المصدري | [https://github.com/SamoTech/Radio](https://github.com/SamoTech/Radio) |
| 📻 محطات البث | أكثر من 50,000 محطة من كل العالم + قوائم منسقة للمحطات العربية (كتالوج يدوي منسّق: 106 محطة عبر 20 دولة + قوائم IPRD العربية) + المحطات المصرية (62 محطة) |
| 🌍 أجهزة الاستقبال | ~830 جهاز KiwiSDR حول العالم |
| 🔭 التغطية | الفحص والتحليل لأكثر من 50,000 محطة + 6 مصادر بيانات خارجية |
| 🎨 التقنية | HTML + CSS + Vanilla JS ووحدات ES + HLS.js + Python stdlib للـ crawler + GitHub Pages + Kiwi Worker مستقل |
| 🌐 اللغات | عربي (RTL) + English (LTR) |

## 📡 الميزات الرئيسية

### 📻 محطات البث

- فحص جودة جديد تدريجي: data/stream_quality.json (48 رابطًا في دورة تحديث المحطات)، يفرق بين دليل صوت حقيقي وبين رد HTTP ناجح فقط أو ملف HLS. فحوص stream_checks.json القديمة ليست تأكيد تشغيل بالمتصفح. تُعزل اللقطات الناقصة جدًا من دون حذف محطات. [تقرير تدقيق المصادر](docs/RADIO_SOURCES_AUDIT_2026-11-19.md).


- كتالوج كامل من Radio-Browser (كل المحطات غير المكسورة (أكثر من 50,000)، ترتيب: سمعية/عربية/IPRD + الكتالوج الكامل) + في البحث المباشر في FM tab أيضا
- بحث فوري في الكتالوج الكامل (~13MB) بعد التحميل الأول — مع ملف إقلاع خفيف stations_head (~530KB) يعرض أول 2500 محطة فورًا، وزياراتك التالية تُحدَّث تفاضليًا بكيلوبايتات عبر IndexedDB
- فلترة حسب الدولة/اللغة/الفئة (FACET_OPTIONS + filterFacetOptions(kind) — يحتفظ بالخيار المحدد أثناء التصفية)
- LANGUAGE_ALIASES + LANGUAGE_LABELS: تطبيع ~75 لغة (لكنتات لاتينية + تشكيل عربي + فواصل عُليا) + دمج المرادفات في مدخل واحد مرتّب بالعدد + أسماء معرّبة
- CORE_CATEGORIES consolidates genres to 20 with ar/en labels
- normalizeSearchText() normalizes NFD diacritics + alef variants (أإآ→ا, ى→ي)
- isOfficialStation() → officials sorted first in results
- الصفحة الرئيسية: شبكة «🏛 الرسمية · 🇪🇬 مصر» = إذاعات مصر فقط — بلا رسميين أجانب، دمج المكررات بالاسم المطبّع، استبعاد الأسماء النُتفة، والقابل للتشغيل داخل التطبيق قبل كروت فيديو Dailymotion
- local search matches name/language/tags/cc/localized country name (Intl.DisplayNames)

- مشغّل مصغّر ثابت، مع لوحة قابلة للتوسيع للصوت والتنقل ومؤقت النوم.
- **تبديل آمن بين روابط المحطة:** أربع وصلات HTTPS مباشرة بحد أقصى ورابط relay اختياري كآخر محاولة؛ يتم رفض HTTP والرابط ذي بيانات الدخول، وإزالة المكرر، مع إبقاء اسم المحطة والمفضلة والاستماع على عنصر الصوت نفسه. روابط البدائل هي روابط مرشحة وليست ضمانًا للتشغيل ما لم يُثبت فحص الصوت ذلك.

**KiwiSDR P0:** أُضيفت طبقة حصص عالمية مبنية على Cloudflare Durable Objects (SQLite)، والمالك أفاد بنشرها مع الربط والترحيل. قبولها التشغيلي الدقيق (حدود المحاولات والتزامن وRetry-After وتنظيف الجلسات) ما زال مفتوحًا للتحقق المستقل. تفاصيل الضمانات وحدودها في [KIWI_README](proxy/KIWI_README.md)؛ نشر GitHub Pages لا يحدّث Worker.

**تحسين استقرار KiwiSDR (v87):** إعادة المحاولة بعد انقطاع الصوت أصبحت محدودة ومتدرجة (8 ثوانٍ، ثم 65 ثانية بعد محاولة تستقبل PCM)، بدل محاولات سريعة خلال ثوانٍ. تظهر رسائل مختلفة لانتهاء الجلسة أو الرفض أو مهلة الصوت أو تعذر الاتصال، بينما تبقى حالة HTTP 429 غير مرئية لواجهة WebSocket نفسها وتُشخّص عبر سجلات Cloudflare أو اختبار Chromium CDP. هذا لا يغير الحصص أو ينشر Worker جديدًا. التفاصيل في [تقرير Kiwi P0](docs/KIWI_P0_VERIFICATION.md).

**إصلاح استقبال قبرص (v90):** أصلحت حالة ضبط من جلسة المستخدم فيها التردد `818 kHz` والـSquelch على `20`، وهي إعدادات يمكن أن تمنع سماع 819 kHz أو تضعف الإشارة. أزرار AM في قبرص تضبط الآن `AGC ON` و`Squelch=0` و`normal passband` وخطوة `9 kHz`، وترسل التغييرات داخل جلسة Kiwi القائمة دون فتح اتصال جديد. ولا تُكتب تغييرات التوليف في «آخر جهاز ناجح» إلا عند وصول إطار PCM غير صفري بعد أمر الضبط. ظهور «تعذر فتح الاتصال» يرجع إلى مسار WebSocket منفصل ولا يُثبت من واجهة المتصفح وحدها أنه HTTP 429؛ لم يتغير Cloudflare Worker أو حصصه.

**ترددات مصرية من قبرص (v89 / SDR-4):** أزرار ضبط سريعة داخل مستقبل `0-30 MHz SDR | Cyprus` فقط: 864 القرآن الكريم، 819 البرنامج العام، 774 الشرق الأوسط، 711 الشباب والرياضة، 558 للاستكشاف (تسرده الأدلة باسم التعليمية)، و621 صوت العرب كمرجع تاريخي. وحدة التردد `kHz` ووضع `AM` بعرض مرشح عادي بعد إصلاح v90. الأزرار لا تغيّر جهاز الاستقبال أو تنشئ WebSocket، ولا تُعامل الترددات كدليل سماع مباشر. [تفاصيل الدراسة](docs/SDR_STUDIO_ARCHITECTURE.md).

**ذاكرة ترددات Kiwi (v88 / SDR-4):** احفظ حتى 40 ترددًا محليًا باسم تختاره مع الوضع وعرض المرشح، واستدعها أثناء الاستماع أو قبل الاتصال. الترددات تُخزن على جهازك فقط؛ الاستدعاء لا يفتح جهازًا ولا ينشئ اتصالًا تلقائيًا. حذف الذكريات متاح من نفس المشغل.

**ماسح النطاقات (v104 / SDR-5):** ماسح نطاقات داخل مشغّل Kiwi: نطاقات جاهزة (الموجة المتوسطة والطويلة وباندات البث القصير والهواة) أو نطاق مخصص بخطوة قابلة للضبط، بقياس إشارة فعلي من الجهاز وحد رصد dBm، مع إيقاف مؤقت واستئناف وإلغاء، وترتيب النتائج بقوة الإشارة وضغطة استماع لكل رصد. الرصد طاقة RF فقط — مش دليل هوية محطة؛ المسح يعمل على جلسة الجهاز المفتوحة فقط، بلا اتصالات إضافية، ويرجّع التردد السابق بعد الانتهاء. Service Worker v104.

**قياس حي عميق وخط أساس أداء (v108 / SDR-11):** أدوات اختبار فقط دون أي تغيير في الواجهة: أوضاع قياس حي اختيارية في سكربت QA — مسح قصير عبر عينة من المستقبلين لقياس زمن أول صوت، نقع مستمر حتى 10 دقائق بعينات كل 10 ثوانٍ للإطارات والانهيارات والكمون والذاكرة، قبول الماسح الحي مع إعادة التردد السابق، وتعافي انقطاع شبكة حقيقي دون تحديث الصفحة — إضافة إلى خط أساس Lighthouse موثق (الجوال 46/96/100، سطح المكتب 79/96/100). لا تُفعَّل أي وضع حي إلا من سير عمل QA صريح، وتُغلق كل جلسة فور انتهائها.

**تبديل تلقائي وترددات حديثة (v108 / SDR-10):** عند فشل الاتصال بجهاز Kiwi نهائيًا (بعد انتهاء المحاولات) ينتقل المشغّل تلقائيًا مرة واحدة إلى البديل الأصح الذي يغطي التردد الحالي، مع الحفاظ على التردد والوضع والمرشح. الخيار مفعّل افتراضيًا ويمكن إيقافه من صندوق «تبديل تلقائي» في التحكم المتقدم، وأي اختيار يدوي للمستقبل يتقدم على التبديل التلقائي دائمًا. ويضيف شريط «ترددات ضُبطت حديثًا»: آخر 6 ترددات أُكد ضبطها بوصول صوت فعلي كأزرار ضبط فوري محفوظة على جهازك فقط، بلا اتصالات إضافية. Service Worker v108.

**مؤشر الانتشار ليلًا/نهارًا (v107 / SDR-8):** داخل مشغّل Kiwi يعرض مؤشر تقديري لحالة الانتشار الآن (نهار/ليل محليًا حسب موضع الشمس وساعتك المحلية) مع تفضيل النطاقات المنخفضة ليلًا والعالية نهارًا للتردد المضبوط، وتوسيم صفوف تلميح EIBI التي يغطي جدولها اللحظة الحالية بوسم «على الهواء الآن حسب الجدول». تقدير تخطيطي فقط وليس بديلًا عن مقياس الإشارة، وبلا اتصالات إضافية. Service Worker v107.

**تلميح هوية المحطة من EIBI (v106 / SDR-7):** أثناء الاستماع داخل مشغّل Kiwi يعرض المشغّل البثوث المجدولة القريبة من التردد الحالي (±5 كيلوهرتز) من لقطة EIBI «على الهواء الآن» التي يجلبها الـ crawler بالتوقيت العالمي — اسم المحطة، لغتها، وفترة بثها — لتحويل الضبط العشوائي إلى تعريف مبدئي للمحطة. التلميح مجدول وليس دليل بث لحظي، ولا يفتح أي اتصال إضافي.

**موثوقية الاتصال واختيار ذكي (v105 / SDR-6):** طبقة صحة أجهزة محلية: بعد فشل غير قابل لإعادة المحاولة (رفض/امتلاء/مهلة/انقطاع) يتذكّر المشغّل ملاحظة هذا التبويب لكل جهاز مع تهدئة تصاعدية محدودة (90/60 ثانية تتضاعف حتى 10 دقائق)، والتنقل التلقائي وتلميح «جرّب جهازًا بديلًا» يتجاهلان الأجهزة في فترة التهدئة، بينما يتجاوزها الاختيار اليدوي من القائمة دائمًا. بعد فشل نهائي يقترح المشغّل زر بديل صحي يغطي التردد الحالي حسب نطاق الجهاز المعلن وأكبر مساحة متاحة، مع الحفاظ على التردد والوضع والمرشح من مدخلات النافذة نفسها. إعادة المحاولات أصبحت بتشتيت زمني ±25% لمنع عواصف إعادة الاتصال، ومخزن الصوت المسبق تكيفي (60–200 مللي ثانية حسب فجوات وصول الإطارات) مع عدّ Underruns في التشخيصات.

**Waterfall مباشر:** مشغل OpenWebRX يرسم طيف FFT وشلالًا متحركًا من إطارات الجهاز الحقيقية، ويخفيهما وينظفهما عند إغلاق الجلسة أو تبديل النطاق. لا يظهر رسم وهمي عند غياب FFT؛ شلال KiwiSDR موصول الآن في واجهة مشغّل Kiwi (SDR-3B): canvas في نافذة Kiwi، طلب `SET wf_lease` عند جاهزية جلسة SND، ورسم الصفوف بحد ~10 إطارات/ثانية، مع تدهور آمن — أي فشل في الشلال يُظهر ملاحظة فقط ولا يمسّ الصوت أبدًا. البث الحي ينتظر نشر المالك لمسار /kiwi/wf على Worker المنشور؛ حتى ذلك الحين لا يدّعي الموقع شلالًا حيًا. مسار W/F مقيّد بالـlease في مصدر Worker وفكّاك مستقل وعينة W/F مسجلة حقيقية من EA8BFK تفسَّر في اختبارات Node.

**سياق صوت SDR مشترك داخل إيماءة الضغط (v95):** مشغّلا Kiwi وOpenWebRX الأصليان يشتركان الآن في `AudioContext` واحد يُنشأ ويُستأنف synchronously داخل ضغطة المستخدم (مستمع capture على أزرار التشغيل المباشر، مع تسخين عند بداية كل فتح)، بدل إنشائه بعد تحميل الوحدة الكسولة خارج الإيماءة — فلا يفشل الاستئناف كخطأ `audio_locked` عام. إغلاق المشغل يعلّق السياق بدل إغلاقه، فتستأنف الضغطة التالية السياق نفسه. اختبارات جديدة في `tests/sdr-audio-context.test.cjs` مع تحديثات في `tests/kiwi-native.test.cjs`.

**استئناف آخر جهاز ناجح بضغطة واحدة (v97):** شريحة «▶ آخر جهاز ناجح — {الاسم} · {التردد}» أعلى قسم «راديو مباشر من الجهاز» في تبويب SDR؛ الضغطة الثانية بعد فتح التبويب تفتح الصوت الأصلي مباشرة بالإعدادات المحفوظة — Kiwi عبر الاستعادة الحالية، وOpenWebRX عبر التردد والوضع والبروفايل المحفوظين في `ra-owrx-session-v1`. لا يُحفظ أي جهاز إلا بعد استقبال صوت PCM غير صفري فعليًا، ولا تُكتب إعادة ضبط فوق إعدادات ناجحة إلا بعد PCM جديد على التردد الجديد. اختبارات جديدة في `tests/sdr-resume.test.cjs`.

**أخطاء OpenWebRX مترجمة وإيقاف مؤقت النوم عند الإغلاق (v99):** سطور حالة OpenWebRX لم تعد تُلحق المعرّف الإنجليزي الخام بعد النص المترجم («الاتصال لم يكتمل · audio_locked») — كل رموز الفشل الخمسة عشر تُترجم الآن إلى نصوص `STR_SDR` عربي/إنجليزي، والرمز المجهول يعود للنص العام دون إظهار الرمز. وإغلاق مشغّل Kiwi أو OpenWebRX يوقف مؤقت نوم FM بصمت حتى لا يظهر تنبيه `sleep_done` لاحقًا بلا مشغّل؛ منبّه الراديو منفصل ويستمر عمدًا. اختبارات جديدة في `tests/sdr-owrx-errors.test.cjs`.

**إصلاح مفاتيح ترجمة مفقودة في التشغيل (v92):** خمسة مفاتيح كانت تُستدعى من `t()` بلا تعريف في أي حزمة STR (`toast_broken` و`stations` و`no_match_fm` و`no_data` و`random_none`) فكانت تظهر كمفاتيح برمجية حرفية في تنبيه المحطة المعطلة وعدّاد المحطات ورسائل الشبكة الفارغة، بالعربي والإنجليزي. أُضيفت بنص عربي وإنجليزي في STR النواة، مع اختبارات انحدار في `tests/i18n.test.cjs` تفحص كل مفاتيح `t()` و`data-i18n` في المستودع.

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

- **KiwiSDR**: 817-834 جهاز حول العالم (AetherSDR CDN mirror، CORS-open، hourly + أصل rx.kiwisdr.com الاحتياطي + mirror ثالث: اللقطة المؤرشفة المنشورة من المستودع نفسه)
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
- **HTML5 + CSS3 + Vanilla JavaScript** (بلا إطار واجهة؛ HLS.js اعتماد تشغيل خارجي)
- **Service Worker** (sw.js v108) لـ caching و offline
- **HLS.js** (1.6.10) لدعم HLS
- **hls.js CDN**: jsdelivr → unpkg fallback

### Backend (Crawler)
- **Python 3 + stdlib فقط** (لا dependencies خارجية)
- **Radio-Browser API** (de1/de2/nl1)
- **AetherSDR CDN** (KiwiSDR mirror)
- **اللقطة المؤرشفة داخل المستودع** (mirror ثالث لـ KiwiSDR — raw + GitHub Pages)
- **NOAA SWPC** (Kp, F10.7)
- **WSPR.live** (ClickHouse)
- **EiBi** (eibispace.de)
- **IPRD** (iprd-org/iprd)

### Hosting
- **GitHub Pages** (static hosting)
- **GitHub Actions** (CI/CD + data refresh)

## 📁 هيكل المشروع

```text
Radio/
├── AGENTS.md / ROADMAP.md / README.md
├── index.html / css/styles.css / sw.js / manifest.webmanifest
├── js/app.js                 # الكتالوج والتمهيد وحالة التطبيق
├── js/modules/               # وحدات ES بتحميل كسول
│   ├── player.mjs / regions.mjs / tools.mjs / mobile.mjs
│   ├── map.mjs
│   ├── sdr.mjs               # استوديو SDR ومشغّل Kiwi وضوابطه
│   ├── sdr-adapters.mjs       # أهلية الأجهزة وطريقة تشغيلها
│   ├── openwebrx-native.mjs   # بروتوكول OpenWebRX المدعوم
│   └── sdr-waterfall.mjs      # رسم FFT الحقيقي لـOpenWebRX
├── data/                     # لقطات الكتالوج والفهارس والدلتا وأدلة الصوت السابقة
├── scripts/                  # crawler + تدقيق النشر + QA بالمتصفح
├── tests/                    # Node/Python وfixtures بروتوكول حقيقية
├── proxy/
│   ├── kiwi-worker.js / kiwi-quota.js / kiwi-wrangler.toml
│   └── worker.js / wrangler.toml  # relay محطات FM منفصل وغير مفعّل بالواجهة
├── .github/workflows/        # Validate وتحديث البيانات والنشر وQA
├── countries/ / genres/ / languages/  # صفحات SEO مولدة
└── docs/                     # دليل الاستلام والحالة والتشغيل والأدلة
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
| ✅ الأساس | كتالوج FM ومشغّل داخلي وSDR Studio وcrawler وPages/PWA |
| ✅ KiwiSDR | PCM داخلي وتحكم وذاكرة، ووسيط WSS مستقل لأجهزة HTTP المسموح بها |
| ✅ OpenWebRX | PCM داخلي وFFT/waterfall للأجهزة المتوافقة؛ WebSDR بواجهته الأصلية |
| ✅ WSPR | نشاط الانتشار الراديوي + أفضل المسارات |
| ✅ EIBI | جدول البث القصير للموجات |

## 🎯 خارطة الطريق

> 📌 **الخارطة الكاملة المفصلة — الفجوات (16) + المخاطر (11) + التوصيات بالمراحل والأولويات وتعريف الاكتمال — في [ROADMAP.md](ROADMAP.md): الوثيقة الحاكمة للتخطيط.**

- ✅ **منجز مؤخرًا:** الخريطة التفاعلية + طبقة الزوار + لوحة «أكثر البلاد زيارةً» · شريط 🔥 الأكثر سماعاً · طبقات الجلب الخمس في الـ crawler + تصنيف «جرّبها» · relay جاهز في proxy/ · فلتر اللغات المنقح (~75 لغة) · حوكمة P0 (قفل البروكسي + بوابة مزامنة الوثائق) · مراقبة أخطاء التشغيل الأساسية · كتالوج تفاضلي عبر IndexedDB (الزيارة الثانية بكيلوبايتات) · تقسيم app.js لوحدات ES Modules بتحميل كسول (التحميل الابتدائي أقل من النصف: ~84KB بدل ~149KB) · تنقية شبكة «الرسمية · مصر» في الصفحة الرئيسية (مصر فقط + دمج المكررات + استبعاد الأسماء النُتفة) · جولة وصولية كاملة + بوابة Lighthouse Accessibility ≥ 90 في Validate · صفحات SEO للأنواع واللغات (genres/ + languages/ مولدة آليًا من الكتالوج) · mirror ثالث لـ KiwiSDR: اللقطة المؤرشفة داخل المستودع (raw + Pages) بطوابع زمنية صادقة عند سقوط المصدرين الأصليين · دليل التداول والتشغيل docs/RUNBOOK.md (الفحص اليومي + الطوارئ + سجل الحوادث) · توسيع الكتالوج العربي المنسّق P2-3 (دفعة أولى): 49 محطة يدوية جديدة عبر 20 دولة (57→106) — sw v75
- ⏳ **القبول الجاري:** استكمال تحقق Kiwi P0 للحصص والتنظيف والثبات وتوسيع دعم SDR وفق ROADMAP. بند P0-1 القديم يخص FM relay غير المفعّل، وليس وسيط Kiwi المنشور.
- 💡 **أفكار مؤجلة:** دعم البودكاست · نظام تسجيل سحابي للمفضلة · AIS/ADS-B

## ⚠ قيود معروفة

- **المحطات المصرية (maspero.eg)**: الموقع الرسمي يحجب الوصول الآلي — روابط البث المباشرة غير متاحة حاليا
- **Sham FM (SY)**: https://radioshamfm.grtvstream.com:8400/; تعطي كود 0 من US CI runners (geo-gate) لكن jina-verified live — محفوظة عمدا، تظهر علامة dead badge لكن من المحتمل أن تعمل من MENA
- **MBC/Qatar streamlock**: كود 0/502 — محفوظة عمدا (قد تكون geo-gated لمستخدمي MENA; crawler يعمل على US runners)
- **العداد**: Abacus؛ عدادات تقريبية وليست قياس مستخدمين فريدين أو ضمانًا ضد التلاعب.
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

الأرقام التالية تقريبية؛ لقطة 2026-11-22 المقاسة بالتوقيت والمصدر موجودة في [الحالة الحالية](docs/PROJECT_STATUS.md). عدد الصفوف لا يساوي عدد المحطات أو الأجهزة القابلة للتشغيل الآن.

- **عدد المحطات**: أكثر من 50,000 محطة (Radio-Browser + IPRD + official + arabic + community playlists + Dailymotion)
- **أجهزة KiwiSDR**: ~830 جهاز
- **أجهزة WebSDR/OpenWebRX**: ~400 جهاز
- **EIBI**: ~3000 إدخال
- **WSPR**: ملخص نشاط ومسارات ونطاقات؛ راجع اللقطة الحالية بدل اعتبار عدد نقاط تاريخي عدادًا حيًا.

## 🎨 التصميم

- **RTL Support**: دعم كامل للغة العربية
- **Responsive**: متوافق مع جميع الأحجام
- **Dark Mode**: وضع داكن/فاتح
- **PWA**: تثبيت على الهاتف

---
**SamoTech/Radio** — Cairo 🇪🇬






## سجل التنفيذ والتحقق المؤرخ

الأقسام التالية تصف مراحل سابقة؛ الحالة الأحدث وحدودها في [PROJECT_STATUS](docs/PROJECT_STATUS.md). أرقام إصدارات SW هنا تاريخية، والإصدار الحالي v108.
### Production provenance and deployment verification

GitHub Pages deployment stamps a generated `build-info.json` with the exact deployment commit, Service Worker cache version, catalog version and asset SHA-256 digests. The separate post-deploy verification job fetches the live artifact and checks every tracked asset byte-for-byte. See [docs/PRODUCTION_VERIFICATION.md](docs/PRODUCTION_VERIFICATION.md). A merged PR or an HTTP 200 response alone does not establish that the new release is live.


### Immediate GitHub Pages deploys vs. data crawls

Merges to `main` now publish the checked-out application without first crawling the entire station catalog. Catalog refresh policy is unchanged: stations update daily at 02:17 UTC, SDR every six hours at :11 UTC, and the `workflow_dispatch` action still supports `all`, `stations`, `sdr`. The upload and post-deploy provenance verifier run for both fast code deploys and scheduled data deploys, so a merge is **not** proof of a published release until the verifier passes.


### KiwiSDR native playback and responsive listening cockpit (v81)
The KiwiSDR embedded player now uses the receiver's native `/<timestamp>/SND` WebSocket and Kiwi text commands with uncompressed big-endian PCM audio. The first real SND packet, rather than merely opening a WebSocket, confirms a playable receiver. Manual frequency/mode tuning, bounded audio buffering, audio-context cleanup, and operator API permissions are preserved. The independent Cloudflare WebSocket bridge is configured in production; HTTP receivers require it because secure GitHub Pages cannot connect directly to WS. See the current status above and the dated P0 evidence. The original receiver URL remains accessible as a fallback. The responsive header, directory grid and Kiwi listening dialog have been updated for phone and desktop screens.


### KiwiSDR Cloudflare relay activation (v81)
Site owner reports the independent Worker `https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev` has been enabled and `/healthz` returned HTTP 200. HTTP KiwiSDR devices that advertise `ext_api > 0` now *attempt* the in-app secure WSS bridge; HTTPS devices connect directly. Failed connections stay in Radio Atlas, show a receiver error and retain a clearly labeled optional original-device link. That initial health-only report was superseded by the dated PCM/browser evidence below and the 2026-11-22 Cyprus check in docs/PROJECT_STATUS.md. `healthz` alone does **not** demonstrate working stream relaying. See `proxy/KIWI_README.md` for staged browser/audio verification and origin requirements.


### KiwiSDR bridge deployed Worker sync (November 20, 2026)
Before this P0 hardening, `proxy/kiwi-worker.js` matched the Cloudflare AI Agent's deployed version `3e349979-4861-4f78-aa7d-8dc1fdc42b56`: handshake timeout limited to setup, missing/non-numeric `ext_api` denied, expired per-isolate rate counters pruned, and structured error codes distinguish forbidden origin, 429 rate limiting, and upstream errors. This does not constitute a verified end-to-end KiwiSDR audio session; real public receiver audio and mobile browser validation are still required.

### KiwiSDR P0 verification (2026-11-20)

Binary-control handshake and PCM decoding corrections, Worker security guards, and captured-stream browser smoke coverage are under verification (Service Worker v82). Chromium verified nonzero PCM and Web Audio graph output through the deployed bridge from EA8BFK and Heppen. The owner reports hardened Worker version `2dbe0921-40bc-47f2-8425-11506c5da4a4` deployed with matching source bytes. Post-deployment probes received PCM from both receivers and confirmed private-host rejection and oversized-command closure. At that historical cutoff human audibility and exact live quota ceilings remained unverified, and limits were isolate-local. The owner subsequently reported the SQLite Durable Object deployment; exact live global ceilings remain open. See the latest P0 evidence. See [P0 evidence and reproduction commands](docs/KIWI_P0_VERIFICATION.md); this is not a completed live-playback claim.

### Cyprus KiwiSDR listening controls (v83)

The native listening dialog adds eligible receiver selection, frequency steps, mode-aware passband presets, AGC/manual gain, squelch, live S-meter and explicit reconnect. Tuning and volume survive receiver changes. Last successful tuning can be restored without autoplay. The original receiver link opens its complete interface for operator-supported extensions. The Kiwi dialog also draws a live waterfall from actual receiver frames when the bridge serves /kiwi/wf (owner deploy pending); until then it says so plainly and audio keeps working.

On 2026-11-20, `http://cyp.twrmon.net:8073/` played unmuted inside Radio Atlas through the deployed bridge; a separate transport probe decoded 10 PCM frames, 5,120 samples (5,100 nonzero) at 12 kHz. `http://sdr.cyhams.org/` upgraded but produced no PCM within 20 seconds. These observations do not certify human audibility or continuous receiver availability. Chromium verified live Cyprus audio, all native controls, automatic recovery without a new gesture, and 390px Arabic/English layouts without overflow. Browser QA 21/21, PWA Upgrade QA 9/9, JS 102/102, Python 125/125 and Lighthouse Accessibility92 passed. Evidence: [Cyprus verification](docs/evidence/kiwi-cyprus-2026-11-20.json) and PR #150.

### SDR Studio متعدد الأنظمة (v84)

مساحة موحّدة لاختيار أجهزة KiwiSDR وWebSDR وOpenWebRX وصفحات SatNOGS مع إظهار النظام وأدواته المناسبة. واجهات HTTPS الأصلية يمكن طلب عرضها داخل الاستوديو، وHTTP وصفحات SatNOGS تفتح من الرابط الأصلي. التضمين وتشغيل أدوات الصوت يخضعان لإذن الجهاز والمتصفح؛ وصول الصفحة ليس تأكيدًا للصوت. يظل Kiwi يستخدم مشغّل PCM الداخلي للأجهزة المتاحة والمسموح بها فقط.

طبقة `sdr-adapters.mjs` مستقلة وخفيفة (~3.5KB) ومخزنة ضمن Service Worker v84؛ تدير أهلية الرابط والنظام دون تحميل إطار عمل أو توسيع وسيط Cloudflare. التنقل بين الأجهزة يغلق الجلسة السابقة، وتبقى أدوات النظام الكاملة في واجهته الأصلية. [التصميم وخارطة التوسع والتحقق](docs/SDR_STUDIO_ARCHITECTURE.md). لا يوجد ادعاء بأن كل جهاز في العالم أو كل decoder اختُبر حيًا.

### Reliable Pages artifact publication

Pages uploads and deploys use the same unique name per workflow run/attempt. A bounded metadata check waits for that artifact to appear before deployment, avoiding both an immediately invisible upload and duplicate `github-pages` artifacts after a job rerun. Existing provenance and catalog refresh scheduling remain in place; no artifacts are deleted.


### الاستقبال المباشر OpenWebRX وتجربة الراديو (v85)

مشغّل أطلس الخاص يستقبل الآن PCM وADPCM (IMA) من أجهزة OpenWebRX/OpenWebRX+ المدرجة عبر HTTPS/WSS، سواء أعلن الخادم `audio_compression=none` أو `adpcm`. اختيار بروفايل الجهاز والنطاق، وضبط التردد بخطوات، وAM/NFM/WFM/USB/LSB/CW، ومستوى الصوت وإعادة الاتصال متاحة داخل الموقع. مقياس الإشارة والطيف مأخوذان من رسائل الجهاز الفعلية؛ لا طيف اصطناعي. الصوت المضغوط ADPCM يُفكّ في `js/modules/owrx-adpcm.mjs` (جدول خطوات csdr نفسه، ومتجهات مرسومة يدويًا واختبارات round-trip في Node) وطيف FFT المضغوط يُفكّ كذلك مع إسقاط 10 عينات تمهيدية؛ قيمة ضغط غير معروفة تفشل برسالة مترجمة ولا تُفسر كـPCM. الإشارات الرقمية وأدوات المشغّل الإضافية تظل في الواجهة الأصلية، ولا يُدّعى تشغيل كل إمكانيات كل جهاز. التحقق بالاستماع الحي لجهاز ADPCM حقيقي ما زال مفتوحًا (لا عينة ADPCM مسجلة بعد)؛ التغطية test-driven فقط.

قسم «استقبال مباشر» يجمع مرشحي Kiwi المسموحين وOpenWebRX الآمن، ويميّز المرشح عن الجهاز الذي أرسل عينات غير صفرية إلى مسار صوت يعمل في جلسة المستخدم، مع وقت التحقق وفلتر لهذه النتائج. ليست قائمة ضمان دائم أو فحصًا شاملًا للكتالوج. بدء SDR يوقف FM مؤقتًا؛ العودة لمحطة FM تغلق اتصال SDR ومخرجاته. لا تحميل إضافي لوحدة SDR أثناء الاستماع المعتاد لـFM؛ `js/app.js` يبقى 82,304 بايت. Service Worker v85 يخزن الموصل الجديد.

اختبارات البروتوكول والمتصفح تستخدم تسجيلًا حقيقيًا معلن المصدر من S52MP على 20 متر، منفصلًا عن الفحص الحي اليدوي في `openwebrx-live-audio-qa.yml`. تُحفظ نتائج Chromium وقياس خرج Web Audio في artifacts، ولا يُعتبر فتح WebSocket أو وصول الصفحة دليل صوت. التفاصيل والحدود في [تصميم SDR Studio](docs/SDR_STUDIO_ARCHITECTURE.md).

التحقق الحي في Chromium للنسخة المرشحة `2f25fb9c`: S52MP/OpenWebRX على 20m أخرج 5 إطارات PCM و5,059 عينة غير صفرية عند 12kHz مع 3 إطارات FFT؛ Kiwi قبرص أخرج 6 إطارات و3,069 عينة غير صفرية، وEA8BFK أخرج 5 إطارات و1,191 عينة غير صفرية عبر Worker المنشور. هذه قياسات خرج Web Audio في المتصفح، وليست شهادة سماع بشري أو فحصًا لكل الأجهزة. [دليل التنفيذ الحي](docs/evidence/native-sdr-browser-live-2026-11-21.json).

الأجهزة الثلاثة التي نجحت في الفحص الحي تظهر أولًا بنتيجة اختبار سابقة وتاريخها من `data/receiver_audio_checks.json`، الذي يُحمّل عند فتح SDR فقط. تظل علامة الصوت المتحقق في جلستك منفصلة؛ لا تُرفع نتيجة تاريخية إلى حالة «متصل الآن». بروفايل S52MP الذي نجح يُختار عند أول تشغيل فقط إذا بقي ضمن البروفايلات التي يعلنها الخادم، وإعادة الاتصال تحفظ اختيار المستخدم.

### Phase 1 — موثوقية النشر

مسارا Pages اليدوي والمجدول ينشران معرّف artifact الذي أعاده الرفع عبر API الرسمية؛ يتحقق controller من الهوية والاستقرار ويعيد قراءات الشبكة المؤقتة بحدود. طلب إنشاء النشر لا يُعاد تلقائيًا عند الغموض، والتحقق بالبصمات يبدأ بعد نجاح النشر فقط. سياسة الاستعادة وحدود الحماية موثقة في [دليل التحقق](docs/PRODUCTION_VERIFICATION.md). القبول الإنتاجي يتطلب الأدلة الفعلية بعد الدمج.

### تحديث Actions — Phase 1

مراجع Actions الرسمية مثبتة بـSHA كامل مع إصدار دقيق، على Ubuntu24.04 وNode24 لتشغيل Actions؛ اختبارات التطبيق تحتفظ بـNode22/Python3.12. صلاحيات الكتابة وOIDC محصورة في الوظائف المحتاجة. [الإصدارات والتحقق والحدود](docs/ACTIONS_MODERNIZATION.md). قبول الإنتاج يبقى مشروطًا بفحوص النشر الفعلية.

### Phase 1 — حزمة إنتاج معزولة وبصمات شاملة

النشر يرفع مجلدًا نظيفًا من قائمة عامة معلنة، ويستبعد ملفات التطوير والاختبارات وproxy والتوثيق. نفس القائمة تنتج وصف إصدار ثابت schema2 وبصمات وأحجام كل الملفات العامة، مع تحقق streaming للكتالوج الكبير وأربع قراءات متزامنة كحد أقصى. [السياسة والقياس والتراجع](docs/PRODUCTION_ARTIFACT.md). لا تغيير واجهة أو سياسة محطات أو SW v103؛ القبول النهائي يتطلب تحقق الإنتاج على SHA الجديد.


