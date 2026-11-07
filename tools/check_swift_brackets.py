"""Cek cepat keseimbangan kurung di file Swift (tanpa compiler). python tools/check_swift_brackets.py"""
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for path in sorted(glob.glob(os.path.join(ROOT, 'ios', 'MenuMingguan.swiftpm', '*.swift'))):
    s = open(path, encoding='utf-8').read()
    s = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', s)
    s = re.sub(r'//[^\n]*', '', s)
    diffs = {k: s.count(a) - s.count(b) for k, a, b in (('{}', '{', '}'), ('()', '(', ')'), ('[]', '[', ']'))}
    status = 'OK' if not any(diffs.values()) else 'TIDAK SEIMBANG'
    print(f"{os.path.basename(path):28} {status} {diffs}")
