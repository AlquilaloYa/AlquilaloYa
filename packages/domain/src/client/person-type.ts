export const PersonType = {
  NATURAL: "NATURAL",
  LEGAL: "LEGAL",
} as const;

export type PersonType = (typeof PersonType)[keyof typeof PersonType];