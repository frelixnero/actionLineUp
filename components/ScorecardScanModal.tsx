"use client";

import { useState } from "react";
import { AlertTriangle, Camera, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type ScannedRow = {
  gameNumber: number;
  home: string;
  visitor: string;
  winner: "home" | "visitor" | "unplayed" | "unknown";
  needsReview: boolean;
};

export type ScanApplyPayload = {
  games: ScannedRow[];
  raceTarget: number | null;
  scanPath: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
};

type Props = {
  homeTeam: string;
  awayTeam: string;
  homeNames: string[];
  awayNames: string[];
  lineupId: string | null;
  raceTarget: number | null;
  onApply: (payload: ScanApplyPayload) => void;
};

type Warning = { code: string; message: string; gameNumber?: number };

/**
 * Score-sheet scan + human-in-the-loop verification. The modal owns the
 * upload/scan/review cycle; the parent owns the board and maps reviewed
 * rows onto matchup ids on approve. Nothing is committed by scanning —
 * approval calls onApply, which the parent routes to publishLineup().
 */
export default function ScorecardScanModal({
  homeTeam, awayTeam, homeNames, awayNames, lineupId, raceTarget, onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"pick" | "review">("pick");
  const [rows, setRows] = useState<ScannedRow[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scanPath, setScanPath] = useState<string | null>(null);
  const [detectedRace, setDetectedRace] = useState<number | null>(null);
  const [detectedHome, setDetectedHome] = useState<string | null>(null);
  const [detectedAway, setDetectedAway] = useState<string | null>(null);
  const [rawNotes, setRawNotes] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [contrast, setContrast] = useState(false);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setStage("pick");
    setRows([]);
    setWarnings([]);
    setManualMode(false);
    setRawNotes(null);
    setModelUsed(null);
    setDetectedHome(null);
    setDetectedAway(null);
    setZoom(1);
    setRotation(0);
    setContrast(false);
  };

  const scan = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("homeTeam", homeTeam);
      form.append("awayTeam", awayTeam);
      if (lineupId) form.append("lineupId", lineupId);
      if (raceTarget) form.append("raceTarget", String(raceTarget));
      const res = await fetch("/api/scorecard/scan", { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d?.error ?? "Scan failed. Try a clearer photo.");
        return;
      }
      setScanPath(d.scanPath ?? null);
      setImageUrl(d.imageUrl ?? previewUrl);
      setWarnings(d.warnings ?? []);
      if (!d.visionAvailable || !d.parsed) {
        // Image stored; fall back to one blank row per expected game.
        setManualMode(true);
        setRows([]);
        setStage("review");
        toast.info("Photo saved. Automatic reading is off — enter games manually.");
        return;
      }
      const games = (d.parsed.games ?? []) as {
        gameNumber: number; homePlayerRaw: string; visitorPlayerRaw: string;
        winner: "home" | "visitor" | "unplayed" | "unknown";
      }[];
      const byGame = new Map<number, { home: unknown; visitor: unknown }>();
      for (const m of (d.matches ?? []) as { gameNumber: number; home: unknown; visitor: unknown }[]) {
        byGame.set(m.gameNumber, { home: m.home, visitor: m.visitor });
      }
      const resolved = (raw: string, m: unknown) => {
        const match = m as { matchedName: string | null; confidence: string } | null;
        if (match?.matchedName && (match.confidence === "high" || match.confidence === "medium")) {
          return { name: match.matchedName, review: false };
        }
        return { name: raw, review: true };
      };
      setRows(
        games.map((g) => {
          const m = byGame.get(g.gameNumber);
          const h = resolved(g.homePlayerRaw, m?.home);
          const v = resolved(g.visitorPlayerRaw, m?.visitor);
          const review = g.winner === "unknown" || h.review || v.review;
          const winner = g.winner === "home" || g.winner === "visitor" || g.winner === "unplayed" ? g.winner : "unknown";
          return { gameNumber: g.gameNumber, home: h.name, visitor: v.name, winner, needsReview: review };
        }),
      );
      setDetectedRace(typeof d.parsed.raceTarget === "number" ? d.parsed.raceTarget : null);
      setDetectedHome(typeof d.parsed.homeTeam === "string" && d.parsed.homeTeam.trim() ? d.parsed.homeTeam.trim() : null);
      setDetectedAway(typeof d.parsed.awayTeam === "string" && d.parsed.awayTeam.trim() ? d.parsed.awayTeam.trim() : null);
      setRawNotes(typeof d.parsed.rawNotes === "string" && d.parsed.rawNotes ? d.parsed.rawNotes : null);
      setModelUsed(typeof d.modelUsed === "string" ? d.modelUsed : null);
      setStage("review");
      const flagged = (d.warnings ?? []).length;
      toast.success(flagged > 0 ? `Scan complete with ${flagged} flag${flagged === 1 ? "" : "s"} to review.` : "Scan complete. Review and approve.");
    } catch {
      toast.error("Scan failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const setRow = (gameNumber: number, patch: Partial<ScannedRow>) =>
    setRows((list) => list.map((r) => (r.gameNumber === gameNumber ? { ...r, ...patch, needsReview: false } : r)));

  const addRow = () => {
    const next = rows.length > 0 ? Math.max(...rows.map((r) => r.gameNumber)) + 1 : 1;
    setRows((list) => [...list, { gameNumber: next, home: "", visitor: "", winner: "unknown", needsReview: true }]);
  };

  const approve = () => {
    const unresolved = rows.filter((r) => r.winner === "unknown");
    if (rows.length > 0 && unresolved.length > 0) {
      toast.error(`${unresolved.length} game${unresolved.length === 1 ? "" : "s"} still need a winner (or mark Skipped).`);
      return;
    }
    onApply({ games: rows, raceTarget: detectedRace, scanPath, homeTeam: detectedHome, awayTeam: detectedAway });
    setOpen(false);
    toast.success("Scan applied to the scorecard. Publish to share it.");
  };

  const shownImage = imageUrl ?? previewUrl;
  const reviewCount = rows.filter((r) => r.needsReview).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="scan-button"><Camera size={14} /> Scan score sheet</button>
      </DialogTrigger>
      <DialogContent className="scan-dialog" style={{ maxWidth: 980, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>Scan a paper score sheet</DialogTitle>
          <DialogDescription>
            Take a clear picture, review what the scanner read, then approve to fill the scorecard.
          </DialogDescription>
        </DialogHeader>

        {stage === "pick" && (
          <div>
            <label className="camera-drop">
              <Camera size={34} />
              <strong>{file?.name || "Open camera or choose photo"}</strong>
              <span>JPG, PNG or WebP · under 10 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </label>
            {file && (
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className="primary" disabled={busy} onClick={scan} style={{ flex: 1 }}>
                  {busy ? <><Loader2 size={14} className="animate-spin" /> Reading sheet…</> : "Scan sheet"}
                </button>
              </div>
            )}
          </div>
        )}

        {stage === "review" && (
          <div>
            {warnings.length > 0 && (
              <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                {warnings.slice(0, 6).map((w, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#f2c94c" }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
              <div>
                {shownImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shownImage}
                      alt="Scanned score sheet"
                      style={{
                        width: "100%", borderRadius: 10, border: "1px solid #38413d",
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        filter: contrast ? "contrast(180%) brightness(105%)" : "none",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <button className="quiet-button" onClick={() => setZoom((z) => Math.min(z + 0.25, 3))} style={{ fontSize: 11, padding: "4px 8px" }}>Zoom +</button>
                      <button className="quiet-button" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))} style={{ fontSize: 11, padding: "4px 8px" }}>Zoom −</button>
                      <button className="quiet-button" onClick={() => setRotation((r) => (r + 90) % 360)} style={{ fontSize: 11, padding: "4px 8px" }}>Rotate</button>
                      <button className="quiet-button" onClick={() => setContrast((c) => !c)} style={{ fontSize: 11, padding: "4px 8px" }}>{contrast ? "Normal" : "Contrast"}</button>
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 12 }}>No image preview.</p>
                )}
                {detectedRace ? <p style={{ fontSize: 12 }}>Detected race to {detectedRace}.</p> : null}
                {detectedHome || detectedAway ? (
                  <p style={{ fontSize: 12 }}>Detected teams: <strong>{detectedHome ?? "?"}</strong> vs <strong>{detectedAway ?? "?"}</strong> — applied on approve.</p>
                ) : null}
                {modelUsed ? <p style={{ fontSize: 11, opacity: 0.7 }}>Read by {modelUsed}.</p> : null}
                {rawNotes ? (
                  <div style={{ fontSize: 12, marginTop: 8, padding: 8, borderRadius: 8, background: "#0b0f0d", border: "1px solid #38413d" }}>
                    <strong>Sheet notes:</strong> {rawNotes}
                  </div>
                ) : null}
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>
                    {rows.length} game{rows.length === 1 ? "" : "s"}{reviewCount > 0 ? ` · ${reviewCount} to review` : ""}
                  </strong>
                  <button className="quiet-button" onClick={addRow}>Add row</button>
                </div>
                {manualMode && rows.length === 0 && (
                  <p style={{ fontSize: 12 }}>No readable games — add rows manually from the photo.</p>
                )}
                <div style={{ display: "grid", gap: 8 }}>
                  {rows.map((r) => (
                    <div
                      key={r.gameNumber}
                      style={{
                        display: "grid", gridTemplateColumns: "28px 1fr 1fr", gap: 6, padding: 8, borderRadius: 8,
                        background: r.needsReview ? "#2a230d" : "#0b0f0d",
                        border: `1px solid ${r.needsReview ? "#8a6d1b" : "#38413d"}`,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800, paddingTop: 8 }}>{r.gameNumber}</span>
                      <div style={{ display: "grid", gap: 6 }}>
                        <input
                          aria-label={`Game ${r.gameNumber} home player`}
                          value={r.home}
                          list="scan-home-roster"
                          onChange={(e) => setRow(r.gameNumber, { home: e.target.value })}
                          placeholder={homeTeam || "Home"}
                          style={{ background: "#121714", border: "1px solid #38413d", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "inherit" }}
                        />
                        <input
                          aria-label={`Game ${r.gameNumber} visitor player`}
                          value={r.visitor}
                          list="scan-away-roster"
                          onChange={(e) => setRow(r.gameNumber, { visitor: e.target.value })}
                          placeholder={awayTeam || "Visitor"}
                          style={{ background: "#121714", border: "1px solid #38413d", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "inherit" }}
                        />
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <button
                          className={r.winner === "home" ? "confirmed" : "quiet-button"}
                          onClick={() => setRow(r.gameNumber, { winner: "home" })}
                          style={{ fontSize: 11, padding: "6px 4px" }}
                        >{r.winner === "home" && <Check size={12} />} Home</button>
                        <button
                          className={r.winner === "visitor" ? "confirmed" : "quiet-button"}
                          onClick={() => setRow(r.gameNumber, { winner: "visitor" })}
                          style={{ fontSize: 11, padding: "6px 4px" }}
                        >{r.winner === "visitor" && <Check size={12} />} Visitor</button>
                        <button
                          className={r.winner === "unplayed" ? "confirmed" : "quiet-button"}
                          onClick={() => setRow(r.gameNumber, { winner: "unplayed" })}
                          style={{ fontSize: 11, padding: "6px 4px" }}
                          title="Game was never played (match ended early)"
                        >{r.winner === "unplayed" && <Check size={12} />} Skip</button>
                      </div>
                    </div>
                  ))}
                </div>
                <datalist id="scan-home-roster">{homeNames.map((n) => <option key={n} value={n} />)}</datalist>
                <datalist id="scan-away-roster">{awayNames.map((n) => <option key={n} value={n} />)}</datalist>
              </div>
            </div>
            <div className="dialog-actions" style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="primary" onClick={approve} style={{ flex: 1 }}>
                <Check size={14} /> Approve & fill scorecard
              </button>
              <button className="quiet-button" onClick={() => setStage("pick")}>Retake</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
