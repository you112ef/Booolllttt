export function parseAllowedResourceProfiles(value?: string | string[]): string[] {
  if (!value) {
    return ['small', 'medium', 'large'];
  }

  const profiles = Array.isArray(value) ? value : value.split(',');

  const normalized = profiles
    .map((profile) => profile.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

