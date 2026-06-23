import type { Lang } from "../context/LangContext";

export interface LandingContent {
  utility: {
    // skip: string;
    accessibility: string;
    sizeText: string;
    langLabel: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    titleAlt: string; // shown small under the main title (the other tongue)
    beta: string;
    tagline: string;
    lede: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  chips: { label: string; to: string }[];
  stats: { num: string; lbl: string }[];
  ministriesCap: string;
  problem: {
    eyebrow: string;
    title: string;
    lede: string;
    cards: { icon: string; figure: string; label: string; note: string }[];
  };
  approach: {
    eyebrow: string;
    title: string;
    // lede: string;
    steps: { step: string; title: string; body: string; tag: string }[];
    cards: { title: string; body: string }[];
  };
  features: {
    eyebrow: string;
    title: string;
    cards: {title: string; body: string }[];
  };
  footer: {
    about: string;
    cols: {
      title: string;
      links: { label: string; to: string; ext?: boolean }[];
    }[];
    contact: {
      title: string;
      dept: string;
      address: string;
      emailLabel: string;
      email: string;
      helplineLabel: string;
      helpline: string;
    };
    socialLabel: string;
    bottomLinks: { label: string; to: string }[];
    copyright: string;
    credit: string;
    lastUpdated: string;
  };
}

const CHIP_ROUTES = [
  "/dashboard/live",
  "/dashboard/emergency",
  "/dashboard/analytics",
  "/dashboard/health",
];

const EN: LandingContent = {
  utility: {
    // skip: "Skip to main content",
    accessibility: "Accessibility",
    sizeText: "A",
    langLabel: "हिंदी",
  },
  hero: {
    eyebrow: "Government of NCT of Delhi · Transport Department",
    title: "Smart Traffic Management System",
    titleAlt: "स्मार्ट यातायात प्रबंधन प्रणाली",
    beta: "PILOT",
    tagline: "Where Delhi's traffic moves smarter, safer and faster",
    lede: "A person-centric, safety-first traffic-signal platform for Delhi — uniting AI perception, real-time optimization, and a secure emergency green-corridor service across the city's junctions.",
    ctaPrimary: "Enter Control Center",
    ctaSecondary: "See the problem & approach",
  },
  chips: [
    { label: "Live Operations", to: CHIP_ROUTES[0] },
    { label: "Emergency Corridor", to: CHIP_ROUTES[1] },
    { label: "Analytics", to: CHIP_ROUTES[2] },
    { label: "System Health", to: CHIP_ROUTES[3] },
  ],
  stats: [
    { num: "30s", lbl: "Optimization cycle" },
    { num: "4", lbl: "Approaches per junction" },
    { num: "100%", lbl: "Signal changes safety-checked" },
    { num: "24×7", lbl: "Autonomous operation" },
  ],
  ministriesCap: "Aligned with national programmes",
  problem: {
    eyebrow: "The Problem",
    title: "Delhi's roads lose time, money and lives to static signals",
    lede: "Conventional fixed-timer junctions can't react to real demand, and there is no trustworthy, city-wide priority path for emergency vehicles. The cost is measured in hours, rupees and minutes that ambulances cannot spare.",
    cards: [
      {
        icon: "🚗",
        figure: "₹60,000 cr",
        label:
          "Estimated annual economic loss to congestion across India's metros",
        note: "Fuel burn, lost productivity and freight delay (NCR among the worst-hit).",
      },
      {
        icon: "⏱️",
        figure: "~1.5 hrs",
        label: "Daily commute time lost per Delhi road user in peak hours",
        note: "Fixed-timer signals can't adapt to surging, uneven demand.",
      },
      {
        icon: "🚑",
        figure: "10+ min",
        label:
          "Avoidable delay an ambulance can face crossing congested corridors",
        note: "No verified, city-wide priority path for emergency vehicles today.",
      },
      {
        icon: "🛠️",
        figure: "Manual",
        label:
          "Most junctions still run pre-set or hand-controlled timing plans",
        note: "Little real-time sensing, no audit trail, no safety interlocks.",
      },
    ],
  },
  approach: {
    eyebrow: "Our Approach",
    title: "A five-layer pipeline",
    // lede: "Two systems share one database — a physical edge loop and a digital applications layer — so every signal change is sensed, optimized, safety-checked and audited in a single 30-second cycle.",
    steps: [
      {
        step: "01",
        title: "Perception",
        body: "Roadside cameras feed YOLOv8 / OpenCV vehicle detection at every approach.",
        tag: "Layer 2 · Perception-ML",
      },
      {
        step: "02",
        title: "Processing & Detection",
        body: "Per-approach demand, queue pressure and emergency-vehicle presence are extracted.",
        tag: "Detection",
      },
      {
        step: "03",
        title: "Decision & Optimization",
        body: "A max-pressure optimizer chooses the next phase; A*/D* logic frames green corridors.",
        tag: "Layer 3 · STM",
      },
      {
        step: "04",
        title: "Safety Supervisor",
        body: "A deterministic guard vets every change — no conflicting greens, enforced all-red & ped phases.",
        tag: "Guard",
      },
      {
        step: "05",
        title: "Control & Logging",
        body: "Validated plans drive the signals; every cycle streams to this dashboard and the audit log.",
        tag: "Layer 4–5",
      },
    ],
    cards: [
      {
        title: "Verify once, trust per-junction",
        body: "At dispatch the vehicle gets a signed, time-bound, route-scoped, revocable token (Ed25519).",
      },
      {
        title: "GPS-matched route gate",
        body: "Each junction checks the token signature and that the live GPS track matches its claimed route.",
      },
      {
        title: "Camera corroboration",
        body: "ANPR only confirms the vehicle has passed — it never opens the gate on its own.",
      },
      {
        title: "Two systems, one shared DB",
        body: "Edge control and digital apps stay decoupled through a strict Data Access Layer.",
      },
    ],
  },
  features: {
    eyebrow: "Capabilities",
    title: "What the platform delivers",
    cards: [
      {
        title: "AI Signal Optimization",
        body: "Computer-vision perception drives a max-pressure optimizer that retimes every junction in real time.",
      },
      {
        title: "Emergency Green Corridor",
        body: "Cryptographically signed, GPS-verified ambulance priority — a clear path when seconds matter.",
      },
      {
        title: "Safety-First Control",
        body: "A deterministic Safety Supervisor owns every signal change: no conflicting greens, enforced clearances.",
      },
      {
        title: "Live Transparency",
        body: "Operators see every decision and its reasoning, cycle by cycle, with a full audit trail.",
      },
    ],
  },
  footer: {
    about:
      "An AI-driven, safety-first traffic-signal platform for the National Capital Territory of Delhi, delivering adaptive signal control and a verified emergency green-corridor service across the city's junctions.",
    cols: [
      {
        title: "Control Center",
        links: [
          { label: "Live Operations", to: "/dashboard/live" },
          { label: "Emergency Corridor", to: "/dashboard/emergency" },
          { label: "Analytics", to: "/dashboard/analytics" },
          { label: "System Health", to: "/dashboard/health" },
        ],
      },
      {
        title: "Explore",
        links: [
          { label: "The Problem", to: "#problem" },
          { label: "Our Approach", to: "#approach" },
          { label: "Capabilities", to: "#features" },
          { label: "Enter Control Center", to: "/dashboard" },
        ],
      },
      {
        title: "Policies",
        links: [
          { label: "Terms of Use", to: "#" },
          { label: "Privacy Policy", to: "#" },
          { label: "Accessibility Statement", to: "#" },
          { label: "Copyright Policy", to: "#" },
          { label: "Right to Information (RTI)", to: "#" },
        ],
      },
      {
        title: "Related Links",
        links: [
          {
            label: "National Portal of India",
            to: "https://www.india.gov.in",
            ext: true,
          },
          {
            label: "Digital India",
            to: "https://www.digitalindia.gov.in",
            ext: true,
          },
          {
            label: "Delhi Government Portal",
            to: "https://delhi.gov.in",
            ext: true,
          },
          {
            label: "Delhi Transport Department",
            to: "https://transport.delhi.gov.in",
            ext: true,
          },
        ],
      },
    ],
    contact: {
      title: "Contact Us",
      dept: "Transport Department, Government of NCT of Delhi",
      address: "5/9, Under Hill Road, Civil Lines, Delhi – 110054",
      emailLabel: "Email",
      email: "stm-support@transport.delhi.gov.in",
      helplineLabel: "Traffic Helpline",
      helpline: "1095 · 011-2588 0000",
    },
    socialLabel: "Follow us",
    bottomLinks: [
      { label: "Help", to: "#" },
      { label: "Feedback", to: "#" },
      { label: "Sitemap", to: "#" },
      { label: "Terms of Use", to: "#" },
    ],
    copyright:
      "© 2026 Transport Department, Government of NCT of Delhi. All rights reserved.",
    credit:
      "Content owned by the Transport Department, GNCTD. Designed, developed & maintained by the Traffic Management Delhi 2.0 team.",
    lastUpdated: "Last reviewed & updated: 22 June 2026",
  },
};

const HI: LandingContent = {
  utility: {
    // skip: "मुख्य सामग्री पर जाएँ",
    accessibility: "सुगम्यता",
    sizeText: "अ",
    langLabel: "English",
  },
  hero: {
    eyebrow: "राष्ट्रीय राजधानी क्षेत्र दिल्ली सरकार · परिवहन विभाग",
    title: "स्मार्ट यातायात प्रबंधन प्रणाली",
    titleAlt: "Smart Traffic Management System",
    beta: "पायलट",
    tagline: "जहाँ दिल्ली का यातायात अधिक स्मार्ट, सुरक्षित और तेज़ चलता है",
    lede: "दिल्ली के लिए एक व्यक्ति-केंद्रित, सुरक्षा-प्रथम ट्रैफिक-सिग्नल मंच — एआई संवेदन, वास्तविक-समय अनुकूलन और एक सुरक्षित आपातकालीन ग्रीन-कॉरिडोर सेवा को शहर के जंक्शनों पर एकीकृत करता है।",
    ctaPrimary: "नियंत्रण केंद्र में प्रवेश करें",
    ctaSecondary: "समस्या और दृष्टिकोण देखें",
  },
  chips: [
    { label: "लाइव संचालन", to: CHIP_ROUTES[0] },
    { label: "आपातकालीन कॉरिडोर", to: CHIP_ROUTES[1] },
    { label: "विश्लेषण", to: CHIP_ROUTES[2] },
    { label: "प्रणाली स्वास्थ्य", to: CHIP_ROUTES[3] },
  ],
  stats: [
    { num: "30 से", lbl: "अनुकूलन चक्र" },
    { num: "4", lbl: "प्रति जंक्शन दिशाएँ" },
    { num: "100%", lbl: "सिग्नल परिवर्तन सुरक्षा-जाँचे" },
    { num: "24×7", lbl: "स्वायत्त संचालन" },
  ],
  ministriesCap: "संबद्ध राष्ट्रीय कार्यक्रम",
  problem: {
    eyebrow: "समस्या",
    title: "दिल्ली की सड़कें स्थिर सिग्नलों के कारण समय, धन और जीवन गँवाती हैं",
    lede: "पारंपरिक नियत-समय जंक्शन वास्तविक माँग पर प्रतिक्रिया नहीं दे सकते, और आपातकालीन वाहनों के लिए कोई भरोसेमंद, शहर-व्यापी प्राथमिकता मार्ग नहीं है। इसकी कीमत उन घंटों, रुपयों और मिनटों में चुकाई जाती है जो एम्बुलेंस के पास नहीं हैं।",
    cards: [
      {
        icon: "🚗",
        figure: "₹60,000 करोड़",
        label:
          "भारत के महानगरों में यातायात जाम से अनुमानित वार्षिक आर्थिक हानि",
        note: "ईंधन की खपत, घटी उत्पादकता और माल-ढुलाई में देरी (एनसीआर सर्वाधिक प्रभावित)।",
      },
      {
        icon: "⏱️",
        figure: "~1.5 घंटे",
        label: "व्यस्त समय में प्रति दिल्ली यात्री प्रतिदिन गँवाया गया समय",
        note: "नियत-समय सिग्नल बढ़ती, असमान माँग के अनुसार ढल नहीं पाते।",
      },
      {
        icon: "🚑",
        figure: "10+ मिनट",
        label:
          "जाम वाले मार्गों को पार करते समय एम्बुलेंस को होने वाली टाली जा सकने वाली देरी",
        note: "आज आपातकालीन वाहनों के लिए कोई सत्यापित, शहर-व्यापी प्राथमिकता मार्ग नहीं है।",
      },
      {
        icon: "🛠️",
        figure: "मैनुअल",
        label:
          "अधिकांश जंक्शन अब भी पूर्व-निर्धारित या हाथ से नियंत्रित समय-योजना पर चलते हैं",
        note: "बहुत कम वास्तविक-समय संवेदन, कोई ऑडिट-लॉग नहीं, कोई सुरक्षा इंटरलॉक नहीं।",
      },
    ],
  },
  approach: {
    eyebrow: "हमारा दृष्टिकोण",
    title:
      "पाँच-परत पाइपलाइन: संवेदन → प्रसंस्करण → निर्णय → सुरक्षा → क्रिया → अभिलेख",
    // lede: "दो प्रणालियाँ एक डेटाबेस साझा करती हैं — एक भौतिक एज लूप और एक डिजिटल अनुप्रयोग परत — ताकि हर सिग्नल परिवर्तन एक ही 30-सेकंड चक्र में संवेदित, अनुकूलित, सुरक्षा-जाँचा और अभिलेखित हो।",
    steps: [
      {
        step: "01",
        title: "संवेदन",
        body: "सड़क किनारे लगे कैमरे प्रत्येक दिशा पर YOLOv8 / OpenCV वाहन-पहचान को डेटा देते हैं।",
        tag: "परत 2 · Perception-ML",
      },
      {
        step: "02",
        title: "प्रसंस्करण और पहचान",
        body: "प्रत्येक दिशा की माँग, कतार-दबाव और आपातकालीन-वाहन उपस्थिति निकाली जाती है।",
        tag: "पहचान",
      },
      {
        step: "03",
        title: "निर्णय और अनुकूलन",
        body: "मैक्स-प्रेशर अनुकूलक अगला चरण चुनता है; A*/D* तर्क ग्रीन कॉरिडोर बनाता है।",
        tag: "परत 3 · STM",
      },
      {
        step: "04",
        title: "सुरक्षा पर्यवेक्षक",
        body: "एक नियतात्मक संरक्षक हर परिवर्तन जाँचता है — कोई परस्पर-विरोधी हरा नहीं, सख्त ऑल-रेड व पैदल-यात्री चरण।",
        tag: "संरक्षक",
      },
      {
        step: "05",
        title: "नियंत्रण और अभिलेखन",
        body: "सत्यापित योजनाएँ सिग्नल चलाती हैं; हर चक्र इस डैशबोर्ड और ऑडिट-लॉग में प्रवाहित होता है।",
        tag: "परत 4–5",
      },
    ],
    cards: [
      {
        title: "एक बार सत्यापन, प्रत्येक जंक्शन पर भरोसा",
        body: "प्रस्थान के समय वाहन को हस्ताक्षरित, समय-सीमित, मार्ग-विशिष्ट, निरस्त-योग्य टोकन (Ed25519) मिलता है।",
      },
      {
        title: "जीपीएस-मिलान मार्ग द्वार",
        body: "प्रत्येक जंक्शन टोकन हस्ताक्षर और यह जाँचता है कि लाइव जीपीएस-पथ उसके घोषित मार्ग से मेल खाता है।",
      },
      {
        title: "कैमरा पुष्टिकरण",
        body: "ANPR केवल यह पुष्टि करता है कि वाहन गुज़र चुका है — यह स्वयं द्वार नहीं खोलता।",
      },
      {
        title: "दो प्रणालियाँ, एक साझा डेटाबेस",
        body: "एज नियंत्रण और डिजिटल ऐप्स एक सख्त डेटा एक्सेस लेयर के माध्यम से अलग बने रहते हैं।",
      },
    ],
  },
  features: {
    eyebrow: "क्षमताएँ",
    title: "मंच क्या प्रदान करता है",
    cards: [
      {
        title: "एआई सिग्नल अनुकूलन",
        body: "कंप्यूटर-विज़न संवेदन एक मैक्स-प्रेशर अनुकूलक चलाता है जो हर जंक्शन को वास्तविक-समय में पुनः समयबद्ध करता है।",
      },
      {
        title: "आपातकालीन ग्रीन कॉरिडोर",
        body: "क्रिप्टोग्राफ़िक रूप से हस्ताक्षरित, जीपीएस-सत्यापित एम्बुलेंस प्राथमिकता — जब हर सेकंड मायने रखता है तब साफ़ रास्ता।",
      },
      {
        title: "सुरक्षा-प्रथम नियंत्रण",
        body: "एक नियतात्मक सुरक्षा पर्यवेक्षक हर सिग्नल परिवर्तन का स्वामी है: कोई परस्पर-विरोधी हरा नहीं, सख्त क्लीयरेंस।",
      },
      {
        title: "लाइव पारदर्शिता",
        body: "ऑपरेटर हर निर्णय और उसका कारण, चक्र-दर-चक्र, पूर्ण ऑडिट-ट्रेल के साथ देखते हैं।",
      },
    ],
  },
  footer: {
    about:
      "राष्ट्रीय राजधानी क्षेत्र दिल्ली के लिए एक एआई-संचालित, सुरक्षा-प्रथम ट्रैफिक-सिग्नल मंच, जो शहर के जंक्शनों पर अनुकूली सिग्नल नियंत्रण और एक सत्यापित आपातकालीन ग्रीन-कॉरिडोर सेवा प्रदान करता है।",
    cols: [
      {
        title: "नियंत्रण केंद्र",
        links: [
          { label: "लाइव संचालन", to: "/dashboard/live" },
          { label: "आपातकालीन कॉरिडोर", to: "/dashboard/emergency" },
          { label: "विश्लेषण", to: "/dashboard/analytics" },
          { label: "प्रणाली स्वास्थ्य", to: "/dashboard/health" },
        ],
      },
      {
        title: "खोजें",
        links: [
          { label: "समस्या", to: "#problem" },
          { label: "हमारा दृष्टिकोण", to: "#approach" },
          { label: "क्षमताएँ", to: "#features" },
          { label: "नियंत्रण केंद्र में प्रवेश", to: "/dashboard" },
        ],
      },
      {
        title: "नीतियाँ",
        links: [
          { label: "उपयोग की शर्तें", to: "#" },
          { label: "गोपनीयता नीति", to: "#" },
          { label: "सुगम्यता विवरण", to: "#" },
          { label: "कॉपीराइट नीति", to: "#" },
          { label: "सूचना का अधिकार (आरटीआई)", to: "#" },
        ],
      },
      {
        title: "संबंधित लिंक",
        links: [
          {
            label: "भारत का राष्ट्रीय पोर्टल",
            to: "https://www.india.gov.in",
            ext: true,
          },
          {
            label: "डिजिटल इंडिया",
            to: "https://www.digitalindia.gov.in",
            ext: true,
          },
          {
            label: "दिल्ली सरकार पोर्टल",
            to: "https://delhi.gov.in",
            ext: true,
          },
          {
            label: "दिल्ली परिवहन विभाग",
            to: "https://transport.delhi.gov.in",
            ext: true,
          },
        ],
      },
    ],
    contact: {
      title: "संपर्क करें",
      dept: "परिवहन विभाग, राष्ट्रीय राजधानी क्षेत्र दिल्ली सरकार",
      address: "5/9, अंडर हिल रोड, सिविल लाइंस, दिल्ली – 110054",
      emailLabel: "ईमेल",
      email: "stm-support@transport.delhi.gov.in",
      helplineLabel: "यातायात हेल्पलाइन",
      helpline: "1095 · 011-2588 0000",
    },
    socialLabel: "हमें फ़ॉलो करें",
    bottomLinks: [
      { label: "सहायता", to: "#" },
      { label: "प्रतिक्रिया", to: "#" },
      { label: "साइटमैप", to: "#" },
      { label: "उपयोग की शर्तें", to: "#" },
    ],
    copyright:
      "© 2026 परिवहन विभाग, राष्ट्रीय राजधानी क्षेत्र दिल्ली सरकार। सर्वाधिकार सुरक्षित।",
    credit:
      "सामग्री का स्वामित्व परिवहन विभाग, दिल्ली सरकार के पास है। Traffic Management Delhi 2.0 टीम द्वारा अभिकल्पित, विकसित एवं अनुरक्षित।",
    lastUpdated: "अंतिम समीक्षा एवं अद्यतन: 22 जून 2026",
  },
};

export const LANDING_CONTENT: Record<Lang, LandingContent> = { en: EN, hi: HI };
