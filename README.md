# HealthAi — Vercel Project

مشروع HealthAi مقسّم إلى واجهة Frontend وVercel Functions في Backend.

## هيكل المشروع

```text
healthai-vercel/
├── index.html
├── styles.css
├── app.js
├── api/
│   ├── _shared.js
│   ├── gemini.js
│   └── images.js
├── .env.example
├── .gitignore
├── package.json
└── vercel.json
```

## متغيرات البيئة في Vercel

من داخل مشروع Vercel افتح:

**Settings → Environment Variables**

ثم أضف:

| الاسم | مطلوب | الاستخدام |
|---|---:|---|
| `GEMINI_API_KEY` | نعم | إنشاء الخطط والمحادثة وتحليل صور الوجبات |
| `UNSPLASH_ACCESS_KEY` | لا | البحث عن صور وجبات مناسبة |
| `ALLOWED_ORIGIN` | لا | تقييد API على دومين الموقع، مثل `https://your-site.vercel.app` |

بعد تعديل متغيرات البيئة اعمل **Redeploy**؛ التغييرات لا تُطبّق على النشر السابق.

## النشر بالطريقة الأسهل

1. ارفع المجلد إلى GitHub.
2. افتح Vercel واختر **Add New Project**.
3. استورد المستودع.
4. اترك Framework Preset على **Other**.
5. أضف Environment Variables.
6. اضغط **Deploy**.

لا يوجد Build Command ولا Output Directory.

## التشغيل محليًا

ثبّت Vercel CLI:

```bash
npm i -g vercel
```

انسخ ملف البيئة:

```bash
cp .env.example .env.local
```

ضع المفاتيح ثم شغّل:

```bash
vercel dev
```

افتح العنوان الذي يظهر في الطرفية، غالبًا:

```text
http://localhost:3000
```

> لا تفتح `index.html` مباشرة عند الاختبار المحلي، لأن مسارات `/api/*` تحتاج `vercel dev`.

## الحماية

المفاتيح لا توجد داخل `app.js` ولا يتم إرسالها إلى المتصفح. المتصفح يتصل بهذه المسارات فقط:

- `POST /api/gemini`
- `GET /api/images`

يمكن إضافة `ALLOWED_ORIGIN` لتقليل استخدام الدوال من واجهات أخرى. هذا لا يُعد نظام مصادقة كاملًا؛ للموقع التجاري يُفضّل إضافة تسجيل مستخدمين، Rate Limiting، وBot Protection.

## ملاحظة تحليل الصور

الواجهة تضغط صورة الوجبة قبل إرسالها. الصور الكبيرة جدًا قد تتجاوز حد طلب Vercel، لذلك يفضّل إبقاء الصورة تحت عدة ميجابايت.


## المميزات الإضافية

- سجل يومي للسعرات والبروتين والمياه
- مخزن مكونات محلي واقتراح وصفات بالذكاء الاصطناعي
- إدخال صوتي للوجبات في المتصفحات المدعومة
- تذكيرات محلية أثناء فتح التطبيق
- وضع رمضان وإرشادات مخصصة
- قوالب لأنماط الحياة
- مقارنة الوجبات والمنتجات
- تقرير أسبوعي ذكي
- نقاط وتحديات وسلسلة التزام
- PWA قابلة للتثبيت مع Offline App Shell

جميع بيانات المستخدم في هذه المميزات محفوظة في `localStorage` داخل الجهاز. لا يوجد تسجيل دخول أو قاعدة بيانات.
