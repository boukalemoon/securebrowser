;Language: Turkmen (1090)
;By İlgezdi

!insertmacro LANGFILE "Turkmen" = "Türkmen dili" "Turkmen dili"

!ifdef MUI_WELCOMEPAGE
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TITLE "$(^NameDA) gurnama ussadyna hoş geldiňiz"
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TEXT "Bu ussat $(^NameDA) programmasyny gurnamakda size ýol görkezer.$\r$\n$\r$\nGurnamany başlamazdan öň beýleki ähli programmalary ýapmagyňyz maslahat berilýär. Şeýle edilende degişli ulgam faýllaryny kompýuteri gaýtadan başlatmazdan täzeläp bolýar.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_UNWELCOMEPAGE
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TITLE "$(^NameDA) aýyrma ussadyna hoş geldiňiz"
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TEXT "Bu ussat $(^NameDA) programmasyny aýyrmakda size ýol görkezer.$\r$\n$\r$\nAýyrmany başlamazdan öň $(^NameDA) programmasynyň işlemeýändigine göz ýetiriň.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_LICENSEPAGE
  ${LangFileString} MUI_TEXT_LICENSE_TITLE "Ygtyýarnama ylalaşygy"
  ${LangFileString} MUI_TEXT_LICENSE_SUBTITLE "$(^NameDA) programmasyny gurnamazdan öň ygtyýarnama şertleri bilen tanyşyň."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM "Ylalaşygyň şertlerini kabul edýän bolsaňyz, dowam etmek üçin «Kabul edýärin» düwmesine basyň. $(^NameDA) programmasyny gurnamak üçin ylalaşygy kabul etmelisiňiz."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_CHECKBOX "Ylalaşygyň şertlerini kabul edýän bolsaňyz, aşakdaky gutujyga belgi goýuň. $(^NameDA) programmasyny gurnamak üçin ylalaşygy kabul etmelisiňiz. $_CLICK"
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Ylalaşygyň şertlerini kabul edýän bolsaňyz, aşakdaky birinji görnüşi saýlaň. $(^NameDA) programmasyny gurnamak üçin ylalaşygy kabul etmelisiňiz. $_CLICK"
!endif

!ifdef MUI_UNLICENSEPAGE
  ${LangFileString} MUI_UNTEXT_LICENSE_TITLE "Ygtyýarnama ylalaşygy"
  ${LangFileString} MUI_UNTEXT_LICENSE_SUBTITLE "$(^NameDA) programmasyny aýyrmazdan öň ygtyýarnama şertleri bilen tanyşyň."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM "Ylalaşygyň şertlerini kabul edýän bolsaňyz, dowam etmek üçin «Kabul edýärin» düwmesine basyň. $(^NameDA) programmasyny aýyrmak üçin ylalaşygy kabul etmelisiňiz."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_CHECKBOX "Ylalaşygyň şertlerini kabul edýän bolsaňyz, aşakdaky gutujyga belgi goýuň. $(^NameDA) programmasyny aýyrmak üçin ylalaşygy kabul etmelisiňiz. $_CLICK"
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Ylalaşygyň şertlerini kabul edýän bolsaňyz, aşakdaky birinji görnüşi saýlaň. $(^NameDA) programmasyny aýyrmak üçin ylalaşygy kabul etmelisiňiz. $_CLICK"
!endif

!ifdef MUI_LICENSEPAGE | MUI_UNLICENSEPAGE
  ${LangFileString} MUI_INNERTEXT_LICENSE_TOP "Ylalaşygyň galan bölegini görmek üçin Page Down düwmesine basyň."
!endif

!ifdef MUI_COMPONENTSPAGE
  ${LangFileString} MUI_TEXT_COMPONENTS_TITLE "Düzüm böleklerini saýlaň"
  ${LangFileString} MUI_TEXT_COMPONENTS_SUBTITLE "$(^NameDA) programmasynyň haýsy mümkinçiliklerini gurnamak isleýändigiňizi saýlaň."
!endif

!ifdef MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_UNTEXT_COMPONENTS_TITLE "Düzüm böleklerini saýlaň"
  ${LangFileString} MUI_UNTEXT_COMPONENTS_SUBTITLE "$(^NameDA) programmasynyň haýsy mümkinçiliklerini aýyrmak isleýändigiňizi saýlaň."
!endif

!ifdef MUI_COMPONENTSPAGE | MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_TITLE "Düşündiriş"
  !ifndef NSIS_CONFIG_COMPONENTPAGE_ALTERNATIVE
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Düzüm böleginiň düşündirişini görmek üçin kursory onuň üstüne getiriň."
  !else
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Düşündirişini görmek üçin düzüm bölegini saýlaň."
  !endif
!endif

!ifdef MUI_DIRECTORYPAGE
  ${LangFileString} MUI_TEXT_DIRECTORY_TITLE "Gurnaljak ýeri saýlaň"
  ${LangFileString} MUI_TEXT_DIRECTORY_SUBTITLE "$(^NameDA) programmasynyň gurnaljak bukjasyny saýlaň."
!endif

!ifdef MUI_UNDIRECTORYPAGE
  ${LangFileString} MUI_UNTEXT_DIRECTORY_TITLE "Aýryljak ýeri saýlaň"
  ${LangFileString} MUI_UNTEXT_DIRECTORY_SUBTITLE "$(^NameDA) programmasynyň aýryljak bukjasyny saýlaň."
!endif

!ifdef MUI_INSTFILESPAGE
  ${LangFileString} MUI_TEXT_INSTALLING_TITLE "Gurnalýar"
  ${LangFileString} MUI_TEXT_INSTALLING_SUBTITLE "$(^NameDA) gurnalýança biraz garaşyň."
  ${LangFileString} MUI_TEXT_FINISH_TITLE "Gurnama tamamlandy"
  ${LangFileString} MUI_TEXT_FINISH_SUBTITLE "Gurnama üstünlikli tamamlandy."
  ${LangFileString} MUI_TEXT_ABORT_TITLE "Gurnama bes edildi"
  ${LangFileString} MUI_TEXT_ABORT_SUBTITLE "Gurnama üstünlikli tamamlanmady."
!endif

!ifdef MUI_UNINSTFILESPAGE
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_TITLE "Aýrylýar"
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_SUBTITLE "$(^NameDA) aýrylýança biraz garaşyň."
  ${LangFileString} MUI_UNTEXT_FINISH_TITLE "Aýyrma tamamlandy"
  ${LangFileString} MUI_UNTEXT_FINISH_SUBTITLE "Aýyrma üstünlikli tamamlandy."
  ${LangFileString} MUI_UNTEXT_ABORT_TITLE "Aýyrma bes edildi"
  ${LangFileString} MUI_UNTEXT_ABORT_SUBTITLE "Aýyrma üstünlikli tamamlanmady."
!endif

!ifdef MUI_FINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_INFO_TITLE "$(^NameDA) gurnamasy tamamlanýar"
  ${LangFileString} MUI_TEXT_FINISH_INFO_TEXT "$(^NameDA) kompýuteriňize gurnaldy.$\r$\n$\r$\nUssady ýapmak üçin «Tamamla» düwmesine basyň."
  ${LangFileString} MUI_TEXT_FINISH_INFO_REBOOT "$(^NameDA) programmasynyň gurnamasyny tamamlamak üçin kompýuteriňizi gaýtadan başlatmaly. Häzir gaýtadan başlatmak isleýärsiňizmi?"
!endif

!ifdef MUI_UNFINISHPAGE
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TITLE "$(^NameDA) aýyrmasy tamamlanýar"
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TEXT "$(^NameDA) kompýuteriňizden aýryldy.$\r$\n$\r$\nUssady ýapmak üçin «Tamamla» düwmesine basyň."
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_REBOOT "$(^NameDA) programmasyny aýyrmagy tamamlamak üçin kompýuteriňizi gaýtadan başlatmaly. Häzir gaýtadan başlatmak isleýärsiňizmi?"
!endif

!ifdef MUI_FINISHPAGE | MUI_UNFINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_REBOOTNOW "Häzir gaýtadan başlat"
  ${LangFileString} MUI_TEXT_FINISH_REBOOTLATER "Soňrak özüm gaýtadan başladaryn"
  ${LangFileString} MUI_TEXT_FINISH_RUN "$(^NameDA) programmasyny &işlet"
  ${LangFileString} MUI_TEXT_FINISH_SHOWREADME "&Readme faýlyny görkez"
  ${LangFileString} MUI_BUTTONTEXT_FINISH "&Tamamla"
!endif

!ifdef MUI_STARTMENUPAGE
  ${LangFileString} MUI_TEXT_STARTMENU_TITLE "Başla menýusyndaky bukjany saýlaň"
  ${LangFileString} MUI_TEXT_STARTMENU_SUBTITLE "$(^NameDA) programmasynyň gysga ýollary üçin Başla menýusyndaky bukjany saýlaň."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_TOP "Programmanyň gysga ýollary dörediljek Başla menýusyndaky bukjany saýlaň. Täze bukja döretmek üçin onuň adyny hem ýazyp bilersiňiz."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_CHECKBOX "Gysga ýollary döretme"
!endif

!ifdef MUI_UNCONFIRMPAGE
  ${LangFileString} MUI_UNTEXT_CONFIRM_TITLE "$(^NameDA) programmasyny aýyr"
  ${LangFileString} MUI_UNTEXT_CONFIRM_SUBTITLE "$(^NameDA) programmasyny kompýuteriňizden aýyrmak."
!endif

!ifdef MUI_ABORTWARNING
  ${LangFileString} MUI_TEXT_ABORTWARNING "Hakykatdan hem $(^Name) gurnamasyndan çykmak isleýärsiňizmi?"
!endif

!ifdef MUI_UNABORTWARNING
  ${LangFileString} MUI_UNTEXT_ABORTWARNING "Hakykatdan hem $(^Name) aýyrmasyndan çykmak isleýärsiňizmi?"
!endif

!ifdef MULTIUSER_INSTALLMODEPAGE
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_TITLE "Ulanyjylary saýlaň"
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_SUBTITLE "$(^NameDA) programmasyny haýsy ulanyjylar üçin gurnamak isleýändigiňizi saýlaň."
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_TOP "$(^NameDA) programmasyny diňe özüňiz üçin ýa-da şu kompýuteriň ähli ulanyjylary üçin gurnamak isleýändigiňizi saýlaň. $(^ClickNext)"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Şu kompýuteri ulanýan her bir kişi üçin gurna"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Diňe meniň üçin gurna"
!endif
