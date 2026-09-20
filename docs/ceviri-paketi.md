# Çeviri dil paketi — sunucuya kurulum

İlgezdi'nin cihaz içi çevirisi (Ülgen → "özeti Türkçeye çevir") iki şeye ihtiyaç
duyar: **WASM motoru** ve **dil modeli**. İkisi de uygulamaya paketlenmez;
kullanıcı çeviriyi açınca **`www.ilgezdi.com.tr/ceviri` altından** iner.

**Neden kendi sunucumuz:** dosyalar Mozilla'nın Google Cloud deposunda da
duruyor, ama o zaman kullanıcının IP'si Google'a görünürdü. Kendi sunucumuzdan
sunmak İlgezdi'nin duruşuyla tutarlı ve MPL-2.0 buna izin veriyor
(lisans/atıf: `src/main/ceviri/LISANS.md`).

## Sunucudaki düzen

```
/ceviri/motor/bergamot-translator-worker.wasm.gz
/ceviri/en-tr/model.entr.intgemm.alphas.bin.gz
/ceviri/en-tr/lex.50.50.entr.s2t.bin.gz
/ceviri/en-tr/vocab.entr.spm.gz
```

| Dosya | Boyut (gz) | SHA-256 |
|---|---|---|
| `motor/bergamot-translator-worker.wasm.gz` | 1.857.881 | `24b80fdd0cfe326a69fdb3f8f17619cad0e6179098bd71636445d0e4803514d2` |
| `en-tr/model.entr.intgemm.alphas.bin.gz` | 13.159.314 | `52d10136b1a4804879989aa9ee146e83ced75aa0ce2d371b4e582473ed6b9020` |
| `en-tr/lex.50.50.entr.s2t.bin.gz` | 1.546.258 | `cf74d4edec0b51affd30a43e6bd2c2274bf4ce7fd54c24fd293db2c5c4bf043d` |
| `en-tr/vocab.entr.spm.gz` | 395.473 | `01e55973e65a34c5efbdce3968857d4e53998b4bef131c5125a19f8e44d8f87c` |

Toplam indirme **16,2 MB**; kullanıcının diskinde açılmış hâli **~26 MB**.

Aynı özetler `src/main/ulgen-ceviri.js` içinde de yazılıdır. **Dosya değişirse
uygulama onu kurmaz** — sunucu ele geçirilse bile listede olmayan ya da özeti
tutmayan bir şey kullanıcının makinesine yazılmaz. Model güncellenecekse önce
koddaki özet güncellenir, sonra dosya yüklenir.

## Dosyaları üretme (tekrarlanabilir)

Model dosyaları Mozilla'nın yayımladığı `en-tr` (tiny, "Release") modelidir:

```sh
B=https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/models/en-tr/spring-2024_LiFGeNrEQpKdNlziG2qP_A/exported
curl -sSLO $B/model.entr.intgemm.alphas.bin.gz
curl -sSLO $B/lex.50.50.entr.s2t.bin.gz
curl -sSLO $B/vocab.entr.spm.gz
```

WASM motoru npm paketinden çıkar ve burada sıkıştırılır:

```sh
npm pack @mkljczk/bergamot-translator@0.4.16
tar xf mkljczk-bergamot-translator-0.4.16.tgz package/worker/bergamot-translator-worker.wasm
# -n ŞART: gzip normalde dosya adını ve zaman damgasını baytlara gömer,
# o zaman aynı içerikten her seferinde BAŞKA bir özet çıkar.
gzip -9 -n -c package/worker/bergamot-translator-worker.wasm > bergamot-translator-worker.wasm.gz
```

Yükledikten sonra özetleri doğrula:

```sh
sha256sum *.gz          # yukarıdaki tabloyla birebir aynı olmalı
# İçerik denetimi (sıkıştırmadan bağımsız): açılmış WASM her zaman
gzip -dc bergamot-translator-worker.wasm.gz | sha256sum
# → 735d4d95ede043c48f146b9a89336077f18885ad30b7e9a6a86c51a73ca02e7b
```

⚠️ `-n` olmadan üretilen dosya **aynı boyutta ama başka özette** çıkar
(ölçüldü 20.09.2026: damgalı 1.857.913 bayt / `b28dc11c…`, damgasız 1.857.881
bayt / `24b80fdd…`). Koda yazılı olan **damgasız** olandır.

## ⚠️ Sunucu ayarı

Tehlikeli olan tek şey: `.gz` dosyasını **`Content-Encoding: gzip`** diye
etiketlemek. O zaman istemci katmanı dosyayı kendiliğinden açar, uygulamanın
gördüğü baytlar `.gz` değil `.bin` olur, **SHA-256 tutmaz ve paket kurulmaz**.
Doğru etiket:

```
Content-Type: application/octet-stream
```

**Taşıma sıkıştırması ayrı bir şeydir ve sorun değildir.** Ölçüldü
(20.09.2026, canlı): Vercel bu dosyaları `content-encoding: br` ile
gönderiyor, istemci şeffaf biçimde açıyor ve elimize yine birebir `.gz`
baytları geçiyor — indirme ve özet doğrulaması sorunsuz çalıştı.

⚠️ **`curl -sI` ile denetim YANILTIR:** curl varsayılan olarak sıkıştırma
istemediği için `content-encoding` satırını hiç görmezsiniz; Node/Chromium
ister ve görür. Yani başlığa bakmak yerine **uçtan uca** denetleyin:

```sh
# İnen dosya, koddaki özetle birebir mi? (taşıma sıkıştırmasından bağımsız)
curl -sL --compressed https://www.ilgezdi.com.tr/ceviri/en-tr/vocab.entr.spm.gz | sha256sum
# → 01e55973e65a34c5efbdce3968857d4e53998b4bef131c5125a19f8e44d8f87c
curl -sL --compressed https://www.ilgezdi.com.tr/ceviri/motor/bergamot-translator-worker.wasm.gz | gzip -dc | sha256sum
# → 735d4d95ede043c48f146b9a89336077f18885ad30b7e9a6a86c51a73ca02e7b   (açılmış WASM)
```

Bu iki satır tutuyorsa yayın doğrudur; başlıklar ne derse desin.

## Yeni dil çifti eklerken

1. Mozilla kayıt dosyasından çifti bul:
   `https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json`
   (`releaseStatus: "Release"` olanı seç).
2. Dosyaları indir, `sha256sum` al.
3. `src/main/ulgen-ceviri.js` → `PAKETLER` ve `DESTEKLENEN` içine ekle.
4. Sunucuya `/ceviri/<kaynak>-<hedef>/` altına yükle.

Mozilla modellerinin çoğu **X→en** ve **en→X** yönündedir; Almanca gibi bir
sayfayı Türkçeye çevirmek için `de-en` + `en-tr` ile iki adımlı geçiş gerekir
(ikinci paket ayrıca iner). Bugün yalnız **en→tr** desteklenir; başka dilde
motor "desteklenmiyor" der ve çeviri teklif edilmez.
