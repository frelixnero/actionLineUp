"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Bell, BookOpen, CalendarDays, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Cloud, CloudOff, RefreshCw, CircleDollarSign, Clock, Crown, FileText, HandHeart, LayoutDashboard, LogIn, MapPin, Medal, MessageCircle, Play, Plus, QrCode, RotateCcw, Search, Send, Share2, ShieldCheck, ShoppingBag, Sparkles, ThumbsDown, ThumbsUp, Trophy, TrendingUp, Users, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import TournamentDesk from "./tournament";

type Payment = "paid" | "due" | "pending";
type Player = { name: string; position: string; payment: Payment; active?: boolean };
type Winner = "home" | "away" | null;
type ScoreSubmission = { submittedAt?: string; homeConfirmed: boolean; awayConfirmed: boolean };
type LeagueIssue = { id: string; type: string; details: string; createdAt: string; resolved?: boolean };
const initialHome: Player[] = [];
const initialAway: Player[] = [];
const buildRotation = (size: number): number[][] =>
  size === 0 ? [] : Array.from({ length: Math.min(4, size) }, (_, r) => Array.from({ length: size }, (_, h) => (h + r) % size));
const labels = { paid: "Paid", due: "Payment due", pending: "Pending" };

type LeagueTeam = { name:string; w:number; l:number; division:"American"|"National" };
type StatPlayer = { name:string; team:string; w:number; l:number; eight?:number; tr?:number; dropped?:boolean };
const leagueTeams: LeagueTeam[] = [];
const statPlayers: StatPlayer[] = [];
const weekResults: (readonly [string, number, string, number])[] = [];

const playerAliases:Record<string,string>={};
const pctForPlayer=(name:string)=>{const key=name.trim().toLowerCase();const canonical=playerAliases[key]||name;const player=statPlayers.find(p=>p.name.toLowerCase()===canonical.toLowerCase());return player?player.w/(player.w+player.l):.5;};
const pctForTeam=(name:string)=>{const team=leagueTeams.find(t=>t.name.toLowerCase()===name.trim().toLowerCase());return team?team.w/(team.w+team.l):.5;};
const matchupForecast=(a:string,b:string,aTeam:string,bTeam:string)=>{const aRating=pctForPlayer(a)*.8+pctForTeam(aTeam)*.2;const bRating=pctForPlayer(b)*.8+pctForTeam(bTeam)*.2;return Math.round(aRating/(aRating+bRating)*100);};

export default function Home() {
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [home, setHome] = useState<Player[]>(initialHome);
  const [away, setAway] = useState<Player[]>(initialAway);
  const [round, setRound] = useState(0);
  const [winners, setWinners] = useState<Record<string, Winner>>({});
  const [sheetName, setSheetName] = useState("");
  const [raised, setRaised] = useState(0);
  const [matchInfo,setMatchInfo]=useState({date:"2026-08-26",time:"7:30 PM",venue:"Enter venue or location"});
  const [leagueName,setLeagueName]=useState("Seguin 8Ball League");
  const [playerFee,setPlayerFee]=useState(10);
  const [scoring,setScoring]=useState({format:"Games won",gamesPerMatch:20,matchWinAt:11,winPoints:2,lossPoints:0});
  const [portal,setPortal]=useState<"landing"|"league"|"owner">("landing");
  const [scoreSubmission,setScoreSubmission]=useState<ScoreSubmission>({homeConfirmed:false,awayConfirmed:false});
  const [issues,setIssues]=useState<LeagueIssue[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("action-line-up-match");
    if (!saved) return;
    try {
      const d = JSON.parse(saved);
      setHomeTeam(d.homeTeam ?? ""); setAwayTeam(d.awayTeam ?? "");
      setHome(d.home ?? initialHome); setAway(d.away ?? initialAway); setWinners(d.winners ?? {});
      setMatchInfo(d.matchInfo ?? {date:"2026-08-26",time:"7:30 PM",venue:"Enter venue or location"});
      setLeagueName(d.leagueName ?? "Seguin 8Ball League");
      setPlayerFee(d.playerFee ?? 10);
      setScoring(d.scoring ?? {format:"Games won",gamesPerMatch:20,matchWinAt:11,winPoints:2,lossPoints:0});
      setScoreSubmission(d.scoreSubmission ?? {homeConfirmed:false,awayConfirmed:false});
      setIssues(d.issues ?? []);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem("action-line-up-match", JSON.stringify({ homeTeam, awayTeam, home, away, winners, matchInfo, leagueName, playerFee, scoring, scoreSubmission, issues }));
  }, [homeTeam, awayTeam, home, away, winners, matchInfo, leagueName, playerFee, scoring, scoreSubmission, issues]);

  const rotation = useMemo(()=>buildRotation(Math.min(home.length,away.length)),[home.length,away.length]);
  const matchups = useMemo(() => rotation.map((order, r) => order.map((a, h) => ({
    id: `${r}-${h}`, home: home[h], away: away[a],
  }))), [rotation, home, away]);
  const homeWins = Object.values(winners).filter(v => v === "home").length;
  const awayWins = Object.values(winners).filter(v => v === "away").length;
  const unpaid = [...home, ...away].filter(p => p.payment !== "paid").length;
  const updateName = (team: "home"|"away", index: number, name: string) => {
    const setter = team === "home" ? setHome : setAway;
    setter(list => list.map((p,i) => i === index ? {...p,name} : p));
  };
  const updatePosition=(team:"home"|"away",index:number,position:string)=>{const setter=team==="home"?setHome:setAway;setter(list=>list.map((p,i)=>i===index?{...p,position}:p));};
  const togglePlayer=(team:"home"|"away",index:number)=>{const setter=team==="home"?setHome:setAway;setter(list=>list.map((p,i)=>i===index?{...p,active:!p.active}:p));};
  const addPlayer=(team:"home"|"away")=>{const setter=team==="home"?setHome:setAway;setter(list=>{if(list.length>=8){toast.error("Teams can have up to 8 roster spots.");return list;}return [...list,{name:`Player ${list.length+1}`,position:"Player",payment:"due",active:true}];});};
  const movePlayer=(team:"home"|"away",from:number,to:number)=>{const setter=team==="home"?setHome:setAway;setter(list=>{if(to<0||to>=list.length||from===to)return list;const next=[...list];const [moved]=next.splice(from,1);next.splice(to,0,moved);return next;});};
  const cyclePay = (team: "home"|"away", index: number) => {
    const setter = team === "home" ? setHome : setAway;
    setter(list => list.map((p,i) => i !== index ? p : {...p, payment: p.payment === "due" ? "pending" : p.payment === "pending" ? "paid" : "due"}));
  };

  const [lineupId,setLineupId]=useState<string|null>(null);
  const [signedIn,setSignedIn]=useState(false);
  const [syncBusy,setSyncBusy]=useState(false);
  const applyLineup=(l:{id:string;homeTeam:string;awayTeam:string;home:Player[];away:Player[];matchInfo:{date:string;time:string;venue:string};scoring:typeof scoring;winners:Record<string,Winner>})=>{
    setLineupId(l.id); setHomeTeam(l.homeTeam??""); setAwayTeam(l.awayTeam??"");
    setHome(l.home??[]); setAway(l.away??[]); setWinners(l.winners??{});
    if(l.matchInfo?.date||l.matchInfo?.time||l.matchInfo?.venue) setMatchInfo(v=>({...v,...l.matchInfo}));
    if(l.scoring&&Object.keys(l.scoring).length) setScoring(v=>({...v,...l.scoring}));
  };
  useEffect(()=>{let off=false;(async()=>{
    const me=await fetch("/api/auth/me").then(r=>r.ok?r.json():null).catch(()=>null);
    if(!off) setSignedIn(Boolean(me?.user));
    try{const d=await fetch("/api/lineup").then(r=>r.json());if(!off&&d?.lineup) applyLineup(d.lineup);}catch{}
  })();return()=>{off=true;};},[]);
  const pullLineup=async()=>{setSyncBusy(true);try{const d=await fetch("/api/lineup").then(r=>r.json());
    if(d?.lineup){applyLineup(d.lineup);toast.success("Pulled the league lineup.");}else toast.info("No shared lineup yet.");
  }catch{toast.error("Could not reach the league board.");}finally{setSyncBusy(false);}};
  const publishLineup=async()=>{setSyncBusy(true);try{
    const res=await fetch("/api/lineup",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:lineupId,homeTeam,awayTeam,home,away,matchInfo,scoring,winners})});
    const d=await res.json();
    if(!res.ok){toast.error(d?.error??"Could not publish the lineup.");return;}
    setLineupId(d.id); toast.success("Lineup published. Both teams can see it.");
  }catch{toast.error("Could not reach the league board.");}finally{setSyncBusy(false);}};
  if(portal==="landing") return <LandingPage onLeague={(name)=>{setLeagueName(name);setPortal("league");}} onOwner={()=>setPortal("owner")} />;
  if(portal==="owner") return <OwnerDashboard leagueName={leagueName} homeTeam={homeTeam} awayTeam={awayTeam} homeWins={homeWins} awayWins={awayWins} matchInfo={matchInfo} scoreSubmission={scoreSubmission} issues={issues} onResolve={(id)=>setIssues(list=>list.map(issue=>issue.id===id?{...issue,resolved:true}:issue))} onBack={()=>setPortal("league")} />;

  return <main className="app-shell">
    <Toaster position="top-center" />
    <header className="topbar">
      <div className="brand-mark"><ChevronRight size={19} strokeWidth={3}/></div>
      <div><input className="league-name-input" aria-label="League name" value={leagueName} onChange={e=>setLeagueName(e.target.value)}/><p>League night, without the paperwork.</p></div>
      <div className="live-pill"><span/> LIVE MATCH</div>
    </header>

    <section className="score-hero">
      <div className="team-side"><input aria-label="Home team" value={homeTeam} onChange={e=>setHomeTeam(e.target.value)}/><span>HOME TEAM</span></div>
      <div className="score-center"><strong>{homeWins}<small>—</small>{awayWins}</strong><p>{Object.keys(winners).length} of {scoring.gamesPerMatch} games complete</p></div>
      <div className="team-side away-side"><input aria-label="Visitors" value={awayTeam} onChange={e=>setAwayTeam(e.target.value)}/><span>VISITORS</span></div>
    </section>

    <Tabs defaultValue="lineup" className="workspace">
      <TabsList className="main-tabs">
        <TabsTrigger value="lineup"><Users/> Lineup</TabsTrigger>
        <TabsTrigger value="score"><Trophy/> Live score</TabsTrigger>
        <TabsTrigger value="league"><BarChart3/> League HQ</TabsTrigger>
        <TabsTrigger value="tournament"><Crown/> Tournament</TabsTrigger>
        <TabsTrigger value="payments"><WalletCards/> Payments {unpaid>0&&<b>{unpaid}</b>}</TabsTrigger>
        <TabsTrigger value="donate"><HandHeart/> Donations</TabsTrigger>
        <TabsTrigger value="rules"><MessageCircle/> Rule Desk</TabsTrigger>
        <TabsTrigger value="market"><ShoppingBag/> Pool Market</TabsTrigger>
      </TabsList>

      <TabsContent value="lineup" className="tab-panel">
        <div className="toolbar">
          <div><p className="eyebrow">AUTOMATIC ROTATION</p><h2>Tonight&apos;s lineup</h2></div>
          <div className="lineup-sync"><span className={`sync-pill ${lineupId?"live":""}`}>{lineupId?<Cloud/>:<CloudOff/>}{lineupId?"Shared":"This device"}</span><button className="quiet-button" disabled={syncBusy} onClick={pullLineup}><RefreshCw/> Pull</button>{signedIn&&<button className="quiet-button" disabled={syncBusy} onClick={publishLineup}><Cloud/> Publish lineup</button>}</div>
          <Dialog><DialogTrigger asChild><button className="scan-button"><Camera/> Scan score sheet</button></DialogTrigger>
            <DialogContent className="scan-dialog"><DialogHeader><DialogTitle>Scan a paper score sheet</DialogTitle>
              <DialogDescription>Take a clear picture, then confirm the names before creating the lineup.</DialogDescription></DialogHeader>
              <label className="camera-drop"><Camera size={34}/><strong>{sheetName||"Open camera or choose photo"}</strong><span>JPG, PNG or HEIC</span>
                <input type="file" accept="image/*" capture="environment" onChange={e=>{const n=e.target.files?.[0]?.name;if(n){setSheetName(n);toast.success("Sheet attached. Confirm the roster names.");}}}/></label>
              {sheetName&&<div className="scan-ready"><Check/> Photo ready for roster review</div>}
            </DialogContent>
          </Dialog>
        </div>
        <section className="match-location-bar"><label><MapPin/><span>PLAYING AT</span><input value={matchInfo.venue} onChange={e=>setMatchInfo(v=>({...v,venue:e.target.value}))}/></label><label><CalendarDays/><span>DATE</span><input type="date" value={matchInfo.date} onChange={e=>setMatchInfo(v=>({...v,date:e.target.value}))}/></label><label><Clock/><span>TIME</span><input value={matchInfo.time} onChange={e=>setMatchInfo(v=>({...v,time:e.target.value}))}/></label></section>
        {(()=>{const chance=Math.round(pctForTeam(homeTeam)/(pctForTeam(homeTeam)+pctForTeam(awayTeam))*100);return <section className="team-forecast"><div><p className="eyebrow"><Sparkles/> MATCH FORECAST</p><h3>{homeTeam} <b>{chance}%</b></h3></div><div className="forecast-track"><i style={{width:`${chance}%`}}/><span/></div><div><h3><b>{100-chance}%</b> {awayTeam}</h3><small>Estimated from current team records · not betting odds</small></div></section>})()}
        <div className="roster-grid">
          <Roster title={homeTeam} players={home} team="home" onName={updateName} onPosition={updatePosition} onPay={cyclePay} onToggle={togglePlayer} onAdd={addPlayer} onMove={movePlayer}/>
          <Roster title={awayTeam} players={away} team="away" onName={updateName} onPosition={updatePosition} onPay={cyclePay} onToggle={togglePlayer} onAdd={addPlayer} onMove={movePlayer}/>
        </div>
        <section className="round-section">
          <div className="round-head"><div><p className="eyebrow">MATCHUPS GENERATED</p><h3>Round {round+1}</h3></div>
            <div className="round-picker">{rotation.map((_,i)=><button key={i} className={round===i?"active":""} onClick={()=>setRound(i)}>{i+1}</button>)}</div></div>
          <div className="matchup-list">{(matchups[round]??[]).map((m,i)=>{const chance=matchupForecast(m.home.name,m.away.name,homeTeam,awayTeam);return <div className="matchup-row" key={m.id}>
            <span className="table-number">{i+1}</span><strong>{m.home.name||`Home ${i+1}`}<small>{chance}% estimate</small></strong><span className="versus">VS</span><strong>{m.away.name||`Visitor ${i+1}`}<small>{100-chance}% estimate</small></strong><span className="match-odds"><b>{chance}</b><i><span style={{width:`${chance}%`}}/></i><b>{100-chance}</b></span>
          </div>})}{(matchups[round]??[]).length===0&&<p className="leaderboard-empty">Add players to both rosters to generate matchups.</p>}</div>
          <p className="forecast-note"><ShieldCheck/> Forecasts blend player season percentage and team record. They are performance estimates, not gambling odds or guaranteed outcomes.</p>
        </section>
      </TabsContent>

      <TabsContent value="score" className="tab-panel">
        <div className="toolbar"><div><p className="eyebrow">TAP THE WINNER</p><h2>Live scorecard</h2></div>
          <button className="quiet-button" onClick={()=>{setWinners({});setRound(0);toast.success("Scores cleared. Rosters saved.");}}><RotateCcw/> Clear scores</button></div>
        <div className="all-rounds">{matchups.map((games,r)=><section className="score-round" key={r}><h3>Round {r+1}</h3>
          {games.map(g=><div className="score-game" key={g.id}>
            <button className={winners[g.id]==="home"?"winner":""} onClick={()=>setWinners(v=>({...v,[g.id]:"home"}))}>{g.home.name}</button><span>vs</span>
            <button className={winners[g.id]==="away"?"winner":""} onClick={()=>setWinners(v=>({...v,[g.id]:"away"}))}>{g.away.name}</button>
          </div>)}</section>)}{matchups.length===0&&<p className="leaderboard-empty">Add players to both rosters to see the scorecard.</p>}</div>
        <ScoreSheetReview homeTeam={homeTeam} awayTeam={awayTeam} homeWins={homeWins} awayWins={awayWins} completeGames={Object.keys(winners).length} requiredGames={scoring.gamesPerMatch} submission={scoreSubmission} onChange={setScoreSubmission}/>
      </TabsContent>

      <TabsContent value="league" className="tab-panel">
        <LeagueHub games={matchups} winners={winners} scoring={scoring} setScoring={setScoring} issues={issues} onReport={(issue)=>setIssues(list=>[issue,...list])} />
      </TabsContent>

      <TabsContent value="payments" className="tab-panel">
        <div className="toolbar"><div><p className="eyebrow">MATCH FEES & DUES</p><h2>Payment board</h2></div><div className="due-summary"><CircleDollarSign/> {unpaid} need attention</div></div>
        <div className="payment-note">Tap a status to move it from due → pending → paid. External payments require captain confirmation.</div>
        <section className="money-ledger"><div><p className="eyebrow">LEAGUE MONEY OVERVIEW</p><h3>Public league ledger</h3><p>Show league totals without exposing individual balances.</p></div><div className="ledger-totals"><label><b>$<input aria-label="Player fee" type="number" min="0" value={playerFee} onChange={e=>setPlayerFee(Math.max(0,Number(e.target.value)||0))}/></b> player fee</label><span><b>$50</b> sponsor fee</span><span><b>8</b> roster spots</span><span><b>2</b> league contacts</span></div><small>Visible records: totals, deposits, expenses, and confirmations. Individual payment details stay captain-only.</small></section>
        <div className="roster-grid"><Payments title={homeTeam} players={home} team="home" onPay={cyclePay} playerFee={playerFee}/><Payments title={awayTeam} players={away} team="away" onPay={cyclePay} playerFee={playerFee}/></div>
        <section className="methods-card"><div><p className="eyebrow">PAYMENT LINKS</p><h3>Captain&apos;s payment options</h3></div>
          <div className="method-grid">{[["$ActionLineUp","Cash App"],["@ActionLineUp","Venmo"],["actionlineup","PayPal"],["Captain phone","Zelle"]].map(([h,m])=>
            <button key={m} onClick={()=>toast.info(`${m} link copied for the player.`)}><span>{m}</span><strong>{h}</strong><QrCode/></button>)}</div>
        </section>
      </TabsContent>

      <TabsContent value="donate" className="tab-panel">
        <div className="toolbar"><div><p className="eyebrow">COMMUNITY SUPPORT</p><h2>Donations & fundraisers</h2></div></div>
        <section className="fundraiser-card"><div className="fund-icon"><HandHeart/></div><div className="fund-copy"><span>TEAM FUNDRAISER</span>
          <h3>Help our team reach the regional tournament</h3><p>Travel, entry fees and equipment support for the full team.</p>
          <div className="progress-track"><i style={{width:`${Math.min(100,raised/10)}%`}}/></div><div className="fund-numbers"><strong>${raised.toLocaleString()} raised</strong><em>$1,000 goal</em></div>
        </div><button className="donate-button" onClick={()=>{setRaised(v=>v+25);toast.success("$25 donation recorded. Thank you!");}}>Donate $25</button></section>
        <div className="donation-rules"><ShieldCheck/><div><strong>Clear money records</strong><p>Donations stay separate from league dues and prize money. Only verified nonprofit campaigns should be marked tax-deductible.</p></div></div>
      </TabsContent>

      <TabsContent value="tournament" className="tab-panel"><TournamentDesk/></TabsContent>
      <TabsContent value="rules" className="tab-panel"><RuleDesk/></TabsContent>
      <TabsContent value="market" className="tab-panel"><PoolMarket/></TabsContent>
    </Tabs>
    <footer>Action Line-Up <span>•</span> Built for league night</footer>
  </main>;
}

function ruleAnswer(question:string){
  const q=question.toLowerCase();
  if(/8.*break|break.*8|eight.*break/.test(q)) return "Seguin rule: 8-ball on a legal break is a win. If the 8-ball is made on the break and the cue ball scratches, it is a loss of game.";
  if(/rack|racking/.test(q)) return "Seguin rack: alternate solids and stripes, with the 8-ball in the center and the two corner balls both stripes or both solids. The breaker must tell the racker before the break if the rack is wrong. Breaking an incorrect rack is not a foul; play continues.";
  if(/break/.test(q)) return "Seguin legal break: the cue ball must be completely behind the head string, hit the head ball first, and at least four balls must hit a rail; a pocketed ball counts. On a miss-cue or illegal break, the breaker re-racks and the racker breaks.";
  if(/scratch|cue ball|white ball|kitchen|behind the line|place.*cue/.test(q)) return "Seguin scratch rule: it is a foul and the incoming player places the cue ball completely behind the head string. An object ball must be completely beyond the head string to be shot at.";
  if(/call.*pocket|called pocket|call.*shot|rail/.test(q)) return "Seguin uses call shot. Call the pocket, every rail the object ball will contact, and any balls contacted in a carom. The short ‘friendly rail’ area into a corner and rails inside the pocket do not need to be called. If a close shot was not stopped to be watched and no agreement can be reached, the shooter is credited with a legal shot.";
  if(/safety|intentional.*foul|no shot/.test(q)) return "Safety play is not allowed in Seguin 8 Ball. A real attempt to pocket an object ball—including the 8 when shooting the 8—is required. An intentional foul used as a safety can be reviewed by the Board and can cost the game or league eligibility.";
  if(/watch|neutral|close shot/.test(q)) return "Before the shot, the sitting player may stop play for a watched shot. Both captains choose the neutral watcher and that person’s call stands. The sitting player must make sure the shooter knows the shot is being watched; if the shooter refuses to stop, the shooter loses the turn.";
  if(/solid|stripe|open table|group/.test(q)) return "After a legal break, the breaker continues only if a ball was legally pocketed. The player gets the group made unless at least one solid and one stripe were made; then the table stays open. On an open table, either group may be shot, but a combination still must first contact and pocket the same group.";
  if(/kick/.test(q)) return "For a Seguin kick shot, call the rail or rails the cue ball will contact and any rails the object ball will contact after the kick. Contact with the long-rail friendly-rail area inside the second diamond does not need to be called.";
  if(/combination|combo/.test(q)) return "Combination shots are legal if the first ball contacted and the ball pocketed are your group. This is also required on an open table. The 8-ball is not neutral: it cannot be contacted first, but it may be an in-between ball.";
  if(/8[ -]?ball|eight ball|black ball/.test(q)) return "To win in Seguin 8 Ball, clear your group and cleanly make the 8 in the called pocket. You cannot make the 8 with your final group ball, and you may not play the 8 off an opponent’s ball. Either is a loss of game.";
  if(/foul|double|push|ball.*off|move.*ball/.test(q)) return "Seguin fouls include moving a ball with your body, clothes, or cue; a double-hit/push shot; scratching; an unauthorized second coach; balls off the table; and fouling while pocketing the 8. A ball off the table stays down and costs the shooter’s turn; cue ball off the table is a scratch; 8-ball off the table is loss of game.";
  if(/coach|coaching/.test(q)) return "Each player may use one coach per rack, and the player must request the coach. Coaching is by the captain, or co-captain when the captain is unavailable, for no more than two minutes. The captain and co-captain can be listed on the score sheet before play.";
  if(/score|sheet|stat|report/.test(q)) return "Seguin score sheets must be complete and legible, including wins, losses, break-and-runs, table runs, and 8s on the break. Email completed sheets to Seguin.8ball.assn@gmail.com with the team name and date in the subject line. Delivery with money in a drop box delays statistics.";
  if(/roster|sub|substitute|eligib|player|reside/.test(q)) return "A Seguin team has a captain, co-captain, and up to six other players—eight total. Only one player may live outside the Seguin 10-mile area, subject to the prior-season exception. Team lineups lock after week 8; adding a player after that requires Board approval.";
  if(/dues|fee|pay|money|weekly/.test(q)) return "Seguin fees: $15 player league fee is due by week 4; unpaid player fees can cost that player’s wins. The weekly team fee is $50, due after each week; failure may result in a loss for that week. Host locations owe $100 per team before week 4. A bye week still requires the $50 weekly fee to receive the win.";
  if(/fight|sportsmanship|shark|barred/.test(q)) return "No fighting: striking a player or spectator removes that player for the season, with Board approval needed for a later return. Do not shark or distract shooters. A barred player does not change the schedule; the team plays without that player.";
  return "I am using the official Seguin 8 Ball League bylaws and rules. Ask about the rack, break, scratches, call shots, safeties, watched shots, kicks, combinations, the 8-ball, coaching, score sheets, rosters, fees, or sportsmanship. For an unusual situation, stop before the next shot and ask the Board for the official ruling.";
}

function RuleDesk(){
  const [question,setQuestion]=useState("");
  const [messages,setMessages]=useState<{role:"desk"|"player";text:string}[]>([
    {role:"desk",text:"Welcome to Seguin Rule Desk. I use the official League Bylaws and Rules for common league-night questions."},
  ]);
  const submit=()=>{
    const trimmed=question.trim(); if(!trimmed)return;
    setMessages(list=>[...list,{role:"player",text:trimmed},{role:"desk",text:ruleAnswer(trimmed)}]);
    setQuestion("");
  };
  return <section className="rule-desk">
    <div className="rule-desk-head"><div className="rule-desk-icon"><BookOpen/></div><div><p className="eyebrow">SEGUIN 8 BALL LEAGUE HELP</p><h2>Rule Desk</h2><p>Ask the official league rules—without a separate app or account.</p></div><span>OFFICIAL RULES ACTIVE</span></div>
    <div className="league-contacts"><strong>Use Rule Desk first</strong><span>Most common questions can be answered here—no phone call needed.</span><span>Gaylord Robles · Group admin · Manuel Cevallos · Moderator — only for an official ruling or a rule not yet in the guide.</span></div>
    <RulebookLibrary />
    <div className="rule-prompts"><button onClick={()=>setQuestion("What happens after a scratch?")}>After a scratch</button><button onClick={()=>setQuestion("What counts as a legal break?")}>Legal break</button><button onClick={()=>setQuestion("Are safety shots allowed?")}>Safety shots</button><button onClick={()=>setQuestion("What must I call on a shot?")}>Called shot</button><button onClick={()=>setQuestion("Can I ask for a watched shot?")}>Watched shot</button></div>
    <div className="rule-chat" aria-live="polite">{messages.map((message,index)=><div key={index} className={`rule-message ${message.role}`}><span>{message.role==="desk"?"RULE DESK":"YOU"}</span><p>{message.text}</p></div>)}</div>
    <div className="rule-compose"><input aria-label="Ask Rule Desk" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit();}} placeholder="Ask a rules question…"/><button aria-label="Send question" onClick={submit}><Send/></button></div>
    <p className="rule-disclaimer"><ShieldCheck/> Rule Desk is based on the supplied Seguin 8 Ball League Bylaws and Rules. For a situation not covered here, stop play before the next shot; the Board’s official ruling controls.</p>
  </section>
}

type Rulebook = { name: string; url: string | null; createdAt?: string; size?: number };
function RulebookLibrary(){
  const [documents,setDocuments]=useState<Rulebook[]>([]);
  const [file,setFile]=useState<File|null>(null);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const load=async()=>{setLoading(true);try{const response=await fetch("/api/rulebooks");const data=await response.json();setDocuments(data.documents??[]);}catch{setDocuments([]);}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const upload=async()=>{if(!file){toast.error("Choose a rules document first.");return;}setUploading(true);try{const form=new FormData();form.append("file",file);const response=await fetch("/api/rulebooks",{method:"POST",body:form});const data=await response.json();if(!response.ok){toast.error(data.error??"Could not upload the document.");return;}setFile(null);const input=document.getElementById("rulebook-upload") as HTMLInputElement|null;if(input)input.value="";toast.success("Official rule document uploaded.");await load();}catch{toast.error("Could not upload the document.");}finally{setUploading(false);}};
  return <section className="rulebook-library"><div><p className="eyebrow"><FileText/> RULEBOOK LIBRARY</p><h3>Official league documents</h3><p>Every league can keep its bylaws, rules, season notes, and rule screenshots in one public place.</p>{loading?<small>Loading documents…</small>:documents.length===0?<small>No uploaded documents yet.</small>:<div className="rulebook-list">{documents.map(document=><a key={document.url??document.name} href={document.url??undefined} target="_blank" rel="noreferrer"><FileText/><span>{document.name}</span><ChevronRight/></a>)}</div>}</div><div className="rulebook-upload"><strong>Owner upload</strong><input id="rulebook-upload" type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)}/><small>PDF, Word, text, or screenshot · 10 MB max</small><button onClick={upload} disabled={uploading}>{uploading?"Uploading…":"Upload rules"}</button></div></section>;
}

function LandingPage({onLeague,onOwner}:{onLeague:(name:string)=>void;onOwner:()=>void}){
  const [username,setUsername]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [building,setBuilding]=useState(false); const [newLeague,setNewLeague]=useState("");
  const openOwnerSignIn=()=>{document.getElementById("owner-sign-in")?.scrollIntoView({behavior:"smooth",block:"center"});window.setTimeout(()=>document.getElementById("sign-in-identifier")?.focus(),350);toast.info("Sign in with your owner email or username and password.");};
  const signIn=async()=>{if(!username.trim()||password.length<8){toast.error("Enter your username and password.");return;}const response=await fetch("/api/auth/sign-in",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const result=await response.json();if(!response.ok){toast.error(result.error||"Could not sign in.");return;}toast.success(`Welcome back, ${result.username}.`);result.role==="owner"?onOwner():onLeague("Seguin 8Ball League");};
  const signUp=async()=>{if(!username.trim()||!email.trim()||password.length<8){toast.error("Use a username, email, and password with at least 8 characters.");return;}const response=await fetch("/api/auth/sign-up",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,email,password})});const result=await response.json();if(!response.ok){toast.error(result.error||"Could not create your account.");return;}toast.success(`Account created for ${result.username}.`);onLeague("Seguin 8Ball League");};
  return <main className="landing-page"><nav className="landing-public-nav"><a href="/standings">Public standings</a><a href="/schedule">Schedule</a><a href="/rules">League guide</a></nav><section className="landing-hero"><div className="landing-brand"><span><Trophy/></span><p>ACTION LINE-UP</p></div><p className="eyebrow">POOL LEAGUES · SIMPLE ON PURPOSE</p><h1>League night, organized.</h1><p className="landing-copy">Lineups, scores, league money, local pool items, and standings—one place for every team.</p><div className="mode-picker"><button onClick={()=>onLeague("Seguin 8Ball League")}><Users/><span>PLAYER MODE</span><small>View scores, standings, schedule, marketplace, and public league updates.</small></button><button onClick={openOwnerSignIn}><LayoutDashboard/><span>OWNER MODE</span><small>Sign in to manage leagues, see signups, review matchups, and post score sheets.</small></button></div><div className="landing-stats"><span><b>0</b> players tracked</span><span><b>0</b> teams</span><span><b>0</b> member signups</span></div><section className="league-directory"><div><p className="eyebrow">LEAGUE DIRECTORY</p><h2>Choose a league</h2></div><button className="league-card" onClick={()=>onLeague("Seguin 8Ball League")}><span><Trophy/></span><div><strong>Seguin 8Ball League</strong><small>No teams yet · current league</small></div><ChevronRight/></button><button className="build-league" onClick={()=>setBuilding(v=>!v)}><Plus/> Build another league</button>{building&&<div className="league-builder"><label>New league name<input value={newLeague} onChange={e=>setNewLeague(e.target.value)} placeholder="Example: New Braunfels 8Ball League"/></label><p>Your new league starts with its own scoring setup, teams, members, and owner dashboard.</p><button onClick={()=>{if(!newLeague.trim()){toast.error("Enter the new league name first.");return;}onLeague(newLeague.trim());}}>Create league space</button></div>}</section></section><section id="owner-sign-in" className="login-card"><p className="eyebrow"><LogIn/> PLAYER OR OWNER SIGN IN</p><h2>Welcome back</h2><p>Use your email or username and password to sign in.</p><label>Email or username<input id="sign-in-identifier" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Your email or username"/></label><label>Email for account recovery<input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Needed when creating a player account"/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Your password"/></label><button onClick={signIn}>Sign in</button><a className="forgot-password-link" href="/forgot-password">Forgot password?</a><button className="quiet-button" onClick={signUp}>Create player account</button><small>New player accounts need a real email for password recovery. Owner accounts are set up by the league owner.</small></section></main>
}

function OwnerDashboard({leagueName,homeTeam,awayTeam,homeWins,awayWins,matchInfo,scoreSubmission,issues,onResolve,onBack}:{leagueName:string;homeTeam:string;awayTeam:string;homeWins:number;awayWins:number;matchInfo:{date:string;time:string;venue:string};scoreSubmission:ScoreSubmission;issues:LeagueIssue[];onResolve:(id:string)=>void;onBack:()=>void}){
  const share=async()=>{const text=`${leagueName} score sheet\n${homeTeam} ${homeWins} — ${awayWins} ${awayTeam}\n${matchInfo.date} · ${matchInfo.time}\n${matchInfo.venue}`;if(navigator.share){await navigator.share({title:`${leagueName} score sheet`,text});}else{await navigator.clipboard.writeText(text);toast.success("Score sheet copied—paste it into your post.");}};
  const openIssues=issues.filter(issue=>!issue.resolved);
  return <main className="owner-page"><header><button onClick={onBack}>← Back to league</button><div><p className="eyebrow">OWNER CONTROL CENTER</p><h1>{leagueName}</h1></div><span>Owner view</span></header><section className="owner-metrics"><article><span>MEMBER SIGNUPS</span><strong>0</strong><small>No player accounts yet</small></article><article><span>OPEN REPORTS</span><strong>{openIssues.length}</strong><small>{openIssues.length?"Need owner review":"No problems waiting"}</small></article><article><span>RECENT MATCH</span><strong>{homeTeam} vs {awayTeam}</strong><small>{matchInfo.date} · {matchInfo.venue}</small></article></section><section className="score-sheet"><div><p className="eyebrow"><FileText/> LATEST SCORE SHEET</p><h2>{homeTeam} <b>{homeWins} — {awayWins}</b> {awayTeam}</h2><p>{scoreSubmission.submittedAt?`Submitted · ${scoreSubmission.homeConfirmed&&scoreSubmission.awayConfirmed?"both teams confirmed":"waiting on team confirmation"}`:"Not submitted yet"} · {matchInfo.date} at {matchInfo.time}</p></div><button onClick={share}><Share2/> Post / share score sheet</button></section><section className="owner-review"><div><p className="eyebrow">CAPTAIN REPORTS</p><h2>Review queue</h2></div>{openIssues.length===0?<p>No open reports. Captains can report a dispute, roster issue, payment issue, or score correction from League HQ.</p>:openIssues.map(issue=><article key={issue.id}><div><strong>{issue.type}</strong><p>{issue.details}</p><small>{new Date(issue.createdAt).toLocaleString()}</small></div><button onClick={()=>{onResolve(issue.id);toast.success("Report marked resolved.");}}>Mark resolved</button></article>)}</section><CaptainAdmin/><section className="owner-note"><ShieldCheck/><div><strong>Owner review is ready for the current league session.</strong><p>For shared, real-time league records, every captain and player still needs to be mapped to the live league roster before score confirmations can be enforced by account.</p></div></section></main>
}

type Captain = { id: string; teamName: string; username: string };
function CaptainAdmin(){
  const [captains,setCaptains]=useState<Captain[]>([]);
  const [username,setUsername]=useState(""); const [teamName,setTeamName]=useState("");
  const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(true);
  const load=async()=>{try{const d=await fetch("/api/captains").then(r=>r.json());setCaptains(d.captains??[]);}catch{setCaptains([]);}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const assign=async()=>{
    if(!username.trim()||!teamName.trim()){toast.error("Enter the player username and their team.");return;}
    setBusy(true);
    try{
      const res=await fetch("/api/captains",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,teamName})});
      const d=await res.json();
      if(!res.ok){toast.error(d?.error??"Could not assign the captain.");return;}
      setCaptains(list=>[...list.filter(c=>c.id!==d.captain.id),d.captain]);
      setUsername(""); setTeamName("");
      toast.success(`${d.captain.username} can now set the ${d.captain.teamName} lineup.`);
    }catch{toast.error("Could not reach the league board.");}finally{setBusy(false);}
  };
  const remove=async(id:string)=>{
    setBusy(true);
    try{
      const res=await fetch(`/api/captains?id=${id}`,{method:"DELETE"});
      if(!res.ok){toast.error("Could not remove the captain.");return;}
      setCaptains(list=>list.filter(c=>c.id!==id)); toast.success("Captain removed.");
    }catch{toast.error("Could not reach the league board.");}finally{setBusy(false);}
  };
  return <section className="owner-review captain-admin"><div><p className="eyebrow"><Users/> TEAM CAPTAINS</p><h2>Who can set a lineup</h2>
    <p>Only you and the captain of a team can change that team&apos;s lineup. Assign a captain by their player account username.</p></div>
    <div className="captain-form"><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Player username"/>
      <input value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="Team name"/>
      <button disabled={busy} onClick={assign}><Plus/> Assign captain</button></div>
    {loading?<p>Loading captains…</p>:captains.length===0
      ?<p>No captains yet. Until one is assigned, only you can change a lineup.</p>
      :<div className="captain-list">{captains.map(c=><article key={c.id}><div><strong>{c.username}</strong><p>{c.teamName}</p></div>
        <button disabled={busy} onClick={()=>remove(c.id)}>Remove</button></article>)}</div>}
  </section>;
}
function ScoreSheetReview({homeTeam,awayTeam,homeWins,awayWins,completeGames,requiredGames,submission,onChange}:{homeTeam:string;awayTeam:string;homeWins:number;awayWins:number;completeGames:number;requiredGames:number;submission:ScoreSubmission;onChange:React.Dispatch<React.SetStateAction<ScoreSubmission>>}){
  const submit=()=>{if(completeGames<requiredGames){toast.error(`Finish all ${requiredGames} games before submitting the score sheet.`);return;}onChange({submittedAt:new Date().toISOString(),homeConfirmed:false,awayConfirmed:false});toast.success("Score sheet submitted. Both teams can now confirm it.");};
  const confirm=(team:"home"|"away")=>{if(!submission.submittedAt){toast.error("Submit the score sheet first.");return;}onChange(current=>({...current,[team==="home"?"homeConfirmed":"awayConfirmed"]:true}));toast.success(`${team==="home"?homeTeam:awayTeam} confirmation recorded.`);};
  const bothConfirmed=submission.homeConfirmed&&submission.awayConfirmed;
  return <section className="score-confirmation"><div><p className="eyebrow"><ShieldCheck/> CAPTAIN CONFIRMATION</p><h3>{homeTeam} <b>{homeWins} — {awayWins}</b> {awayTeam}</h3><p>{submission.submittedAt?bothConfirmed?"Both teams confirmed. This score is ready for owner review.":"Submitted. Each captain should confirm the final score.":"Finish the scorecard, then submit it for both captains to confirm."}</p></div>{!submission.submittedAt?<button onClick={submit}><FileText/> Submit score sheet</button>:<div className="confirmation-actions"><button className={submission.homeConfirmed?"confirmed":undefined} onClick={()=>confirm("home")} disabled={submission.homeConfirmed}>{submission.homeConfirmed?<Check/>:""}{homeTeam} confirmed</button><button className={submission.awayConfirmed?"confirmed":undefined} onClick={()=>confirm("away")} disabled={submission.awayConfirmed}>{submission.awayConfirmed?<Check/>:""}{awayTeam} confirmed</button></div>}</section>
}

function PoolMarket(){
  const [items,setItems]=useState([{id:1,title:"Pool cue",price:"$75",note:"Good condition · local pickup"},{id:2,title:"Cue case",price:"$30",note:"Fits two cues · local pickup"}]);
  const [draft,setDraft]=useState({title:"",price:"",note:""});
  const add=()=>{if(!draft.title.trim()||!draft.price.trim()){toast.error("Add an item name and price.");return;}setItems(list=>[...list,{...draft,id:Date.now()}]);setDraft({title:"",price:"",note:""});toast.success("Listing posted for local pickup.");};
  const [membership,setMembership]=useState<{tier:string;status:string}|null>(null);
  const [billingBusy,setBillingBusy]=useState(false);
  const [billingOpen,setBillingOpen]=useState(false);
  useEffect(()=>{fetch("/api/billing/status").then(r=>r.ok?r.json():null).then(d=>{if(d){setMembership(d.membership);setBillingOpen(Boolean(d.configured));}}).catch(()=>{});},[]);
  const subscribe=async(tier:"basic"|"premium")=>{
    setBillingBusy(true);
    try{
      const res=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tier})});
      const d=await res.json();
      if(res.status===401){toast.error("Sign in first, then choose a membership.");return;}
      if(!res.ok){toast.error(d?.error??"Could not start checkout.");return;}
      window.location.href=d.url;
    }catch{toast.error("Could not reach checkout.");}finally{setBillingBusy(false);}
  };
  const manageBilling=async()=>{
    setBillingBusy(true);
    try{
      const res=await fetch("/api/billing/status",{method:"POST"});
      const d=await res.json();
      if(!res.ok){toast.error(d?.error??"Could not open billing.");return;}
      window.location.href=d.url;
    }catch{toast.error("Could not reach billing.");}finally{setBillingBusy(false);}
  };
  const paidTier=membership&&membership.tier!=="free"&&(membership.status==="active"||membership.status==="trial")?membership.tier:null;
  return <section className="pool-market"><div className="market-head"><div><p className="eyebrow">LOCAL BUY · SELL · TRADE</p><h2>Pool Market</h2><p>League members can list cues, cases, tables, accessories, and other local pool gear.</p></div><ShoppingBag/></div><section className="membership-grid"><article><span>FREE</span><strong>$0 <small>/ week</small></strong><p>Public standings, schedule, league guide, match results, and browsing local listings.</p><button onClick={()=>toast.info("Create a free account to follow the league.")}>{paidTier?"Included":"Choose Free"}</button></article><article><span>BASIC MEMBER</span><strong>$1.99 <small>/ week</small></strong><p>League access, scores, schedule, standings, local listing privileges, and monthly Skill Award eligibility.</p><button disabled={billingBusy||!billingOpen} onClick={()=>paidTier==="basic"?manageBilling():subscribe("basic")}>{!billingOpen?"Opening soon":paidTier==="basic"?"Manage membership":"Choose Basic"}</button></article><article className="featured-membership"><span>PREMIUM MEMBER</span><strong>$2.99 <small>/ week</small></strong><p>Everything in Basic, premium leaderboard access, and end-of-season prize eligibility.</p><button disabled={billingBusy||!billingOpen} onClick={()=>paidTier==="premium"?manageBilling():subscribe("premium")}>{!billingOpen?"Opening soon":paidTier==="premium"?"Manage membership":"Choose Premium"}</button></article></section><section className="awards-board"><div><p className="eyebrow">MONTHLY SKILL AWARDS</p><h3>Earn your spot</h3><p><strong>Every month, the top 3 most wins and top 3 underdog wins earn one free week of league dues.</strong></p><p>Basic and Premium members qualify for monthly awards. Premium members also qualify for the season prizes. Season payouts grow with the league length, so longer seasons build a bigger prize pool.</p></div><div><p className="eyebrow">END-OF-SEASON PRIZES · PREMIUM ONLY · APP OWNER FUNDED</p><span>Up to 3 months · <b>$150 / $100 / $50</b></span><span>4–5 months · <b>$200 / $125 / $75</b></span><span>6 months · <b>$300 / $200 / $100</b></span><span>7+ months · <b>$400 / $300 / $200 / $100 / $75 / $50</b></span><small>First place is capped at $400. Six places are paid only for seasons longer than six months.</small></div></section><div className="market-grid">{items.map(item=><article key={item.id}><span>LOCAL LISTING</span><h3>{item.title}</h3><strong>{item.price}</strong><p>{item.note}</p><button onClick={()=>toast.info("Ask the seller in person or through your league contact.")}>Ask seller</button></article>)}</div><section className="sell-form"><div><p className="eyebrow">POST AN ITEM · $1</p><h3>Up to 3 photos per listing</h3></div><input value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))} placeholder="Item name"/><input value={draft.price} onChange={e=>setDraft(v=>({...v,price:e.target.value}))} placeholder="Price"/><input value={draft.note} onChange={e=>setDraft(v=>({...v,note:e.target.value}))} placeholder="Condition or pickup note"/><button onClick={add}><Plus/> Start $1 listing</button></section><p className="market-note"><ShieldCheck/> Listings are local contact only. The league does not take marketplace payments or guarantee sales.</p></section>
}

function LeagueHub({games,winners,scoring,setScoring,issues,onReport}:{games:{id:string;home:Player;away:Player}[][];winners:Record<string,Winner>;scoring:{format:string;gamesPerMatch:number;matchWinAt:number;winPoints:number;lossPoints:number};setScoring:React.Dispatch<React.SetStateAction<{format:string;gamesPerMatch:number;matchWinAt:number;winPoints:number;lossPoints:number}>>;issues:LeagueIssue[];onReport:(issue:LeagueIssue)=>void}){
  const [query,setQuery]=useState("");
  const [leaderboardLimit,setLeaderboardLimit]=useState<5|10|20>(10);
  const [ranking,setRanking]=useState<"percentage"|"wins"|"power">("percentage");
  const [issueType,setIssueType]=useState("Score correction");
  const [issueDetails,setIssueDetails]=useState("");
  const qualified=statPlayers.filter(p=>p.w+p.l>=20&&!p.dropped).sort((a,b)=>b.w/(b.w+b.l)-a.w/(a.w+a.l));
  const power=(p:StatPlayer)=>Math.round((p.w/(p.w+p.l))*70+Math.min(20,(p.w+p.l)/3)+(p.eight||0)*3+(p.tr||0)*4);
  const ranked=[...qualified].sort((a,b)=>ranking==="wins"?b.w-a.w||a.l-b.l:ranking==="power"?power(b)-power(a):b.w/(b.w+b.l)-a.w/(a.w+a.l));
  const filtered=ranked.filter(p=>(p.name+p.team).toLowerCase().includes(query.toLowerCase()));
  const reportIssue=()=>{if(!issueDetails.trim()){toast.error("Tell the owner what needs attention.");return;}onReport({id:`issue-${Date.now()}`,type:issueType,details:issueDetails.trim(),createdAt:new Date().toISOString()});setIssueDetails("");toast.success("Your report was added to the owner review queue.");};
  return <div className="league-hq">
    <div className="league-banner">
      <div><p className="eyebrow"><Sparkles/> ACTION INTELLIGENCE</p><h2>League Command Center</h2><p>{leagueTeams.length} teams &middot; {statPlayers.length} tracked players</p></div>
      <div className="apex-badge"><Crown/><span>APEX MODE</span><strong>LIVE</strong></div>
    </div>
    <LeagueAnnouncements/>
    <div className="metric-grid">
      <article><span>AMERICAN #1</span><strong>{leagueTeams.filter(t=>t.division==="American").sort((a,b)=>b.w-a.w)[0]?.name??"—"}</strong><small>No results yet</small></article>
      <article><span>NATIONAL #1</span><strong>{leagueTeams.filter(t=>t.division==="National").sort((a,b)=>b.w-a.w)[0]?.name??"—"}</strong><small>No results yet</small></article>
      <article><span>PLAYER MVP</span><strong>{qualified[0]?.name??"—"}</strong><small>No qualified players</small></article>
      <article className="attention"><span>ACTION REQUIRED</span><strong>{issues.filter(i=>!i.resolved).length} score issues</strong><small>Missing or incomplete sheets</small></article>
    </div>

    <Tabs defaultValue="standings" className="league-tabs">
      <TabsList className="league-tab-list">
        <TabsTrigger value="standings">Standings</TabsTrigger><TabsTrigger value="players">Top players</TabsTrigger><TabsTrigger value="results">Results</TabsTrigger><TabsTrigger value="schedule">Calendar</TabsTrigger><TabsTrigger value="alerts">Commissioner</TabsTrigger><TabsTrigger value="scoring">Scoring setup</TabsTrigger>
      </TabsList>
      <TabsContent value="standings">
        <div className="division-grid">{(["American","National"] as const).map(div=><section className="data-card" key={div}>
          <div className="data-title"><div><p className="eyebrow">{div.toUpperCase()}</p><h3>{div} Division</h3></div><span>{leagueTeams.filter(t=>t.division===div).length} teams</span></div>
          <div className="standing-head"><span>RK</span><span>TEAM</span><span>W</span><span>L</span><span>PCT</span></div>
          {leagueTeams.filter(t=>t.division===div).sort((a,b)=>b.w-a.w||a.l-b.l).map((t,i)=><div className="standing-row" key={t.name}>
            <span className={i<3?`rank rank-${i+1}`:"rank"}>{i+1}</span><strong>{t.name}</strong><b>{t.w}</b><span>{t.l}</span><span>{Math.round(t.w/(t.w+t.l)*100)}%</span>
          </div>)}{leagueTeams.filter(t=>t.division===div).length===0&&<p className="leaderboard-empty">No teams in this division yet.</p>}</section>)}</div>
        <section className="power-card"><div><p className="eyebrow"><TrendingUp/> ACTION POWER RANKING</p><h3>Top team momentum</h3></div>
          <div className="power-teams">{leagueTeams.length===0?<p className="formula">Power rankings appear once teams and results are entered.</p>:[...leagueTeams].sort((a,b)=>b.w/(b.w+b.l)-a.w/(a.w+a.l)).slice(0,4).map((t,i)=><div key={t.name}><span>{i+1}</span><strong>{t.name}</strong><small>{t.w}&ndash;{t.l}</small><b>{Math.round(t.w/(t.w+t.l)*100)}</b></div>)}</div>
          <p className="formula">Power Score blends team record, recent results, roster win rate, table runs and 8-ball breaks. It is an Action Line-Up rating—not an official league statistic.</p>
        </section>
      </TabsContent>

      <TabsContent value="players">
        <div className="player-tools"><div><p className="eyebrow">QUALIFIED: 20+ GAMES</p><h3>Player leaderboards</h3><small>Choose how deep you want to see the rankings.</small></div><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player or team"/></label></div>
        <div className="leaderboard-controls" role="group" aria-label="Leaderboard size">
          <div><span>SHOW</span>{([5,10,20] as const).map(limit=><button key={limit} className={leaderboardLimit===limit?"active":undefined} onClick={()=>setLeaderboardLimit(limit)}>Top {limit}</button>)}</div>
          <div className="ranking-filters"><select aria-label="Ranking method" value={ranking} onChange={e=>setRanking(e.target.value as typeof ranking)}><option value="percentage">Win percentage</option><option value="wins">Most wins</option><option value="power">Power score</option></select><p>{Math.min(filtered.length,leaderboardLimit)} of {qualified.length} qualified players shown</p></div>
        </div>
        <section className="mvp-podium">{qualified.length===0?<p className="leaderboard-empty">No qualified players yet. Players appear here once they reach the 20-game minimum.</p>:qualified.slice(0,3).map((p,i)=><article key={p.name} className={`podium p${i+1}`}><Medal/><span>#{i+1}</span><h3>{p.name}</h3><p>{p.team}</p><strong>{(p.w/(p.w+p.l)*100).toFixed(2)}%</strong><small>{p.w}W &middot; {p.l}L &middot; Power {power(p)}</small></article>)}</section>
        <RivalryIntel games={games} winners={winners}/>
        <section className="data-card player-table"><div className="standing-head player-head"><span>RK</span><span>PLAYER</span><span>RECORD</span><span>WIN %</span><span>8B / TR</span><span>POWER</span></div>
          {filtered.slice(0,leaderboardLimit).map((p,i)=><div className="player-stat" key={p.name}><span className={`rank ${i<3?`rank-${i+1}`:""}`}>{i+1}</span><div><strong>{p.name}</strong><small>{p.team}</small></div><b>{p.w}–{p.l}</b><strong>{(p.w/(p.w+p.l)*100).toFixed(2)}%</strong><span>{p.eight||0} / {p.tr||0}</span><em>{power(p)}</em></div>)}
          {filtered.length<leaderboardLimit&&<p className="leaderboard-empty">More player results will appear here automatically as score sheets are entered and players reach the 20-game minimum.</p>}
        </section>
      </TabsContent>

      <TabsContent value="results">
        <div className="results-layout"><section className="data-card weekly-results"><div className="data-title"><div><p className="eyebrow">COMPLETED</p><h3>Latest results</h3></div><span>{weekResults.length} reported</span></div>
          {weekResults.length===0?<p className="leaderboard-empty">No results reported yet. Completed matches appear here.</p>:weekResults.map(([a,as,b,bs])=><div className="result-row" key={a}><strong className={as>bs?"won":""}>{a}</strong><b>{as}</b><span>FINAL</span><b>{bs}</b><strong className={bs>as?"won":""}>{b}</strong></div>)}</section>
          <aside className="data-card week-leaders"><div className="data-title"><div><p className="eyebrow">THIS WEEK</p><h3>Performance pulse</h3></div></div><div><span>Biggest win</span><strong>&mdash;</strong></div><div><span>Closest match</span><strong>&mdash;</strong></div><div><span>Best defense</span><strong>&mdash;</strong></div><div><span>Reports complete</span><strong>0%</strong></div></aside></div>
      </TabsContent>

      <TabsContent value="schedule">
        <CalendarPanel />
      </TabsContent>

      <TabsContent value="alerts">
        <div className="commission-grid"><section className="alert-stack"><div className="alert-card"><Check/><div><span>NO OPEN ALERTS</span><strong>Nothing needs attention</strong><p>Score sheet and roster alerts appear here once matches are reported.</p></div></div></section>
          <aside className="automation-card"><Crown/><p className="eyebrow">APEX AUTOMATION</p><h3>Stop chasing paperwork</h3><ul><li><Check/> Block submission until final score is entered</li><li><Check/> Flag duplicate or ineligible players</li><li><Check/> Auto-calculate W/L, percentage and standings</li><li><Check/> Mark dropped players across every roster</li><li><Check/> Send payment and score reminders</li><li><Check/> Create a commissioner audit trail</li></ul><button onClick={()=>toast.success("Apex guardrails enabled for this demo.")}>Enable all guardrails</button></aside></div>
        <section className="captain-report"><div><p className="eyebrow"><AlertTriangle/> CAPTAIN-ONLY SUPPORT</p><h3>Report a league problem</h3><p>Use this for a score correction, disputed shot, roster issue, or payment question. The owner sees it in the review queue.</p></div><div><select value={issueType} onChange={e=>setIssueType(e.target.value)}><option>Score correction</option><option>Disputed shot</option><option>Roster issue</option><option>Payment question</option></select><textarea value={issueDetails} onChange={e=>setIssueDetails(e.target.value)} placeholder="What happened? Include the teams and game number if you know them."/><button onClick={reportIssue}><Send/> Send to owner</button><small>{issues.filter(issue=>!issue.resolved).length} open report{issues.filter(issue=>!issue.resolved).length===1?"":"s"} in this league session</small></div></section>
      </TabsContent>
      <TabsContent value="scoring">
        <section className="scoring-settings"><div><p className="eyebrow">LEAGUE ADMIN SETUP</p><h3>Set your league’s scoring system</h3><p>Each league can use its own format. These settings currently save on this device; admin accounts will control them once sign-in is connected.</p></div><div className="scoring-fields"><label>Score format<select value={scoring.format} onChange={e=>setScoring(v=>({...v,format:e.target.value}))}><option>Games won</option><option>Team points</option><option>Race to score</option></select></label><label>Games per match<input type="number" min="1" max="100" value={scoring.gamesPerMatch} onChange={e=>setScoring(v=>({...v,gamesPerMatch:Math.max(1,Number(e.target.value)||1)}))}/></label><label>Race-to target<input type="number" min="1" max="100" value={scoring.matchWinAt} onChange={e=>setScoring(v=>({...v,matchWinAt:Math.max(1,Number(e.target.value)||1)}))}/></label><label>Standings points for a win<input type="number" min="0" max="20" value={scoring.winPoints} onChange={e=>setScoring(v=>({...v,winPoints:Math.max(0,Number(e.target.value)||0)}))}/></label><label>Standings points for a loss<input type="number" min="0" max="20" value={scoring.lossPoints} onChange={e=>setScoring(v=>({...v,lossPoints:Math.max(0,Number(e.target.value)||0)}))}/></label></div><div className="scoring-preview"><strong>{scoring.format}</strong><span>{scoring.gamesPerMatch} games per match · race to {scoring.matchWinAt} · {scoring.winPoints} points for a win / {scoring.lossPoints} for a loss</span><button onClick={()=>toast.success("Scoring setup saved for this league.")}>Save scoring setup</button></div></section>
      </TabsContent>
    </Tabs><CallTheHit />
  </div>
}

type LeagueAnnouncement = { id: string; title: string; message: string; created_at: string };
function LeagueAnnouncements(){
  const [isOwner,setIsOwner]=useState(false); const [open,setOpen]=useState(false); const [title,setTitle]=useState(""); const [message,setMessage]=useState(""); const [announcements,setAnnouncements]=useState<LeagueAnnouncement[]>([]); const [loading,setLoading]=useState(true);
  const load=async()=>{try{const response=await fetch("/api/announcements");const data=await response.json();setAnnouncements(data.announcements??[]);}catch{setAnnouncements([]);}finally{setLoading(false);}};
  useEffect(()=>{void load();fetch("/api/auth/me").then(response=>response.ok?response.json():null).then(data=>setIsOwner(data?.user?.role==="owner")).catch(()=>setIsOwner(false));},[]);
  const publish=async()=>{if(!title.trim()||!message.trim()){toast.error("Add an announcement title and message.");return;}try{const response=await fetch("/api/announcements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,message})});const data=await response.json();if(!response.ok){toast.error(data.error??"Could not publish the announcement.");return;}setAnnouncements(list=>[data.announcement,...list]);setTitle("");setMessage("");setOpen(false);toast.success("League announcement published for every player.");}catch{toast.error("Could not publish the announcement.");}};
  return <section className="league-announcements"><div className="announcement-head"><div><p className="eyebrow"><Bell/> LEAGUE ANNOUNCEMENTS</p><h3>What players need to know</h3></div>{isOwner&&<button onClick={()=>setOpen(value=>!value)}><Plus/> New announcement</button>}</div>{open&&<div className="announcement-compose"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Announcement title"/><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Schedule change, league notice, score update, or reminder…"/><button onClick={publish}><Send/> Publish</button></div>}<div className="announcement-list">{loading?<small>Loading announcements…</small>:announcements.length===0?<article><span><Bell/></span><div><strong>No announcements yet</strong><p>Official league notices will appear here.</p></div></article>:announcements.slice(0,3).map(announcement=><article key={announcement.id}><span><Bell/></span><div><strong>{announcement.title}</strong><p>{announcement.message}</p><small>{new Date(announcement.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</small></div></article>)}</div></section>
}

function CallTheHit(){
  const [vote,setVote]=useState<"good"|"foul"|null>(null); const [good,setGood]=useState(0); const [foul,setFoul]=useState(0);
  const cast=(choice:"good"|"foul")=>{if(vote)return;setVote(choice);if(choice==="good")setGood(v=>v+1);else setFoul(v=>v+1);toast.success("Your call is counted.");};
  return <section className="call-hit"><div className="call-hit-media"><img src="/call-the-hit.png" alt="Close pool shot under review"/><span><Play/> REVIEW CLIP</span></div><div className="call-hit-copy"><p className="eyebrow">PUBLIC REVIEW · CALL THE HIT</p><h3>Was that a good hit?</h3><p>Close rail shot. The public gets one vote before the commissioner makes the final call.</p><div className="vote-buttons"><button className={vote==="good"?"selected":undefined} onClick={()=>cast("good")}><ThumbsUp/> Good hit <b>{good}%</b></button><button className={vote==="foul"?"selected foul":undefined} onClick={()=>cast("foul")}><ThumbsDown/> Foul <b>{foul}%</b></button></div><small>{vote?"Thanks for voting. The league official makes the final ruling.":"Community votes are advisory—not the official ruling."}</small></div></section>
}

type ScheduleEvent={id:string;date:string;title:string;type:"match"|"practice"|"tournament"|"payment"|"fundraiser";time:string;venue:string};
const starterEvents:ScheduleEvent[]=[];

function CalendarPanel(){
  const [month,setMonth]=useState(new Date(2026,7,1));
  const [events,setEvents]=useState<ScheduleEvent[]>(starterEvents);
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState({date:"2026-08-27",title:"",type:"match" as ScheduleEvent["type"],time:"7:30 PM",venue:""});
  useEffect(()=>{const saved=localStorage.getItem("action-line-up-calendar");if(saved)try{setEvents(JSON.parse(saved));}catch{}},[]);
  useEffect(()=>{localStorage.setItem("action-line-up-calendar",JSON.stringify(events));},[events]);
  const year=month.getFullYear(),monthIndex=month.getMonth(),days=new Date(year,monthIndex+1,0).getDate();
  const offset=(new Date(year,monthIndex,1).getDay()+6)%7;
  const monthKey=`${year}-${String(monthIndex+1).padStart(2,"0")}`;
  const visible=events.filter(event=>event.date.startsWith(monthKey)).sort((a,b)=>a.date.localeCompare(b.date));
  const addEvent=()=>{if(!draft.title.trim()||!draft.date){toast.error("Add an event name and date.");return;}setEvents(list=>[...list,{...draft,id:`event-${Date.now()}`}]);setOpen(false);setDraft(v=>({...v,title:"",venue:""}));toast.success("Calendar event added.");};
  return <div className="calendar-shell">
    <div className="calendar-toolbar"><div><p className="eyebrow"><CalendarDays/> LEAGUE SCHEDULE</p><h3>{month.toLocaleString("en-US",{month:"long",year:"numeric"})}</h3><p>Matches, practices, deadlines, tournaments and fundraisers in one place.</p></div><div className="calendar-actions"><button aria-label="Previous month" onClick={()=>setMonth(new Date(year,monthIndex-1,1))}><ChevronLeft/></button><button onClick={()=>setMonth(new Date(2026,7,1))}>Today</button><button aria-label="Next month" onClick={()=>setMonth(new Date(year,monthIndex+1,1))}><ChevronRight/></button>
      <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button className="add-event"><Plus/> Add event</button></DialogTrigger><DialogContent className="scan-dialog"><DialogHeader><DialogTitle>Add league event</DialogTitle><DialogDescription>Create a match, practice, tournament, payment deadline or fundraiser.</DialogDescription></DialogHeader><div className="event-form"><label>Event name<input value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))} placeholder="Team vs team, or event name"/></label><div><label>Date<input type="date" value={draft.date} onChange={e=>setDraft(v=>({...v,date:e.target.value}))}/></label><label>Time<input value={draft.time} onChange={e=>setDraft(v=>({...v,time:e.target.value}))}/></label></div><label>Event type<select value={draft.type} onChange={e=>setDraft(v=>({...v,type:e.target.value as ScheduleEvent["type"]}))}><option value="match">Match</option><option value="practice">Practice</option><option value="tournament">Tournament</option><option value="payment">Payment deadline</option><option value="fundraiser">Fundraiser</option></select></label><label>Venue or location<input value={draft.venue} onChange={e=>setDraft(v=>({...v,venue:e.target.value}))} placeholder="Venue, table or address"/></label><button onClick={addEvent}><Plus/> Add to calendar</button></div></DialogContent></Dialog>
    </div></div>
    <div className="calendar-layout"><section className="month-card"><div className="weekdays">{["MON","TUE","WED","THU","FRI","SAT","SUN"].map(day=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({length:offset},(_,i)=><div className="day muted-day" key={`blank-${i}`}/>)}{Array.from({length:days},(_,i)=>i+1).map(day=>{const date=`${monthKey}-${String(day).padStart(2,"0")}`;const dayEvents=events.filter(event=>event.date===date);const today=date==="2026-08-27";return <div className={`day ${today?"today":""}`} key={day}><span>{day}</span>{dayEvents.slice(0,2).map(event=><button className={`calendar-event ${event.type}`} key={event.id} onClick={()=>toast.info(`${event.title} · ${event.time}`)}>{event.title}</button>)}{dayEvents.length>2&&<small>+{dayEvents.length-2} more</small>}</div>})}</div></section>
      <aside className="agenda-card"><div className="data-title"><div><p className="eyebrow">MONTH AGENDA</p><h3>{visible.length} scheduled</h3></div><Bell/></div>{visible.length===0?<div className="empty-agenda"><CalendarDays/><strong>No events this month</strong><span>Use Add event to build the schedule.</span></div>:visible.map(event=><article className="agenda-item" key={event.id}><time><b>{new Date(`${event.date}T12:00:00`).toLocaleString("en-US",{month:"short"})}</b><strong>{Number(event.date.slice(-2))}</strong></time><div><span className={event.type}>{event.type}</span><strong>{event.title}</strong><small><Clock/> {event.time}</small><small><MapPin/> {event.venue||"Location TBD"}</small></div></article>)}</aside>
    </div><div className="calendar-legend"><span><i className="match"/> Match</span><span><i className="practice"/> Practice</span><span><i className="tournament"/> Tournament</span><span><i className="payment"/> Payment</span><span><i className="fundraiser"/> Fundraiser</span><small>Events currently save on this device until cloud accounts are connected.</small></div>
  </div>
}

function RivalryIntel({games,winners}:{games:{id:string;home:Player;away:Player}[][];winners:Record<string,Winner>}){
  const names=Array.from(new Set(games.flatMap(round=>round.flatMap(game=>[game.home.name,game.away.name])).filter(Boolean)));
  const [selected,setSelected]=useState(names.find(name=>name.toLowerCase().includes("elliot"))||names[0]||"");
  const records=new Map<string,{wins:number;losses:number}>();
  games.flat().forEach(game=>{
    const result=winners[game.id]; if(!result)return;
    const isHome=game.home.name===selected,isAway=game.away.name===selected;if(!isHome&&!isAway)return;
    const opponent=isHome?game.away.name:game.home.name;const won=(isHome&&result==="home")||(isAway&&result==="away");
    const record=records.get(opponent)||{wins:0,losses:0};won?record.wins++:record.losses++;records.set(opponent,record);
  });
  const rows=Array.from(records.entries()).map(([name,r])=>{const games=r.wins+r.losses;const yourPct=Math.round(r.wins/games*100);return{name,...r,games,yourPct,theirPct:100-yourPct,gap:Math.abs(50-yourPct)*2};});
  const dominated=rows.filter(r=>r.wins>0).sort((a,b)=>b.yourPct-a.yourPct||b.games-a.games)[0];
  const nemesis=rows.filter(r=>r.losses>0).sort((a,b)=>b.theirPct-a.theirPct||b.games-a.games)[0];
  const equal=rows.filter(r=>r.games>=2).sort((a,b)=>a.gap-b.gap||b.games-a.games)[0];
  return <section className="rivalry-lab">
    <div className="rivalry-head"><div><p className="eyebrow"><Sparkles/> RIVALRY INTELLIGENCE</p><h3>Who owns the matchup?</h3><p>Calculated only from recorded head-to-head games—not overall win percentage.</p></div><label><span>PLAYER</span><select value={selected} onChange={e=>setSelected(e.target.value)}>{names.map(name=><option key={name}>{name}</option>)}</select></label></div>
    <div className="rival-grid">
      <RivalCard tone="danger" label="BEATS YOU THE MOST" title={nemesis?.name} record={nemesis&&`${nemesis.losses} losses · ${nemesis.wins} wins`} percent={nemesis?.theirPct} percentLabel="Their win rate" empty="No scored loss yet" />
      <RivalCard tone="success" label="YOU BEAT THE MOST" title={dominated?.name} record={dominated&&`${dominated.wins} wins · ${dominated.losses} losses`} percent={dominated?.yourPct} percentLabel="Your win rate" empty="No scored win yet" />
      <RivalCard tone="equal" label="YOUR CLOSEST EQUAL" title={equal?.name} record={equal&&`${equal.wins}–${equal.losses} head-to-head`} percent={equal?100-equal.gap:undefined} percentLabel="Rivalry closeness" empty="More results needed" />
    </div>
    {rows.length>0&&<div className="rival-percent-table"><div className="rival-percent-head"><span>OPPONENT</span><span>MEETINGS</span><span>YOUR WIN %</span><span>THEIR WIN %</span><span>CLOSENESS</span></div>{[...rows].sort((a,b)=>b.games-a.games).map(r=><div className="rival-percent-row" key={r.name}><strong>{r.name}</strong><span>{r.games}</span><b>{r.yourPct}%</b><b>{r.theirPct}%</b><em>{100-r.gap}%</em></div>)}</div>}
    <p className="rival-note"><ShieldCheck/> Score games in Live Score and these cards update automatically. A full season database will make the comparisons stronger over time.</p>
  </section>
}

function RivalCard({tone,label,title,record,percent,percentLabel,empty}:{tone:string;label:string;title?:string;record?:string|false;percent?:number;percentLabel:string;empty:string}){
  return <article className={`rival-card ${tone}`}><span>{label}</span><strong>{title||empty}</strong><small>{record||"Waiting for head-to-head results"}</small>{percent!==undefined&&<div className="rival-percentage"><b>{percent}%</b><em>{percentLabel}</em><span><i style={{width:`${percent}%`}}/></span></div>}</article>
}

function Roster({title,players,team,onName,onPosition,onPay,onToggle,onAdd,onMove}:{title:string;players:Player[];team:"home"|"away";onName:(t:"home"|"away",i:number,n:string)=>void;onPosition:(t:"home"|"away",i:number,n:string)=>void;onPay:(t:"home"|"away",i:number)=>void;onToggle:(t:"home"|"away",i:number)=>void;onAdd:(t:"home"|"away")=>void;onMove:(t:"home"|"away",from:number,to:number)=>void}) {
  const [dragFrom,setDragFrom]=useState<number|null>(null);
  const [dragOver,setDragOver]=useState<number|null>(null);
  const endDrag=()=>{setDragFrom(null);setDragOver(null);};
  const dropOn=(to:number)=>{if(dragFrom!==null&&dragFrom!==to)onMove(team,dragFrom,to);endDrag();};
  const labelFor=(p:Player,i:number)=>p.name.trim()||`player ${i+1}`;
  return <section className="roster-card"><div className="card-title"><span>{team==="home"?"H":"V"}</span><h3>{title}</h3><small>{players.length} / 8 SPOTS</small></div>
    {players.map((p,i)=><div
      className={`player-row ${p.active===false?"removed-player":""} ${dragFrom===i?"dragging":""} ${dragOver===i&&dragFrom!==null&&dragFrom!==i?"drag-over":""}`}
      key={i}
      draggable
      onDragStart={e=>{setDragFrom(i);e.dataTransfer.effectAllowed="move";}}
      onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDragOver(i);}}
      onDragLeave={()=>setDragOver(o=>o===i?null:o)}
      onDrop={e=>{e.preventDefault();dropOn(i);}}
      onDragEnd={endDrag}
    ><div className="order-cell" title="Drag to reorder">
        <button aria-label={`Move ${labelFor(p,i)} up`} disabled={i===0} onClick={()=>onMove(team,i,i-1)}><ChevronUp/></button>
        <b>{i+1}</b>
        <button aria-label={`Move ${labelFor(p,i)} down`} disabled={i===players.length-1} onClick={()=>onMove(team,i,i+1)}><ChevronDown/></button>
      </div><div className="player-fields"><input aria-label={`${title} player ${i+1}`} value={p.name} onChange={e=>onName(team,i,e.target.value)}/><input aria-label={`${title} player ${i+1} position`} value={p.position} onChange={e=>onPosition(team,i,e.target.value)} placeholder="Position"/></div><button className={`status ${p.payment}`} onClick={()=>onPay(team,i)}>{labels[p.payment]}</button><button className="roster-toggle" onClick={()=>onToggle(team,i)}>{p.active===false?"Restore":"Remove"}</button></div>)}
    <button className="add-roster-spot" onClick={()=>onAdd(team)}><Plus/> Add roster spot</button>
    {players.length>1&&<p className="roster-hint">Drag a row, or use the arrows, to set the match order.</p>}</section>;
}
function Payments({title,players,team,onPay,playerFee}:{title:string;players:Player[];team:"home"|"away";onPay:(t:"home"|"away",i:number)=>void;playerFee:number}) {
  return <section className="payment-card"><h3>{title}</h3>{players.map((p,i)=><div className="payment-person" key={i}><span className="avatar">{p.name[0]||"?"}</span><div><strong>{p.name||`Player ${i+1}`}</strong><small>${playerFee} player fee when they play</small></div><button className={`status ${p.payment}`} onClick={()=>onPay(team,i)}>{labels[p.payment]}</button></div>)}</section>;
}
