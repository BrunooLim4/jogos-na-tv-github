# Tom Sobre Tom na TV

O jogo das cores e das dicas: alguém escolhe uma das 480 cores do tabuleiro e dá
uma dica de uma palavra ("oceano"); cada um põe o seu cone na cor que acha que é.
Quanto mais perto, mais pontos. A mesa aparece na TV (a tela do PC) e cada pessoa
usa o celular como controle, lendo o QR code. Sem app: é tudo página web.

## Como usar

1. Dê dois cliques em `iniciar.bat`. A tela da TV abre sozinha.
2. Se o Windows perguntar sobre o firewall, clique em **Permitir**.
3. No celular (mesmo Wi-Fi do PC), aponte a câmera para o QR code.

Precisa de **3 a 10 jogadores**. O primeiro a entrar vira o **líder** 👑: quando
todos derem "pronto", o celular do líder começa a partida.

Para testar sozinho: com o jogo ligado, dê dois cliques em
`testar-com-robos.bat`. Três robôs entram depois de você e jogam.

Para parar, feche a janela preta (ou Ctrl+C nela).

O Tom Sobre Tom usa a porta 3070: dá para deixar ligado junto com os outros jogos.

## Como se joga (o que aparece em cada tela)

1. **Vez de alguém dar a dica.** Só no celular dessa pessoa aparece uma carta com
   **4 cores**. Ela toca numa, vê as vizinhas na lupa e escreve **uma palavra** que
   lembre a cor ("tomate", "oceano"). Não vale dizer o nome da cor ("azul", "verde")
   nem letra e número do tabuleiro; o celular avisa. Também dá para falar a dica em voz alta.
2. **Cada um põe o 1º cone**, um de cada vez. No celular: arraste o dedo no tabuleiro
   pequeno para mexer a lupa e toque na cor. Na TV aparece o seu cone "flutuando" onde
   o seu dedo está; ao confirmar, ele cai no tabuleiro. Uma cor só aguenta um cone.
3. **2ª dica**: até 2 palavras ("mar profundo"), ou passar e revelar já.
4. **Cada um põe o 2º cone**, agora na ordem contrária.
5. **Revelação.** Na TV aparece a carta com as 4 cores, a escolhida cresce e o
   **quadro de pontos** cai em volta da cor certa (o resto escurece). Cada cone que
   pontuou pula com o "+3", "+2" ou "+1", e o placar sobe. Os celulares dizem
   **"Olhem a TV!"** e depois mostram quanto você ganhou e por quê.
6. Quem dá a próxima dica (ou o líder) toca **"Começar a próxima rodada"**.
7. **Fim**: com 3 a 6 jogadores, cada um dá a dica 2 vezes; com 7 ou mais, 1 vez.
   O placar final aparece do último para o primeiro. O líder pode "Jogar de novo".

**Pontos de cada cone:** na cor certa 3; dentro do quadro (as 8 cores em volta) 2;
encostado por fora do quadro 1. Quem deu a dica ganha 1 ponto por cone dentro do
quadro (com 3 jogadores, 2). Empate: ganha quem deu a dica por último.

## Sons

Gotas de tinta, marimba e o "arco-íris de notas". Na TV: alguém entrou, a partida começou,
nova rodada, última rodada, a dica apareceu, a carta da revelação (rufo), o quadro caindo na
cor certa, "acertou a cor exata!", "ninguém pontuou" e o fim. No celular: só a sua vez.
Para ouvir cada um pelo PC: `http://localhost:3070/sons`.

## Privacidade

Só o servidor e o celular de quem dá a dica sabem a carta e a cor escolhida. A TV só
fica sabendo na revelação. Onde cada um põe o cone é público (como no jogo de mesa).

## Como está organizado

| Arquivo | O que é |
|---|---|
| `server.js` | Servidor: sala, líder, QR, conversa com TV e celulares |
| `game/jogo.js` | Regras (carta, dicas, cones, pontos, rodadas, empate) |
| `public/cores.js` | As 480 cores do tabuleiro e os nomes das casas (C12) |
| `public/dicas.js` | Confere a dica (1 ou 2 palavras, sem nome de cor) |
| `public/tv.html`, `public/tv.js` | Tela da TV (palco 1920×1080, tabuleiro, animações) |
| `public/fila.js` | Fila das animações da TV (uma de cada vez) |
| `public/tempos.js` | Quanto dura cada animação (a TV anima; o celular espera: "Olhem a TV!") |
| `public/phone.html`, `public/phone.js` | Tela do celular (carta, dica, tabuleiro com lupa) |
| `public/style.css` | A base do visual (estilo padrão do modelo) |
| `public/visual.css` | O visual "tudo em cores" (por cima da base) |
| `public/sound.js`, `public/sons.html` | Sons do jogo (gotas, marimba, arco-íris); ouvir em `/sons` |
| `tools/teste-regras.mjs` | Teste das regras e da privacidade |
| `tools/teste-sala.mjs` | Teste da sala e de uma rodada pela rede |
| `tools/robos.mjs` | Robôs que entram e jogam (dão dicas e chutam a cor) |
| `tools/montar-cena.mjs` | Deixa a partida parada numa fase (para fotos) |
