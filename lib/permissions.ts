/**
 * RBAC helpers shared by the client (gating controls) and the server
 * (enforcing writes). The server is always the enforcer; these pure
 * functions just make both sides agree on the same rule:
 *
 * - Owners can change anything.
 * - Captains can change their OWN side only (roster, payments).
 * - Scores (game winners) may be recorded by a captain of EITHER side,
 *   because live scoring happens from whichever phone is handy.
 * - Plain signed-in players and visitors can view and report, never mutate.
 */

export type Role = "owner" | "player";

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export function isOwner(role: Role | string | null | undefined): boolean {
  return role === "owner";
}

/** True when the user may publish/change the given side's roster & payments. */
export function canEditSide(
  role: Role | string | null | undefined,
  captainTeams: string[],
  sideTeamName: string,
): boolean {
  if (isOwner(role)) return true;
  if (!sideTeamName.trim()) return false;
  const mine = new Set((captainTeams ?? []).map(norm));
  return mine.has(norm(sideTeamName));
}

/** True when the user may touch the lineup at all (either side). */
export function canEditLineupSide(
  role: Role | string | null | undefined,
  captainTeams: string[],
  homeTeam: string,
  awayTeam: string,
): boolean {
  return canEditSide(role, captainTeams, homeTeam) || canEditSide(role, captainTeams, awayTeam);
}

export type RosterSpot = {
  name: string;
  role?: string;
  payment?: string;
  active?: boolean;
};

/** Canonical comparison for "did the other side's roster change?" checks. */
export function normalizeRoster(list: RosterSpot[]): { name: string; role: string; payment: string; active: boolean }[] {
  return (list ?? []).map((p) => ({
    name: String(p?.name ?? "").trim(),
    role: String(p?.role ?? "Player").trim() || "Player",
    payment: String(p?.payment ?? "due").trim() || "due",
    active: p?.active !== false,
  }));
}

export function rostersEqual(a: RosterSpot[], b: RosterSpot[]): boolean {
  const x = normalizeRoster(a);
  const y = normalizeRoster(b);
  if (x.length !== y.length) return false;
  return x.every(
    (p, i) =>
      p.name === y[i].name &&
      p.role === y[i].role &&
      p.payment === y[i].payment &&
      p.active === y[i].active,
  );
}
