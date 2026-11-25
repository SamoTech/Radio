# تحديث GitHub Actions — Phase 1 / البنية — 2026-11-25

هذه مراجعة للمصدر، وليست شهادة نجاح CI أو نشر. تنفذ جانب تحديث Actions من المرحلة الأولى المعتمدة من المالك، منفصلًا عن P0 الخاصة بـKiwi/FM. لا تغيير واجهة أو بيانات أو Service Worker (يبقى v103).

## المراجع المتحققة

تم استرجاع tags مباشرة من مستودعات GitHub الرسمية بـ`git ls-remote --tags`، ثم clone ضحل لكل tag جديد ومراجعة `action.yml` وREADME. إصدارات الجدول tags فعلية بتاريخ لا يتجاوز يوم المراجعة؛ الـSHA يخص commit لا ref متحرك. راجع رابط الإصدار ثم `action.yml` على SHA عند التحديث التالي.

| Action رسمي | المرجع السابق الحقيقي | الإصدار المختار | SHA غير قابل للتغير |
|---|---|---|---|
| [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1) | v4.4.0 | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| [configure-pages](https://github.com/actions/configure-pages/releases/tag/v6.0.0) | v5.0.0 | v6.0.0 | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| [deploy-pages](https://github.com/actions/deploy-pages/releases/tag/v5.0.1) | v4.0.5 | مستبدل بـPages REST (PR #185)؛ v5.0.1 للمقارنة | `368f82528645a54fb793d4d04e342629a3f51346` |
| [upload-pages-artifact](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0) | v3.0.1 | v5.0.0 | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| [upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | v4.6.2 | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0) | v7.1.0، تعليق v5 غير صحيح | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| [setup-python](https://github.com/actions/setup-python/releases/tag/v7.1.0) | v5.6.0 | v7.1.0 | `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` |

إصدار deploy-pages الأحدث موثق للمقارنة؛ استبدله PR #185 بمتحكم REST يحافظ على OIDC والهوية. v5.0.1 نفسه يحسن polling/backoff لحالة النشر، ولا يثبت حل مشكلة lookup المبلغ عنها.

كل Actions JavaScript المختارة تستخدم `node24` في `action.yml`. `upload-pages-artifact` مركب (composite) ويستخدم `upload-artifact` v7.0.0 داخليًا على SHA كامل `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`؛ لا ref متحرك داخلي. يرفع `artifact.tar` داخل ZIP، ويوفر output رسمي `artifact_id`؛ هذا متوافق مع صيغة GitHub Pages وdeploy-pages. لا حاجة لإضافة action غير رسمي.

## بيئة التشغيل والصلاحيات

- جميع jobs تثبت `ubuntu-24.04` لتجنب انتقال تلقائي لتوزيعة أخرى. Actions Node24 تتطلب runner >=2.327.1؛ checkout المحسن لأوامر Docker الموثقة يتطلب >=2.329.0. GitHub-hosted Ubuntu24.04 هو المسار المدعوم؛ لا self-hosted أو Docker-auth هنا.
- Node المستخدم لاختبارات التطبيق يظل22، منفصلًا عن Node24 الخاص بتشغيل Actions. Python3.12 وWrangler4.165.0 وPlaywright1.62.1 وLighthouse12.8.2 وoverride robots-parser3.0.1 تبقى كما هي؛ لا تغيير نطاق QA أو عتبة الوصولية90.
- الصلاحية الافتراضية `contents:read`. وظيفة update وحدها تحتفظ بـ`contents:write` لدفع snapshot القائم. `pages:write` و`id-token:write` و`actions:read` محصورة في وظيفة النشر؛ لا OIDC للزحف أو الاختبارات أو verifier.
- `persist-credentials:false` على كل checkout لا يدفع git. يبقى persistence على update وicons لأنهما يدفعان ملفات مولدة بالمسار القائم. workflow icons مستقل، ولا تغيّر هذه المهمة كيفية توليد الأيقونات أو سياسة دفع الـbot الحالية.
- `package-manager-cache:false` على setup-node؛ كل أدوات QA مؤقتة ولا تحتاج كاش تلقائيًا، خصوصًا وظيفة update ذات صلاحية الكتابة.
- فُحصت workflows التسعة: لا `set-output` أو `save-state` قديم، ولا `pull_request_target`/تشغيل كود fork مع أسرار، ولا مراجع Actions متحركة في المصدر. أوامر `group`/`endgroup` ليست أوامر متوقفة.

## التحقق والحدود والتراجع

نجح محليًا `node --check js/app.js`، وكل `node --check js/modules/*.mjs`، و`node --test tests/*.test.cjs` (245/245)، و`python3 -m py_compile scripts/update_data.py`، و`python3 -m unittest discover -s tests -p 'test_*.py'` (129/129). تحليل YAML لكل workflows التسعة نجح باستخدام PyYAML المثبت في بيئة المراجعة؛ ليس اعتماد إنتاج أو اختبار جديد. كذلك نجح `node --check proxy/kiwi-worker.js` و`node --check proxy/kiwi-quota.js` و`npx --yes wrangler@4.165.0 deploy --config proxy/kiwi-wrangler.toml --dry-run --outdir <temporary-directory>` دون نشر. فحص `actionlint -shellcheck= -pyflakes=` بإصدار1.7.10 الرسمي نجح لكل workflows (exit0). هذه النتائج على worktree التحديث، ويجب إعادة البوابات على رأس PR النهائي بعد دمج تغييرات البنية الأخرى.

فحص الـdist/runtime وتوافق المدخلات لا يحل محل تشغيل CI الفعلي. سجل CI على رأس PR وmain هو المرجع المتبقي لاكتشاف تحذيرات Node بعد التحديث، بما فيها أي Action خارجي غير ظاهر في workflows. لا نعلن زوال كل تحذير قبل رؤية اللوج.

للتراجع: PR تصحيحي يعيد مراجع Actions السابقة المحددة في تاريخ git، مع جميع البوابات؛ لا push إلى main ولا تعديل branch protection. إعادة Node20 بديل مؤقت غير مرغوب عند التراجع، ويحتاج مبررًا وخطة تحديث. تحديث المراجع وحده لا يغير ملفات runtime أو يتطلب refresh من الزوار.
