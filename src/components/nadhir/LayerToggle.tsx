import { Layers } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { MapLayers } from "@/components/FireMap";

type Props = {
  layers: MapLayers;
  onChange: (next: MapLayers) => void;
};

export function LayerToggle({ layers, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const rows: { key: keyof MapLayers; label: string }[] = [
    { key: "fires", label: t("map.layerFires") },
    { key: "unverified", label: t("map.layerUnverified") },
    { key: "industrialSources", label: t("map.layerIndustrialSources") },
  ];

  return (
    <div className="absolute end-3 top-3 z-10 flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="card-raised flex items-center gap-2 px-3 py-2 text-sm font-medium"
      >
        <Layers aria-hidden className="size-4" />
        {t("map.layers")}
      </button>
      {open ? (
        <div className="card-raised flex w-56 flex-col gap-1 p-2">
          {rows.map((row) => (
            <label
              key={row.key}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={layers[row.key]}
                onChange={(e) =>
                  onChange({ ...layers, [row.key]: e.target.checked })
                }
                className="size-4 accent-[var(--accent)]"
              />
              {row.label}
            </label>
          ))}
          <p className="px-2 pt-1 text-[11px] text-muted-foreground">
            {t("map.unverifiedHint")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
