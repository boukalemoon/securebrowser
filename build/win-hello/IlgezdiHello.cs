// İlgezdi — Windows Hello doğrulama yardımcısı
//
// Neden ayrı bir exe: Electron'un Windows Hello için yerleşik bir API'si yok
// (systemPreferences.promptTouchID yalnızca macOS). npm'deki yerel modüller ya
// bakımsız (son sürüm 2019) ya da kurulumda node-gyp + MSVC istiyor ve
// electron-builder'ın mac/linux derlemelerini bozuyor. Bu yardımcı derleme
// sırasında .NET Framework'ün csc.exe'si ile üretilir, yalnızca Windows
// paketine girer ve child_process ile çağrılır.
//
// Gizlilik: UserConsentVerifier "bu oturumdaki kullanıcı mı?" sorusunu YEREL
// TPM/biyometrik servise sorar. Biyometrik şablon cihazdan çıkmaz, Microsoft
// hesabı ya da internet gerekmez, yerel hesap + PIN yeterlidir. Bu program
// hiçbir ağ çağrısı yapmaz, hiçbir şey diske yazmaz, hiçbir argümanı saklamaz.
//
// Kullanım:
//   IlgezdiHello.exe check           → çıkış kodu = UserConsentVerifierAvailability
//   IlgezdiHello.exe verify <mesaj>  → çıkış kodu = UserConsentVerificationResult
//
// Çıkış kodları (Windows'un kendi sabitleri):
//   check : 0 Available, 1 DeviceNotPresent, 2 NotConfiguredForUser,
//           3 DisabledByPolicy, 4 DeviceBusy
//   verify: 0 Verified, 1 DeviceNotPresent, 2 NotConfiguredForUser,
//           3 DisabledByPolicy, 4 DeviceBusy, 5 RetriesExhausted, 6 Canceled
//   90 = beklenmeyen hata, 91 = zaman aşımı, 92 = hatalı kullanım
//
// Yalnızca "Verified" (0) kabul edilir; başka her sonuçta İlgezdi kendi koduna düşer.

// NOT: AsTask() uzantısı System.Runtime.WindowsRuntime + Windows SDK'nın birleşik
// Windows.winmd dosyasını gerektiriyor; ikisine de bağımlı kalmamak için WinRT'nin
// kendi Completed işleyicisi doğrudan kullanılıyor. Böylece derleme için yalnızca
// her Windows'ta hazır gelen System32\WinMetadata yeterli oluyor.

using System;
using System.Threading;
using Windows.Foundation;
using Windows.Security.Credentials.UI;

static class IlgezdiHello
{
    const int TIMEOUT_MS = 120000;   // kullanıcı parmağını okutana kadar makul süre

    /// <summary>WinRT eşzamansız işlemini bekler; süre dolarsa hasTimeout döner.</summary>
    static bool Bekle<T>(IAsyncOperation<T> op, out T sonuc)
    {
        var bitti = new ManualResetEventSlim(false);
        T yakalanan = default(T);
        Exception hata = null;
        op.Completed = (bilgi, durum) =>
        {
            try { if (durum == AsyncStatus.Completed) yakalanan = bilgi.GetResults(); }
            catch (Exception e) { hata = e; }
            finally { bitti.Set(); }
        };
        bool zamanindaBitti = bitti.Wait(TIMEOUT_MS);
        if (hata != null) throw hata;
        sonuc = yakalanan;
        return zamanindaBitti;
    }

    static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0) return 92;

            if (args[0] == "check")
            {
                UserConsentVerifierAvailability durum;
                if (!Bekle(UserConsentVerifier.CheckAvailabilityAsync(), out durum)) return 91;
                return (int)durum;
            }

            if (args[0] == "verify")
            {
                string message = args.Length > 1 ? args[1] : "İlgezdi";
                UserConsentVerificationResult sonuc;
                if (!Bekle(UserConsentVerifier.RequestVerificationAsync(message), out sonuc)) return 91;
                return (int)sonuc;
            }

            return 92;
        }
        catch (Exception e)
        {
            // Ayrıntı stderr'e; ana süreç bunu yalnızca tanılamaya yazar.
            Console.Error.WriteLine(e.GetType().Name + ": " + e.Message);
            return 90;
        }
    }
}
