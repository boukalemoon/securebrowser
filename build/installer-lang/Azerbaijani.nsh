;Language: Azerbaijani (1068)
;By İlgezdi

!insertmacro LANGFILE "Azerbaijani" = "Azərbaycan dili" "Azerbaycan dili"

!ifdef MUI_WELCOMEPAGE
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TITLE "$(^NameDA) quraşdırma proqramına xoş gəlmisiniz"
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TEXT "Bu proqram $(^NameDA) tətbiqinin quraşdırılmasında sizə yol göstərəcək.$\r$\n$\r$\nQuraşdırmaya başlamazdan əvvəl bütün digər tətbiqləri bağlamağınız tövsiyə olunur. Bu, kompüterinizi yenidən başlatmadan müvafiq sistem fayllarını yeniləməyə imkan verəcək.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_UNWELCOMEPAGE
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TITLE "$(^NameDA) silmə proqramına xoş gəlmisiniz"
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TEXT "Bu proqram $(^NameDA) tətbiqinin silinməsində sizə yol göstərəcək.$\r$\n$\r$\nSilməyə başlamazdan əvvəl $(^NameDA) tətbiqinin işləmədiyinə əmin olun.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_LICENSEPAGE
  ${LangFileString} MUI_TEXT_LICENSE_TITLE "Lisenziya müqaviləsi"
  ${LangFileString} MUI_TEXT_LICENSE_SUBTITLE "$(^NameDA) quraşdırılmazdan əvvəl lisenziya şərtlərini nəzərdən keçirin."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM "Müqavilənin şərtlərini qəbul edirsinizsə, davam etmək üçün Razıyam düyməsini basın. $(^NameDA) tətbiqini quraşdırmaq üçün müqaviləni qəbul etməlisiniz."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_CHECKBOX "Müqavilənin şərtlərini qəbul edirsinizsə, aşağıdakı qutunu işarələyin. $(^NameDA) tətbiqini quraşdırmaq üçün müqaviləni qəbul etməlisiniz. $_CLICK"
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Müqavilənin şərtlərini qəbul edirsinizsə, aşağıdakı birinci seçimi seçin. $(^NameDA) tətbiqini quraşdırmaq üçün müqaviləni qəbul etməlisiniz. $_CLICK"
!endif

!ifdef MUI_UNLICENSEPAGE
  ${LangFileString} MUI_UNTEXT_LICENSE_TITLE "Lisenziya müqaviləsi"
  ${LangFileString} MUI_UNTEXT_LICENSE_SUBTITLE "$(^NameDA) silinməzdən əvvəl lisenziya şərtlərini nəzərdən keçirin."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM "Müqavilənin şərtlərini qəbul edirsinizsə, davam etmək üçün Razıyam düyməsini basın. $(^NameDA) tətbiqini silmək üçün müqaviləni qəbul etməlisiniz."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_CHECKBOX "Müqavilənin şərtlərini qəbul edirsinizsə, aşağıdakı qutunu işarələyin. $(^NameDA) tətbiqini silmək üçün müqaviləni qəbul etməlisiniz. $_CLICK"
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Müqavilənin şərtlərini qəbul edirsinizsə, aşağıdakı birinci seçimi seçin. $(^NameDA) tətbiqini silmək üçün müqaviləni qəbul etməlisiniz. $_CLICK"
!endif

!ifdef MUI_LICENSEPAGE | MUI_UNLICENSEPAGE
  ${LangFileString} MUI_INNERTEXT_LICENSE_TOP "Müqavilənin qalan hissəsini görmək üçün Page Down düyməsini basın."
!endif

!ifdef MUI_COMPONENTSPAGE
  ${LangFileString} MUI_TEXT_COMPONENTS_TITLE "Komponentləri seçin"
  ${LangFileString} MUI_TEXT_COMPONENTS_SUBTITLE "$(^NameDA) tətbiqinin hansı funksiyalarını quraşdırmaq istədiyinizi seçin."
!endif

!ifdef MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_UNTEXT_COMPONENTS_TITLE "Komponentləri seçin"
  ${LangFileString} MUI_UNTEXT_COMPONENTS_SUBTITLE "$(^NameDA) tətbiqinin hansı funksiyalarını silmək istədiyinizi seçin."
!endif

!ifdef MUI_COMPONENTSPAGE | MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_TITLE "Təsvir"
  !ifndef NSIS_CONFIG_COMPONENTPAGE_ALTERNATIVE
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Komponentin təsvirini görmək üçün siçanı onun üzərinə gətirin."
  !else
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Komponentin təsvirini görmək üçün onu seçin."
  !endif
!endif

!ifdef MUI_DIRECTORYPAGE
  ${LangFileString} MUI_TEXT_DIRECTORY_TITLE "Quraşdırma yerini seçin"
  ${LangFileString} MUI_TEXT_DIRECTORY_SUBTITLE "$(^NameDA) tətbiqinin quraşdırılacağı qovluğu seçin."
!endif

!ifdef MUI_UNDIRECTORYPAGE
  ${LangFileString} MUI_UNTEXT_DIRECTORY_TITLE "Silinəcək yeri seçin"
  ${LangFileString} MUI_UNTEXT_DIRECTORY_SUBTITLE "$(^NameDA) tətbiqinin silinəcəyi qovluğu seçin."
!endif

!ifdef MUI_INSTFILESPAGE
  ${LangFileString} MUI_TEXT_INSTALLING_TITLE "Quraşdırılır"
  ${LangFileString} MUI_TEXT_INSTALLING_SUBTITLE "$(^NameDA) quraşdırılarkən gözləyin."
  ${LangFileString} MUI_TEXT_FINISH_TITLE "Quraşdırma tamamlandı"
  ${LangFileString} MUI_TEXT_FINISH_SUBTITLE "Quraşdırma uğurla başa çatdı."
  ${LangFileString} MUI_TEXT_ABORT_TITLE "Quraşdırma dayandırıldı"
  ${LangFileString} MUI_TEXT_ABORT_SUBTITLE "Quraşdırma uğurla başa çatmadı."
!endif

!ifdef MUI_UNINSTFILESPAGE
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_TITLE "Silinir"
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_SUBTITLE "$(^NameDA) silinərkən gözləyin."
  ${LangFileString} MUI_UNTEXT_FINISH_TITLE "Silmə tamamlandı"
  ${LangFileString} MUI_UNTEXT_FINISH_SUBTITLE "Silmə uğurla başa çatdı."
  ${LangFileString} MUI_UNTEXT_ABORT_TITLE "Silmə dayandırıldı"
  ${LangFileString} MUI_UNTEXT_ABORT_SUBTITLE "Silmə uğurla başa çatmadı."
!endif

!ifdef MUI_FINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_INFO_TITLE "$(^NameDA) quraşdırılması tamamlanır"
  ${LangFileString} MUI_TEXT_FINISH_INFO_TEXT "$(^NameDA) kompüterinizə quraşdırıldı.$\r$\n$\r$\nQuraşdırma proqramını bağlamaq üçün Bitir düyməsini basın."
  ${LangFileString} MUI_TEXT_FINISH_INFO_REBOOT "$(^NameDA) quraşdırılmasını tamamlamaq üçün kompüteriniz yenidən başladılmalıdır. İndi yenidən başlatmaq istəyirsinizmi?"
!endif

!ifdef MUI_UNFINISHPAGE
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TITLE "$(^NameDA) silinməsi tamamlanır"
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TEXT "$(^NameDA) kompüterinizdən silindi.$\r$\n$\r$\nSilmə proqramını bağlamaq üçün Bitir düyməsini basın."
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_REBOOT "$(^NameDA) silinməsini tamamlamaq üçün kompüteriniz yenidən başladılmalıdır. İndi yenidən başlatmaq istəyirsinizmi?"
!endif

!ifdef MUI_FINISHPAGE | MUI_UNFINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_REBOOTNOW "İndi yenidən başlat"
  ${LangFileString} MUI_TEXT_FINISH_REBOOTLATER "Sonra özüm yenidən başladacağam"
  ${LangFileString} MUI_TEXT_FINISH_RUN "$(^NameDA) tətbiqini &işə sal"
  ${LangFileString} MUI_TEXT_FINISH_SHOWREADME "README faylını gö&stər"
  ${LangFileString} MUI_BUTTONTEXT_FINISH "&Bitir"
!endif

!ifdef MUI_STARTMENUPAGE
  ${LangFileString} MUI_TEXT_STARTMENU_TITLE "Başlat menyusu qovluğunu seçin"
  ${LangFileString} MUI_TEXT_STARTMENU_SUBTITLE "$(^NameDA) qısayolları üçün Başlat menyusu qovluğunu seçin."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_TOP "Proqram qısayollarının yaradılacağı Başlat menyusu qovluğunu seçin. Yeni qovluq yaratmaq üçün ad da daxil edə bilərsiniz."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_CHECKBOX "Qısayol yaratma"
!endif

!ifdef MUI_UNCONFIRMPAGE
  ${LangFileString} MUI_UNTEXT_CONFIRM_TITLE "$(^NameDA) tətbiqini sil"
  ${LangFileString} MUI_UNTEXT_CONFIRM_SUBTITLE "$(^NameDA) tətbiqini kompüterinizdən silin."
!endif

!ifdef MUI_ABORTWARNING
  ${LangFileString} MUI_TEXT_ABORTWARNING "$(^Name) quraşdırma proqramından çıxmaq istədiyinizə əminsinizmi?"
!endif

!ifdef MUI_UNABORTWARNING
  ${LangFileString} MUI_UNTEXT_ABORTWARNING "$(^Name) silmə proqramından çıxmaq istədiyinizə əminsinizmi?"
!endif

!ifdef MULTIUSER_INSTALLMODEPAGE
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_TITLE "İstifadəçiləri seçin"
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_SUBTITLE "$(^NameDA) tətbiqini hansı istifadəçilər üçün quraşdırmaq istədiyinizi seçin."
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_TOP "$(^NameDA) tətbiqini yalnız özünüz üçün, yoxsa bu kompüterin bütün istifadəçiləri üçün quraşdırmaq istədiyinizi seçin. $(^ClickNext)"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Bu kompüterdən istifadə edən hər kəs üçün quraşdır"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Yalnız mənim üçün quraşdır"
!endif
