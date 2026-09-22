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