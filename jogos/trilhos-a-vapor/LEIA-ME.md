# Trilhos a Vapor na TV

O jogo roda na TV (por enquanto, a tela do PC) e cada pessoa usa o celular
como controle, escaneando um QR code. Sem app: é tudo página web.

## Como usar

1. Dê dois cliques em `iniciar.bat`. A tela da TV abre sozinha no navegador.
2. Se o Windows perguntar sobre o firewall, clique em **Permitir**.
3. No celular (mesmo Wi-Fi do PC), aponte a câmera para o QR code.

O primeiro a entrar vira o **líder** 👑: quando todos derem "pronto", o
celular do líder começa a partida (e pode encerrar ou remover jogadores).
A TV só mostra — não precisa de mouse.

Para testar sozinho: com o jogo ligado, dê dois cliques em
`testar-com-robos.bat`. Dois robôs entram depois de você e jogam sozinhos.

Para parar, feche a janela preta (ou Ctrl+C nela).

## Sons e animações

- A TV abre numa janela própria do Chrome, já com o som liberado. **F11** deixa em tela cheia.
  Se abrir a TV de outro jeito e aparecer "Aperte qualquer tecla para ligar o som", é só apertar uma tecla.
- O líder liga/desliga o som da TV pelo celular ("🔊 Som da TV"). Cada um liga/desliga o
  aviso de "sua vez" do próprio celular no 🔔 lá em cima.

**Regra de privacidade dos sons:** só faz barulho o que todo mundo já vê na mesa
(alguém entrou, conquistou rota, pegou carta ou bilhete, passou a vez, última rodada,
fim de jogo). Nunca há som nem vibração para segredos:
- bilhete completo: só um ✓ verde, em silêncio, na tela do dono;
- carta da pilha: o som é sempre o mesmo, seja qual for a carta;
- quais bilhetes alguém escolheu: só a quantidade é pública.
O teste `tools/teste-regras.mjs` confere isso.

## Personagens

Cada cor de trem é um personagem, com retrato, trem e visual próprios
(artes do Bruno, em `public/img`):

| Cor | Personagem |
|---|---|
| vermelho | Jeremiah, o Aviador |
| verde | Martha, a Botânica |
| amarelo | Clive, o Minerador |
| azul | Jacqueline, a Capitã |
| roxo | Brewster, o Apostador |

Nomes e frases ficam em `public/characters.js`. Para trocar as artes, rode
`tools/recortar-personagens.py` (precisa de Python com Pillow) na folha com os 5 personagens.

## Cartas

As 8 cores de vagão usam as ilustrações da folha "Cores dos vagões" (com a frase
de cada cor, que aparece no celular quando você pega a carta). A locomotiva é o
**Coringa**: vale qualquer cor e tem carta própria, dourada, com moldura arco-íris.
Para refazer as artes: `tools/recortar-cartas.py <folha-cores-dos-vagoes.png>`.

## Como está organizado

| Arquivo | O que é |
|---|---|
| `server.js` | Servidor: guarda a sala e o jogo, conversa com TV e celulares |
| `game/ttr.js` | Regras do jogo (cartas, rotas, bilhetes, última rodada, contagem final) |
| `public/rules.js` | Regras das rotas usadas pelo servidor e pelo celular (pagamento, rota dupla, maior caminho). `rankRoutes` dá a nota de cada jogada da aba "Colocar trens" (também usada pelos robôs) |
| `public/map-usa.js` | Mapa: 36 cidades e 100 rotas (`BENDS` = curva de cada rota, `SPREAD` = zoom out, `label` = onde fica cada nome) |
| `public/tickets-usa.js` | Os 30 bilhetes de destino e os pontos por rota |
| `public/map-view.js` | Desenho do mapa (TV e mini-mapa do celular): vagões que não se encostam, nomes com a linha fininha até o ponto |
| `public/map-scenery.js` | Fundo do mapa: costa, mares, Grandes Lagos e os desenhinhos (montanhas, navios, búfalos...) |
| `public/mapa.html` | Página só com o mapa: `http://localhost:3000/mapa` |
| `public/cards.js`, `public/ui.js` | Cartas de vagão e como desenhá-las |
| `public/tv.html`, `public/tv.js` | Tela da TV |
| `public/phone.html`, `public/phone.js` | Tela do celular (o controle) |
| `public/net.js` | Conexão que reconecta sozinha |
| `public/sound.js` | Sons gerados pelo navegador (sem arquivos de áudio) |
| `public/style.css` | Visual compartilhado (metal, latão e pergaminho) |
| `public/characters.js` | Os 5 personagens (um por cor) |
| `public/img`, `public/fonts` | Retratos, trens, enfeites do mapa e as fontes Rye e Cinzel |
| `tools/teste-regras.mjs` | Teste das regras (`node tools/teste-regras.mjs`) |
| `tools/teste-sala.mjs` | Teste da sala e da partida (servidor ligado e sala vazia) |
| `tools/robos.mjs` | Robôs que entram e jogam (usado pelo `testar-com-robos.bat`) |
| `tools/recortar-personagens.py` | Recorta retratos e trens da folha de personagens |
| `tools/recortar-cartas.py` | Gera as artes das cartas (8 cores, coringa e verso da pilha) |
| `tools/ajustar-curvas.mjs` | Sugere curvas para as rotas se um dia o mapa mudar (`node tools/ajustar-curvas.mjs public`); `tools/gravar-curvas.py` grava |
| `tools/otimizar-nomes.html` | Acha o melhor lugar para o nome de cada cidade (instruções dentro do arquivo); `tools/gravar-posicoes-nomes.py` grava |
| `tools/acompanhar-partida.mjs` | Acompanha uma partida de teste e para quando a mesa tem N rotas |

Regra de ouro: só o servidor conhece tudo. A TV recebe o que é público e
cada celular recebe só o que é do seu dono.

## Visual novo (out/2026)
A TV ganhou o "padrão Resistência": estação a vapor ao fundo (engrenagens, vapor,
dirigível), cada jogador num cartão com o retrato e a moeda de pontos, a locomotiva da
vez voando de um jogador para o outro, a carta pega voando até quem pegou, vapor e
carimbo de pontos ao conquistar rota, "Última rodada!" carimbado no mapa e a contagem
final com os bilhetes de cada um virando um por um. No celular, o fim mostra "Olhem a
TV!" enquanto a contagem acontece. Fotos de antes e depois e o GIF na pasta `fotos`.
**Aprovado.**
