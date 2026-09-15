export const weatherEn = {
  historyUnavailable:
    "Earlier bulletins could not be loaded. Current warnings remain available.",
  earlierBulletins: "Earlier bulletins",
  bulletinGrouping:
    "Grouped by overlapping validity, event and area. These earlier bulletins have not been verified as superseded.",
  comparisonFull: "Model time coverage: the full warning period is covered.",
  comparisonPartial:
    "Model time coverage: only part of the warning period is covered.",
  comparisonNoOverlap:
    "Model time coverage: no overlap with the warning period.",
  comparisonMissing:
    "Model comparison unavailable: no forecast evidence loaded.",
  comparisonStale:
    "Model comparison unavailable: forecast evidence is stale or could not be refreshed.",
  comparisonUnknownValidity:
    "Model time coverage cannot be compared: warning validity is incomplete.",
  comparisonScope:
    "Time coverage does not mean agreement. Individual values may be unknown; this grid forecast cannot confirm or disprove a wilaya warning.",
  nextDay: "Next 24 hours",
  rainTotal: "Rain + showers total",
  peakProbability: "Highest known hourly precipitation probability",
  summaryCoverage:
    "Rain: {{rainCount}}/24 hours known; a total requires all 24. Probability: {{probabilityCount}}/24 hours known; the peak uses available hours only.",
  stormHours: "Hours with a thunderstorm forecast",
  stormsNone: "No thunderstorm code forecast in these 24 hours.",
  stormCoverage:
    "Conditions known for {{count}}/24 hourly endpoints. Times mark the end of each hour, not observed lightning.",
  hourlyDetails: "View 48-hour forecast details",
  upcoming: "Upcoming warning",
  active: "Active warning",
  expired: "Expired bulletin",
  pageTitle: "Weather and fire danger",
  metaTitle: "Weather and fire danger in Algeria — Nadhir",
  metaDescription:
    "Local weather forecasts, official ONM warnings and fire danger forecasts for Algeria.",
  title: "Weather forecast · 48 hours",
  location: "Choose a commune",
  choose: "Select a commune",
  loading: "Loading forecast…",
  unavailable: "Weather forecast unavailable for this commune.",
  error: "Could not load the weather forecast.",
  locationsError: "Could not load locations.",
  locationsEmpty: "No locations available.",
  retry: "Try again",
  stale: "This forecast is stale. Conditions may have changed.",
  unknown: "Unknown",
  fetched: "Retrieved",
  valid: "Forecast period",
  time: "Hour ending (Algeria)",
  condition: "Predicted conditions",
  precipitation: "Total precipitation (mm)",
  rain: "Rain + showers (mm)",
  probability: "Precipitation probability (%)",
  gusts: "Wind gusts (km/h)",
  interval:
    "Amounts and gusts refer to the preceding hour. Missing values are unknown.",
  limitation:
    "Model forecast at a grid point near the commune, not observations or lightning detection. It does not describe the entire wilaya.",
  warnings: "Official ONM warnings for this wilaya",
  warningsNone:
    "No current ONM warning returned for this wilaya. This is not a guarantee of safety.",
  warningsError: "ONM warnings unavailable.",
  warningsLoading: "Loading ONM warnings…",
  warningScope:
    "Official warnings cover the wilaya. Different or missing grid forecasts do not invalidate them.",
  warningPeriod: "Warning validity",
  issued: "Issued",
  officialSource: "Official bulletin",
  clear: "Clear / mostly clear",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rainfall: "Rain / showers",
  snow: "Snow / snow showers",
  freezing: "Freezing precipitation",
  thunderstorm: "Thunderstorm forecast",
};

export const weatherFr: typeof weatherEn = {
  historyUnavailable:
    "Les bulletins antérieurs n’ont pas pu être chargés. Les vigilances en cours restent disponibles.",
  earlierBulletins: "Bulletins antérieurs",
  bulletinGrouping:
    "Regroupés par validité chevauchante, événement et zone. Le remplacement de ces bulletins antérieurs n’a pas été vérifié.",
  comparisonFull:
    "Couverture temporelle du modèle : toute la période de vigilance est couverte.",
  comparisonPartial:
    "Couverture temporelle du modèle : seule une partie de la période de vigilance est couverte.",
  comparisonNoOverlap:
    "Couverture temporelle du modèle : aucun chevauchement avec la période de vigilance.",
  comparisonMissing:
    "Comparaison au modèle indisponible : aucune prévision chargée.",
  comparisonStale:
    "Comparaison au modèle indisponible : prévisions anciennes ou actualisation impossible.",
  comparisonUnknownValidity:
    "Couverture temporelle non comparable : la validité de la vigilance est incomplète.",
  comparisonScope:
    "La couverture temporelle ne signifie pas un accord. Certaines valeurs peuvent être inconnues ; cette prévision ponctuelle ne confirme ni n’infirme une vigilance de wilaya.",
  nextDay: "Les 24 prochaines heures",
  rainTotal: "Total pluie + averses",
  peakProbability: "Plus forte probabilité horaire de précipitations connue",
  summaryCoverage:
    "Pluie : {{rainCount}}/24 heures connues ; le total exige les 24. Probabilité : {{probabilityCount}}/24 heures connues ; le maximum utilise seulement les heures disponibles.",
  stormHours: "Heures avec un orage prévu",
  stormsNone: "Aucun code d’orage prévu sur ces 24 heures.",
  stormCoverage:
    "Conditions connues pour {{count}}/24 échéances horaires. Les heures indiquent la fin de chaque heure, sans observation de foudre.",
  hourlyDetails: "Voir les prévisions détaillées sur 48 heures",
  upcoming: "Vigilance à venir",
  active: "Vigilance en cours",
  expired: "Bulletin expiré",
  pageTitle: "Météo et danger d’incendie",
  metaTitle: "Météo et danger d’incendie en Algérie — Nadhir",
  metaDescription:
    "Prévisions météo locales, vigilances officielles ONM et prévisions du danger d’incendie en Algérie.",
  title: "Prévisions météo · 48 heures",
  location: "Choisir une commune",
  choose: "Sélectionner une commune",
  loading: "Chargement des prévisions…",
  unavailable: "Prévisions météo indisponibles pour cette commune.",
  error: "Impossible de charger les prévisions météo.",
  locationsError: "Impossible de charger les lieux.",
  locationsEmpty: "Aucun lieu disponible.",
  retry: "Réessayer",
  stale: "Ces prévisions sont anciennes. Les conditions peuvent avoir changé.",
  unknown: "Inconnu",
  fetched: "Récupérées le",
  valid: "Période de prévision",
  time: "Heure de fin (Algérie)",
  condition: "Conditions prévues",
  precipitation: "Précipitations totales (mm)",
  rain: "Pluie + averses (mm)",
  probability: "Probabilité de précipitations (%)",
  gusts: "Rafales (km/h)",
  interval:
    "Les quantités et les rafales concernent l’heure précédente. Les valeurs absentes sont inconnues.",
  limitation:
    "Prévision de modèle sur un point de grille proche de la commune, sans observation ni détection de foudre. Elle ne décrit pas toute la wilaya.",
  warnings: "Vigilances officielles ONM pour cette wilaya",
  warningsNone:
    "Aucune vigilance ONM en cours reçue pour cette wilaya. Cela ne garantit pas l’absence de danger.",
  warningsError: "Vigilances ONM indisponibles.",
  warningsLoading: "Chargement des vigilances ONM…",
  warningScope:
    "Les vigilances officielles couvrent la wilaya. Des prévisions ponctuelles différentes ou absentes ne les invalident pas.",
  warningPeriod: "Validité de la vigilance",
  issued: "Émise le",
  officialSource: "Bulletin officiel",
  clear: "Dégagé / peu nuageux",
  cloudy: "Nuageux",
  fog: "Brouillard",
  drizzle: "Bruine",
  rainfall: "Pluie / averses",
  snow: "Neige / averses de neige",
  freezing: "Précipitations verglaçantes",
  thunderstorm: "Orage prévu",
};

export const weatherAr: typeof weatherEn = {
  historyUnavailable:
    "تعذر تحميل النشرات السابقة. تظل التنبيهات الحالية متاحة.",
  earlierBulletins: "النشرات السابقة",
  bulletinGrouping:
    "جُمعت حسب تداخل الصلاحية والحدث والمنطقة. لم يتم التحقق من إلغاء هذه النشرات السابقة أو استبدالها.",
  comparisonFull: "التغطية الزمنية للنموذج: تشمل فترة التنبيه كاملة.",
  comparisonPartial: "التغطية الزمنية للنموذج: تشمل جزءًا من فترة التنبيه فقط.",
  comparisonNoOverlap: "التغطية الزمنية للنموذج: لا تتداخل مع فترة التنبيه.",
  comparisonMissing: "المقارنة بالنموذج غير متاحة: لم تُحمّل توقعات.",
  comparisonStale:
    "المقارنة بالنموذج غير متاحة: التوقعات قديمة أو تعذر تحديثها.",
  comparisonUnknownValidity:
    "تعذرت مقارنة التغطية الزمنية: فترة صلاحية التنبيه غير مكتملة.",
  comparisonScope:
    "التغطية الزمنية لا تعني الاتفاق. بعض القيم قد تكون غير معروفة؛ توقعات نقطة الشبكة لا تؤكد تنبيه الولاية ولا تنفيه.",
  nextDay: "الساعات الأربع والعشرون القادمة",
  rainTotal: "مجموع الأمطار والزخات",
  peakProbability: "أعلى احتمال هطول ساعي معروف",
  summaryCoverage:
    "الأمطار: {{rainCount}} من 24 ساعة معروفة؛ يتطلب المجموع معرفة الساعات كلها. الاحتمال: {{probabilityCount}} من 24 ساعة معروفة؛ القيمة القصوى تخص الساعات المتاحة فقط.",
  stormHours: "الساعات التي تُتوقع فيها عاصفة رعدية",
  stormsNone:
    "لا يتوقع النموذج رمز عاصفة رعدية في هذه الساعات الأربع والعشرين.",
  stormCoverage:
    "الظروف معروفة لـ {{count}} من 24 توقيتًا ساعيًّا. التوقيت يحدد نهاية كل ساعة، وليس رصدًا للبرق.",
  hourlyDetails: "عرض تفاصيل توقعات 48 ساعة",
  upcoming: "تنبيه قادم",
  active: "تنبيه سارٍ",
  expired: "نشرة منتهية الصلاحية",
  pageTitle: "الطقس وخطر الحرائق",
  metaTitle: "الطقس وخطر الحرائق في الجزائر — نذير",
  metaDescription:
    "توقعات الطقس المحلية والتنبيهات الرسمية للديوان الوطني للأرصاد الجوية وتوقعات خطر الحرائق في الجزائر.",
  title: "توقعات الطقس · 48 ساعة",
  location: "اختر بلدية",
  choose: "اختيار بلدية",
  loading: "جارٍ تحميل التوقعات…",
  unavailable: "توقعات الطقس غير متاحة لهذه البلدية.",
  error: "تعذر تحميل توقعات الطقس.",
  locationsError: "تعذر تحميل المواقع.",
  locationsEmpty: "لا توجد مواقع متاحة.",
  retry: "إعادة المحاولة",
  stale: "هذه التوقعات قديمة. ربما تغيرت الظروف.",
  unknown: "غير معروف",
  fetched: "وقت الاسترجاع",
  valid: "فترة التوقعات",
  time: "نهاية الساعة (الجزائر)",
  condition: "الظروف المتوقعة",
  precipitation: "إجمالي الهطول (مم)",
  rain: "أمطار + زخات (مم)",
  probability: "احتمال الهطول (%)",
  gusts: "هبّات الرياح (كم/س)",
  interval: "الكميات والهبّات تخص الساعة السابقة. القيم الغائبة غير معروفة.",
  limitation:
    "توقعات نموذج عند نقطة شبكة قرب البلدية، وليست رصدًا أو كشفًا للبرق. لا تصف الولاية بأكملها.",
  warnings: "التنبيهات الرسمية للأرصاد الجوية لهذه الولاية",
  warningsNone: "لم يرد تنبيه رسمي سارٍ لهذه الولاية. هذا لا يضمن غياب الخطر.",
  warningsError: "تنبيهات الأرصاد الجوية غير متاحة.",
  warningsLoading: "جارٍ تحميل تنبيهات الأرصاد الجوية…",
  warningScope:
    "التنبيهات الرسمية تخص الولاية. اختلاف توقعات نقطة الشبكة أو غيابها لا ينفيها.",
  warningPeriod: "فترة صلاحية التنبيه",
  issued: "صدر في",
  officialSource: "النشرة الرسمية",
  clear: "صافٍ / قليل السحب",
  cloudy: "غائم",
  fog: "ضباب",
  drizzle: "رذاذ",
  rainfall: "أمطار / زخات",
  snow: "ثلوج / زخات ثلجية",
  freezing: "هطول متجمد",
  thunderstorm: "عاصفة رعدية متوقعة",
};
