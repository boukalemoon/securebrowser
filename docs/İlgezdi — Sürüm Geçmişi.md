---
title: İlgezdi — Sürüm Geçmişi
tags: [ilgezdi, changelog, surum, versiyon]
aliases: [İlgezdi Changelog, Sürüm Geçmişi]
guncel_surum: 0.6.0
tarih: 2026-07-02
---

# 📦 İlgezdi — Sürüm Geçmişi

> [!note] Numaralandırma
> **Anlamsal sürümleme (SemVer): `MAJOR.MINOR.PATCH`**
> - `MAJOR` — geriye uyumsuz büyük değişiklik / kararlı milestone
> - `MINOR` — yeni özellik grubu (bir "Adım/Faz")
> - `PATCH` — hata düzeltmesi / küçük iyileştirme
>
> Not: Eski "Faz/Adım" numaraları bu şemaya taşındı. UI (`v0.5`) ve `package.json` (`0.2.0`) uyumsuzdu; `v0.6.0` ile hizalandı.

İlgili: [[İlgezdi — Tarayıcı Gereksinim Analizi]]

---

## [0.6.0] — 2026-07-02 · "Ötüken"

### ✨ Eklendi
- **Claude Design tema sistemi** — 4 tema (Ötüken, Umay, Kağan, Hibrit) birebir entegre edildi.
- Tema anahtarı (`settings-panel.js`) token değerleriyle senkronlandı; canlı önizleme + accent paleti güncellendi.

### 🐛 Düzeltildi
- **Incognito — yer imi popup'ı** yanlış pencerede açılıyordu → pencere-farkında yapıldı (`event.sender`).
- **Incognito — Glance (link önizleme)** ana pencerede açılıyordu → pencere-farkında yapıldı.
- Tema üstüne yanlış inline `--accent` bindirmesi; eski `DM Sans` fontu → Inter migrasyonu.

### 🧹 Temizlendi
- Yüklenmeyen yetim tema CSS'leri silindi (`themes.css`, `themes/*.css`, `tokens/semantic.css`).

---

## [0.5.0] — (öncesi) · "CSS Overhaul (Faz 5)"
- Font-size ayarı, yeni sekme iskeleti, incognito iskeleti (yarım).
- CSS token mimarisine geçiş başlangıcı.

## [0.4.0] · "Faz 4"
- Ayarlar & özelleştirme paneli, config.json kalıcılığı.

## [0.2.0] · "Faz 2"
- WireGuard VPN entegrasyonu (package.json bu sürümde kalmıştı).

---

## 🔜 Planlanan

- **[0.7.0]** — İndirmeler + sağ tık bağlam menüsü *(🔴 kritik)*
- **[0.8.0]** — Geçmiş sayfası, `Ctrl+F`, zoom, yazdırma
- **[0.9.0]** — İzin yönetimi, sertifika hataları, oturum geri yükleme
- **[1.0.0]** — Adres çubuğu önerileri, sekme UX, kararlı sürüm

#ilgezdi #changelog
