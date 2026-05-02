// Network layer: SSE for incoming events, HTTP POST for outgoing
export class Network {
  constructor() {
    this.roomId = null;
    this.playerId = null;
    this.color = null;
    this._sse = null;
    this._handlers = {};
    this._baseUrl = '';
  }

  on(event, fn) {
    this._handlers[event] = fn;
    return this;
  }

  _emit(event, data) {
    const h = this._handlers[event];
    if (h) h(data);
  }

  async createRoom() {
    const res = await fetch(`${this._baseUrl}/room`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to create room');
    const json = await res.json();
    this.roomId = json.roomId;
    this.playerId = json.playerId;
    this.color = json.color;
    this._subscribe();
    return { roomId: this.roomId, color: this.color };
  }

  async joinRoom(roomId) {
    const res = await fetch(`${this._baseUrl}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to join room');
    this.roomId = json.roomId;
    this.playerId = json.playerId;
    this.color = json.color;
    this._subscribe();
    return { color: this.color };
  }

  _subscribe() {
    if (this._sse) this._sse.close();
    const url = `${this._baseUrl}/events?roomId=${this.roomId}&playerId=${this.playerId}`;
    this._sse = new EventSource(url);

    this._sse.addEventListener('move', e => {
      this._emit('move', JSON.parse(e.data));
    });
    this._sse.addEventListener('opponent_joined', e => {
      this._emit('opponent_joined', JSON.parse(e.data));
    });
    this._sse.addEventListener('resign', e => {
      this._emit('resign', JSON.parse(e.data));
    });
    this._sse.addEventListener('rematch', e => {
      this._emit('rematch', JSON.parse(e.data));
    });
    this._sse.addEventListener('chat', e => {
      this._emit('chat', JSON.parse(e.data));
    });
    this._sse.onerror = () => {
      // EventSource reconnects automatically; emit for UI feedback
      this._emit('connection_error', {});
      // Try to reconnect after a short delay
      setTimeout(() => {
        if (this._sse.readyState === EventSource.CLOSED) {
          this._subscribe();
        }
      }, 2000);
    };
  }

  async sendMove(move) {
    return this._post('/move', { roomId: this.roomId, playerId: this.playerId, move });
  }

  async sendEvent(event, data = {}) {
    return this._post('/event', { roomId: this.roomId, playerId: this.playerId, event, data });
  }

  async _post(path, body) {
    try {
      const res = await fetch(`${this._baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  disconnect() {
    if (this._sse) {
      this._sse.close();
      this._sse = null;
    }
    this.roomId = null;
    this.playerId = null;
    this.color = null;
  }
}
