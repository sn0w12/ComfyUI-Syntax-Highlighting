function defaultFavoriteInfo(value) {
  if (typeof value !== "string") {
    const key = String(value ?? "");
    return { key, label: key };
  }

  if (value.includes("\\")) {
    const parts = value.split("\\");
    const key = parts[parts.length - 1];
    return { key, label: key };
  }

  return { key: value, label: value };
}

export function resolveComboFavorite(widget) {
  const resolver = widget.options?.getFavoriteInfo ?? widget.getFavoriteInfo;
  if (typeof resolver === "function") {
    const result = resolver(widget.value, widget);
    if (typeof result === "string") {
      return { key: result, label: result };
    }
    if (result && typeof result.key === "string") {
      return {
        key: result.key,
        label: typeof result.label === "string" ? result.label : result.key,
      };
    }
  }

  return defaultFavoriteInfo(widget.value);
}

if (typeof window !== "undefined") {
  window.ComfySyntaxHighlighting = Object.assign(
    window.ComfySyntaxHighlighting ?? {},
    { resolveComboFavorite },
  );
}
