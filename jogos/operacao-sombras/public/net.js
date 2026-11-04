// Conexão com o servidor que se reconecta sozinha (tela do celular apagou,
// Wi-Fi oscilou, servidor reiniciou...).

export function connect({ onOpen, onMessage, onStatus }) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  let ws = null;
  let attempts = 0;
  let retryTimer = null;

  function open() {
    clearTimeout(retryTimer);
    retryTimer = null;
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      attempts = 0;
      onStatus?.('online');
      onOpen?.();
    });

    ws.addEventListener('message', event => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      onMessage(message);
    });

    ws.addEventListener('close', () => {
      onStatus?.('offline');
      const delay = Math.min(1000 * 2 ** attempts, 5000);
      attempts += 1;
      retryTimer = setTimeout(open, delay);
    });
  }

  // Ao voltar para a aba (ou desbloquear o celular), tenta na hora.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ws?.readyState === WebSocket.CLOSED) {
      attempts = 0;
      open();
    }
  });

  open();

  return {
    send(message) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    },
  };
}

export const COLOR_LABELS = {
  verde: 'Verde',
  amarelo: 'Amarelo',
  laranja: 'Laranja',
  roxo: 'Roxo',
  rosa: 'Rosa',
  ciano: 'Ciano',
  marrom: 'Marrom',
  cinza: 'Cinza',
};
