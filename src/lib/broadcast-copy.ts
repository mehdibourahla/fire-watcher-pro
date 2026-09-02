import type { BroadcastPhase, CapText } from "@/lib/cap";

export type BroadcastVars = {
  place: string;
  wilaya: string;
  km: number | null;
  bearingDeg: number | null;
  hotspots: number;
  hours: number;
  inside: Record<Locale, string[]>;
};

type Locale = "ar" | "fr" | "en" | "kab";

type Copy = {
  event: string;
  initialHeadline: string;
  initialDesc: string;
  initialDescNoKm: string;
  initialDrift: string;
  updateHeadline: string;
  updateDesc: string;
  updateDrift: string;
  endHeadline: string;
  endDesc: string;
  cancelHeadline: string;
  cancelDesc: string;
  insideOne: string;
  insideMany: string;
  instruction: string;
  compass: [string, string, string, string, string, string, string, string];
};

/* AR copy is approved maquette wording except the inside-commune sentences and the
 * 2026-09-02 detected/confirmed rewording, both unreviewed; instruction lines are the pre-approved
 * Standing Guidance already shipped in alerts-engine. KAB pending native review. */
const COPY: Record<"ar" | "fr" | "en" | "kab", Copy> = {
  ar: {
    event: "حريق غابات",
    initialHeadline: "حريق مرصود بالقمر الاصطناعي — {{place}}، {{wilaya}}",
    initialDesc:
      "رصدت الأقمار الاصطناعية حريقًا على بعد نحو {{km}} كلم من {{place}}",
    initialDescNoKm: "رصدت الأقمار الاصطناعية حريقًا قرب {{place}}",
    initialDrift: "، يتقدم مع الريح نحو {{bearing}}",
    updateHeadline: "تحديث — حريق {{place}}",
    updateDesc: "اتسع الرصد إلى {{hotspots}} نقطة حرارية.",
    updateDrift: " اتجاه التقدم نحو {{bearing}}.",
    endHeadline: "حريق {{place}} — لا رصد جديد",
    endDesc:
      "لم تُرصد نقاط حرارية منذ {{hours}} ساعة. قد تفوت الأقمار الاصطناعية نارًا نشطة — اتبع تعليمات الحماية المدنية.",
    cancelHeadline: "إلغاء تنبيه حريق {{place}}",
    cancelDesc: "تبيّن أن الرصد قرب {{place}} لم يكن حريقًا نشطًا.",
    insideOne: " رُصدت نقاط حرارية داخل بلدية {{communes}}.",
    insideMany: " رُصدت نقاط حرارية داخل البلديات: {{communes}}.",
    instruction:
      "ابتعد عن الدخان، واتبع تعليمات السلطات المحلية، واتصل بالحماية المدنية على 14 إذا هدّد الحريق أشخاصًا أو منازل.",
    compass: [
      "الشمال",
      "الشمال الشرقي",
      "الشرق",
      "الجنوب الشرقي",
      "الجنوب",
      "الجنوب الغربي",
      "الغرب",
      "الشمال الغربي",
    ],
  },
  fr: {
    event: "Feu de forêt",
    initialHeadline: "Incendie détecté par satellite — {{place}}, {{wilaya}}",
    initialDesc:
      "Incendie détecté par satellite à environ {{km}} km de {{place}}",
    initialDescNoKm: "Incendie détecté par satellite près de {{place}}",
    initialDrift: ", poussé par le vent vers {{bearing}}",
    updateHeadline: "Mise à jour — incendie de {{place}}",
    updateDesc: "La détection s'est étendue à {{hotspots}} points chauds.",
    updateDrift: " La progression reste orientée vers {{bearing}}.",
    endHeadline: "Incendie de {{place}} — aucune nouvelle détection",
    endDesc:
      "Aucun point chaud détecté depuis {{hours}} heures. Les satellites peuvent manquer un feu actif — suivez les consignes de la Protection Civile.",
    cancelHeadline: "Annulation — alerte incendie de {{place}}",
    cancelDesc:
      "La détection près de {{place}} ne correspondait pas à un incendie actif.",
    insideOne: " Détections à l'intérieur de la commune {{communes}}.",
    insideMany: " Détections à l'intérieur des communes : {{communes}}.",
    instruction:
      "Éloignez-vous de la fumée, suivez les consignes des autorités locales et appelez la Protection Civile au 14 si le feu menace des personnes ou des habitations.",
    compass: [
      "le nord",
      "le nord-est",
      "l'est",
      "le sud-est",
      "le sud",
      "le sud-ouest",
      "l'ouest",
      "le nord-ouest",
    ],
  },
  en: {
    event: "Wildfire",
    initialHeadline: "Fire detected by satellite — {{place}}, {{wilaya}}",
    initialDesc: "Satellite-detected fire about {{km}} km from {{place}}",
    initialDescNoKm: "Satellite-detected fire near {{place}}",
    initialDrift: ", moving with the wind toward the {{bearing}}",
    updateHeadline: "Update — {{place}} fire",
    updateDesc: "Detection has grown to {{hotspots}} hotspots.",
    updateDrift: " It is still heading {{bearing}}.",
    endHeadline: "{{place}} fire — no new detections",
    endDesc:
      "No hotspots detected for {{hours}} hours. Satellites can miss an active fire — follow Civil Protection instructions.",
    cancelHeadline: "Cancelled — {{place}} fire alert",
    cancelDesc: "The detection near {{place}} was not an active fire.",
    insideOne: " Detections inside the commune of {{communes}}.",
    insideMany: " Detections inside the communes: {{communes}}.",
    instruction:
      "Stay away from the smoke, follow instructions from local authorities, and call Civil Protection on 14 if the fire threatens people or homes.",
    compass: [
      "north",
      "northeast",
      "east",
      "southeast",
      "south",
      "southwest",
      "west",
      "northwest",
    ],
  },
  kab: {
    event: "Times n teẓgi",
    initialHeadline: "Times tettwaf s uḍfar n igenwan — {{place}}, {{wilaya}}",
    initialDesc:
      "Times tettwaf s uḍfar n igenwan ɣef azal n {{km}} km si {{place}}",
    initialDescNoKm: "Times tettwaf s uḍfar n igenwan ɣer {{place}}",
    initialDrift: ", tetteddu d waḍu ɣer {{bearing}}",
    updateHeadline: "Aleqqem — times n {{place}}",
    updateDesc: "Aḍfar yewweḍ ɣer {{hotspots}} n tenqiḍin n tmes.",
    updateDrift: " Mazal tetteddu ɣer {{bearing}}.",
    endHeadline: "Times n {{place}} — ulac aḍfar amaynut",
    endDesc:
      "Ulac tinqiḍin n tmes seg {{hours}} n tsaɛtin. Igenwan zemren ad zeglen times iddren — ḍfer iwellihen n Tɣellist Tagdudant.",
    cancelHeadline: "Yefsex — alɣu n tmes n {{place}}",
    cancelDesc: "Aḍfar ɣer {{place}} mači d times iddren.",
    insideOne: " Aḍfar deg tɣiwant n {{communes}}.",
    insideMany: " Aḍfar deg tɣiwanin: {{communes}}.",
    instruction:
      "Ḥader iman-ik seg dexxan, ḍfer iwellihen n yidebbaren idiganen, tsiwleḍ i Tɣellist Tagdudant ɣef 14 ma tessexlaɛ times imdanen neɣ ixxamen.",
    compass: [
      "agafa",
      "agafa-agmuḍ",
      "agmuḍ",
      "anẓul-agmuḍ",
      "anẓul",
      "anẓul-ataram",
      "ataram",
      "agafa-ataram",
    ],
  },
};

const LANGUAGE: Record<Locale, string> = {
  ar: "ar-DZ",
  fr: "fr-DZ",
  en: "en",
  kab: "kab",
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    String(vars[k] ?? ""),
  );
}

function frDe(name: string): string {
  return /^[aeiouyhâéèêîôûAEIOUYH]/.test(name) ? `d'${name}` : `de ${name}`;
}

function insideSentence(copy: Copy, locale: Locale, names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1)
    return fill(copy.insideOne, {
      communes: locale === "fr" ? frDe(names[0]!) : names[0]!,
    });
  return fill(copy.insideMany, {
    communes: names.join(locale === "ar" ? "، " : ", "),
  });
}

function compassWord(copy: Copy, deg: number): string {
  return copy.compass[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

function description(
  phase: BroadcastPhase,
  copy: Copy,
  locale: Locale,
  vars: BroadcastVars,
): string {
  const slots = {
    place: vars.place,
    km: vars.km ?? "",
    hotspots: vars.hotspots,
    hours: vars.hours,
    bearing: vars.bearingDeg === null ? "" : compassWord(copy, vars.bearingDeg),
  };
  switch (phase) {
    case "initial": {
      const base = fill(
        vars.km === null ? copy.initialDescNoKm : copy.initialDesc,
        slots,
      );
      const drift =
        vars.bearingDeg === null ? "" : fill(copy.initialDrift, slots);
      return `${base}${drift}.${insideSentence(copy, locale, vars.inside[locale])}`;
    }
    case "update": {
      const drift =
        vars.bearingDeg === null ? "" : fill(copy.updateDrift, slots);
      return `${fill(copy.updateDesc, slots)}${drift}${insideSentence(copy, locale, vars.inside[locale])}`;
    }
    case "end":
      return fill(copy.endDesc, slots);
    case "cancel":
      return fill(copy.cancelDesc, slots);
  }
}

const HEADLINE: Record<BroadcastPhase, keyof Copy> = {
  initial: "initialHeadline",
  update: "updateHeadline",
  end: "endHeadline",
  cancel: "cancelHeadline",
};

export function broadcastTexts(
  phase: BroadcastPhase,
  vars: BroadcastVars,
): CapText[] {
  const live = phase === "initial" || phase === "update";
  return (Object.keys(COPY) as Locale[]).map((locale) => {
    const copy = COPY[locale];
    return {
      language: LANGUAGE[locale],
      event: copy.event,
      headline: fill(copy[HEADLINE[phase]] as string, {
        place: vars.place,
        wilaya: vars.wilaya,
      }),
      description: description(phase, copy, locale, vars),
      instruction: live ? copy.instruction : "",
    };
  });
}
