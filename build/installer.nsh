; İlgezdi — Windows'a tarayıcı olarak kayıt (Ayarlar › Uygulamalar › Varsayılan uygulamalar).
;
; Windows 10 ve sonrası uygulamaların kendini varsayılan tarayıcı YAPMASINA izin vermez:
; uygulama yalnızca "tarayıcı" olarak kaydolur, seçimi kullanıcı Ayarlar'dan yapar.
; İlgezdi › Ayarlar › Genel › "Varsayılan yap" düğmesi o sayfayı İlgezdi seçili açar
; (ms-settings:defaultapps?registeredAppUser=Ilgezdi — ad buradaki RegisteredApplications
; değeriyle aynı olmalı).
;
; Kurulum kullanıcı başına (perMachine: false) → kayıtlar HKCU altında. Bağlantı
; `"İlgezdi.exe" "https://…"` diye açılır; uygulama zaten çalışıyorsa adres çalışan
; pencereye iletilir ve yeni sekmede açılır (main.js → second-instance).
; Dosya UTF-8 BOM'lu: NSIS Türkçe karakterleri ancak böyle doğru okur.

!macro customInstall
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi" "" "İlgezdi"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities" "ApplicationName" "İlgezdi"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities" "ApplicationDescription" "Gizlilik odaklı, reklam ve izleyici engelleyen güvenli tarayıcı"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities\StartMenu" "StartMenuInternet" "Ilgezdi"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities\URLAssociations" "http" "IlgezdiURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities\URLAssociations" "https" "IlgezdiURL"
  WriteRegStr HKCU "Software\RegisteredApplications" "Ilgezdi" "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities"

  WriteRegStr HKCU "Software\Classes\IlgezdiURL" "" "İlgezdi bağlantısı"
  WriteRegStr HKCU "Software\Classes\IlgezdiURL" "FriendlyTypeName" "İlgezdi bağlantısı"
  WriteRegStr HKCU "Software\Classes\IlgezdiURL\Application" "ApplicationName" "İlgezdi"
  WriteRegStr HKCU "Software\Classes\IlgezdiURL\Application" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\IlgezdiURL\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\IlgezdiURL\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Kabuğa ilişkilendirmelerin değiştiğini bildir (Ayarlar listesi yenilensin).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "Ilgezdi"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Ilgezdi"
  DeleteRegKey HKCU "Software\Classes\IlgezdiURL"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
