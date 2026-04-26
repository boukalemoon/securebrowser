# SecureBrowser — Kurulum & Başlangıç Rehberi

## Gereksinimler

- **Node.js** v18 veya üzeri → https://nodejs.org
- **Git** → https://git-scm.com
- **GitHub hesabı** → https://github.com (private repo için)

---

## Adım 1: Node.js Kurulumu

### Windows
1. https://nodejs.org adresine git
2. "LTS" sürümünü indir ve kur (Next > Next > Finish)
3. Kurulum bittikten sonra **Komut İstemi** (cmd) veya **PowerShell** aç
4. Doğrula:
```
node --version    → v18.x.x veya üzeri görünmeli
npm --version     → 9.x.x veya üzeri görünmeli
```

### macOS
Terminal'e yapıştır:
```bash
# Homebrew yoksa önce kur:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Sonra Node.js:
brew install node
```

### Linux (Ubuntu/Debian)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
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

## Adım 3: GitHub Private Repo Oluştur

1. https://github.com adresine giriş yap
2. Sağ üstteki **+** butonuna tıkla → **New repository**
3. Ayarlar:
   - Repository name: `securebrowser`
   - Description: `Kişisel güvenli browser`
   - **Private** seçeneğini seç ✓
   - "Add a README file" kutusunu **işaretleme**
4. **Create repository** butonuna bas
5. Açılan sayfada "HTTPS" linkini kopyala:
   ```
   https://github.com/KULLANICI_ADIN/securebrowser.git
   ```

---

## Adım 4: Proje Dosyalarını Kur

Terminali aç ve sırayla şunları çalıştır:

```bash
# Proje klasörüne git (Windows'ta masaüstüne koymak için)
cd Desktop

# Projeyi başlat ve GitHub'a bağla
git init securebrowser
cd securebrowser

# Projenin dosyalarını bu klasöre kopyala
# (Claude'dan aldığın dosyaları buraya yapıştır)

# Bağımlılıkları yükle
npm install

# İlk commit ve GitHub'a gönder
git add .
git commit -m "Faz 1: Temel browser MVP"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/securebrowser.git
git push -u origin main
```

---

## Adım 5: Uygulamayı Çalıştır

```bash
# Geliştirme modunda başlat (DevTools açık)
npm run dev

# Normal başlatma
npm start
```

---

## Adım 6: Derleme (İsteğe Bağlı)

Uygulamayı `.exe`, `.dmg` veya `.AppImage` olarak derlemek için:

```bash
# Windows için
npm run build:win

# macOS için
npm run build:mac

# Linux için
npm run build:linux
```

Derlenen dosyalar `dist/` klasörüne gelir.

---

## Klavye Kısayolları

| Kısayol       | İşlev                    |
|---------------|--------------------------|
| Ctrl + T      | Yeni sekme               |
| Ctrl + W      | Sekmeyi kapat            |
| Ctrl + L      | Adres çubuğuna odaklan   |
| F5            | Sayfayı yenile           |
| Alt + Sol     | Geri                     |
| Alt + Sağ     | İleri                    |

---

## Sorun Giderme

**"electron: command not found" hatası:**
```bash
npm install -g electron
```

**"better-sqlite3" yüklenemiyor:**
```bash
npm install --build-from-source better-sqlite3
```

**Uygulama açılıyor ama sayfa yüklenmiyor:**
- `npm run dev` ile başlat ve DevTools'dan hata mesajını kontrol et

---

## Sonraki Adımlar (Faz 2)

Faz 1 çalıştıktan sonra Claude ile şunları yapabiliriz:
- WireGuard VPN entegrasyonu
- DNS sızıntısı koruması ve kill switch
- Gelişmiş fingerprint maskeleme
- Android/iOS mobil geliştirme

---

*SecureBrowser Faz 1 MVP — Kişisel kullanım için*
