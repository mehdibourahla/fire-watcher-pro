import { headTranslator } from "@/i18n";

export function pageMeta(
  titleKey: string,
  descriptionKey: string,
  params?: Record<string, string>,
) {
  const t = headTranslator();
  const title = t(titleKey, params ?? {});
  const description = t(descriptionKey);
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

export function titledMeta(pageTitleKey: string, descriptionKey?: string) {
  const t = headTranslator();
  const title = t("meta.titleTemplate", { page: t(pageTitleKey) });
  const meta: Record<string, string>[] = [
    { title },
    { property: "og:title", content: title },
  ];
  if (!descriptionKey) return meta;
  const description = t(descriptionKey);
  return [
    ...meta,
    { name: "description", content: description },
    { property: "og:description", content: description },
  ];
}
