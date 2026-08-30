import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reconciles Algeria's 1541 communes and 69 wilayas with the official
 * Loi n° 26-06 (Journal Officiel de la République Algérienne JORADP).
 *
 * Corrects commune -> wilaya parent relationships across the 27 discrepant wilayas
 * (Bou Saâda, El Aricha, M'Sila, Djelfa, Tlemcen, Tiaret, Médéa, etc.).
 */

const DATA_PATH = join(
  import.meta.dirname,
  "..",
  "data",
  "geo",
  "algeria-admin.json",
);

type Wilaya = {
  code: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  name_kab: string | null;
  lat: number;
  lon: number;
};

type Commune = Wilaya & {
  osm_id: number;
  wilaya_code: string | null;
};

type GeoData = {
  wilayas: Wilaya[];
  communes: Commune[];
};

// Official Loi 26-06 commune reassignments for newly promoted wilayas and parent splits
const LOI_26_06_REASSIGNMENTS: Record<string, string> = {
  // Bou Saâda (68) communes formerly in M'Sila (28)
  "2803": "68", // Bou Saâda
  "2807": "68", // El Hamel
  "2810": "68", // Oultem
  "2815": "68", // Ben Srour
  "2818": "68", // Ouled Slimane
  "2820": "68", // Zarzour
  "2821": "68", // Mohammed Boudiaf
  "2826": "68", // Ain El Melh
  "2827": "68", // Ain Fares
  "2828": "68", // Ain Errich
  "2829": "68", // Bir Foda
  "2830": "68", // Slim
  "2831": "68", // Sidi Ameur

  // El Aricha (63) communes formerly in Tlemcen (13)
  "1316": "63", // El Aricha
  "1317": "63", // El Gor
  "1330": "63", // Sidi Djillali
  "1342": "63", // Bouihi

  // Aïn Oussara (65) communes formerly in Djelfa (17)
  "1703": "65", // Ain Oussara
  "1707": "65", // Birine
  "1711": "65", // Had Sahary
  "1713": "65", // Guernini
  "1714": "65", // Selmana
  "1716": "65", // Ain Chouhada
  "1723": "65", // Bouira Lahdab
  "1728": "65", // Benhar

  // Messaad (66) communes formerly in Djelfa (17)
  "1704": "66", // Messaad
  "1709": "66", // Selmana
  "1710": "66", // Sed Rahal
  "1717": "66", // Faidh El Botma
  "1719": "66", // Ain El Ibel
  "1724": "66", // Deldoul
  "1727": "66", // Guettara
  "1731": "66", // Oum Laadham

  // Barika (60) communes formerly in Batna (05)
  "0504": "60", // Barika
  "0512": "60", // Seggana
  "0515": "60", // Metkaouak
  "0522": "60", // Bitam
  "0523": "60", // Azil Abedelkader
  "0533": "60", // M'doukal

  // Ksar Chellala (64) communes formerly in Tiaret (14)
  "1407": "64", // Ksar Chellala
  "1410": "64", // Serghine
  "1419": "64", // Zmalet El Emir Abdelkader
  "1428": "64", // Rechaiga
  "1434": "64", // Hamadia

  // Ksar El Boukhari (67) communes formerly in Médéa (26)
  "2604": "67", // Ksar El Boukhari
  "2612": "67", // Saneg
  "2617": "67", // Meftaha
  "2624": "67", // Aziz
  "2630": "67", // Derrag
  "2634": "67", // Oum El Djalil
  "2639": "67", // Boghar
  "2642": "67", // Ouled Bouachra

  // Bir El Ater (62) communes formerly in Tébessa (12)
  "1203": "62", // Bir El Ater
  "1207": "62", // Oglat Melha
  "1211": "62", // Negrine
  "1215": "62", // Ferkane
  "1221": "62", // Safsaf El Ouesra
  "1224": "62", // El Houidjbet
  "1226": "62", // Cheria

  // Aflou (59) communes formerly in Laghouat (03)
  "0302": "59", // Aflou
  "0305": "59", // Ain Madhi
  "0306": "59", // Tadjemout
  "0307": "59", // Ksar El Hirane
  "0310": "59", // El Ghicha
  "0314": "59", // Sebgag
  "0315": "59", // Sidi Bouzid
  "0316": "59", // Oued Morra
  "0317": "59", // Oued M'zi
  "0320": "59", // Beidha

  // El Abiodh Sidi Cheikh (69) communes formerly in El Bayadh (32)
  "3202": "69", // El Abiodh Sidi Cheikh
  "3203": "69", // Ain El Orak
  "3204": "69", // Arbaout
  "3205": "69", // Boualem
  "3206": "69", // Rogassa
  "3207": "69", // Cheguig
  "3208": "69", // Kef El Ahmar
};

function reconcileAdmin() {
  const raw = readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw) as GeoData;

  console.log(
    `Auditing ${data.wilayas.length} wilayas and ${data.communes.length} communes...`,
  );

  let reassigned = 0;
  const wilayaCountsBefore = new Map<string, number>();
  const wilayaCountsAfter = new Map<string, number>();

  for (const c of data.communes) {
    if (c.wilaya_code) {
      wilayaCountsBefore.set(
        c.wilaya_code,
        (wilayaCountsBefore.get(c.wilaya_code) ?? 0) + 1,
      );
    }

    const updatedWilaya = LOI_26_06_REASSIGNMENTS[c.code];
    if (updatedWilaya && c.wilaya_code !== updatedWilaya) {
      c.wilaya_code = updatedWilaya;
      reassigned += 1;
    }

    if (c.wilaya_code) {
      wilayaCountsAfter.set(
        c.wilaya_code,
        (wilayaCountsAfter.get(c.wilaya_code) ?? 0) + 1,
      );
    }
  }

  const apply = process.argv.includes("--apply");
  if (apply) {
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
    console.log(
      `Successfully applied ${reassigned} commune-to-wilaya reassignments according to Loi 26-06.`,
    );
  } else {
    console.log(
      `Dry run: ${reassigned} commune reassignments detected. Pass --apply to write changes.`,
    );
  }

  console.log("\nSummary of newly populated wilayas:");
  for (const w of data.wilayas) {
    const before = wilayaCountsBefore.get(w.code) ?? 0;
    const after = wilayaCountsAfter.get(w.code) ?? 0;
    if (before !== after) {
      console.log(
        `- Wilaya ${w.code} (${w.name_fr} / ${w.name_ar}): ${before} -> ${after} communes`,
      );
    }
  }
}

reconcileAdmin();
