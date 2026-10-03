# İlgezdi — Kurulum & Geliştirme Rehberi

## Gereksinimler

- **Node.js 22.12 veya üzeri** (önerilen: 24 LTS) → https://nodejs.org
  Electron 44 ve electron-builder 26 ile gelen araçlar (`@electron/rebuild`,
  `@electron/get`) Node 22.12'den eskisinde çalışmaz.
- **Git** → https://git-scm.com

---

## Adım 1: Node.js Kurulumu

### Windows
1. https://nodejs.org adresine git
2. "LTS" sürümünü indir ve kur (Next > Next > Finish)
3. Kurulum bittikten sonra **Komut İstemi** (cmd) veya **PowerShell** aç
4. Doğrula:
```
node --version    → v22.12.0 veya üzeri görünmeli (önerilen v24.x)
npm --version     → 10.x.x veya üzeri görünmeli
```

### macOS
Terminal'e yapıştır:
```bash
# Homebrew yoksa önce kur:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Sonra Node.js:
brew install node@24
```

### Linux (Ubuntu/Debian)
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## Adım 2: Git Kurulumu

### Windows
https://git-scm.com/download/win adresinden indir ve kur.
Kurulum sırasında "Git Bash" seçeneğini aktif bırak.

### macOS
```bash
brew install git
```

### Linux
```bash
sudo apt-get install git
```

---

## Adım 3: Projeyi İndir ve Bağımlılıkları Kur

```bash
git clone https://github.com/boukalemoon/securebrowser.git ilgezdi
cd ilgezdi
npm install
```

> **Not (Electron 42+):** `npm install` artık Electron ikili dosyasını indirmez.
> İkili (~110 MB) **ilk `npm start` çalıştırmasında** otomatik ve sağlama
> doğrulamalı olarak indirilir; sonraki çalıştırmalar aynı dosyayı kullanır.
> Önceden indirmek isterseniz: `npx install-electron --no`

---

## Adım 4: Uygulamayı Çalıştır

```bash
# Geliştirme modunda başlat (DevTools açık)
npm run dev

# Normal başlatma
npm start

# Testler (bağımlılıksız, Electron gerektirmez)
npm test
```

---

## Adım 5: Derleme (İsteğe Bağlı)

Uygulamayı `.exe`, `.dmg` veya `.AppImage` olarak derlemek için:

```bash
# Windows için (NSIS kurulum dosyası)
npm run build:win

# macOS için
npm run build:mac

# Linux için
npm run build:linux

# Yalnızca paketlenmiş klasör (kurulum dosyası olmadan, hızlı deneme için)
npm run pack
```

Derlenen dosyalar `dist/` klasörüne gelir. electron-builder paketleme için kendi
Electron kopyasını indirir; `npm start` için indirilen ikiliye ihtiyaç duymaz.

> **Otomatik güncelleme:** `app-update.yml` yalnızca gerçek kurulum hedefleri
> (Windows'ta NSIS) derlenirken üretilir. `npm run pack` çıktısında bu dosyanın
> olmaması normaldir.

### Yayın

`v*` biçiminde bir etiket gönderildiğinde (ör. `git tag v0.8.0 && git push --tags`)
GitHub Actions (`.github/workflows/release.yml`) Windows, macOS ve Linux kurulum
dosyalarını derleyip GitHub Releases'e yükler.

---

## Klavye Kısayolları

| Kısayol          | İşlev                                   |
|------------------|-----------------------------------------|
| Ctrl + T         | Yeni sekme                              |
| Ctrl + W         | Sekmeyi kapat                           |
| Ctrl + L         | Adres çubuğuna odaklan                  |
| Ctrl + D         | Yer imine ekle                          |
| Ctrl + B         | Yer imleri paneli                       |
| Ctrl + Shift + N | Gizli pencere                           |
| Ctrl + Shift + L | Ziyaret günlüğü paneli                  |
| Ctrl + Shift + V | VPN paneli                              |
| Ctrl + ,         | Ayarlar                                 |
| F5               | Sayfayı yenile                          |
| Alt + Sol / Sağ  | Geri / İleri                            |
| Alt + Tıklama    | Bağlantıyı Glance önizlemesinde aç      |
| Alt + Enter      | Adres çubuğundaki adresi Glance'te aç   |
| Esc              | Açık ekranı ya da paneli kapat          |

---

## Sorun Giderme

**Electron ikili dosyası bulunamıyor / indirilemiyor:**
```bash
npx install-electron --no
```
Hâlâ olmuyorsa `node_modules/electron` klasörünü silip `npm install` ve ardından
yukarıdaki komutu tekrar çalıştırın.

**Uygulama açılır açılmaz `Cannot read properties of undefined (reading 'getVersion')` hatası:**
Ortamda `ELECTRON_RUN_AS_NODE=1` değişkeni tanımlı demektir (bazı geliştirme
araçları bunu ayarlar). Bu değişken Electron'u düz Node olarak çalıştırır.
```bash
# PowerShell
Remove-Item Env:ELECTRON_RUN_AS_NODE
# Git Bash
unset ELECTRON_RUN_AS_NODE
```

**Uygulama açılıyor ama bir özellik çalışmıyor:**
- Ayarlar → **Tanılama** sekmesinde son olaylara bakın; "Dosyaya Kaydet" ile
  kimliksizleştirilmiş bir rapor alabilirsiniz.
- Tanılama günlükleri: `%APPDATA%\ilgezdi\diagnostics\` (Windows),
  `~/Library/Application Support/ilgezdi/diagnostics/` (macOS),
  `~/.config/ilgezdi/diagnostics/` (Linux)
- `npm run dev` ile başlatıp DevTools konsolunu kontrol edin.

---

*İlgezdi — Göktürk temalı, gizlilik odaklı web tarayıcısı*
