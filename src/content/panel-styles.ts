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
  .kx-header { border-bottom: 1px solid #303030; padding-bottom: 8px; }
  .kx-title { font-size: 15px; font-weight: 600; }
  .kx-subtitle { font-size: 12px; color: #aaa; margin-top: 2px; }
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
    scroll-behavior: smooth;
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
    transition: color 0.25s ease, opacity 0.25s ease, font-size 0.25s ease;
  }
  .kx-line-active {
    color: #ffffff;
    opacity: 1;
    font-size: 20px;
  }
  .kx-hidden { display: none !important; }
  .kx-offset {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0 2px;
    font-size: 12px;
    color: #aaa;
    border-bottom: 1px solid #303030;
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
  .kx-offset-value { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
  .kx-correct-bar {
    padding: 4px 0;
    border-bottom: 1px solid #303030;
  }
  .kx-not-this {
    background: none;
    border: none;
    color: #888;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
  .kx-not-this:hover { color: #aaa; }
  .kx-search-form {
    display: flex;
    gap: 6px;
    padding: 6px 0;
    border-bottom: 1px solid #303030;
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
  .kx-candidates {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: 160px;
    overflow-y: auto;
    border-bottom: 1px solid #303030;
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
`;
