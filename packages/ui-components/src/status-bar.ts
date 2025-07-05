import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Define the status types
type Status = 'connected' | 'disconnected' | 'connecting' | 'error';

// Map statuses to VS Code theme colors
const statusColorMap = {
  connected: '#007acc',    // vscodeAccent
  disconnected: '#3c3c3c', // A neutral grey
  connecting: '#ffd43b',   // vscodeWarning
  error: '#ff6b6b',        // vscodeError
};

@customElement('status-bar')
export class StatusBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: #252526;
      color: #cccccc;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 12px;
      height: 22px;
      padding: 0 10px;
      width: 100%;
      box-sizing: border-box;
    }

    .status-section, .port-section, .action-section {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      transition: background-color 0.3s ease;
    }
    
    .disconnect-button {
      background: none;
      border: none;
      color: #cccccc;
      cursor: pointer;
      font-family: inherit;
    }

    .disconnect-button:hover {
      color: white;
      background-color: #3c3c3c;
    }
  `;

  @property({ type: String })
  status: Status = 'disconnected';

  @property({ type: String })
  statusText = 'Disconnected';

  @property({ type: Number })
  portCount = 0;

  private _onDisconnect() {
    this.dispatchEvent(new CustomEvent('disconnect'));
  }

  private _onOpenConnectionModal() {
    this.dispatchEvent(new CustomEvent('open-connection-modal'));
  }

  render() {
    const indicatorColor = statusColorMap[this.status] || statusColorMap.disconnected;

    return html`
      <div class="status-section">
        <div class="status-indicator" style="background-color: ${indicatorColor}"></div>
        <span>${this.statusText}</span>
      </div>
      
      <div class="port-section">
        ${this.portCount > 0 ? html`<span>Ports: ${this.portCount}</span>` : ''}
      </div>

      <div class="action-section">
        ${this.status === 'connected'
          ? html`
            <button class="disconnect-button" @click=${this._onDisconnect}>
              Disconnect
            </button>
          `
          : html`
            <button class="disconnect-button" @click=${this._onOpenConnectionModal}>
              Connect...
            </button>
          `}
      </div>
    `;
  }
}
