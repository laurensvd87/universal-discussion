import assert from 'node:assert/strict';

// Test-only preparation in a disposable Chrome profile. The real
// permissions.request still runs through the product's Start click. Chrome's
// internal site-access UI API suppresses its otherwise unautomated native dialog;
// this is not evidence that we automated the permission confirmation dialog.
export async function prepareSessionPermission(browser, extensionId, { onTargetCreated = () => {} } = {}) {
  assert.match(extensionId, /^[a-p]{32}$/u);
  const { targetId } = await browser.send('Target.createTarget', { url: 'chrome://extensions/' });
  onTargetCreated(targetId);
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    let available = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const result = await browser.send('Runtime.evaluate', {
        expression: "typeof chrome.developerPrivate?.addHostPermission === 'function'", returnByValue: true,
      }, sessionId);
      if (result.result?.value === true) { available = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(available, 'Disposable profile extension management API required');
    const result = await browser.send('Runtime.evaluate', {
      expression: `chrome.developerPrivate.addHostPermission(${JSON.stringify(extensionId)}, 'https://*/*')`,
      awaitPromise: true, returnByValue: true, userGesture: true,
    }, sessionId);
    assert.ok(!result.exceptionDetails, 'Native test site-access preparation must succeed');
  } finally {
    await browser.send('Target.closeTarget', { targetId });
  }
}
