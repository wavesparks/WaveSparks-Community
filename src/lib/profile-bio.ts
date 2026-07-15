export function canonicalLegacyBio(shortBio: string, longBio: string) {
  const short = shortBio.trim();
  const long = longBio.trim();

  if (!long) return short;
  if (!short) return long;

  const normalizedShort = short.toLowerCase();
  const normalizedLong = long.toLowerCase();
  if (normalizedLong.includes(normalizedShort)) return long;
  if (normalizedShort.includes(normalizedLong)) return short;

  return `${short}\n\n${long}`;
}

export function distinctLegacyProfileText(canonical: string, legacy: string) {
  const normalizedCanonical = canonical.trim().toLowerCase();
  const normalizedLegacy = legacy.trim().toLowerCase();

  if (
    !normalizedLegacy ||
    normalizedCanonical === normalizedLegacy ||
    normalizedCanonical.includes(normalizedLegacy)
  ) {
    return "";
  }

  return legacy.trim();
}
