# Halal Crypto Intelligence & Investment Analytics Platform

منصة استخبارات شرعية واستثمارية للعملات الرقمية مرتبطة بسوق **Binance Spot** فقط (قراءة وتحليل فقط — بدون تداول آلي، بدون عقود آجلة أو رافعة مالية، وبدون أي صلاحيات سحب).

---

## تنزيل وتثبيت التطبيقات (مع تحديث تلقائي من GitHub Releases)

يمكنك تنزيل أحدث نسخة جاهزة دائماً من صفحة **[GitHub Releases](https://github.com/aliazizdbab/halal-crypto-intelligence/releases)** أو من داخل المنصة عبر صفحة **`/downloads`**:

| المنصة | الملف / الطريقة | آلية التحديث التلقائي |
|---|---|---|
| **Windows (10/11 x64)** | `Halal-Crypto-Intelligence-Setup-x.y.z.exe` (مستقل بالكامل بدون الحاجة لتثبيت Node.js) | تحديث تلقائي عبر **`electron-updater`** من GitHub Releases مع حفظ قاعدة البيانات في `%APPDATA%` |
| **Android (8.0+)** | `Halal-Crypto-Intelligence-vx.y.z.apk` (تطبيق Capacitor أصلي) | فحص تلقائي لإصدارات GitHub Releases وإشعار مباشر بتنزيل وتثبيت الـ APK الأحدث + أسعار Binance Spot حية |
| **Web / PWA** | تثبيت مباشر من المتصفح (`Add to Home Screen` / `Install App`) أو نشر عبر `Dockerfile` / `render.yaml` / `railway.json` | إعادة نشر تلقائية من GitHub عند كل `git push` إلى `main` |

---

## المميزات الرئيسية

- **تكامل Binance Spot الحقيقي:** التحقق الصارم عبر `/api/v3/exchangeInfo` من حالة `TRADING` وصلاحية `SPOT` على أزواج `USDT` مع Fallback تلقائي إلى `data-api.binance.vision` وبث أسعار لحظي عبر **Binance WebSocket**.
- **سجل الفحص الشرعي الموثّق (Auditable Shariah Registry):** 37+ عملة موثّقة بالمصادر والروابط (بما فيها شهادات Shariyah Review Bureau وSharlife وIFG وCryptoHalal وHalalScreener) + واجهة إدارة واستيراد JSON وسجل تدقيق (Audit Trail).
- **الترتيب الافتراضي:** من **أقل سعر للوحدة إلى أعلى سعر** مع 9 خيارات ترتيب إضافية وتنبيه واضح للفصل بين سعر الوحدة والقيمة السوقية (`Market Cap` و`FDV`).
- **موثوقية المشروع (7 محاور موزونة) + فرص النمو + التوكنوميكس + السيناريوهات الثلاثة.**
- **التحليل الفني التفاعلي:** شارت شموع TradingView (`lightweight-charts`) على 9 أطر زمنية (`1m` حتى `1M`) مع `RSI, MACD, EMA/SMA, Bollinger, ATR, ADX, VWAP, Volume Profile` وعمق دفتر الأوامر.
- **المساعد البحثي الذكي + مركز التنبيهات (مع دعم Telegram) + تصدير Excel (9 أوراق) وCSV وPDF.**

---

## التشغيل والتطوير المحلي

```bash
npm install
npm run dev
```
ثم افتح: `http://localhost:3000`

### تشغيل نسخة سطح المكتب (Windows Electron) محلياً
```bash
npm run desktop:dev
# أو بناء المثبّت:
npm run desktop:build
```

### نشر إصدار جديد وتفعيل التحديث التلقائي لجميع المستخدمين
عندما تقوم بأي تعديل وتريد وصوله تلقائياً لكل مستخدمي Windows وAndroid والويب:
```bash
npm version patch   # أو minor / major
git push origin main --follow-tags
```
سيقوم **GitHub Actions** تلقائياً بـ:
1. تشغيل اختبارات `TypeScript` و`Vitest` وبناء الويب.
2. بناء مثبّت **Windows `.exe`** وملف `latest.yml` ورفعهما إلى GitHub Releases.
3. بناء حزمة **Android `.apk`** الموقّعة ورفعها إلى نفس الإصدار.
4. وصول إشعار التحديث التلقائي لجميع التطبيقات المثبتة.

---

> للمواصفات الهندسية الكاملة وقاعدة البيانات، راجع [ARCHITECTURE.md](./ARCHITECTURE.md).
