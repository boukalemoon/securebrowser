# Çeviri motoru — üçüncü taraf kod (MPL-2.0)

Bu klasördeki iki dosya **Mozilla Public License 2.0** altındadır ve öyle kalır:

| Dosya | Kaynak | Değişiklik |
|---|---|---|
| `bergamot-translator-worker.js` | Bergamot WASM Emscripten tutkalı (`@mkljczk/bergamot-translator` 0.4.16) | **yok** |
| `bergamot-worker.cjs` | aynı paketin `worker/translator-worker.js` dosyası | **iki yama**, dosyada "İLGEZDİ YAMASI" diye işaretli |

Yukarı akış: <https://github.com/mozilla/translations> (motor), <https://codeberg.org/mkljczk/bergamot-translator> (npm paketi).
Lisans metni: <https://www.mozilla.org/MPL/2.0/>.

**Dil modelleri** ayrıca Mozilla'nındır ve MPL-2.0 ile dağıtılır
(`mozilla/translations` README: *"The model files are distributed under the MPL 2.0 license."*).
İlgezdi bu dosyaları kendi sunucusundan sunar; kullanıcı Google'a bağlanmaz.

**WASM ikilisi (`bergamot-translator-worker.wasm`) burada DEĞİLDİR**: uygulamaya
paketlenmez, çeviri açılınca kullanıcının makinesine indirilir (userData).
