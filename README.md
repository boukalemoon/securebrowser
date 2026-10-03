# İlgezdi

Gizlilik odaklı, Göktürk temalı masaüstü web tarayıcısı (Electron). Windows, macOS ve Linux.

- Site ve indirme: https://www.ilgezdi.com.tr
- Sürüm notları: https://www.ilgezdi.com.tr/surumler

## Geliştirme

```
npm ci
npm test        # bağımlılıksız test koşucusu (test/run.js) + kardeş sınama dosyaları
npm start       # uygulamayı geliştirme kipinde açar
```

Kurulum ve geliştirme ayrıntıları: [docs/KURULUM.md](docs/KURULUM.md).
Belgelerin tamamı: [docs/](docs/README.md).

## Klasörler

| Klasör | İçerik |
|---|---|
| `src/main` | Ana süreç (Electron): pencere, oturumlar, engelleyici, Ülgen motoru |
| `src/renderer` | Arayüz: paneller, ayarlar, Veri ve Gizlilik |
| `src/preload` | Sayfa ve arayüz ön yüklemeleri (yalıtılmış köprü) |
| `src/locales` | Arayüz metinleri (9 dil) |
| `site` | www.ilgezdi.com.tr (Vercel) |
| `api` | Sitenin sunucu uçları (Vercel) |
| `build` | Kurulum sihirbazı ve paketleme kaynakları |
| `scripts` | Derleme yardımcıları |
| `test` | Testler |
| `docs` | Belgeler |
