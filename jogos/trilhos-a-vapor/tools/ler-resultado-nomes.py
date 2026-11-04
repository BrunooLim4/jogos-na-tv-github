# Lê o resultado do otimizar-nomes.html capturado pelo REA (capture_browser_scenario
# com at_end dom+screenshot) e salva a foto e o JSON das posições.
# Uso: python tools/ler-resultado-nomes.py <resultado-rea.json> <foto.png> <posicoes.json>
import base64, html, json, re, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
out_png, out_json = sys.argv[2], sys.argv[3]
steps = data['normalized_result']['steps']
art = steps[-1]['artifacts']
dom = art['dom']['value']['text']
m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
result = json.loads(html.unescape(m.group(1)))
json.dump(result, open(out_json, 'w', encoding='utf-8'), ensure_ascii=False)
open(out_png, 'wb').write(base64.b64decode(art['screenshot']['value']['data_base64']))
import sys as _s
_s.stdout.reconfigure(encoding='utf-8')
print('trilho em cima de trilho:', result.get('carClashes'))
print('nomes com problema:', result.get('problems'))
