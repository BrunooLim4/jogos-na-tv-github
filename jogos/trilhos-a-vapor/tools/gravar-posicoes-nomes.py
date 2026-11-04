# Grava as posições dos nomes (JSON {"result": {...}} do otimizar-nomes.html) no map-usa.js.
# Uso: python tools/gravar-posicoes-nomes.py public/map-usa.js resultado.json
import json, re, sys
path, result_json = sys.argv[1], sys.argv[2]
result = json.load(open(result_json, encoding='utf-8'))['result']
s = open(path, encoding='utf-8').read()
fmt = lambda v: str(int(v)) if float(v).is_integer() else str(v)
for cid, spec in result.items():
    parts = [fmt(spec[0]), fmt(spec[1]), f"'{spec[2]}'"] + [str(x) for x in spec[3:]]
    new = f"label: [{', '.join(parts)}] }}"
    pattern = re.compile(r"(  " + cid + r": \{ name: '[^']+', x: -?\d+(?:\.\d+)?, y: -?\d+(?:\.\d+)?, )label: (?:'[a-z]+'|\[[^\]]*\]) \}")
    s, n = pattern.subn(lambda m: m.group(1) + new, s)
    assert n == 1, cid
open(path, 'w', encoding='utf-8').write(s)
print('ok')
