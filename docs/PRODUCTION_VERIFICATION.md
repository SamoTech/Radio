# Production release verification (GitHub Pages)

**Goal:** establish the **actual files served by** `https://samotech.github.io/Radio/`, rather than assuming a successful merge or a successful workflow means production is current.

## How it works

1. In `update-data.yml`, scheduled/manual refreshes publish after the data step; a push to `main` takes the fast code-deploy path without a full crawl. The deployment job checks out the current `main` HEAD. The manual `deploy.yml` fallback uses the same exact-artifact controller and verifies the checked-out SHA after deployment.
2. `scripts/deployment_provenance.py stamp --commit "$(git rev-parse HEAD)"` creates a temporary **`build-info.json`** in the artifact. It records the exact checkout commit SHA, Service Worker cache version, catalog version/count and SHA-256 hashes of the application shell, JS modules and sitemap. The file is not committed into the repository.
3. GitHub Pages deploys that exact artifact ID through its official REST API; only read requests retry.
4. A separate read-only `verify` job checks out **that exact SHA** and fetches live `build-info.json` and every recorded asset from GitHub Pages. It retries during CDN propagation and validates SHA-256 hashes, not just HTTP 200.
5. The job publishes a `radio-atlas-production-provenance` log. Only `DONE` in that report establishes that the checked files are actually deployed.

The verifier has no credentials to Search Console and cannot establish Google sitemap ingestion. It does not test whether live streaming sources work, and it does not clear users' favorites or IndexedDB.

## Manual reproduction

On the exact source commit being deployed:

```bash
python3 scripts/deployment_provenance.py stamp --commit <40-character-commit-sha>
python3 scripts/deployment_provenance.py verify --commit <same-sha> --attempts 20 --delay 6
```

**Interpretation**

- `DONE`: the public descriptor commit, local source hash set, published Service Worker version, and all tracked public asset bytes agree.
- `NOT VERIFIED`: deployment job did not complete or verification was not run.
- `BLOCKED`: network/permission prevents independent checks.
- `IN PROGRESS`: new artifact deployed but the CDN has not yet served all expected bytes; retry.
- `FAIL`: attempts exhausted or actual bytes differ. Do not claim success until identified.

A source commit is not a production commit until the verifier reports that exact SHA.

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
