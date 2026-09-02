# -*- coding: utf-8 -*-
"""狼人杀模拟模式语音批量下载脚本（v3，逐条核对URL与文件名）"""
import os
import urllib.request

BASE = "https://aka.doubaocdn.com/s/"
ROOT = r"D:\项目\狼人杀语音"

# (url后缀, 相对保存路径)  已逐条核对
FILES = [
    # ============ 01_首夜 ============
    ("8fICq7on9I",  r"01_首夜\01_开场_天黑请闭眼.wav"),
    ("uzFV5mwPj4",  r"01_首夜\02_狼人_请睁眼确认队友.wav"),
    ("aRW3gaBBok",  r"01_首夜\03_狼人_请杀人.wav"),
    ("4zvRx6KAkN",  r"01_首夜\04_狼人_请统一意见.wav"),
    ("Vw2ZeigoBt",  r"01_首夜\05_狼人_请闭眼.wav"),
    ("ckMVOSqxJ5",  r"01_首夜\06_女巫_请睁眼.wav"),
    ("1FRfnFUtGT",  r"01_首夜\07_女巫_今晚死亡为1号请救.wav"),
    ("NE8yzjIQTg",  r"01_首夜\07_女巫_今晚死亡为2号请救.wav"),
    ("fLSgp334nf",  r"01_首夜\07_女巫_今晚死亡为3号请救.wav"),
    ("LW2es8EfCS",  r"01_首夜\07_女巫_今晚死亡为4号请救.wav"),
    ("ivp04Gnj0N",  r"01_首夜\07_女巫_今晚死亡为5号请救.wav"),
    ("4AfHfQwjI4",  r"01_首夜\07_女巫_今晚死亡为6号请救.wav"),
    ("wV3w2aV7dA",  r"01_首夜\07_女巫_今晚死亡为7号请救.wav"),
    ("kkcdCoIxwW",  r"01_首夜\07_女巫_今晚死亡为8号请救.wav"),
    ("TpZpEQjHLi",  r"01_首夜\07_女巫_今晚死亡为9号请救.wav"),
    ("p3lKTcL2FW",  r"01_首夜\07_女巫_今晚死亡为10号请救.wav"),
    ("tsAFrsKbln",  r"01_首夜\07_女巫_今晚死亡为11号请救.wav"),
    ("tXl2dIZ7Ml",  r"01_首夜\07_女巫_今晚死亡为12号请救.wav"),
    ("IgkyZSHB4u",  r"01_首夜\08_女巫_请选择毒杀目标.wav"),
    ("ZlcxcJNYV5",  r"01_首夜\09_女巫_请闭眼.wav"),
    ("KwAg43oXKg",  r"01_首夜\10_预言家_请睁眼.wav"),
    ("bYPyqlPBCb",  r"01_首夜\11_预言家_请选择查验玩家.wav"),
    ("a83DERyKQj",  r"01_首夜\12_预言家_身份是好人.wav"),
    ("O70AiNULfm",  r"01_首夜\13_预言家_身份是狼人.wav"),
    ("KlqfVJ4mJm",  r"01_首夜\14_预言家_请闭眼.wav"),
    ("xuEOUmpjM0",  r"01_首夜\15_守卫_请睁眼守护谁.wav"),
    ("DcfViUxs5X",  r"01_首夜\16_守卫_请闭眼.wav"),
    ("fvfn5N6nFB",  r"01_首夜\17_猎人白痴_请睁眼确认身份.wav"),
    ("4eDh7Xms4y",  r"01_首夜\18_猎人白痴_请闭眼.wav"),
    ("S98jFZtFec",  r"01_首夜\19_丘比特_请睁眼.wav"),
    ("cPmfHK3lO3",  r"01_首夜\20_丘比特_请指定情侣.wav"),
    ("YPRtu1pBDb",  r"01_首夜\21_丘比特_请闭眼.wav"),
    ("ICVGgjeXV5",  r"01_首夜\22_情侣_请睁眼确认身份.wav"),

    # ============ 02_首个白天 ============
    ("3dSCPgOaVz",  r"02_首个白天\01_竞选_天亮了请举手.wav"),
    ("bt2XJk7V8i",  r"02_首个白天\02_竞选_请1号发表竞选发言.wav"),
    ("4SEGKEwpw5",  r"02_首个白天\02_竞选_请2号发表竞选发言.wav"),
    ("UOaCUvT5gR",  r"02_首个白天\02_竞选_请3号发表竞选发言.wav"),
    ("QHlW2yEkXU",  r"02_首个白天\02_竞选_请4号发表竞选发言.wav"),
    ("36sZ9kbNrD",  r"02_首个白天\02_竞选_请5号发表竞选发言.wav"),
    ("Go2kuKRRN3",  r"02_首个白天\02_竞选_请6号发表竞选发言.wav"),
    ("AqvPGO4xi0",  r"02_首个白天\02_竞选_请7号发表竞选发言.wav"),
    ("guc9eG1MmN",  r"02_首个白天\02_竞选_请8号发表竞选发言.wav"),
    ("hwIlbKjmCC",  r"02_首个白天\02_竞选_请9号发表竞选发言.wav"),
    ("iPVEwH4mo0",  r"02_首个白天\02_竞选_请10号发表竞选发言.wav"),
    ("WXvKTbksK8",  r"02_首个白天\02_竞选_请11号发表竞选发言.wav"),
    ("pNMO2AjNXU",  r"02_首个白天\02_竞选_请12号发表竞选发言.wav"),
    ("WEr8PV5V67",  r"02_首个白天\03_竞选_请警下玩家投票.wav"),
    ("umsvqFAx2X",  r"02_首个白天\04_竞选_1号获得警徽.wav"),
    ("0Basm1pIBD",  r"02_首个白天\04_竞选_2号获得警徽.wav"),
    ("eXjAOAF9rv",  r"02_首个白天\04_竞选_3号获得警徽.wav"),
    ("g9z5Klg72J",  r"02_首个白天\04_竞选_4号获得警徽.wav"),
    ("hk1KdrMru6",  r"02_首个白天\04_竞选_5号获得警徽.wav"),
    ("cGLUe3Mt3o",  r"02_首个白天\04_竞选_6号获得警徽.wav"),
    ("LhL6FDTdcL",  r"02_首个白天\04_竞选_7号获得警徽.wav"),
    ("3CUeclAt3D",  r"02_首个白天\04_竞选_8号获得警徽.wav"),
    ("bz9ofNpYFC",  r"02_首个白天\04_竞选_9号获得警徽.wav"),
    ("92Ml5Qhu51",  r"02_首个白天\04_竞选_10号获得警徽.wav"),
    ("ldfcNys739",  r"02_首个白天\04_竞选_11号获得警徽.wav"),
    ("WHZqSz7hUC",  r"02_首个白天\04_竞选_12号获得警徽.wav"),
    ("3woiDqfHJC",  r"02_首个白天\05_死亡_昨晚死亡玩家1号.wav"),
    ("HCbuOLLBzc",  r"02_首个白天\05_死亡_昨晚死亡玩家2号.wav"),
    ("EDGVnAJU1L",  r"02_首个白天\05_死亡_昨晚死亡玩家3号.wav"),
    ("11rpR06Oya",  r"02_首个白天\05_死亡_昨晚死亡玩家4号.wav"),
    ("oTlVpzHIfx",  r"02_首个白天\05_死亡_昨晚死亡玩家5号.wav"),
    ("4gbKwAmrAw",  r"02_首个白天\05_死亡_昨晚死亡玩家6号.wav"),
    ("BpikHrtUUZ",  r"02_首个白天\05_死亡_昨晚死亡玩家7号.wav"),
    ("DzLX8vU90i",  r"02_首个白天\05_死亡_昨晚死亡玩家8号.wav"),
    ("0pUAavtu1R",  r"02_首个白天\05_死亡_昨晚死亡玩家9号.wav"),
    ("U23eVPcTLN",  r"02_首个白天\05_死亡_昨晚死亡玩家10号.wav"),
    ("ySpEqmGVCs",  r"02_首个白天\05_死亡_昨晚死亡玩家11号.wav"),
    ("R4baDs4jRG",  r"02_首个白天\05_死亡_昨晚死亡玩家12号.wav"),
    ("qGCBA6UMHa",  r"02_首个白天\06_死亡_平安夜.wav"),
    ("MV1ffW8ABB",  r"02_首个白天\07_遗言_请死亡玩家发表遗言.wav"),
    ("DxPnvg71mn",  r"02_首个白天\08_发言_请从死左死右发言.wav"),
    ("8UE8QBBmeG",  r"02_首个白天\09_发言_请从警左警右发言.wav"),
    ("dmMZ26vRZz",  r"02_首个白天\10_投票_请选择放逐玩家.wav"),
    ("5uPBNhEwaS",  r"02_首个白天\11_出局_1号出局请发遗言.wav"),
    ("gZWnPnkMNK",  r"02_首个白天\11_出局_2号出局请发遗言.wav"),
    ("ksiQJS9sPN",  r"02_首个白天\11_出局_3号出局请发遗言.wav"),
    ("0R7SOrJ8O8",  r"02_首个白天\11_出局_4号出局请发遗言.wav"),
    ("555DH8yVIr",  r"02_首个白天\11_出局_5号出局请发遗言.wav"),
    ("Mq4x2CJK8V",  r"02_首个白天\11_出局_6号出局请发遗言.wav"),
    ("ZJ1Uf6u2ke",  r"02_首个白天\11_出局_7号出局请发遗言.wav"),
    ("9ohV5RIwnV",  r"02_首个白天\11_出局_8号出局请发遗言.wav"),
    ("RIswYRJOGL",  r"02_首个白天\11_出局_9号出局请发遗言.wav"),
    ("tebglOcX0s",  r"02_首个白天\11_出局_10号出局请发遗言.wav"),
    ("UEbihKtVNs",  r"02_首个白天\11_出局_11号出局请发遗言.wav"),
    ("4A1f2Gojd5",  r"02_首个白天\11_出局_12号出局请发遗言.wav"),
]

def main():
    os.makedirs(ROOT, exist_ok=True)
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
