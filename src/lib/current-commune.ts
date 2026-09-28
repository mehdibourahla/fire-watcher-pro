import { registerPlugin } from "@capacitor/core";

export type CurrentCommuneStatus = {
  enabled: boolean;
  commune: string | null;
  updatedAt: number | null;
  background: boolean;
};

type CurrentCommunePlugin = {
  start(options: {
    lang: string;
    pinned: string[];
  }): Promise<CurrentCommuneStatus>;
  stop(): Promise<CurrentCommuneStatus>;
  setPinned(options: {
    pinned: string[];
    lang: string;
  }): Promise<CurrentCommuneStatus>;
  status(): Promise<CurrentCommuneStatus>;
  requestBackground(): Promise<CurrentCommuneStatus>;
};

export const CurrentCommune =
  registerPlugin<CurrentCommunePlugin>("CurrentCommune");
