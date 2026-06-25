# WaitSpin Trust Boundary

WaitSpin measures wait-state ad visibility, not developer work.

Public targets: status-bar-fallback (VS Code, Cursor Editor Mode, Devin Desktop), claude-code, mimocode, opencode, grok, antigravity, copilot.

Never sent: workspace files, source code, open editor text, prompts, model
responses, terminal output, shell history, repository URLs, screenshots,
clipboard contents, or raw keystrokes.

Sent payloads:

- publisher registration: {install_id,target}
- serve polling: {install_id}
- impression event: {serve_id,serve_receipt,install_id,visible_ms}
- normal network metadata for rate limits, fraud controls, abuse response, and audit logs
