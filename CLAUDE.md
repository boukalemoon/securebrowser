# İlgezdi — Çalışma Kuralları

## Kesin kurallar
- Hiçbir port açma, hiçbir sunucu/süreç/konteyner başlatma veya durdurma.
- Ana Ülgen'e (127.0.0.1:8765) ve SearXNG'ye (127.0.0.1:8888) dokunma; adreslerini değiştirme.
- Uygulamayı (npm start / electron) sen başlatma; Burak başlatır.
- Sadece görevde adı geçen dosyaları değiştir. Yeni bağımlılık ekleme.
- Görev bitince göster: `git diff --stat` ve `npm test` çıktısının son 30 satırı.
- "Düzelttim" deme; ne değişti ve test ne dedi, onu yaz.

## Sabit bilgiler
- 8765 = ana Ülgen paneli/API (kasıtlı, doğru).
- 8888 = SearXNG (Docker: ulgen-searxng), JSON açık.

## Durum dürüstlüğü (bağımsız denetim, 06.10.2026)
- Commit başlığı durumla başlar: `[denenmedi]`, `[birim testi geçti]`, `[CI'da doğrulandı]`, `[Burak ölçtü]`. Kullanıcıya gitmediyse "düzeltildi" yazılmaz.
- "Kullanıcıya ulaştı" yalnız `vX` etiketi atılıp GitHub Release'te dosyalar ve sitedeki indirme bağlantısı doğrulandıktan sonra söylenir.
- Site sürüm notları yalnız ölçülmüş davranışı yazar; ölçülmeyen için "garanti edemiyoruz" denir.
- Google girişi / bot denetimine dokunan değişiklikten önce kodda o konudaki eski gerekçe yorumları okunur; çelişen değişiklik yapılmaz.
- Ağa çıkan betikler (`test/arastir*.js` vb.) Burak'ın açık onayı olmadan çalıştırılmaz (`ILGEZDI_AGA_CIK=1`). Üçüncü taraf arama motorları otomatik taranmaz.
- Kaynak metnini kilitleyen test, davranış doğrulaması yerine sayılmaz; davranış ölçülemiyorsa bu açıkça yazılır.
