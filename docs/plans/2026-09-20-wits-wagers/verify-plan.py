"""Read-only plan verification. No product imports, network, or background processes.
Run: py -3.13 D:\\项目\\docs\\plans\\2026-09-20-wits-wagers\\verify-plan.py
Golden expected values must not be regenerated from product implementation.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CHECKS = 0


def check(condition: bool, message: str) -> None:
    global CHECKS
    if not condition:
        raise AssertionError(message)
    CHECKS += 1


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8-sig")


def target(value: int) -> str:
    return f"g:{value}"


def odds_for(values: list[int]) -> list[int]:
    # Independent distance formula, not the production board lookup implementation.
    n = len(values)
    return [2 + abs(i - n // 2) if n % 2 else 3 + min(abs(i - (n // 2 - 1)), abs(i - n // 2))
            for i in range(n)]


def winning(guesses: list[int], answer: int) -> str:
    valid = [v for v in guesses if v <= answer]
    return target(max(valid)) if valid else "smaller"


def ledger(balance: int, bets: list[dict], winner: str, odds: int, author: bool) -> dict:
    check([b["chipId"] for b in bets] == ["A", "B"], "canonical chip pair")
    check(all(type(b["extraStake"]) is int and b["extraStake"] >= 0 for b in bets), "integer extras")
    check(all(b["targetId"] is not None or b["extraStake"] == 0 for b in bets), "null target needs zero stake")
    reserved = sum(b["extraStake"] for b in bets)
    check(0 <= reserved <= balance, "stake fits before balance")
    # Independent cash-flow derivation: escrow all extras, return winning principal,
    # then pay profit including free chips. Not the product's stored-score algorithm.
    available = balance - reserved
    returned = 0
    profit = 0
    loss = 0
    for bet in bets:
        if bet["targetId"] == winner:
            returned += bet["extraStake"]
            profit += (1 + bet["extraStake"]) * odds
        elif bet["targetId"] is not None:
            loss += bet["extraStake"]
    bonus = 3 if author else 0
    return {"reserved": reserved, "availableBefore": available, "winProfit": profit,
            "loss": loss, "authorBonus": bonus, "scoreAfter": available + returned + profit + bonus}


def luminance(color: str) -> float:
    values = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    values = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in values]
    return sum(x * w for x, w in zip(values, [0.2126, 0.7152, 0.0722]))


def main() -> None:
    docs = ["README.md", "01-rules-and-sources.md", "02-architecture-contract.md",
            "03-visual-contract.md", "04-implementation-plan.md",
            "05-acceptance-and-handoff.md", "STATUS.md", "golden-cases.json", "verify-plan.py"]
    for name in docs:
        check((ROOT / name).is_file() and (ROOT / name).stat().st_size > 0, f"missing file: {name}")
    check((ROOT / "reports/plan-verification.md").is_file(), "verification report missing")
    plan = read("04-implementation-plan.md")
    for i in range(11):
        check(plan.count(f"## T{i:02}：") == 1, f"task T{i:02} should appear exactly once")
    for name in docs:
        if name != "README.md":
            check(name in read("README.md"), f"README index missing {name}")
    arch = read("02-architecture-contract.md")
    check("players: string[]" in arch, "state players field missing")
    check("STALE_CLIENT_STATE" in arch and "expectedSeq" in arch, "gateway concurrency contract missing")
    check("game-admission.json" in arch and "game-admission.json" in plan, "admission integration missing")
    check("useConnection.send" in arch and "useConnection.send" in plan, "controller error handling mismatch")
    check("node:crypto" in arch and "禁止把原始PRNG输出直接下发" in arch, "raw RNG disclosure guard missing")
    check("question-bank.zh-CN.json" not in arch + plan, "stale JSON bank import plan")
    check("后序补充" not in read("05-acceptance-and-handoff.md"), "acceptance not finalized")

    data = json.loads(read("golden-cases.json"))
    check(data["rulesetId"] == "wits_wagers_platform_v1", "ruleset mismatch")
    categories = {k: v for k, v in data.items() if k.endswith("Cases")}
    all_ids = [c["id"] for rows in categories.values() for c in rows]
    check(len(all_ids) == 45 and len(set(all_ids)) == 45, "45 unique case IDs required")
    check(len(data["rejectionCases"]) == 10, "10 rejection specifications required")
    slot_order = ["L3", "L2", "L1", "C", "R1", "R2", "R3"]
    for case in data["boardCases"]:
        vals = sorted(set(case["guesses"]))
        check(vals == case["expectedValues"], case["id"] + " sorted/deduped values")
        check(odds_for(vals) == case["expectedOdds"], case["id"] + " symmetric odds")
        n = len(vals)
        offsets = list(range(-(n // 2), n // 2 + 1)) if n % 2 else list(range(-(n // 2), 0)) + list(range(1, n // 2 + 1))
        check([slot_order[x + 3] for x in offsets] == case["expectedSlots"], case["id"] + " slots")
        check(case["expectedSpecialOdds"] == 6, case["id"] + " special odds")
    for case in data["winnerCases"]:
        check(winning(case["guesses"], case["correctAnswer"]) == case["expectedWinner"], case["id"] + " winner")
    for case in data["settlementCases"]:
        actual = ledger(case["scoreBefore"], case["bets"], case["winningTargetId"], case["odds"], case["eligibleAuthor"])
        check(actual == case["expected"], case["id"] + " expected ledger")
    for case in data["roundCases"]:
        players = case["players"]
        values = sorted(set(x["guess"] for x in players))
        win = winning(values, case["correctAnswer"])
        odds = 6 if win == "smaller" else dict(zip(map(target, values), odds_for(values)))[win]
        authors = [x["playerId"] for x in players if target(x["guess"]) == win and x["origin"] == "submitted"]
        check(win == case["expectedWinner"], case["id"] + " full round winner")
        check(odds == case["expectedOdds"], case["id"] + " full round odds")
        check(authors == case["expectedAwardedAuthors"], case["id"] + " eligible authors")
        scores = {x["playerId"]: ledger(x["scoreBefore"], x["bets"], win, odds, x["playerId"] in authors)["scoreAfter"] for x in players}
        check(scores == case["expectedScores"], case["id"] + " full round scores")
        check({x["playerId"]: int(x["playerId"] in authors) for x in players} == case["expectedWinningGuessIncrements"], case["id"] + " author counters")
        valid_targets = {target(x) for x in values} | {"smaller", None}
        check(all(b["targetId"] in valid_targets for x in players for b in x["bets"]), case["id"] + " real targets only")
    for case in data["rankingCases"]:
        players = case["players"]
        key = lambda x: (x["score"], x["winningGuesses"])
        ordered = sorted(players, key=key, reverse=True)
        ranks = [1 + sum(key(other) > key(x) for other in players) for x in ordered]
        check([x["playerId"] for x in ordered] == case["expectedOrder"], case["id"] + " display order")
        check(ranks == case["expectedRanks"], case["id"] + " competition ranks")
        check([x["playerId"] for x in ordered if key(x) == key(ordered[0])] == case["expectedWinners"], case["id"] + " winners")
    for case in data["fullGameCases"]:
        scores = []
        balance = 0
        for _ in range(7):
            # All answers identical => 2:1, all balance on A, free B also wins.
            balance = (balance + 1) * 3 + 2 + 2
            scores.append(balance)
        check(scores == case["expectedScoreAfterEachRound"], case["id"] + " seven-round score sequence")
        check(case["expectedWinningGuesses"] == 7, case["id"] + " author count")
        # Result/timer behavior remains a FUTURE implementation test, not proved here.
    bound = 0
    for _ in range(7):
        bound = 7 * bound + 15
    check(bound == 2058855, "conservative score bound")
    check(data["roundCases"][1]["requiresApproval"] == "P1", "timeout proposal needs approval marker")
    check(all(x.get("requiresApproval") == "P4" for x in data["rankingCases"][1:]), "tie proposals need approval marker")

    # G0 P6 (2026-09-20): platform light-paper tokens replaced the old dark-green --ww-* palette.
    # These are the pairs 03 section 3.3 now mandates; the superseded #0B2424 set is gone.
    palette = [("#292722", "#fff4df", 13.68), ("#292722", "#fffdf7", 14.67),
               ("#575147", "#fff4df", 7.20), ("#575147", "#fffdf7", 7.72),
               ("#292722", "#f7c84b", 9.46), ("#FFFFFF", "#c23616", 5.48),
               ("#FFFFFF", "#115665", 8.26), ("#115665", "#fff4df", 7.57)]
    for fg, bg, expected in palette:
        a, b = sorted([luminance(fg), luminance(bg)])
        ratio = (b + 0.05) / (a + 0.05)
        check(abs(round(ratio, 2) - expected) < 0.01 and ratio >= 4.5, f"contrast {fg}/{bg}")
    # Accent #237c93 on paper is deliberately BELOW 4.5 -- 03 forbids it as body text.
    a, b = sorted([luminance("#237c93"), luminance("#fff4df")])
    check(round((b + 0.05) / (a + 0.05), 2) == 4.40, "accent/paper stays large-text-only")
    visual = read("03-visual-contract.md")
    # The old tokens may only survive as explicitly-marked SUPERSEDED prose, never as a live table row.
    check("|--ww-bg|" not in visual, "superseded dark palette no longer a live token row")
    for dead in ("--ww-bg", "0B2424"):
        for line in visual.splitlines():
            if dead in line:
                check("SUPERSEDED" in line or "作废" in line, f"{dead} mentioned outside superseded note")
    check("--game-paper" in visual and "ocean" in visual, "03 cites platform tokens and accent")
    print("PASS: required files and T00-T10 structure")
    print("PASS: 35 numerical fixtures independently checked (of 45 total specifications)")
    print("PASS: 8 opaque contrast pairs + accent ceiling, 03 palette sync, seven-round score upper bound")
    print(f"PASS: {CHECKS} assertions")
    print("NOT RUN: product implementation, 10 rejection behaviors, real timers/results, browser visuals, typecheck, build, E2E, devices")


if __name__ == "__main__":
    main()
