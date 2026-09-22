import { describe, expect, it } from "vitest";
import { parseDestination, parseRoadRef } from "@/lib/road-ref";

describe("parseRoadRef on real ITA summaries (22 Sept 2026)", () => {
  it.each([
    [
      "Un accident de la circulation a eu lieu sur la route nationale numéro 12, à Naciria, en direction d'Alger.",
      "RN 12",
    ],
    [
      "Accident signalé sur la RN11 entre Fouka Marine et Douaouda Marine (Tipaza).",
      "RN 11",
    ],
    [
      "Congestion sur la Route Nationale 61 de Rouiba vers Dar El Beida, au niveau de Cosider Alger.",
      "RN 61",
    ],
    [
      "Des travaux de réparation de la route sont en cours sur l'autoroute A2 au point kilométrique PK 103 à Bouira, en direction d'Alger.",
      "A2",
    ],
    [
      "Un accident de la circulation a eu lieu sur l'autoroute Est-Ouest, avant la station-service de Babor, en direction de Constantine.",
      "A2",
    ],
    [
      "La circulation est complètement à l'arrêt sur l'autoroute Nord-Sud, à Chiffa, en direction de l'autoroute Est-Ouest.",
      "A1",
    ],
    [
      "La route départementale reliant la Route Nationale 04, passant par Ouled Ben Abdelkader",
      "RN 4",
    ],
  ])("%s → %s", (text, ref) => {
    expect(parseRoadRef(text)).toBe(ref);
  });

  it.each([
    "Congestion routière à l'entrée de la wilaya de Sétif.",
    "Un accident de la circulation mortel a eu lieu sur la rocade sud, à Oued Smar.",
    "Un accident de la circulation s'est produit sur l'autoroute 100 après le tunnel de Khraïssia.",
  ])("finds no road it can place in %s", (text) => {
    expect(parseRoadRef(text)).toBeNull();
  });
});

describe("parseDestination", () => {
  it.each([
    ["…à Naciria, en direction d'Alger.", "Alger"],
    [
      "…avant la station-service de Babor, en direction de Constantine.",
      "Constantine",
    ],
    [
      "…au niveau de Houch El Makhfi, commune d'Ouled Hedadj, en direction de Reghaïa.",
      "Reghaïa",
    ],
    [
      "…de Rouiba vers Dar El Beida, au niveau de Cosider Alger.",
      "Dar El Beida",
    ],
    ["…à Chiffa, en direction de l'autoroute Est-Ouest.", null],
    ["Congestion routière à l'entrée de la wilaya de Sétif.", null],
  ])("%s → %s", (text, place) => {
    expect(parseDestination(text)).toBe(place);
  });
});
