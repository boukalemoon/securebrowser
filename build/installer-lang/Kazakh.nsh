;Language: Kazakh (1087)
;Translation by İlgezdi

!insertmacro LANGFILE "Kazakh" = "Қазақ тілі" "Qazaq tili"

!ifdef MUI_WELCOMEPAGE
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TITLE "$(^NameDA) орнату шеберіне қош келдіңіз"
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TEXT "Бұл шебер $(^NameDA) қолданбасын орнату барысында сізге жол көрсетеді.$\r$\n$\r$\nОрнатуды бастамас бұрын басқа барлық қолданбаларды жапқан жөн. Сонда орнату бағдарламасы компьютерді қайта іске қоспай-ақ қажетті жүйелік файлдарды жаңарта алады.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_UNWELCOMEPAGE
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TITLE "$(^NameDA) жою шеберіне қош келдіңіз"
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TEXT "Бұл шебер $(^NameDA) қолданбасын жою барысында сізге жол көрсетеді.$\r$\n$\r$\nЖоюды бастамас бұрын $(^NameDA) жұмыс істеп тұрмағанына көз жеткізіңіз.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_LICENSEPAGE
  ${LangFileString} MUI_TEXT_LICENSE_TITLE "Лицензиялық келісім"
  ${LangFileString} MUI_TEXT_LICENSE_SUBTITLE "$(^NameDA) орнатпас бұрын лицензия шарттарымен танысып шығыңыз."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM "Келісім шарттарын қабылдасаңыз, жалғастыру үшін «Келісемін» түймесін басыңыз. $(^NameDA) орнату үшін келісімді қабылдауыңыз керек."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_CHECKBOX "Келісім шарттарын қабылдасаңыз, төмендегі ұяшыққа құсбелгі қойыңыз. $(^NameDA) орнату үшін келісімді қабылдауыңыз керек. $_CLICK"
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Келісім шарттарын қабылдасаңыз, төмендегі бірінші нұсқаны таңдаңыз. $(^NameDA) орнату үшін келісімді қабылдауыңыз керек. $_CLICK"
!endif

!ifdef MUI_UNLICENSEPAGE
  ${LangFileString} MUI_UNTEXT_LICENSE_TITLE "Лицензиялық келісім"
  ${LangFileString} MUI_UNTEXT_LICENSE_SUBTITLE "$(^NameDA) жоймас бұрын лицензия шарттарымен танысып шығыңыз."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM "Келісім шарттарын қабылдасаңыз, жалғастыру үшін «Келісемін» түймесін басыңыз. $(^NameDA) жою үшін келісімді қабылдауыңыз керек."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_CHECKBOX "Келісім шарттарын қабылдасаңыз, төмендегі ұяшыққа құсбелгі қойыңыз. $(^NameDA) жою үшін келісімді қабылдауыңыз керек. $_CLICK"
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Келісім шарттарын қабылдасаңыз, төмендегі бірінші нұсқаны таңдаңыз. $(^NameDA) жою үшін келісімді қабылдауыңыз керек. $_CLICK"
!endif

!ifdef MUI_LICENSEPAGE | MUI_UNLICENSEPAGE
  ${LangFileString} MUI_INNERTEXT_LICENSE_TOP "Келісімнің қалған бөлігін көру үшін Page Down пернесін басыңыз."
!endif

!ifdef MUI_COMPONENTSPAGE
  ${LangFileString} MUI_TEXT_COMPONENTS_TITLE "Құрамдастарды таңдау"
  ${LangFileString} MUI_TEXT_COMPONENTS_SUBTITLE "$(^NameDA) қолданбасының қай мүмкіндіктерін орнатқыңыз келетінін таңдаңыз."
!endif

!ifdef MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_UNTEXT_COMPONENTS_TITLE "Құрамдастарды таңдау"
  ${LangFileString} MUI_UNTEXT_COMPONENTS_SUBTITLE "$(^NameDA) қолданбасының қай мүмкіндіктерін жойғыңыз келетінін таңдаңыз."
!endif

!ifdef MUI_COMPONENTSPAGE | MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_TITLE "Сипаттама"
  !ifndef NSIS_CONFIG_COMPONENTPAGE_ALTERNATIVE
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Құрамдастың сипаттамасын көру үшін тінтуір меңзерін оның үстіне апарыңыз."
  !else
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Құрамдастың сипаттамасын көру үшін оны таңдаңыз."
  !endif
!endif

!ifdef MUI_DIRECTORYPAGE
  ${LangFileString} MUI_TEXT_DIRECTORY_TITLE "Орнату қалтасын таңдау"
  ${LangFileString} MUI_TEXT_DIRECTORY_SUBTITLE "$(^NameDA) орнатылатын қалтаны таңдаңыз."
!endif

!ifdef MUI_UNDIRECTORYPAGE
  ${LangFileString} MUI_UNTEXT_DIRECTORY_TITLE "Жойылатын қалтаны таңдау"
  ${LangFileString} MUI_UNTEXT_DIRECTORY_SUBTITLE "$(^NameDA) жойылатын қалтаны таңдаңыз."
!endif

!ifdef MUI_INSTFILESPAGE
  ${LangFileString} MUI_TEXT_INSTALLING_TITLE "Орнатылуда"
  ${LangFileString} MUI_TEXT_INSTALLING_SUBTITLE "$(^NameDA) орнатылып жатыр, күте тұрыңыз."
  ${LangFileString} MUI_TEXT_FINISH_TITLE "Орнату аяқталды"
  ${LangFileString} MUI_TEXT_FINISH_SUBTITLE "Орнату сәтті аяқталды."
  ${LangFileString} MUI_TEXT_ABORT_TITLE "Орнату тоқтатылды"
  ${LangFileString} MUI_TEXT_ABORT_SUBTITLE "Орнату сәтті аяқталмады."
!endif

!ifdef MUI_UNINSTFILESPAGE
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_TITLE "Жойылуда"
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_SUBTITLE "$(^NameDA) жойылып жатыр, күте тұрыңыз."
  ${LangFileString} MUI_UNTEXT_FINISH_TITLE "Жою аяқталды"
  ${LangFileString} MUI_UNTEXT_FINISH_SUBTITLE "Жою сәтті аяқталды."
  ${LangFileString} MUI_UNTEXT_ABORT_TITLE "Жою тоқтатылды"
  ${LangFileString} MUI_UNTEXT_ABORT_SUBTITLE "Жою сәтті аяқталмады."
!endif

!ifdef MUI_FINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_INFO_TITLE "$(^NameDA) орнату шебері аяқталуда"
  ${LangFileString} MUI_TEXT_FINISH_INFO_TEXT "$(^NameDA) компьютеріңізге орнатылды.$\r$\n$\r$\nОрнату шеберін жабу үшін «Дайын» түймесін басыңыз."
  ${LangFileString} MUI_TEXT_FINISH_INFO_REBOOT "$(^NameDA) орнатуын аяқтау үшін компьютерді қайта іске қосу керек. Қазір қайта іске қосқыңыз келе ме?"
!endif

!ifdef MUI_UNFINISHPAGE
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TITLE "$(^NameDA) жою шебері аяқталуда"
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TEXT "$(^NameDA) компьютеріңізден жойылды.$\r$\n$\r$\nШеберді жабу үшін «Дайын» түймесін басыңыз."
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_REBOOT "$(^NameDA) жоюын аяқтау үшін компьютерді қайта іске қосу керек. Қазір қайта іске қосқыңыз келе ме?"
!endif

!ifdef MUI_FINISHPAGE | MUI_UNFINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_REBOOTNOW "Қазір қайта іске қосу"
  ${LangFileString} MUI_TEXT_FINISH_REBOOTLATER "Кейінірек өзім қайта іске қосамын"
  ${LangFileString} MUI_TEXT_FINISH_RUN "$(^NameDA) қолданбасын іске &қосу"
  ${LangFileString} MUI_TEXT_FINISH_SHOWREADME "Readme файлын &көрсету"
  ${LangFileString} MUI_BUTTONTEXT_FINISH "&Дайын"
!endif

!ifdef MUI_STARTMENUPAGE
  ${LangFileString} MUI_TEXT_STARTMENU_TITLE "«Бастау» мәзірі қалтасын таңдау"
  ${LangFileString} MUI_TEXT_STARTMENU_SUBTITLE "$(^NameDA) таңбашалары үшін «Бастау» мәзірі қалтасын таңдаңыз."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_TOP "Бағдарлама таңбашалары жасалатын «Бастау» мәзірі қалтасын таңдаңыз. Жаңа қалта жасау үшін атау енгізуге де болады."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_CHECKBOX "Таңбашалар жасамау"
!endif

!ifdef MUI_UNCONFIRMPAGE
  ${LangFileString} MUI_UNTEXT_CONFIRM_TITLE "$(^NameDA) жою"
  ${LangFileString} MUI_UNTEXT_CONFIRM_SUBTITLE "$(^NameDA) қолданбасын компьютеріңізден жою."
!endif

!ifdef MUI_ABORTWARNING
  ${LangFileString} MUI_TEXT_ABORTWARNING "$(^Name) орнату бағдарламасынан шынымен шыққыңыз келе ме?"
!endif

!ifdef MUI_UNABORTWARNING
  ${LangFileString} MUI_UNTEXT_ABORTWARNING "$(^Name) жою бағдарламасынан шынымен шыққыңыз келе ме?"
!endif

!ifdef MULTIUSER_INSTALLMODEPAGE
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_TITLE "Пайдаланушыларды таңдау"
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_SUBTITLE "$(^NameDA) қолданбасын қай пайдаланушылар үшін орнатқыңыз келетінін таңдаңыз."
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_TOP "$(^NameDA) қолданбасын тек өзіңіз үшін немесе осы компьютердің барлық пайдаланушылары үшін орнатуды таңдаңыз. $(^ClickNext)"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Осы компьютерді пайдаланатын барлық адам үшін орнату"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Тек өзім үшін орнату"
!endif
