;Language: Uzbek (1091)
;Translation by İlgezdi

!insertmacro LANGFILE "Uzbek" = "Oʻzbekcha" "O'zbekcha"

!ifdef MUI_WELCOMEPAGE
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TITLE "$(^NameDA) oʻrnatish dasturiga xush kelibsiz"
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TEXT "Bu dastur $(^NameDA) brauzerini oʻrnatishda sizga yoʻl-yoʻriq koʻrsatadi.$\r$\n$\r$\nOʻrnatishni boshlashdan oldin boshqa barcha ilovalarni yopish tavsiya etiladi. Shunda tegishli tizim fayllarini kompyuterni qayta ishga tushirmasdan yangilash mumkin boʻladi.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_UNWELCOMEPAGE
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TITLE "$(^NameDA) oʻchirib tashlash dasturiga xush kelibsiz"
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TEXT "Bu dastur $(^NameDA) brauzerini oʻchirib tashlashda sizga yoʻl-yoʻriq koʻrsatadi.$\r$\n$\r$\nOʻchirib tashlashni boshlashdan oldin $(^NameDA) brauzeri ishlamayotganiga ishonch hosil qiling.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_LICENSEPAGE
  ${LangFileString} MUI_TEXT_LICENSE_TITLE "Litsenziya kelishuvi"
  ${LangFileString} MUI_TEXT_LICENSE_SUBTITLE "$(^NameDA) brauzerini oʻrnatishdan oldin litsenziya shartlari bilan tanishib chiqing."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM "Kelishuv shartlarini qabul qilsangiz, davom etish uchun «Roziman» tugmasini bosing. $(^NameDA) brauzerini oʻrnatish uchun kelishuvni qabul qilishingiz kerak."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_CHECKBOX "Kelishuv shartlarini qabul qilsangiz, quyidagi katakchani belgilang. $(^NameDA) brauzerini oʻrnatish uchun kelishuvni qabul qilishingiz kerak. $_CLICK"
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Kelishuv shartlarini qabul qilsangiz, quyidagi birinchi variantni tanlang. $(^NameDA) brauzerini oʻrnatish uchun kelishuvni qabul qilishingiz kerak. $_CLICK"
!endif

!ifdef MUI_UNLICENSEPAGE
  ${LangFileString} MUI_UNTEXT_LICENSE_TITLE "Litsenziya kelishuvi"
  ${LangFileString} MUI_UNTEXT_LICENSE_SUBTITLE "$(^NameDA) brauzerini oʻchirib tashlashdan oldin litsenziya shartlari bilan tanishib chiqing."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM "Kelishuv shartlarini qabul qilsangiz, davom etish uchun «Roziman» tugmasini bosing. $(^NameDA) brauzerini oʻchirib tashlash uchun kelishuvni qabul qilishingiz kerak."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_CHECKBOX "Kelishuv shartlarini qabul qilsangiz, quyidagi katakchani belgilang. $(^NameDA) brauzerini oʻchirib tashlash uchun kelishuvni qabul qilishingiz kerak. $_CLICK"
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Kelishuv shartlarini qabul qilsangiz, quyidagi birinchi variantni tanlang. $(^NameDA) brauzerini oʻchirib tashlash uchun kelishuvni qabul qilishingiz kerak. $_CLICK"
!endif

!ifdef MUI_LICENSEPAGE | MUI_UNLICENSEPAGE
  ${LangFileString} MUI_INNERTEXT_LICENSE_TOP "Kelishuvning qolgan qismini koʻrish uchun Page Down tugmasini bosing."
!endif

!ifdef MUI_COMPONENTSPAGE
  ${LangFileString} MUI_TEXT_COMPONENTS_TITLE "Komponentlarni tanlang"
  ${LangFileString} MUI_TEXT_COMPONENTS_SUBTITLE "$(^NameDA) brauzerining qaysi funksiyalarini oʻrnatmoqchi ekaningizni tanlang."
!endif

!ifdef MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_UNTEXT_COMPONENTS_TITLE "Komponentlarni tanlang"
  ${LangFileString} MUI_UNTEXT_COMPONENTS_SUBTITLE "$(^NameDA) brauzerining qaysi funksiyalarini oʻchirib tashlamoqchi ekaningizni tanlang."
!endif

!ifdef MUI_COMPONENTSPAGE | MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_TITLE "Tavsif"
  !ifndef NSIS_CONFIG_COMPONENTPAGE_ALTERNATIVE
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Komponent tavsifini koʻrish uchun sichqoncha koʻrsatkichini uning ustiga olib boring."
  !else
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Tavsifini koʻrish uchun komponentni tanlang."
  !endif
!endif

!ifdef MUI_DIRECTORYPAGE
  ${LangFileString} MUI_TEXT_DIRECTORY_TITLE "Oʻrnatish joyini tanlang"
  ${LangFileString} MUI_TEXT_DIRECTORY_SUBTITLE "$(^NameDA) brauzeri oʻrnatiladigan jildni tanlang."
!endif

!ifdef MUI_UNDIRECTORYPAGE
  ${LangFileString} MUI_UNTEXT_DIRECTORY_TITLE "Oʻchirib tashlash joyini tanlang"
  ${LangFileString} MUI_UNTEXT_DIRECTORY_SUBTITLE "$(^NameDA) brauzeri oʻchirib tashlanadigan jildni tanlang."
!endif

!ifdef MUI_INSTFILESPAGE
  ${LangFileString} MUI_TEXT_INSTALLING_TITLE "Oʻrnatilmoqda"
  ${LangFileString} MUI_TEXT_INSTALLING_SUBTITLE "$(^NameDA) brauzeri oʻrnatilmoqda, iltimos, kuting."
  ${LangFileString} MUI_TEXT_FINISH_TITLE "Oʻrnatish yakunlandi"
  ${LangFileString} MUI_TEXT_FINISH_SUBTITLE "Oʻrnatish muvaffaqiyatli yakunlandi."
  ${LangFileString} MUI_TEXT_ABORT_TITLE "Oʻrnatish toʻxtatildi"
  ${LangFileString} MUI_TEXT_ABORT_SUBTITLE "Oʻrnatish muvaffaqiyatli yakunlanmadi."
!endif

!ifdef MUI_UNINSTFILESPAGE
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_TITLE "Oʻchirib tashlanmoqda"
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_SUBTITLE "$(^NameDA) brauzeri oʻchirib tashlanmoqda, iltimos, kuting."
  ${LangFileString} MUI_UNTEXT_FINISH_TITLE "Oʻchirib tashlash yakunlandi"
  ${LangFileString} MUI_UNTEXT_FINISH_SUBTITLE "Oʻchirib tashlash muvaffaqiyatli yakunlandi."
  ${LangFileString} MUI_UNTEXT_ABORT_TITLE "Oʻchirib tashlash toʻxtatildi"
  ${LangFileString} MUI_UNTEXT_ABORT_SUBTITLE "Oʻchirib tashlash muvaffaqiyatli yakunlanmadi."
!endif

!ifdef MUI_FINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_INFO_TITLE "$(^NameDA) brauzerini oʻrnatish yakunlanmoqda"
  ${LangFileString} MUI_TEXT_FINISH_INFO_TEXT "$(^NameDA) brauzeri kompyuteringizga oʻrnatildi.$\r$\n$\r$\nOʻrnatish dasturini yopish uchun «Tayyor» tugmasini bosing."
  ${LangFileString} MUI_TEXT_FINISH_INFO_REBOOT "$(^NameDA) brauzerini oʻrnatishni yakunlash uchun kompyuteringizni qayta ishga tushirish kerak. Hozir qayta ishga tushirilsinmi?"
!endif

!ifdef MUI_UNFINISHPAGE
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TITLE "$(^NameDA) brauzerini oʻchirib tashlash yakunlanmoqda"
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TEXT "$(^NameDA) brauzeri kompyuteringizdan oʻchirib tashlandi.$\r$\n$\r$\nOʻchirib tashlash dasturini yopish uchun «Tayyor» tugmasini bosing."
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_REBOOT "$(^NameDA) brauzerini oʻchirib tashlashni yakunlash uchun kompyuteringizni qayta ishga tushirish kerak. Hozir qayta ishga tushirilsinmi?"
!endif

!ifdef MUI_FINISHPAGE | MUI_UNFINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_REBOOTNOW "Hozir qayta ishga tushirish"
  ${LangFileString} MUI_TEXT_FINISH_REBOOTLATER "Keyinroq oʻzim qayta ishga tushiraman"
  ${LangFileString} MUI_TEXT_FINISH_RUN "$(^NameDA) brauzerini &ishga tushirish"
  ${LangFileString} MUI_TEXT_FINISH_SHOWREADME "&Readme faylini koʻrsatish"
  ${LangFileString} MUI_BUTTONTEXT_FINISH "&Tayyor"
!endif

!ifdef MUI_STARTMENUPAGE
  ${LangFileString} MUI_TEXT_STARTMENU_TITLE "Start menyusidagi jildni tanlang"
  ${LangFileString} MUI_TEXT_STARTMENU_SUBTITLE "$(^NameDA) yorliqlari uchun Start menyusidagi jildni tanlang."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_TOP "Dastur yorliqlari yaratiladigan Start menyusi jildini tanlang. Yangi jild yaratish uchun nom kiritishingiz ham mumkin."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_CHECKBOX "Yorliqlar yaratilmasin"
!endif

!ifdef MUI_UNCONFIRMPAGE
  ${LangFileString} MUI_UNTEXT_CONFIRM_TITLE "$(^NameDA) brauzerini oʻchirib tashlash"
  ${LangFileString} MUI_UNTEXT_CONFIRM_SUBTITLE "$(^NameDA) brauzerini kompyuteringizdan oʻchirib tashlash."
!endif

!ifdef MUI_ABORTWARNING
  ${LangFileString} MUI_TEXT_ABORTWARNING "$(^Name) oʻrnatish dasturidan chiqishga ishonchingiz komilmi?"
!endif

!ifdef MUI_UNABORTWARNING
  ${LangFileString} MUI_UNTEXT_ABORTWARNING "$(^Name) oʻchirib tashlash dasturidan chiqishga ishonchingiz komilmi?"
!endif

!ifdef MULTIUSER_INSTALLMODEPAGE
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_TITLE "Foydalanuvchilarni tanlang"
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_SUBTITLE "$(^NameDA) brauzeri qaysi foydalanuvchilar uchun oʻrnatilishini tanlang."
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_TOP "$(^NameDA) brauzerini faqat oʻzingiz uchun yoki shu kompyuterning barcha foydalanuvchilari uchun oʻrnatishni tanlang. $(^ClickNext)"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Shu kompyuterdan foydalanadigan hamma uchun oʻrnatish"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Faqat men uchun oʻrnatish"
!endif
