const DOMAIN_LABEL = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?`;
const DOMAIN_TLD = String.raw`(?:xn--[\p{L}\p{N}-]{2,59}|[\p{L}]{2,63})`;
const DOMAIN = String.raw`(?:${DOMAIN_LABEL}\.)+${DOMAIN_TLD}(?:[/:?#][^\s]*)?`;
const EMAIL = String.raw`[\p{L}\p{N}._%+-]+@(?:${DOMAIN_LABEL}\.)+${DOMAIN_TLD}`;
const PHONE = String.raw`(?:\+?\d[\s().-]*){6,}\d`;
const HANDLE = String.raw`@[\p{L}\p{N}_]{2,}`;
const EXPLICIT_URL = String.raw`(?:https?:\/\/|www\.)\S+`;
const SOCIAL_SERVICE = String.raw`(?:linkedin|github|wechat|whatsapp|telegram|instagram|facebook|twitter)`;
const SOCIAL_ACCOUNT = String.raw`\b${SOCIAL_SERVICE}\s*(?:(?:profile|handle|username|user|account|id)\s*)?[:：]\s*\S+`;
const SOCIAL_LABEL = String.raw`\b${SOCIAL_SERVICE}\s+(?:profile|handle|username|user|account|id)\b`;
const BOUNDED_DOMAIN = String.raw`(?:^|[^\p{L}\p{N}_@-])(${DOMAIN})(?=$|[^\p{L}\p{N}_-])`;
const BOUNDED_PHONE = String.raw`(?:^|[^\p{L}\p{N}])(${PHONE})(?=$|[^\p{L}\p{N}])`;
const BOUNDED_HANDLE = String.raw`(?:^|\s)(${HANDLE})(?=$|[^\p{L}\p{N}_])`;

function globalPattern(source: string) {
  return new RegExp(source, "giu");
}

function detectionPattern(source: string) {
  return new RegExp(source, "iu");
}

export function containsPrelaunchQaContactIdentifier(value: string) {
  return (
    detectionPattern(EXPLICIT_URL).test(value) ||
    detectionPattern(EMAIL).test(value) ||
    detectionPattern(BOUNDED_DOMAIN).test(value) ||
    detectionPattern(BOUNDED_PHONE).test(value) ||
    detectionPattern(BOUNDED_HANDLE).test(value) ||
    detectionPattern(SOCIAL_ACCOUNT).test(value) ||
    detectionPattern(SOCIAL_LABEL).test(value)
  );
}

export function stripPrelaunchQaContactIdentifiers(value: unknown, maxLength = 2_000) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]+\)/giu, "$1")
    .replace(globalPattern(EMAIL), " ")
    .replace(globalPattern(EXPLICIT_URL), " ")
    .replace(globalPattern(BOUNDED_DOMAIN), (match, domain: string) =>
      match.slice(0, Math.max(0, match.length - domain.length)),
    )
    .replace(globalPattern(BOUNDED_PHONE), (match, phone: string) =>
      match.slice(0, Math.max(0, match.length - phone.length)),
    )
    .replace(globalPattern(BOUNDED_HANDLE), (match, handle: string) =>
      match.slice(0, Math.max(0, match.length - handle.length)),
    )
    .replace(globalPattern(SOCIAL_ACCOUNT), " ")
    .replace(globalPattern(SOCIAL_LABEL), " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}
