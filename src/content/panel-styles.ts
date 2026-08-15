export const PANEL_STYLES = `
  :host { all: initial; }
  .kx-panel {
    font-family: "Roboto", "Noto Sans Thai", Arial, sans-serif;
    background: #0f0f0f;
    color: #f1f1f1;
    border: 1px solid #303030;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 16px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
  }
  .kx-header { border-bottom: 1px solid #303030; padding-bottom: 8px; }
  .kx-title { font-size: 15px; font-weight: 600; }
  .kx-subtitle { font-size: 12px; color: #aaa; margin-top: 2px; }
  .kx-status { font-size: 12px; color: #ffb86b; padding: 8px 0; }
  .kx-lines {
    list-style: none;
    margin: 0;
    padding: 8px 0 0;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.9;
  }
  .kx-line { color: #c8c8c8; padding: 1px 0; }
`;
