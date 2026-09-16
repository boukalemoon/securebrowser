; İlgezdi — kurulum sihirbazı eklentileri (electron-builder nsis.include).
; Dosya UTF-8 BOM'lu: NSIS Türkçe ve Kiril karakterleri ancak böyle doğru okur.
;
; ─── Kurulum dilleri ─────────────────────────────────────────────────────────
; Arayüzün dokuz dili sihirbazda da seçilebilir (açılışta dil penceresi, varsayılan
; Windows dili). electron-builder yalnızca NSIS paketinde dil dosyası bulunan dilleri
; ekleyebildiği için package.json'da installerLanguages yalnızca en_US; diller burada:
;   • Türkçe, İngilizce, Almanca, Fransızca → NSIS'in kendi dil dosyaları
;   • Azerbaycanca, Kazakça, Özbekçe, Türkmence, Kırgızca → build/installer-lang/*.nlf|*.nsh
;   • electron-builder mesajları ve İlgezdi metinleri → build/installer-lang/messages.nsh
;     (messages.json'dan node scripts/build-installer-messages.js ile üretilir)
; electron-builder "addLangs" makrosunu bu dosyadan önce tanımlar ve sayfalardan sonra
; çağırır; dil listesini değiştirmek için makro burada yeniden tanımlanıyor.
;
; Seçilen dil HKCU\Software\Ilgezdi\InstallerLanguage'a (Windows dil kimliği) yazılır:
;   • uygulama ilk açılışta, ayarlarda dil yoksa bu dili kullanır (main.js),
;   • yeniden kurulumda dil penceresi bu dille açılır, kaldırıcı bu dille konuşur.
; Sessiz kurulumda (otomatik güncelleme) dil seçilmediği için yazılmaz.

!define ILGEZDI_LANG_DIR "${__FILEDIR__}\installer-lang"
!define MUI_LANGDLL_WINDOWTITLE "İlgezdi"
!define MUI_LANGDLL_INFO "Kurulum dilini seçin / Select the setup language"

!include "${ILGEZDI_LANG_DIR}\messages.nsh"

!macroundef addLangs
!macro addLangs
  ; İlk dil, Windows dili listede yoksa varsayılandır.
  !insertmacro MUI_LANGUAGE "English"
  !insertmacro MUI_LANGUAGE "Turkish"
  !insertmacro MUI_LANGUAGEEX "${ILGEZDI_LANG_DIR}" "Azerbaijani"
  !insertmacro MUI_LANGUAGEEX "${ILGEZDI_LANG_DIR}" "Kazakh"
  !insertmacro MUI_LANGUAGEEX "${ILGEZDI_LANG_DIR}" "Uzbek"
  !insertmacro MUI_LANGUAGEEX "${ILGEZDI_LANG_DIR}" "Turkmen"
  !insertmacro MUI_LANGUAGEEX "${ILGEZDI_LANG_DIR}" "Kyrgyz"
  !insertmacro MUI_LANGUAGE "German"
  !insertmacro MUI_LANGUAGE "French"
!macroend

; Daha önce seçilmiş dil, dil penceresinde seçili gelir.
!macro preInit
  ReadRegStr $0 HKCU "Software\Ilgezdi" "InstallerLanguage"
  ${If} $0 != ""
    StrCpy $LANGUAGE $0
  ${EndIf}
!macroend

!macro customUnInit
  ReadRegStr $0 HKCU "Software\Ilgezdi" "InstallerLanguage"
  ${If} $0 != ""
    StrCpy $LANGUAGE $0
  ${EndIf}
!macroend

; ─── Windows'a tarayıcı olarak kayıt (Ayarlar › Uygulamalar › Varsayılan uygulamalar) ───
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

!macro customInstall
  ${IfNot} ${Silent}
    WriteRegStr HKCU "Software\Ilgezdi" "InstallerLanguage" "$LANGUAGE"
  ${EndIf}

  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi" "" "İlgezdi"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities" "ApplicationName" "İlgezdi"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities" "ApplicationDescription" "$(ilgezdiAppDescription)"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities\StartMenu" "StartMenuInternet" "Ilgezdi"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities\URLAssociations" "http" "IlgezdiURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities\URLAssociations" "https" "IlgezdiURL"
  WriteRegStr HKCU "Software\RegisteredApplications" "Ilgezdi" "Software\Clients\StartMenuInternet\Ilgezdi\Capabilities"

  WriteRegStr HKCU "Software\Classes\IlgezdiURL" "" "$(ilgezdiUrlName)"
  WriteRegStr HKCU "Software\Classes\IlgezdiURL" "FriendlyTypeName" "$(ilgezdiUrlName)"
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
  ; Güncellemede eski sürüm sessizce kaldırılır; seçilen kurulum dili korunmalı.
  ${IfNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Ilgezdi"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
