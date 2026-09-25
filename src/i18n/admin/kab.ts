export const adminKab = {
  sources: {
    textRecovery: {
      title: "Ales tesleḍt n yiḍrisen",
      description:
        "50 n yineqqisen iqburen i yekfan tirmitin tiwurmanin. Anedbal yezmer ad d-yales i yal aneqqis yiwet n tikkelt deg wass, mi yekfa ugmar amiran.",
      empty: "Ulac ineqqisen n uḍris i yekfan tirmitin.",
      retry: "Ales tesleḍt",
      retryFailed:
        "Ur nezmir ara ad d-nales. Rǧu ad yekfu ugmar neɣ talast n wass, sakin ɛreḍ tikkelt nniḍen.",
      retryQueued: "Tasleḍt tettwarǧu i ugmar i d-iteddun.",
      exhausted: "Tasleḍt ur temmid ara deffir {{count}} n tirmitin.",
    },
    archive: {
      title: "Aɣbar n yisefka n yiɣbula",
      description:
        "50 n tikkal n ugmar tineggura. Isefka izwura ttwaḥerzen i tesleḍt d useqdec tikkelt nniḍen, ulac tukksa tawurmant. Akud UTC. I yinedbalen kan.",
      source: "Tasarut n uɣbalu (ilem i meṛṛa)",
      filter: "Sizdeg",
      empty: "Ulac agmar yettwaḥerzen dagi.",
      captured: "Isefka ttwaḥerzen",
      not_modified: "Aɣbalu ur ibeddel ara (304)",
      failed: "Agmar ur yeddi ara",
      download: "Sider isefka yettwasenqden",
    },
    pushTestTitle: "Asekyed uslig n telɣut",
    pushTestHelp:
      "Sit ɣef tqeffalt, syin uɣal ɣer ugdil agejdan n iPhone. Talɣut n usekyed ad truḥ ɣer yibenk-a kan.",
    pushTestButton: "Sekyed ibenk-a",
    pushTestWaiting: "Tuzzna. Uɣal ɣer ugdil agejdan",
    pushTestAccepted:
      "Le fournisseur a accepté le test. En attente du signalement d'arrivée par cet appareil.",
    pushTestReceived: "Reçu sur cet appareil à {{time}}.",
    pushTestUnconfirmed:
      "Aucune arrivée signalée en une minute. Le navigateur peut la livrer plus tard, ou cet appareil bloque la réception en arrière-plan.",
    pushTestCheckFailed:
      "La notification est partie, mais son arrivée n'a pas pu être vérifiée. Rechargez la page pour vérifier à nouveau.",
    pushTestErrors: {
      notifications:
        "Activez d'abord les notifications de Nadhir sur cet appareil.",
      signIn: "Reconnectez-vous avec votre compte administrateur.",
      forbidden: "Seuls les administrateurs peuvent lancer ce test.",
      wait: "Deux tests par minute au plus. Attendez une minute puis réessayez.",
      invalid:
        "L'inscription de cet appareil aux notifications n'est pas valide. Désactivez puis réactivez les notifications.",
      unavailable:
        "Le service de notification n'a pas répondu. Réessayez dans un instant.",
    },
    ensemble: {
      title: "Askan n tegnawt s ugraw",
      description:
        "Tamudemt tagreɣlant ICON · 40 n yiɛeggalen · yiwen wass UTC. Tilisa mmalent amgired n yisnammalen, mačči d tignatin yettwaqadden.",
      communeCode: "Tangalt n tɣiwant",
      loading: "Asali…",
      submit: "Sken taɣiwant",
      retrieved: "{{name}} ({{code}}) · yettwagem {{time}}",
      forecastDate: "Azemz n usnammal: {{date}} (UTC)",
      metadata:
        "Akud n uselkem n tmudemt ur d-yettunefk ara. Talemmast n uferrug: {{lat}}, {{lon}}. D isefka n usnammal kan.",
      caption: "Adday d ufellay n 40 n yiɛeggalen i yal asrag UTC",
      validTime: "Akud ameɣtu (UTC)",
      temperature: "Taẓɣelt (°C)",
      precipitation: "Ageffur n usrag (mm)",
      wind: "Aḍu (km/h)",
      members: "Azalen n yiɛeggalen d wakuden imeɣta",
      attribution: "CC BY 4.0 · askan amyigaw, ulac aggay awurman.",
      signIn: "Kcem tikkelt nniḍen i uskan n tegnawt",
      forbidden: "Ilaq unekcum n umahal",
      invalidCommune: "Sekcem tangalt n tɣiwant yettwassnen s ukuẓ n yizwilen",
      quota: "Tewweḍ talast n uskan. Ɛreḍ ticki.",
      unavailable: "Askan ur yewjid ara. Ɛreḍ ticki.",
    },
    title: "Iɣbula",
    subtitle: "Addad n yiɣbula d yilmawen n yisefka.",
    gaps: "Ilmawen yeldin",
    gapsEmpty: "Ulac ilmawen yeldin.",
    colSource: "Aɣbalu",
    colState: "Addad",
    colLastSuccess: "Rbeḥ aneggaru",
    replay: "Ales",
    replayCount: "{{count}} n wallus",
    deliveryQueues: "Idrigen n tuzzna",
    sourcePauseHelp:
      "Inedbalen zemren ad sḥebsen aɣawas d uselkem n twuriwin timaynutin. Tid yetteddun zemrent ad fakent; aɛiwed ad yeḥrez aɣawas d umezruy n uɣbalu.",
    pauseSource: "Sḥebs {{source}}",
    resumeSource: "Ales {{source}}",
    pauseHelp:
      "Aḥbas iseḥbas tuzzniwin timaynutin deg ubadu-a; tid yebdan zemrent ad kemmḍent.",
    loading: "Asali…",
    loadFailed: "Ur nezmir ara ad d-nsali isefka",
    actionFailed: "Tamhelt ur teddi ara",
    channel: "Abadu",
    pending: "Deg uraǧu",
    expired: "Fukkent",
    oldestPending: "Aqbur deg uraǧu",
    paused: "Yeḥbes",
    running: "Yetteddu",
    pause: "Seḥbes",
    resume: "Kemmel",
    operationalIncidents: "Uguren n umahil",
    incidentsHelp:
      "Uguren yeldin d imezwura, syin wid yefran melmi kan (100 s tuget). Aseggem n tɣuri ur yefri ara ugur.",
    resolved: "Yefra",
    acknowledged: "Yettwaɣra",
    open: "Yeldi",
    acknowledge: "Seggem taɣuri",
  },
};
