;Language: Kyrgyz (1088)
;Translation by İlgezdi

!insertmacro LANGFILE "Kyrgyz" = "Кыргызча" "Kyrgyzcha"

!ifdef MUI_WELCOMEPAGE
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TITLE "$(^NameDA) орнотуу программасына кош келиңиз"
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TEXT "Бул программа $(^NameDA) программасын орнотуу боюнча сизге кадам-кадам жол көрсөтөт.$\r$\n$\r$\nОрнотууну баштоодон мурун башка бардык колдонмолорду жабуу сунушталат. Ошондо тиешелүү тутум файлдарын компьютерди кайра иштетпей эле жаңыртууга болот.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_UNWELCOMEPAGE
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TITLE "$(^NameDA) алып салуу программасына кош келиңиз"
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TEXT "Бул программа $(^NameDA) программасын алып салуу боюнча сизге кадам-кадам жол көрсөтөт.$\r$\n$\r$\nАлып салууну баштоодон мурун $(^NameDA) иштеп жатпаганын текшериңиз.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_LICENSEPAGE
  ${LangFileString} MUI_TEXT_LICENSE_TITLE "Лицензиялык келишим"
  ${LangFileString} MUI_TEXT_LICENSE_SUBTITLE "$(^NameDA) программасын орнотуудан мурун лицензиянын шарттары менен таанышып чыгыңыз."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM "Келишимдин шарттарын кабыл алсаңыз, улантуу үчүн «Макулмун» баскычын басыңыз. $(^NameDA) программасын орнотуу үчүн келишимди кабыл алышыңыз керек."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_CHECKBOX "Келишимдин шарттарын кабыл алсаңыз, төмөндөгү кутучаны белгилеңиз. $(^NameDA) программасын орнотуу үчүн келишимди кабыл алышыңыз керек. $_CLICK"
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Келишимдин шарттарын кабыл алсаңыз, төмөндөгү биринчи вариантты тандаңыз. $(^NameDA) программасын орнотуу үчүн келишимди кабыл алышыңыз керек. $_CLICK"
!endif

!ifdef MUI_UNLICENSEPAGE
  ${LangFileString} MUI_UNTEXT_LICENSE_TITLE "Лицензиялык келишим"
  ${LangFileString} MUI_UNTEXT_LICENSE_SUBTITLE "$(^NameDA) программасын алып салуудан мурун лицензиянын шарттары менен таанышып чыгыңыз."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM "Келишимдин шарттарын кабыл алсаңыз, улантуу үчүн «Макулмун» баскычын басыңыз. $(^NameDA) программасын алып салуу үчүн келишимди кабыл алышыңыз керек."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_CHECKBOX "Келишимдин шарттарын кабыл алсаңыз, төмөндөгү кутучаны белгилеңиз. $(^NameDA) программасын алып салуу үчүн келишимди кабыл алышыңыз керек. $_CLICK"
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Келишимдин шарттарын кабыл алсаңыз, төмөндөгү биринчи вариантты тандаңыз. $(^NameDA) программасын алып салуу үчүн келишимди кабыл алышыңыз керек. $_CLICK"
!endif

!ifdef MUI_LICENSEPAGE | MUI_UNLICENSEPAGE
  ${LangFileString} MUI_INNERTEXT_LICENSE_TOP "Келишимдин калган бөлүгүн көрүү үчүн Page Down баскычын басыңыз."
!endif

!ifdef MUI_COMPONENTSPAGE
  ${LangFileString} MUI_TEXT_COMPONENTS_TITLE "Компоненттерди тандоо"
  ${LangFileString} MUI_TEXT_COMPONENTS_SUBTITLE "$(^NameDA) программасынын кайсы функцияларын орноткуңуз келерин тандаңыз."
!endif

!ifdef MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_UNTEXT_COMPONENTS_TITLE "Компоненттерди тандоо"
  ${LangFileString} MUI_UNTEXT_COMPONENTS_SUBTITLE "$(^NameDA) программасынын кайсы функцияларын алып салгыңыз келерин тандаңыз."
!endif

!ifdef MUI_COMPONENTSPAGE | MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_TITLE "Сүрөттөмө"
  !ifndef NSIS_CONFIG_COMPONENTPAGE_ALTERNATIVE
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Сүрөттөмөсүн көрүү үчүн чычкандын курсорун компоненттин үстүнө алып барыңыз."
  !else
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Сүрөттөмөсүн көрүү үчүн компонентти тандаңыз."
  !endif
!endif

!ifdef MUI_DIRECTORYPAGE
  ${LangFileString} MUI_TEXT_DIRECTORY_TITLE "Орнотуу папкасын тандоо"
  ${LangFileString} MUI_TEXT_DIRECTORY_SUBTITLE "$(^NameDA) орнотула турган папканы тандаңыз."
!endif

!ifdef MUI_UNDIRECTORYPAGE
  ${LangFileString} MUI_UNTEXT_DIRECTORY_TITLE "Алып салуу папкасын тандоо"
  ${LangFileString} MUI_UNTEXT_DIRECTORY_SUBTITLE "$(^NameDA) алынып салына турган папканы тандаңыз."
!endif

!ifdef MUI_INSTFILESPAGE
  ${LangFileString} MUI_TEXT_INSTALLING_TITLE "Орнотулууда"
  ${LangFileString} MUI_TEXT_INSTALLING_SUBTITLE "$(^NameDA) орнотулуп жатат, күтө туруңуз."
  ${LangFileString} MUI_TEXT_FINISH_TITLE "Орнотуу аяктады"
  ${LangFileString} MUI_TEXT_FINISH_SUBTITLE "Орнотуу ийгиликтүү аяктады."
  ${LangFileString} MUI_TEXT_ABORT_TITLE "Орнотуу токтотулду"
  ${LangFileString} MUI_TEXT_ABORT_SUBTITLE "Орнотуу ийгиликтүү аяктаган жок."
!endif

!ifdef MUI_UNINSTFILESPAGE
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_TITLE "Алынып салынууда"
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_SUBTITLE "$(^NameDA) алынып салынып жатат, күтө туруңуз."
  ${LangFileString} MUI_UNTEXT_FINISH_TITLE "Алып салуу аяктады"
  ${LangFileString} MUI_UNTEXT_FINISH_SUBTITLE "Алып салуу ийгиликтүү аяктады."
  ${LangFileString} MUI_UNTEXT_ABORT_TITLE "Алып салуу токтотулду"
  ${LangFileString} MUI_UNTEXT_ABORT_SUBTITLE "Алып салуу ийгиликтүү аяктаган жок."
!endif

!ifdef MUI_FINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_INFO_TITLE "$(^NameDA) программасын орнотууну аяктоо"
  ${LangFileString} MUI_TEXT_FINISH_INFO_TEXT "$(^NameDA) компьютериңизге орнотулду.$\r$\n$\r$\nОрнотуу программасын жабуу үчүн «Бүтүрүү» баскычын басыңыз."
  ${LangFileString} MUI_TEXT_FINISH_INFO_REBOOT "$(^NameDA) программасын орнотууну аяктоо үчүн компьютериңизди кайра иштетүү керек. Азыр кайра иштетесизби?"
!endif

!ifdef MUI_UNFINISHPAGE
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TITLE "$(^NameDA) программасын алып салууну аяктоо"
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TEXT "$(^NameDA) компьютериңизден алынып салынды.$\r$\n$\r$\nАлып салуу программасын жабуу үчүн «Бүтүрүү» баскычын басыңыз."
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_REBOOT "$(^NameDA) программасын алып салууну аяктоо үчүн компьютериңизди кайра иштетүү керек. Азыр кайра иштетесизби?"
!endif

!ifdef MUI_FINISHPAGE | MUI_UNFINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_REBOOTNOW "Азыр кайра иштетүү"
  ${LangFileString} MUI_TEXT_FINISH_REBOOTLATER "Кийинчерээк өзүм кайра иштетем"
  ${LangFileString} MUI_TEXT_FINISH_RUN "$(^NameDA) программасын &иштетүү"
  ${LangFileString} MUI_TEXT_FINISH_SHOWREADME "README файлын &көрсөтүү"
  ${LangFileString} MUI_BUTTONTEXT_FINISH "&Бүтүрүү"
!endif

!ifdef MUI_STARTMENUPAGE
  ${LangFileString} MUI_TEXT_STARTMENU_TITLE "«Баштоо» менюсундагы папканы тандоо"
  ${LangFileString} MUI_TEXT_STARTMENU_SUBTITLE "$(^NameDA) ярлыктары үчүн «Баштоо» менюсундагы папканы тандаңыз."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_TOP "Программанын ярлыктары түзүлө турган «Баштоо» менюсундагы папканы тандаңыз. Жаңы папка түзүү үчүн анын атын да жазсаңыз болот."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_CHECKBOX "Ярлыктарды түзбөө"
!endif

!ifdef MUI_UNCONFIRMPAGE
  ${LangFileString} MUI_UNTEXT_CONFIRM_TITLE "$(^NameDA) программасын алып салуу"
  ${LangFileString} MUI_UNTEXT_CONFIRM_SUBTITLE "$(^NameDA) программасын компьютериңизден алып салуу."
!endif

!ifdef MUI_ABORTWARNING
  ${LangFileString} MUI_TEXT_ABORTWARNING "$(^Name) орнотуу программасынан чын эле чыккыңыз келеби?"
!endif

!ifdef MUI_UNABORTWARNING
  ${LangFileString} MUI_UNTEXT_ABORTWARNING "$(^Name) алып салуу программасынан чын эле чыккыңыз келеби?"
!endif

!ifdef MULTIUSER_INSTALLMODEPAGE
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_TITLE "Колдонуучуларды тандоо"
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_SUBTITLE "$(^NameDA) программасын кайсы колдонуучулар үчүн орноткуңуз келерин тандаңыз."
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_TOP "$(^NameDA) программасын өзүңүз үчүн гана же бул компьютердин бардык колдонуучулары үчүн орнотууну тандаңыз. $(^ClickNext)"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Бул компьютерди колдонгон бардык адамдар үчүн орнотуу"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Өзүм үчүн гана орнотуу"
!endif
