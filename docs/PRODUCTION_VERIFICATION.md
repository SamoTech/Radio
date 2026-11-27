# التحقق من إصدار GitHub Pages

هدف التحقق هو مقارنة الملفات العامة بالإصدار المتوقع من checkout فعلي. merge أو upload أو HTTP200 وحده لا يثبت النشر.

## المسار المعتمد

1. تحديث main ينشر الكود والكتالوج الحالي دون زحف كامل؛ الجدولة الحالية تحفظ سياساتها. وظيفة النشر تسجل SHA من `git rev-parse HEAD`.
2. `scripts/stage_production.py` يبني مجلدًا عامًا نظيفًا خارج شجرة المصدر، بقائمة معلنة وفحوص الاعتمادات. يُرفع هذا المجلد فقط.
3. `deployment_provenance.py stamp --root <public-output> --commit <sha>` يضيف descriptor ثابتًا schema2، من نفس inventory: كل ملفات التشغيل والكتالوج الكامل والدلتا وSDR وSEO والأيقونات. `build-info.json` مستثنى من البصمات الذاتية.
4. متحكم Pages REST ينشر معرّف الرفع الصحيح، بعد فحص الهوية والاستقرار؛ GET فقط يعاد بحدود وPOST مرة واحدة.
5. بعد نجاح النشر، verifier على checkout لنفس SHA يعيد بناء metadata المتوقعة محليًا، ويرفض اختلاف المصدر أو SW أو إصدار/عدد المحطات أو المسارات أو البصمات والأحجام. لا يثق ببصمات الموقع وحدها.
6. أربع قراءات متزامنة كحد أقصى، streaming64KiB وحدود أحجام ومهلة كلية480 ثانية وnonce جديد لكل طلب. لا سقف3MiB القديم. تحفظ وظيفة verify تقرير `radio-atlas-production-provenance`.

المسار اليدوي يستخدم نفس staging/controller/verifier. `DONE` يثبت بايتات الإصدار المحدد فقط؛ لا يثبت Search Console أو مصادر الصوت الحية أو السماع البشري. لا يمس مفضلة المستخدم أوIndexedDB.

## إعادة التنفيذ

من checkout المطلوب، بمجلد إخراج جديد:

```bash
python3 scripts/stage_production.py --output /tmp/radio-atlas-public
python3 scripts/deployment_provenance.py stamp --root /tmp/radio-atlas-public --commit <40-character-sha>
python3 scripts/deployment_provenance.py verify --commit <same-sha> --attempts 20 --delay 6
```

| النتيجة | تفسيرها |
|---|---|
| DONE | descriptor والبايتات العامة يطابقان checkout المتوقع |
| NOT VERIFIED | النشر أو التحقق لم يكتمل |
| BLOCKED | الشبكة أو الصلاحيات منعت فحصًا مستقلًا |
| FAIL | المحاولات استُنفدت أو البيانات لا تتطابق؛ يبقى workflow فاشلًا |

سياسة القائمة وصيغة metadata وقياس الحجم والحدود والتراجع في [PRODUCTION_ARTIFACT](PRODUCTION_ARTIFACT.md). لا تُنشر ملفات التطوير أو الأدلة الداخلية؛ تُراجع حالات404 لها بعد النشر. نتائج الإصدارات وأرقام PR وSHA تُسجّل بعد تحققها.

## موثوقية نشر Phase 1 — 2026-11-25

في المحاولة الأولى من [run 45575120718](https://github.com/SamoTech/Radio/actions/runs/45575120718/attempts/1)، رفع الملف `github-pages-45575120718-1` بالمعرّف `15003019781` اكتمل عند `08:19:14.072Z`، وفحص REST نجح عند `08:19:14.361Z`، لكن lookup الأكشن عبر خدمة Artifacts/Twirp أعاد صفر ملفات عند `08:19:14.745Z`. المحاولة اللاحقة نجحت. الدليل يؤكد اختلاف الرؤية بين طلبَي الاكتشاف؛ لا يكشف سبب الاتساق الداخلي في GitHub ولا يثبت حله نهائيًا. إصدار `deploy-pages v5.0.1` أضاف backoff لاستطلاع حالة النشر، وليس retry لاكتشاف الـartifact، وما زال يكتشف الاسم عبر `@actions/artifact`.

المسار الجديد في `update-data.yml` و`deploy.yml` يستخدم `scripts/pages_deploy.py` وواجهة Pages REST الرسمية مباشرة. المبرر: تمرير `artifact_id` الذي أرجعه الرفع يلغي lookup ثانيًا عبر خدمة مختلفة؛ لا توجد مكتبة خارجية أو اعتماد غير رسمي. واجهة [إنشاء النشر الرسمية](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-deployment) تقبل `artifact_id` و`pages_build_version` و`oidc_token`. المصدر المرجعي للتنفيذ الرسمي: [api-client في v5.0.1](https://github.com/actions/deploy-pages/blob/v5.0.1/src/internal/api-client.js)، و[إصدار v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1).

- الاسم `github-pages-<run_id>-<run_attempt>` إلزامي. قائمة ملفات نفس run والقراءة المباشرة بالمعرّف لازم يتفقا على الاسم والمعرّف والحجم وحالة عدم الانتهاء وrun ID في ثلاث ملاحظات متتالية؛ لا يُقبل أول نجاح منفرد.
- اكتشاف الملف: 12 محاولة بحد 180 ثانية، بتأخير متدرج `2,4,8,15…` ثانية. غياب الملف وHTTP `408/429/500/502/503/504` وأخطاء النقل قابلة للمحاولة؛ الالتباس والهوية الخاطئة و401/403 والأخطاء الدائمة تفشل فورًا. 404 يُعاد فقط عند القراءة المباشرة لملف متوقع أو حالة نشر معلوم.
- `pages_build_version` هو SHA الكامل من `git rev-parse HEAD`، ويجب مطابقته مع `build-info.json`. لا نساويه بـ`workflow_run.head_sha`: التحديث المجدول قد ينشئ data commit بعد SHA بداية الـrun.
- OIDC يستخدم عنوان الطلب الذي أعطاه runner دون تغيير audience، مثل `core.getIDToken()` الرسمي؛ صلاحيتا `pages:write` و`id-token:write` وبيئة `github-pages` مستمران. لا تُطبع التوكنات أو أجسام استجابات الإنشاء.
- POST الإنشاء مرة واحدة فقط. قبل إرساله يُكتب journal حصري في `RUNNER_TEMP`؛ إعادة نفس الخطوة على نفس runner لا تنشئ نشرًا ثانيًا. أخطاء POST، بما فيها 5xx أو مهلة أو رد غير صالح، لا تُعاد لأن وصول الطلب غير محسوم.
- بعد الحصول على deployment ID، الاستطلاع GET لهذا المعرّف فقط: حتى40 محاولة/600 ثانية، مع نفس backoff وبحد15ثانية. حالات الفشل النهائية والأخطاء الدائمة توقف التنفيذ. الحالة المؤقتة تعيد GET فقط، ولا تنشئ نشرًا بديلًا.
- لا يبدأ تحقق الإنتاج إلا بعد حالة `succeed`. فشل حقيقي يبقي workflow أحمر. مسارا النشر يشتركان في مجموعة concurrency `radio-atlas-pipeline` دون إلغاء الجاري؛ لم يتغير rebase `-X theirs` أو جدول الزحف. لم تتغير الواجهة أو نسخة SW (v103).

### استعادة نشر تعطل أو رد إنشائه غير محسوم

راجع deployment ID في اللوج وjournal وافحص حالة Pages و`build-info.json` قبل إعادة تشغيل أي workflow. journal محلي للـrunner؛ لا يدّعي منع تشغيل يدوي جديد على runner مختلف. لا توجد قائمة Pages deployments رسمية مكافئة لواجهة get-by-ID لحسم POST ضاع رده؛ لذلك لا توجد إعادة POST آلية. إن كان النشر قد نجح، نفذ تحقق provenance فقط. إن كان فشلًا نهائيًا أو لم يُنشأ بعد الفحص، شغّل نشرًا جديدًا. الرجوع البرمجي يمر بـPR يصحح/يرجع التغيير، ثم نشر وتحقق SHA؛ لا دفع مباشر إلى main ولا تخفيف لحماية الفروع.

اختبارات التحكم: `python3 -m unittest discover -s tests -p test_pages_deploy.py -v`. تشمل غياب الملف، الهوية الخاطئة، الالتباس، انتهاء الصلاحية، اختلاف run، استقرار الملاحظات، فشل الشبكة والصلاحيات، POST مبهم، journal، حالات النشر النهائية، exhaustion، وOIDC الافتراضي. نتائج الفحوص والدمج والنشر الفعلية تُسجّل بعد حصولها؛ هذا القسم وصف تنفيذ وليس شهادة إنتاج مسبقة.

مراجعة عقد REST الرسمية: حالات `syncing_files` و`finished_file_sync` و`updating_pages` و`purging_cdn` مراحل تقدم عادية تُستطلع حتى `succeed`؛ ليست فشلًا. `page_url` يمكن أن يرجع hostname بلا scheme حسب أمثلة GitHub، فيُستكمل إلى HTTPS قبل output. `pages_build_version` معرّف build مستقل موصوف كسلسلة فريدة، ولا يُشترط مساواته بـSHA توكن OIDC؛ الأخير يصدق أصل الـworkflow/الفرع. المرجع الآلي: [OpenAPI الرسمي](https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json).
