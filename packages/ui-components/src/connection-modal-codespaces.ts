import { LitElement, html, css, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import tailwindStyles from './styles.css?inline';

@customElement('connection-modal-codespaces')
export class ConnectionModalCodespaces extends LitElement {
  static styles = css`${unsafeCSS(tailwindStyles)}`;

  @property({ type: Boolean, reflect: true })
  isOpen = false;
  @property({ type: Array })
  codespaces = [];
  @property({ state: true })
  private _isServerUrlProvided = false;

  connectedCallback() {
    super.connectedCallback();
  }

  private _handleServerUrlInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this._isServerUrlProvided = !!input.value;
  }

  private _handleAuthenticate() {
    const githubTokenInput = this.shadowRoot?.getElementById('githubToken') as HTMLInputElement;
    this.dispatchEvent(new CustomEvent('authenticate', { detail: { githubToken: githubTokenInput.value } }));
  }

  private _handleCodespaceClick(codespace: any) {
    this.dispatchEvent(new CustomEvent('connect-codespace', { detail: { codespaceName: codespace.name } }));
  }

  private _handleConnect() {
    const serverUrlInput = this.shadowRoot?.getElementById('serverUrl') as HTMLInputElement;
    const githubTokenInput = this.shadowRoot?.getElementById('githubToken') as HTMLInputElement;
    console.log('Dispatching connect event with:', { serverUrl: serverUrlInput.value, githubToken: githubTokenInput.value });
    this.dispatchEvent(new CustomEvent('connect', { detail: { serverUrl: serverUrlInput.value, githubToken: githubTokenInput.value } }));
  }

  private _handleClose() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  render() {
    if (!this.isOpen) {
      return html``;
    }

    return html`
      <div class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[1000]" id="connectionModal">
        <div class="bg-vscodeInfoBg p-xl rounded-lg border border-vscodeInfoBorder w-[600px] max-w-[90vw] max-h-[90vh] overflow-y-auto flex flex-col gap-lg relative md:w-[95vw] md:p-md">
          <h3 class="text-white text-xl text-center m-0">Connect to Remote Terminal</h3>
          <button @click=${this._handleClose} class="absolute top-sm right-sm bg-vscodeInfoBg border-none rounded-sm text-vscodeTextSecondary text-xl cursor-pointer p-xs hover:text-white hover:bg-vscodeInfoBorder" id="closeModalButton">&times;</button>
          
          <div class="flex flex-col gap-sm md:flex-col md:items-stretch">
            <label class="text-white text-sm font-medium mb-1">1. Connect to Server</label>
            <input @input=${this._handleServerUrlInput} type="text" class="p-sm bg-vscodeInfoBg border border-vscodeInfoBg rounded-md text-white text-sm font-inherit focus:outline-none focus:border-vscodeAccent disabled:opacity-50 disabled:cursor-not-allowed" id="serverUrl" value="ws://localhost:3002" placeholder="Server URL">
            <button @click=${this._handleConnect} class="px-lg py-sm border-none rounded-md cursor-pointer text-sm min-w-[120px] text-center transition-all duration-200 ease-in-out bg-vscodeAccent text-white hover:not(:disabled):bg-vscodeAccentDark disabled:opacity-50 disabled:cursor-not-allowed md:min-w-0" id="connectServerButton">Connect</button>
          </div>

          <div class="flex flex-col gap-sm md:flex-col md:items-stretch">
            <label class="text-white text-sm font-medium mb-1">2. Authenticate</label>
            <input type="password" class="p-sm bg-vscodeInfoBg border border-vscodeInfoBorder rounded-md text-white text-sm font-inherit focus:outline-none focus:border-vscodeAccent disabled:opacity-50 disabled:cursor-not-allowed" id="githubToken" placeholder="GitHub Token" ?disabled=${!this._isServerUrlProvided}>
            <button @click=${this._handleAuthenticate} class="px-lg py-sm border-none rounded-md cursor-pointer text-sm min-w-[120px] text-center transition-all duration-200 ease-in-out bg-vscodeInfoBg text-vscodeTextSecondary border border-vscodeInfoBorder hover:not(:disabled):bg-vscodeInfoBorder hover:not(:disabled):border-vscodeInfoBorder disabled:opacity-50 disabled:cursor-not-allowed md:min-w-0" id="authenticateButton" ?disabled=${!this._isServerUrlProvided}>Authenticate</button>
          </div>

          <div class="flex flex-col gap-sm md:flex-col md:items-stretch" id="codespaceSelectionStep" style="${this.codespaces.length > 0 ? '' : 'display: none;'}">
            <label class="text-white text-sm font-medium mb-1">3. Select Codespace</label>
            <div id="codespaceList" class="border border-vscodeBorder rounded-md max-h-[200px] overflow-y-auto mt-2">
              ${this.codespaces.map((codespace: any) => html`
                <button @click=${() => this._handleCodespaceClick(codespace)} class="w-full text-left p-md cursor-pointer border-b border-vscodeBorder flex flex-col gap-xs text-vscodeTextSecondary transition-colors duration-200 ease-in-out hover:bg-vscodeInfoBg">
                  <div class="font-medium text-sm">${codespace.name}</div>
                  <div class="text-vscodeTextTertiary text-sm">${codespace.repository.full_name}</div>
                  <div class="text-sm px-sm py-xs rounded-sm bg-vscodeInfoBorder text-vscodeTextSecondary self-start mt-1 state-${codespace.state.toLowerCase()}">${codespace.state}</div>
                </button>
              `)}
            </div>
          </div>

          <div class="flex flex-col gap-sm md:flex-col md:items-stretch" id="shellSelectionStep" style="display: none;">
            <label class="text-white text-sm font-medium mb-1">4. Choose Shell</label>
            <div class="flex gap-md mt-2 md:flex-col md:gap-sm">
              <label class="flex items-center gap-xs text-vscodeTextSecondary cursor-pointer text-sm">
                <input type="radio" name="shellType" value="default" checked class="m-0">
                <span>Default Terminal</span>
              </label>
              <label class="flex items-center gap-xs text-vscodeTextSecondary cursor-pointer text-sm">
                <input type="radio" name="shellType" value="gemini" class="m-0">
                <span>Google Gemini</span>
              </label>
            </div>
            <div id="geminiApiKeyGroup" class="mt-2" style="display: none;">
              <input type="password" class="p-sm bg-vscodeInfoBg border border-vscodeInfoBorder rounded-md text-white text-sm font-inherit focus:outline-none focus:border-vscodeAccent disabled:opacity-50 disabled:cursor-not-allowed" id="geminiApiKey" placeholder="Gemini API Key (optional)">
              <small class="text-vscodeTextTertiary text-sm mt-1 block">API key will be set as GEMINI_API_KEY environment variable</small>
            </div>
          </div>

          <div class="info-box" id="infoBox">
            Welcome! Please connect to the server to begin.
          </div>

          <div class="modal-buttons">
            <button @click=${this._handleClose} class="px-lg py-sm border-none rounded-md cursor-pointer text-sm min-w-[120px] text-center transition-all duration-200 ease-in-out bg-vscodeInfoBg text-vscodeTextSecondary border border-vscodeInfoBorder hover:not(:disabled):bg-vscodeInfoBorder hover:not(:disabled):border-vscodeInfoBorder disabled:opacity-50 disabled:cursor-not-allowed md:min-w-0" id="closeModalButtonBottom">Close</button>
            <button class="px-lg py-sm border-none rounded-md cursor-pointer text-sm min-w-[120px] text-center transition-all duration-200 ease-in-out bg-vscodeAccent text-white hover:not(:disabled):bg-vscodeAccentDark disabled:opacity-50 disabled:cursor-not-allowed md:min-w-0" id="connectCodespaceButton" disabled>Connect to Codespace</button>
          </div>
        </div>
      </div>
    `;
  }
}