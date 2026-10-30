# 📻 Radio Atlas — راديو أطلس

دليل بحث ذكي يجمع أجهزة الاستقبال (SDR) ومحطات البث المتاحة أونلاين في مكان واحد، مع تحديث تلقائي مستمر للبيانات.

> **المرحلة الحالية: MVP** — دليل KiwiSDR كامل + محطات FM/إنترنت بتشغيل مباشر من الموقع.

## المعمارية

```mermaid
flowchart LR
    A[KiwiSDR JSON] --> C[Crawler]
    B[Radio-Browser API] --> C
    C[GitHub Actions — كل 30 دقيقة] --> D[(data/*.json)]
    D --> E[GitHub Pages — PWA]
```

- **الواجهة:** PWA عربية (RTL)، بدون أي dependencies — HTML + CSS + vanilla JS + Service Worker.
- **البيانات:** لقطات JSON محدثة تلقائيًا بواسطة `scripts/update_data.py` داخل GitHub Actions.
- **البحث في محطات FM:** حي ومباشر من Radio-Browser API (CORS مفتوح)، مع snapshot احتياطي.

## الميزات (MVP)

- 🛰️ دليل أجهزة KiwiSDR: الحالة (أونلاين/أوفلاين)، عدد المستخدمين، SNR، النطاق، GPS
- 🔎 بحث فوري بالاسم/البلد/النداء + فلترة بالنطاق و SNR الأدنى و«فيه مكان فاضي»
- 📻 محطات FM/إنترنت: الأكثر استماعًا عالميًا + بحث حي + مشغل صوتي داخلي
- 📱 قابلة للتثبيت كتطبيق (PWA) و تعمل أوفلاين للواجهة

## التشغيل محليًا

```bash
python scripts/update_data.py   # سحب البيانات
python -m http.server 8000       # ثم افتح http://localhost:8000
```

## تفعيل النشر على GitHub Pages (مرة واحدة)

1. من صفحة الريبو: **Settings → Pages**
2. تحت **Build and deployment**: اختر **Source: GitHub Actions**
3. شغّل workflow **Deploy to GitHub Pages** من تبويب Actions (أو دوس أي commit جديد)

الموقع هيكون على: `https://samo-tech.github.io/Radio/`

## خطة المراحل

| المرحلة | المحتوى |
|---|---|
| ✅ MVP | دليل KiwiSDR + محطات FM + crawler + Pages |
| 2️⃣ | تشغيل صوتي داخلي لأجهزة Kiwi (WebSocket) + OpenWebRX |
| 3️⃣ | WebSDR + جداول البث الدولي (EIBI) + نطاق الطيران |
| 4️⃣ | تنبيهات «فتح النطاقات» (WSPRnet + تاريخ SNR) + SatNOGS + AIS/ADS-B |

## بروتوكول التطوير

- أي تعديل يتعمل على branch منفصل + Pull Request
- رسائل الـ commits بصيغة conventional (`feat:`, `fix:`, `chore:`)
- البيانات المولدة لا تُعدل يدويًا أبدًا — فقط عن طريق الـ crawler

---
**SamoTech/Radio** — Cairo 🇪🇬
