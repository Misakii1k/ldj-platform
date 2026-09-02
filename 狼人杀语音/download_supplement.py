# -*- coding: utf-8 -*-
"""狼人杀补录音频批量下载脚本（22个文件）"""
import os
import urllib.request

BASE = "https://aka.doubaocdn.com/s/"
ROOT = r"C:\Users\87850\Desktop\狼人杀语音"

FILES = [
    # ===== 01_首夜 =====
    ("5WYS9MTvDB", r"01_首夜\02_狼人_请睁眼选择目标.wav"),
    ("VTZFEwQSwv", r"01_首夜\15_守卫_请睁眼.wav"),
    # ===== 02_首个白天 =====
    ("D74V52JFYl", r"02_首个白天\01_白天_天亮了.wav"),
    ("NftUFrac5u", r"02_首个白天\02_发言_请1号玩家发言.wav"),
    ("X8rhzswZyt", r"02_首个白天\02_发言_请2号玩家发言.wav"),
    ("qRNndRR03X", r"02_首个白天\02_发言_请3号玩家发言.wav"),
    ("Ytg9fPM2Rs", r"02_首个白天\02_发言_请4号玩家发言.wav"),
    ("VxEFOBVGdS", r"02_首个白天\02_发言_请5号玩家发言.wav"),
    ("AAmHx4Zros", r"02_首个白天\02_发言_请6号玩家发言.wav"),
    ("TMqZx8rko5", r"02_首个白天\02_发言_请7号玩家发言.wav"),
    ("CQQ4MMEYhZ", r"02_首个白天\02_发言_请8号玩家发言.wav"),
    ("EpjeLVJVOC", r"02_首个白天\02_发言_请9号玩家发言.wav"),
    ("h7mJMr7pxG", r"02_首个白天\02_发言_请10号玩家发言.wav"),
    ("p6SEt7glpv", r"02_首个白天\02_发言_请11号玩家发言.wav"),
    ("ZMWbPtEjum", r"02_首个白天\02_发言_请12号玩家发言.wav"),
    ("zpm9OSftaq", r"02_首个白天\08_发言_平票请发言.wav"),
    ("VMk7gqDO6z", r"02_首个白天\09_发言_再次平票无人出局.wav"),
    # ===== 03_技能与终局 =====
    ("jP9p2xLlZy", r"03_技能与终局\01_猎人_请开枪.wav"),
    ("qOUmPEUcYV", r"03_技能与终局\02_猎人_放弃开枪.wav"),
    ("os0bRTYW2e", r"03_技能与终局\03_白痴_翻牌免死.wav"),
    ("xnNUQYO9qw", r"03_技能与终局\04_终局_好人获胜.wav"),
    ("KAYhgjOG6o", r"03_技能与终局\05_终局_狼人获胜.wav"),
]

def main():
    ok, fail = 0, []
    for suffix, rel in FILES:
        url = BASE + suffix
        path = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
                f.write(r.read())
            size = os.path.getsize(path)
            print(f"[OK] {rel} ({size} bytes)")
            ok += 1
        except Exception as e:
            print(f"[FAIL] {rel}: {e}")
            fail.append(rel)
    print(f"\n完成 {ok}/{len(FILES)}，失败 {len(fail)}")
    for f in fail:
        print("  失败:", f)

if __name__ == "__main__":
    main()
