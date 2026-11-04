# Operação Sombras

Jogo de palavras em **dois times** (vermelho e azul), de 4 a 8 pessoas.
A TV mostra 25 palavras. Cada time tem um **chefe**, que vê no celular de quem é
cada palavra e dá uma dica: uma palavra e um número (ex.: "MAR · 2"). O time tenta
achar as palavras certas. Cuidado com o **assassino**: quem revelar perde na hora!

## Como abrir
1. Dois cliques em `iniciar.bat` — a tela da TV abre sozinha.
2. Cada pessoa lê o QR code com a câmera do celular e entra com nome e agente.
3. No celular, cada um vê o seu time (dá para trocar) e pode pedir para ser o chefe.
4. Todos tocam em "Estou pronto!" e o líder 👑 toca em "Começar partida".

Para testar sozinho: abra o `iniciar.bat`, depois `testar-com-robos.bat`, e entre
pelo celular. Três robôs entram (dá dois times de 2). Os robôs jogam no chute.

## Na partida
- **Chefe:** vê as cores no celular (vermelho, azul, bege = de ninguém, preto =
  assassino), escreve a dica e escolhe o número.
- **Quem adivinha:** toca numa palavra (aparece na TV para o time conversar) e
  depois em "Revelar". Pode tentar o número da dica + 1. "Passar a vez" para parar.
- No fim, a TV mostra as cores de todas as palavras e o líder pode tocar em
  "Jogar de novo (mesmos times)".

## Sons
Sons de filme de espião, só nos momentos importantes: alguém entra (clique de
câmera), a partida começa, o chefe dá a dica (máquina de escrever), alguém erra
(carimbo), alguém revela o assassino ("pft" do silenciador) e um time vence.
Acertar uma palavra não tem som (acontece muitas vezes). Para ouvir todos:
com o jogo aberto, entre em `http://localhost:3030/sons`.

## Privacidade
As cores das palavras ficam só nos celulares dos 2 chefes. A TV mostra só o que
já foi revelado. O celular só toca para o chefe, na hora de dar a dica.
