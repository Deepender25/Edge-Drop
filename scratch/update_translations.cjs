const fs = require('fs');
let code = fs.readFileSync('src/i18n/translations.ts', 'utf-8');

const translations = {
  es: {
    behaviour: `
    fullscreenProtectionDescOff: 'Desactivado porque la Activación al pasar el cursor está apagada',
    clearUnpinnedTitle: 'Borrar no fijados al reiniciar',
    clearUnpinnedDesc: 'Borrar elementos no fijados cada vez que se reinicie la app',
    autoDeleteTimerTitle: 'Temporizador de borrado automático',
    autoDeleteTimerDesc: 'Purgar automáticamente elementos copiados (preserva los Fijados)',
    historyCapacityTitle: 'Capacidad del historial',
    historyCapacityDesc: 'Máximo de elementos no fijados guardados en el historial'`,
    position: `
    stickPositionTitle: 'Posición de anclaje',
    stickPositionDesc: 'Borde de la pantalla al que se adjuntará el panel',
    left: 'Izquierda',
    right: 'Derecha',
    triggerZoneGroup: 'Zona de Activación',
    edgeHintTitle: 'Pista de ubicación del borde',
    edgeHintDesc: 'Iluminar sutilmente el borde al tocarlo en la posición incorrecta',
    triggerPositionTitle: 'Posición de activación',
    triggerPositionDesc: 'Colocación de la franja de activación respecto al panel',
    triggerHeightTitle: 'Altura de activación',
    triggerHeightDesc: 'Tamaño del área de activación en el borde',
    triggerThicknessTitle: 'Grosor de activación',
    triggerThicknessDesc: 'Grosor físico de la franja invisible de activación',
    panelHeightTitle: 'Altura del panel',
    panelHeightDesc: 'Tamaño vertical del estante del portapapeles',
    small: 'Pequeño',
    medium: 'Mediano',
    large: 'Grande'`,
    appearance: `
    typographyGroup: 'Tipografía',
    audioGroup: 'Audio y Retroalimentación'`,
    item: `
    pinnedHeader: 'FIJADO',
    recentHeader: 'RECIENTE',
    emptyHistory: 'No se encontraron elementos'`
  },
  fr: {
    behaviour: `
    fullscreenProtectionDescOff: 'Désactivé car l\\'activation au survol est éteinte',
    clearUnpinnedTitle: 'Effacer les non épinglés au redémarrage',
    clearUnpinnedDesc: 'Effacer les éléments non épinglés à chaque redémarrage',
    autoDeleteTimerTitle: 'Délai de suppression auto',
    autoDeleteTimerDesc: 'Purger automatiquement les éléments copiés (préserve les Épinglés)',
    historyCapacityTitle: 'Capacité de l\\'historique',
    historyCapacityDesc: 'Nombre maximum d\\'éléments non épinglés stockés'` ,
    position: `
    stickPositionTitle: 'Position d\\'ancrage',
    stickPositionDesc: 'Bord de l\\'écran pour attacher le panneau',
    left: 'Gauche',
    right: 'Droite',
    triggerZoneGroup: 'Zone de déclenchement',
    edgeHintTitle: 'Indice de positionnement',
    edgeHintDesc: 'Illuminer subtilement le bord en cas de toucher au mauvais endroit',
    triggerPositionTitle: 'Position de déclenchement',
    triggerPositionDesc: 'Placement de la zone de survol par rapport au panneau',
    triggerHeightTitle: 'Hauteur de déclenchement',
    triggerHeightDesc: 'Taille de la zone de survol sur le bord',
    triggerThicknessTitle: 'Épaisseur de déclenchement',
    triggerThicknessDesc: 'Épaisseur physique de la zone invisible',
    panelHeightTitle: 'Hauteur du panneau',
    panelHeightDesc: 'Taille verticale de l\\'étagère du presse-papiers',
    small: 'Petit',
    medium: 'Moyen',
    large: 'Grand'`,
    appearance: `
    typographyGroup: 'Typographie',
    audioGroup: 'Audio et Retours'`,
    item: `
    pinnedHeader: 'ÉPINGLÉ',
    recentHeader: 'RÉCENT',
    emptyHistory: 'Aucun élément trouvé'`
  },
  de: {
    behaviour: `
    fullscreenProtectionDescOff: 'Deaktiviert, da die Hover-Aktivierung ausgeschaltet ist',
    clearUnpinnedTitle: 'Nicht angeheftete beim Neustart löschen',
    clearUnpinnedDesc: 'Nicht angeheftete Elemente bei jedem Neustart löschen',
    autoDeleteTimerTitle: 'Auto-Löschen Timer',
    autoDeleteTimerDesc: 'Kopierte Elemente automatisch löschen (Angeheftete bleiben)',
    historyCapacityTitle: 'Verlaufskapazität',
    historyCapacityDesc: 'Maximale Anzahl nicht angehefteter Elemente'` ,
    position: `
    stickPositionTitle: 'Anheftungsposition',
    stickPositionDesc: 'Bildschirmrand zum Anheften des Panels',
    left: 'Links',
    right: 'Rechts',
    triggerZoneGroup: 'Auslösezone',
    edgeHintTitle: 'Randpositions-Hinweis',
    edgeHintDesc: 'Dezentes Leuchten am Rand bei Berührung an falscher Stelle',
    triggerPositionTitle: 'Auslöseposition',
    triggerPositionDesc: 'Platzierung des Hover-Bereichs relativ zum Panel',
    triggerHeightTitle: 'Auslösehöhe',
    triggerHeightDesc: 'Größe des Hover-Bereichs am Rand',
    triggerThicknessTitle: 'Auslösedicke',
    triggerThicknessDesc: 'Physische Dicke des unsichtbaren Auslösebereichs',
    panelHeightTitle: 'Panelhöhe',
    panelHeightDesc: 'Vertikale Größe der Zwischenablage-Leiste',
    small: 'Klein',
    medium: 'Mittel',
    large: 'Groß'`,
    appearance: `
    typographyGroup: 'Typografie',
    audioGroup: 'Audio & Feedback'`,
    item: `
    pinnedHeader: 'ANGEHEFTET',
    recentHeader: 'ZULETZT VERWENDET',
    emptyHistory: 'Keine Elemente gefunden'`
  },
  hi: {
    behaviour: `
    fullscreenProtectionDescOff: 'अक्षम क्योंकि होवर सक्रियण बंद है',
    clearUnpinnedTitle: 'रीस्टार्ट पर अनपिन किए गए साफ़ करें',
    clearUnpinnedDesc: 'ऐप के रीस्टार्ट होने पर अनपिन किए गए आइटम मिटाएं',
    autoDeleteTimerTitle: 'ऑटो-डिलीट टाइमर',
    autoDeleteTimerDesc: 'कॉपी किए गए आइटम स्वचालित रूप से हटाएं (पिन किए गए सुरक्षित रहते हैं)',
    historyCapacityTitle: 'इतिहास क्षमता',
    historyCapacityDesc: 'इतिहास में अधिकतम अनपिन किए गए आइटम'` ,
    position: `
    stickPositionTitle: 'स्टिक स्थिति',
    stickPositionDesc: 'पैनल संलग्न करने के लिए स्क्रीन का किनारा',
    left: 'बाएं',
    right: 'दाएं',
    triggerZoneGroup: 'ट्रिगर ज़ोन',
    edgeHintTitle: 'किनारे का संकेत',
    edgeHintDesc: 'गलत स्थिति पर किनारे को छूने पर सूक्ष्मता से प्रकाशित करें',
    triggerPositionTitle: 'ट्रिगर स्थिति',
    triggerPositionDesc: 'पैनल के सापेक्ष होवर ट्रिगर का स्थान',
    triggerHeightTitle: 'ट्रिगर ऊंचाई',
    triggerHeightDesc: 'स्क्रीन किनारे पर होवर क्षेत्र का आकार',
    triggerThicknessTitle: 'ट्रिगर मोटाई',
    triggerThicknessDesc: 'अदृश्य ट्रिगर पट्टी की भौतिक मोटाई',
    panelHeightTitle: 'पैनल की ऊंचाई',
    panelHeightDesc: 'क्लिपबोर्ड शेल्फ का लंबवत आकार',
    small: 'छोटा',
    medium: 'मध्यम',
    large: 'बड़ा'`,
    appearance: `
    typographyGroup: 'टाइपोग्राफी',
    audioGroup: 'ऑडियो और फीडबैक'`,
    item: `
    pinnedHeader: 'पिन किया गया',
    recentHeader: 'हाल ही में',
    emptyHistory: 'कोई आइटम नहीं मिला'`
  },
  zhCN: {
    behaviour: `
    fullscreenProtectionDescOff: '由于悬停触发已关闭，此功能不可用',
    clearUnpinnedTitle: '重启时清除未固定项',
    clearUnpinnedDesc: '每次重启应用时清空未固定的剪贴板项目',
    autoDeleteTimerTitle: '自动清理倒计时',
    autoDeleteTimerDesc: '自动清除复制的项目（保留已固定项）',
    historyCapacityTitle: '历史记录容量',
    historyCapacityDesc: '历史记录中最多保存的未固定项目数'` ,
    position: `
    stickPositionTitle: '停靠位置',
    stickPositionDesc: '面板附着在屏幕的哪一侧',
    left: '左侧',
    right: '右侧',
    triggerZoneGroup: '触发区域',
    edgeHintTitle: '边缘位置提示',
    edgeHintDesc: '在错误位置触碰边缘时闪烁视觉提示',
    triggerPositionTitle: '边缘触发位置',
    triggerPositionDesc: '悬停触发区域相对于面板的位置',
    triggerHeightTitle: '边缘触发高度',
    triggerHeightDesc: '屏幕边缘悬停区域的长度',
    triggerThicknessTitle: '边缘触发厚度',
    triggerThicknessDesc: '不可见触发条的物理厚度',
    panelHeightTitle: '面板高度',
    panelHeightDesc: '剪贴板面板的垂直大小',
    small: '小',
    medium: '中',
    large: '大'`,
    appearance: `
    typographyGroup: '排版',
    audioGroup: '音效与反馈'`,
    item: `
    pinnedHeader: '已固定',
    recentHeader: '最近',
    emptyHistory: '找不到剪贴板项目'`
  },
  zhTW: {
    behaviour: `
    fullscreenProtectionDescOff: '由於懸停觸發已關閉，此功能無法使用',
    clearUnpinnedTitle: '重啟時清除未固定項目',
    clearUnpinnedDesc: '每次重新啟動應用程式時清空未固定的剪貼簿項目',
    autoDeleteTimerTitle: '自動清理計時器',
    autoDeleteTimerDesc: '自動清除複製的項目（保留已固定項目）',
    historyCapacityTitle: '歷史紀錄容量',
    historyCapacityDesc: '歷史紀錄中最多儲存的未固定項目數'` ,
    position: `
    stickPositionTitle: '停靠位置',
    stickPositionDesc: '面板附著在螢幕的哪一側',
    left: '左側',
    right: '右側',
    triggerZoneGroup: '觸發區域',
    edgeHintTitle: '邊緣位置提示',
    edgeHintDesc: '在錯誤位置觸碰邊緣時閃爍視覺提示',
    triggerPositionTitle: '邊緣觸發位置',
    triggerPositionDesc: '懸停觸發區域相對於面板的位置',
    triggerHeightTitle: '邊緣觸發高度',
    triggerHeightDesc: '螢幕邊緣懸停區域的長度',
    triggerThicknessTitle: '邊緣觸發厚度',
    triggerThicknessDesc: '不可見觸發條的物理厚度',
    panelHeightTitle: '面板高度',
    panelHeightDesc: '剪貼簿面板的垂直大小',
    small: '小',
    medium: '中',
    large: '大'`,
    appearance: `
    typographyGroup: '排版',
    audioGroup: '音效與反饋'`,
    item: `
    pinnedHeader: '已固定',
    recentHeader: '最近',
    emptyHistory: '找不到剪貼簿項目'`
  },
  ja: {
    behaviour: `
    fullscreenProtectionDescOff: 'ホバー起動がオフのため無効です',
    clearUnpinnedTitle: '再起動時にピン留め以外を消去',
    clearUnpinnedDesc: 'アプリ再起動時にピン留めされていない項目を削除',
    autoDeleteTimerTitle: '自動削除タイマー',
    autoDeleteTimerDesc: 'コピーした項目を自動的に削除 (ピン留めは保持)',
    historyCapacityTitle: '履歴の容量',
    historyCapacityDesc: '履歴に保存する未ピン留め項目の最大数'` ,
    position: `
    stickPositionTitle: '配置位置',
    stickPositionDesc: 'パネルを配置する画面の端',
    left: '左',
    right: '右',
    triggerZoneGroup: 'トリガーゾーン',
    edgeHintTitle: '端の位置ヒント',
    edgeHintDesc: '間違った位置の端を触った時に視覚的にヒントを表示',
    triggerPositionTitle: 'トリガー位置',
    triggerPositionDesc: 'パネルに対するホバートリガーの配置',
    triggerHeightTitle: 'トリガーの高さ',
    triggerHeightDesc: '画面端のホバー領域のサイズ',
    triggerThicknessTitle: 'トリガーの厚み',
    triggerThicknessDesc: '透明なトリガー領域の物理的な厚み',
    panelHeightTitle: 'パネルの高さ',
    panelHeightDesc: 'クリップボードシェルフの垂直サイズ',
    small: '小',
    medium: '中',
    large: '大'`,
    appearance: `
    typographyGroup: 'タイポグラフィ',
    audioGroup: 'オーディオとフィードバック'`,
    item: `
    pinnedHeader: 'ピン留め',
    recentHeader: '最近',
    emptyHistory: 'アイテムが見つかりません'`
  },
  ru: {
    behaviour: `
    fullscreenProtectionDescOff: 'Отключено, так как активация при наведении выключена',
    clearUnpinnedTitle: 'Очищать незакрепленные при перезапуске',
    clearUnpinnedDesc: 'Удалять незакрепленные элементы при перезапуске приложения',
    autoDeleteTimerTitle: 'Таймер автоудаления',
    autoDeleteTimerDesc: 'Автоматически удалять скопированные элементы (закрепленные сохраняются)',
    historyCapacityTitle: 'Вместимость истории',
    historyCapacityDesc: 'Максимальное количество незакрепленных элементов в истории'` ,
    position: `
    stickPositionTitle: 'Позиция прикрепления',
    stickPositionDesc: 'Край экрана для прикрепления панели',
    left: 'Слева',
    right: 'Справа',
    triggerZoneGroup: 'Зона активации',
    edgeHintTitle: 'Подсказка положения',
    edgeHintDesc: 'Слегка подсвечивать край экрана при наведении не в том месте',
    triggerPositionTitle: 'Позиция активации',
    triggerPositionDesc: 'Положение зоны наведения относительно панели',
    triggerHeightTitle: 'Высота зоны активации',
    triggerHeightDesc: 'Размер зоны наведения на краю экрана',
    triggerThicknessTitle: 'Толщина зоны активации',
    triggerThicknessDesc: 'Физическая толщина невидимой зоны',
    panelHeightTitle: 'Высота панели',
    panelHeightDesc: 'Вертикальный размер панели буфера обмена',
    small: 'Маленький',
    medium: 'Средний',
    large: 'Большой'`,
    appearance: `
    typographyGroup: 'Типографика',
    audioGroup: 'Аудио и отклик'`,
    item: `
    pinnedHeader: 'ЗАКРЕПЛЕННЫЕ',
    recentHeader: 'НЕДАВНИЕ',
    emptyHistory: 'Элементы не найдены'`
  },
  ko: {
    behaviour: `
    fullscreenProtectionDescOff: '호버 활성화가 꺼져 있어 비활성화됨',
    clearUnpinnedTitle: '재시작 시 고정 해제된 항목 지우기',
    clearUnpinnedDesc: '앱을 재시작할 때마다 고정되지 않은 항목을 삭제합니다',
    autoDeleteTimerTitle: '자동 삭제 타이머',
    autoDeleteTimerDesc: '복사된 항목을 자동으로 삭제합니다 (고정 항목 유지)',
    historyCapacityTitle: '기록 용량',
    historyCapacityDesc: '기록에 저장되는 고정되지 않은 항목의 최대 수'` ,
    position: `
    stickPositionTitle: '부착 위치',
    stickPositionDesc: '패널을 부착할 화면 가장자리',
    left: '왼쪽',
    right: '오른쪽',
    triggerZoneGroup: '트리거 영역',
    edgeHintTitle: '가장자리 위치 힌트',
    edgeHintDesc: '잘못된 위치를 터치할 때 가장자리를 부드럽게 밝힙니다',
    triggerPositionTitle: '가장자리 트리거 위치',
    triggerPositionDesc: '패널에 대한 호버 트리거 배율',
    triggerHeightTitle: '가장자리 트리거 높이',
    triggerHeightDesc: '화면 가장자리의 호버 영역 크기',
    triggerThicknessTitle: '가장자리 트리거 두께',
    triggerThicknessDesc: '보이지 않는 트리거 영역의 물리적 두께',
    panelHeightTitle: '패널 높이',
    panelHeightDesc: '클립보드 선반의 수직 크기',
    small: '작게',
    medium: '보통',
    large: '크게'`,
    appearance: `
    typographyGroup: '타이포그래피',
    audioGroup: '오디오 및 피드백'`,
    item: `
    pinnedHeader: '고정됨',
    recentHeader: '최근',
    emptyHistory: '항목을 찾을 수 없습니다'`
  },
  pt: {
    behaviour: `
    fullscreenProtectionDescOff: 'Desativado porque a Ativação ao passar o cursor está desligada',
    clearUnpinnedTitle: 'Limpar não fixados ao reiniciar',
    clearUnpinnedDesc: 'Apagar itens não fixados sempre que o aplicativo for reiniciado',
    autoDeleteTimerTitle: 'Temporizador de auto-exclusão',
    autoDeleteTimerDesc: 'Excluir automaticamente itens copiados (preserva os Fixados)',
    historyCapacityTitle: 'Capacidade do histórico',
    historyCapacityDesc: 'Máximo de itens não fixados armazenados no histórico'` ,
    position: `
    stickPositionTitle: 'Posição de fixação',
    stickPositionDesc: 'Borda da tela para fixar o painel',
    left: 'Esquerda',
    right: 'Direita',
    triggerZoneGroup: 'Zona de Gatilho',
    edgeHintTitle: 'Dica de localização da borda',
    edgeHintDesc: 'Iluminar sutilmente a borda ao tocar no lugar errado',
    triggerPositionTitle: 'Posição do gatilho',
    triggerPositionDesc: 'Colocação da zona de gatilho em relação ao painel',
    triggerHeightTitle: 'Altura do gatilho',
    triggerHeightDesc: 'Tamanho da área de hover na borda',
    triggerThicknessTitle: 'Espessura do gatilho',
    triggerThicknessDesc: 'Espessura física da área invisível',
    panelHeightTitle: 'Altura do painel',
    panelHeightDesc: 'Tamanho vertical da prateleira da área de transferência',
    small: 'Pequeno',
    medium: 'Médio',
    large: 'Grande'`,
    appearance: `
    typographyGroup: 'Tipografia',
    audioGroup: 'Áudio e Feedback'`,
    item: `
    pinnedHeader: 'FIXADO',
    recentHeader: 'RECENTE',
    emptyHistory: 'Nenhum item encontrado'`
  },
  it: {
    behaviour: `
    fullscreenProtectionDescOff: 'Disabilitato perché l\\'Attivazione al passaggio è spenta',
    clearUnpinnedTitle: 'Cancella non fissati al riavvio',
    clearUnpinnedDesc: 'Cancella gli elementi non fissati a ogni riavvio dell\\'app',
    autoDeleteTimerTitle: 'Timer di eliminazione automatica',
    autoDeleteTimerDesc: 'Elimina automaticamente gli elementi copiati (preserva i Fissati)',
    historyCapacityTitle: 'Capacità della cronologia',
    historyCapacityDesc: 'Numero massimo di elementi non fissati salvati'` ,
    position: `
    stickPositionTitle: 'Posizione di ancoraggio',
    stickPositionDesc: 'Bordo dello schermo a cui agganciare il pannello',
    left: 'Sinistra',
    right: 'Destra',
    triggerZoneGroup: 'Zona di Attivazione',
    edgeHintTitle: 'Suggerimento posizione bordo',
    edgeHintDesc: 'Illumina sottilmente il bordo se si tocca nel punto sbagliato',
    triggerPositionTitle: 'Posizione di attivazione',
    triggerPositionDesc: 'Posizionamento della zona di hover rispetto al pannello',
    triggerHeightTitle: 'Altezza di attivazione',
    triggerHeightDesc: 'Dimensione dell\\'area di hover sul bordo',
    triggerThicknessTitle: 'Spessore di attivazione',
    triggerThicknessDesc: 'Spessore fisico della striscia invisibile',
    panelHeightTitle: 'Altezza del pannello',
    panelHeightDesc: 'Dimensione verticale della mensola degli appunti',
    small: 'Piccolo',
    medium: 'Medio',
    large: 'Grande'`,
    appearance: `
    typographyGroup: 'Tipografia',
    audioGroup: 'Audio e Feedback'`,
    item: `
    pinnedHeader: 'FISSATO',
    recentHeader: 'RECENTE',
    emptyHistory: 'Nessun elemento trovato'`
  },
  ar: {
    behaviour: `
    fullscreenProtectionDescOff: 'معطل لأن التنشيط عند التمرير متوقف',
    clearUnpinnedTitle: 'مسح غير المثبت عند إعادة التشغيل',
    clearUnpinnedDesc: 'مسح العناصر غير المثبتة في كل مرة يعاد فيها تشغيل التطبيق',
    autoDeleteTimerTitle: 'مؤقت الحذف التلقائي',
    autoDeleteTimerDesc: 'مسح العناصر المنسوخة تلقائيًا (يحافظ على المثبتة)',
    historyCapacityTitle: 'سعة السجل',
    historyCapacityDesc: 'الحد الأقصى للعناصر غير المثبتة المخزنة'` ,
    position: `
    stickPositionTitle: 'موضع التثبيت',
    stickPositionDesc: 'حافة الشاشة لتوصيل اللوحة',
    left: 'يسار',
    right: 'يمين',
    triggerZoneGroup: 'منطقة التنشيط',
    edgeHintTitle: 'تلميح موضع الحافة',
    edgeHintDesc: 'إضاءة خفيفة للحافة عند لمسها في موضع خاطئ',
    triggerPositionTitle: 'موضع التنشيط',
    triggerPositionDesc: 'موضع شريط التمرير بالنسبة للوحة',
    triggerHeightTitle: 'ارتفاع التنشيط',
    triggerHeightDesc: 'حجم منطقة التمرير على الحافة',
    triggerThicknessTitle: 'سمك التنشيط',
    triggerThicknessDesc: 'السمك الفعلي للشريط غير المرئي',
    panelHeightTitle: 'ارتفاع اللوحة',
    panelHeightDesc: 'الحجم الرأسي لرف الحافظة',
    small: 'صغير',
    medium: 'متوسط',
    large: 'كبير'`,
    appearance: `
    typographyGroup: 'الطباعة',
    audioGroup: 'الصوت والملاحظات'`,
    item: `
    pinnedHeader: 'مثبت',
    recentHeader: 'حديث',
    emptyHistory: 'لم يتم العثور على عناصر'`
  }
};

for (const [lang, blocks] of Object.entries(translations)) {
  for (const [blockName, blockContent] of Object.entries(blocks)) {
    const regex = new RegExp("(export const " + lang + ":[^=]+=\\s*\\{[\\s\\S]*?" + blockName + ":\\s*\\{[^}]*)(\\})", 'g');
    let replaced = false;
    code = code.replace(regex, (match, p1, p2) => {
      replaced = true;
      const comma = p1.trim().endsWith('{') ? '' : ',';
      return p1 + comma + '\\n' + blockContent + '\\n  ' + p2;
    });
    if (!replaced) console.error("Failed to replace " + lang + " -> " + blockName);
  }
}

fs.writeFileSync('src/i18n/translations.ts', code);
console.log('Translations successfully injected.');
