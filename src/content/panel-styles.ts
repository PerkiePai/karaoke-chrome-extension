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
    /* Belt-and-braces: .kx-lines has a fixed height below, so nothing should
       need to spill past this box — but if it ever does (long header/status
       text, a narrow #secondary), clip it instead of letting it render past
       the rounded border. */
    overflow: hidden;
  }
  .kx-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid #303030;
    padding-bottom: 8px;
    transition: padding-bottom 0.25s ease, border-bottom-color 0.25s ease;
  }
  .kx-panel.kx-collapsed .kx-header {
    padding-bottom: 0;
    border-bottom-color: transparent;
  }
  .kx-header-main { min-width: 0; flex: 1; }
  .kx-title, .kx-header-collapsed-label { font-size: 15px; font-weight: 600; }
  .kx-subtitle { font-size: 12px; color: #aaa; margin-top: 2px; }
  .kx-header-collapsed-label {
    display: none;
    min-width: 0;
    flex: 1;
  }
  .kx-panel.kx-collapsed .kx-header-main { display: none; }
  .kx-panel.kx-collapsed .kx-header-collapsed-label { display: block; }
  /* CSS-grid accordion trick: animating a fr unit (rather than height/
     max-height) gives a smooth open/close regardless of the body's actual
     content height, with no JS measurement needed. kx-body-inner supplies
     the single grid item; its own overflow:hidden clips it as the row
     shrinks to 0fr. */
  .kx-body {
    display: grid;
    grid-template-rows: 1fr;
    opacity: 1;
    transition: grid-template-rows 0.3s ease, opacity 0.25s ease;
  }
  .kx-body-inner { overflow: hidden; min-height: 0; position: relative; }
  .kx-panel.kx-collapsed .kx-body {
    grid-template-rows: 0fr;
    opacity: 0;
  }
  .kx-collapse-btn {
    flex: none;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 50%;
    color: #f1f1f1;
    fill: currentcolor;
    cursor: pointer;
    padding: 5px;
  }
  .kx-collapse-btn:hover { background: rgba(255, 255, 255, 0.1); }
  .kx-collapse-btn svg { display: block; }
  .kx-status { font-size: 12px; color: #ffb86b; padding: 8px 0; }
  .kx-lines {
    list-style: none;
    margin: 0;
    /* Fixed to roughly 5 lines' worth of height (~40px/line at the default
       15px/1.9 sizing) so the window stays compact instead of growing with
       the whole song. flex: none so the flex column never stretches or
       shrinks it. Top/bottom padding is half that height so the first/last
       lines can still be scrolled up to the vertical center — without it,
       scrollTo clamps and they're stuck off-center. */
    height: 200px;
    padding: 100px 0;
    flex: none;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.9;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
  }
  .kx-lines:empty {
    height: 0;
    padding: 0;
  }
  .kx-line {
    color: #a7a7a7;
    padding: 6px 0;
    font-size: 15px;
    font-weight: 600;
    opacity: 0.55;
    transition:
      color 0.4s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1),
      font-size 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .kx-line-active {
    color: #ffffff;
    opacity: 1;
    font-size: 20px;
  }
  .kx-line-clickable { cursor: pointer; }
  .kx-line-clickable:hover { color: #ffffff; opacity: 0.85; }
  .kx-hidden { display: none !important; }
  .kx-controls-row {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #303030;
    font-size: 12px;
    color: #aaa;
  }
  .kx-offset {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0 2px;
  }
  .kx-offset button {
    background: none;
    border: 1px solid #555;
    color: #aaa;
    border-radius: 4px;
    cursor: pointer;
    padding: 1px 6px;
    font-size: 11px;
    line-height: 1.5;
  }
  .kx-offset button:hover { color: #fff; border-color: #aaa; }
  .kx-offset-value {
    min-width: 56px; width: 56px; text-align: center; font-variant-numeric: tabular-nums;
    background: none; border: none; color: inherit; font: inherit; cursor: text;
    padding: 0; border-radius: 3px;
  }
  .kx-offset-value:hover { background: #2a2a2a; }
  .kx-offset-value:focus { outline: 1px solid #555; background: #1a1a1a; cursor: text; }
  .kx-not-this {
    background: none;
    border: none;
    color: #888;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 0 2px 6px;
    text-decoration: underline;
    margin-left: auto;
  }
  .kx-not-this:hover { color: #aaa; }
  .kx-search-overlay {
    position: absolute;
    top: 0; left: 0; right: 0;
    background: #0f0f0f;
    z-index: 10;
    display: flex;
    flex-direction: column;
  }
  .kx-search-form {
    display: flex;
    gap: 6px;
    padding: 4px 0 2px;
    border-bottom: 1px solid #303030;
    flex-shrink: 0;
  }
  .kx-search-input {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #555;
    border-radius: 4px;
    color: #f1f1f1;
    font-size: 12px;
    padding: 3px 6px;
    outline: none;
  }
  .kx-search-input:focus { border-color: #888; }
  .kx-search-btn {
    background: #333;
    border: 1px solid #555;
    border-radius: 4px;
    color: #f1f1f1;
    cursor: pointer;
    font-size: 11px;
    padding: 3px 8px;
  }
  .kx-search-btn:hover { background: #444; }
  .kx-search-close {
    background: none; border: none; color: #666; cursor: pointer;
    font-size: 13px; padding: 0 2px; line-height: 1;
  }
  .kx-search-close:hover { color: #aaa; }
  .kx-search-status { display: none; font-size: 12px; color: #ffb86b; padding: 6px 0; }
  .kx-candidates {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: 200px;
    overflow-y: auto;
  }
  .kx-candidate {
    cursor: pointer;
    padding: 4px 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .kx-candidate:hover { background: #1a1a1a; }
  .kx-candidate-title { font-size: 13px; color: #f1f1f1; }
  .kx-candidate-sub { font-size: 11px; color: #888; }
  .kx-sync-here { margin-left: 4px; }
  .kx-speed {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0 2px;
    font-size: 12px;
    color: #aaa;
  }
  .kx-speed button {
    background: none;
    border: 1px solid #555;
    color: #aaa;
    border-radius: 4px;
    cursor: pointer;
    padding: 1px 6px;
    font-size: 11px;
    line-height: 1.5;
  }
  .kx-speed button:hover { color: #fff; border-color: #aaa; }
  .kx-speed-value { min-width: 32px; text-align: center; font-variant-numeric: tabular-nums; }
  .kx-scroll-pause { margin-left: 4px; }
`;
