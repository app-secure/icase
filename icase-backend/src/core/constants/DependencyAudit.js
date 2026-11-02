module.exports = Object.freeze({
  command: 'npm audit --omit=dev --audit-level=high',
  dockerRun: 'RUN test -n "$ICASE_AUDIT_NONCE" && npm audit --omit=dev --audit-level=high',
  protocol: 'npm-audit-prod-high-v2'
});
