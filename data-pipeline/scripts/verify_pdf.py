import zlib, re
d = open("/home/lakshya/company/towerfeasibility/dist/sample-report.pdf", "rb").read()
texts = []
for m in re.finditer(rb"stream\r?\n(.*?)endstream", d, re.S):
    try:
        t = zlib.decompress(m.group(1))
    except Exception:
        continue
    for tm in re.finditer(rb"\(((?:[^()\\]|\\.)*)\)", t):
        s = tm.group(1).decode("latin-1")
        if s.strip():
            texts.append(s)
blob = " ".join(texts)
probes = ["Tower Feasibility Report", "Ajmer Tower Site A", "Executive Summary",
          "Population Density", "Competitor Towers", "Nearby Resources",
          "RoW Compliance", "Soil", "Administration", "Line-of-Sight",
          "Disclaimers", "BharatNet", "Saturated", "Conditional"]
for p in probes:
    print(("FOUND " if p.lower() in blob.lower() else "MISS  ") + p)
print()
print("extracted chars:", len(blob))
print("sample:", blob[:400])
