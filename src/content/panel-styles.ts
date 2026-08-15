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
    /* Generous top/bottom padding lets scrollIntoView({block:'center'})
       actually center lines near the start or end of the list, not just
       ones in the middle — the scroll container needs room to move past
       its own content bounds. A vh unit keeps this sized to the viewport
       instead of the (much narrower) container width. */
    padding: 30vh 0;
    overflow-y: auto;
    scroll-behavior: smooth;
    font-size: 14px;
    line-height: 1.9;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
  }
  .kx-lines:empty {
    padding: 0;
  }
  .kx-line {
    color: #a7a7a7;
    padding: 6px 0;
    font-size: 15px;
    font-weight: 600;
    opacity: 0.55;
    transition: color 0.25s ease, opacity 0.25s ease, font-size 0.25s ease;
  }
  .kx-line-active {
    color: #ffffff;
    opacity: 1;
    font-size: 20px;
  }
`;
