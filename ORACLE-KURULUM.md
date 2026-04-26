# SecureBrowser Faz 2 — Oracle Cloud + WireGuard Kurulum Rehberi

## Genel Bakış

Bu rehberde şunları yapacağız:
1. Oracle Cloud Free hesabı açmak
2. Ubuntu sunucu oluşturmak
3. WireGuard VPN kurmak
4. SecureBrowser'a bağlamak

---

## ADIM 1: Oracle Cloud Hesabı Aç

1. https://cloud.oracle.com adresine git
2. **"Start for free"** butonuna bas
3. E-posta adresi ve şifre belirle
4. Kredi kartı bilgisi **gerekiyor** (doğrulama için, ücret alınmaz)
5. **Home Region** seçiminde: **Germany Central (Frankfurt)** seç
   - ⚠️ Bu seçim kalıcıdır, sonradan değiştirilemiyor!
6. Hesap aktivasyonunu bekle (5–15 dakika)

---

## ADIM 2: Ubuntu Sunucu Oluştur

1. Oracle Cloud dashboard'a gir
2. Sol menüden **Compute → Instances** seç
3. **"Create instance"** butonuna bas
4. Ayarlar:

| Alan | Değer |
|------|-------|
| Name | `securebrowser-vpn` |
| Image | Ubuntu 22.04 LTS (Minimal) |
| Shape | **VM.Standard.E2.1.Micro** (Free Tier) |
| OCPUs | 1 |
| RAM | 1 GB |

5. **"Add SSH keys"** bölümünde:
   - "Generate a key pair for me" seç
   - **Private key'i indir ve güvenli bir yere kaydet**
6. **"Create"** butonuna bas
7. Sunucu **Running** durumuna gelince devam et (2–3 dakika)

---

## ADIM 3: Oracle Cloud Güvenlik Kuralları (Port Açma)

WireGuard UDP port 51820'yi açman gerekiyor:

1. Oluşturulan instance'a tıkla
2. **"Subnet"** linkine tıkla
3. **"Default Security List"** e tıkla
4. **"Add Ingress Rules"** butonuna bas
5. Şu değerleri gir:

| Alan | Değer |
|------|-------|
| Source CIDR | `0.0.0.0/0` |
| IP Protocol | UDP |
| Destination Port | `51820` |
| Description | WireGuard VPN |

6. **"Add Ingress Rules"** ile kaydet

---

## ADIM 4: Sunucuya Bağlan

### Windows (PowerShell veya CMD):
```cmd
ssh -i C:\Users\KULLANICI\Downloads\ssh-key-...key ubuntu@SUNUCU_IP
```

### macOS / Linux:
```bash
chmod 600 ~/Downloads/ssh-key-...key
ssh -i ~/Downloads/ssh-key-...key ubuntu@SUNUCU_IP
```

`SUNUCU_IP` = Oracle Cloud'daki **Public IP address** değeri

---

## ADIM 5: WireGuard Kur (Tek Komut)

Sunucuya bağlandıktan sonra şu komutu çalıştır:

```bash
curl -O https://raw.githubusercontent.com/... # Dosyayı manuel kopyala
# VEYA direkt aşağıdaki yöntemi kullan:

# wireguard-setup.sh dosyasını sunucuya kopyala:
# Yerel makinende (Windows CMD):
scp -i ssh-key.key wireguard-setup.sh ubuntu@SUNUCU_IP:~

# Sunucuda çalıştır:
sudo bash wireguard-setup.sh
```

Script tamamlandığında şu bilgileri ekrana yazdıracak:
```
╔══════════════════════════════════════════════════════════════╗
║                    KURULUM TAMAMLANDI ✓                      ║
╚══════════════════════════════════════════════════════════════╝

SecureBrowser'a Ekleyeceğin Bilgiler:
────────────────────────────────────────
  Sunucu Adı  : Oracle Cloud EU
  Konum       : 🇩🇪 Frankfurt
  Endpoint    : 1.2.3.4:51820
  Public Key  : XXXX...
  Private Key : YYYY...
  İstemci IP  : 10.0.0.2/32
  DNS         : 10.0.0.1
────────────────────────────────────────
```

**Bu bilgileri bir yere kaydet!**

---

## ADIM 6: SecureBrowser'a VPN Ekle

1. SecureBrowser'ı aç
2. Araç çubuğundaki **🔒** butonuna tıkla (VPN Yönetimi)
3. **"Sunucu Ekle"** bölümünü doldur:

| Alan | Değer (scriptten kopyala) |
|------|--------------------------|
| Sunucu Adı | Oracle Cloud EU |
| Konum | 🇩🇪 Frankfurt |
| Endpoint | `SUNUCU_IP:51820` |
| Public Key | Script çıktısındaki Public Key |
| Private Key | Script çıktısındaki Private Key |
| İstemci IP | `10.0.0.2/32` |
| DNS | `10.0.0.1` |

4. **"Sunucu Ekle"** butonuna bas
5. Eklenen sunucunun yanındaki **"Bağlan"** butonuna bas

---

## ADIM 7: Bağlantıyı Test Et

### VPN çalışıyor mu?
1. VPN bağlandıktan sonra https://whatismyip.com adresine git
2. IP adresi **Oracle sunucunun IP'si** olmalı (senin gerçek IP'n değil)

### DNS sızıntısı var mı?
1. VPN panelinde **"DNS Sızıntı Testi"** butonuna bas
2. Tüm sorgular VPN üzerinden geçiyorsa güvendesin

### Kill Switch test:
1. VPN bağlıyken bağlantıyı kes
2. İnternet erişimi tamamen kesilmeli
3. VPN yeniden bağlandığında internet geri gelmeli

---

## Oracle Cloud Free Tier Limitleri

| Kaynak | Limit |
|--------|-------|
| VM Instances | 2 adet (AMD) |
| OCPU | 1 per instance |
| RAM | 1 GB per instance |
| Depolama | 200 GB toplam |
| Bant genişliği | 10 TB/ay çıkış |
| Fiyat | **Süresiz ücretsiz** |

---

## Sorun Giderme

**WireGuard bağlanamıyor:**
```bash
# Sunucuda kontrol:
sudo wg show
sudo systemctl status wg-quick@wg0
sudo journalctl -u wg-quick@wg0 -n 50
```

**Port 51820 açık mı?**
```bash
# Yerel makinenden test:
nc -zu SUNUCU_IP 51820
```

**DNS sorunu:**
```bash
# Sunucuda:
sudo systemctl status unbound
sudo unbound-control status
```

---

## Ek İstemci Ekle (Aile üyesi / başka cihaz)

Sunucuda şu komutu çalıştır:
```bash
sudo bash /etc/wireguard/add-client.sh telefon-2
```

Yeni bir Public/Private key çifti ve IP adresi oluşturulur.
Aynı şekilde SecureBrowser'a eklenebilir.

---

*SecureBrowser Faz 2 — WireGuard VPN Entegrasyonu*
