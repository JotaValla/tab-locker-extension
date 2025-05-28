// scripts/background.js
let lockedTabs = {};

browser.storage.local.get('lockedTabs')
    .then(result => {
        if (result.lockedTabs) {
            lockedTabs = result.lockedTabs;
            console.log('BACKGROUND: Estado de pestañas bloqueadas cargado:', lockedTabs);
        } else {
            console.log('BACKGROUND: No hay pestañas bloqueadas guardadas.');
        }
    })
    .catch(error => console.error('BACKGROUND: Error al cargar lockedTabs:', error));

function saveLockedTabs() {
    console.log('BACKGROUND: Guardando estado de pestañas bloqueadas:', lockedTabs);
    browser.storage.local.set({ lockedTabs: lockedTabs })
        .catch(error => console.error('BACKGROUND: Error al guardar lockedTabs:', error));
}

/**
 * Calcula el hash SHA-256 de una cadena.
 * @param {string} str La cadena a hashear.
 * @returns {Promise<string>} El hash SHA-256 como una cadena hexadecimal.
 */
async function sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const actionId = `[${message.action} Tab ${message.tabId || (sender.tab ? sender.tab.id : 'N/A')} TID ${Date.now() % 10000}]`;
    console.log(`BACKGROUND: ${actionId} Mensaje recibido:`, message);

    if (message.action === 'toggleLock') {
        const tabId = message.tabId;

        if (typeof tabId === 'undefined' || tabId === null) {
            console.error(`BACKGROUND: ${actionId} toggleLock recibido sin tabId.`);
            sendResponse({ status: 'error', message: 'ID de pestaña faltante.' });
            return false;
        }
        console.log(`BACKGROUND: ${actionId} Procesando toggleLock.`);

        browser.tabs.get(tabId).then(tabInfo => {
            console.log(`BACKGROUND: ${actionId} Info de pestaña: URL: ${tabInfo.url}`);
            const urlToCheck = tabInfo.url;

            if (!urlToCheck) {
                console.warn(`BACKGROUND: ${actionId} La pestaña no tiene URL.`);
                sendResponse({ status: 'error', message: 'La pestaña no tiene URL para verificar.' });
                return;
            }
            if (urlToCheck.startsWith('about:') || urlToCheck.startsWith('moz-extension://')) {
                console.warn(`BACKGROUND: ${actionId} No se puede bloquear URL interna: ${urlToCheck}`);
                sendResponse({ status: 'ignored' });
                return;
            }

            if (lockedTabs[tabId]) {
                (async () => {
                    console.log(`BACKGROUND: ${actionId} Pestaña ya bloqueada. Intentando desbloquear.`);
                    try {
                        await browser.scripting.executeScript({
                            target: { tabId: tabId },
                            func: (overlayId) => {
                                const overlay = document.getElementById(overlayId);
                                if (overlay) overlay.remove();
                            },
                            args: ['tab-locker-overlay']
                        });
                        delete lockedTabs[tabId];
                        saveLockedTabs();
                        sendResponse({ status: 'unlocked' });
                        console.log(`BACKGROUND: ${actionId} Pestaña desbloqueada.`);
                    } catch (e) {
                        console.error(`BACKGROUND: ${actionId} Error al desbloquear:`, e);
                        sendResponse({ status: 'error', message: `Error al desbloquear: ${e.message || String(e)}` });
                    }
                })();
            } else {
                console.log(`BACKGROUND: ${actionId} Pestaña no bloqueada. Intentando bloquear.`);
                browser.scripting.executeScript({
                    target: { tabId: tabId }, files: ['scripts/content.js']
                }).then(() => {
                    console.log(`BACKGROUND: ${actionId} content.js inyectado. Enviando mensaje lockTab.`);
                    return browser.tabs.sendMessage(tabId, { action: 'lockTab' });
                }).then(responseFromContent => {
                    console.log(`BACKGROUND: ${actionId} Respuesta de content.js para lockTab:`, responseFromContent);
                    if (responseFromContent && responseFromContent.status === 'locked') {
                        lockedTabs[tabId] = true;
                        saveLockedTabs();
                        sendResponse({ status: 'locked' });
                        console.log(`BACKGROUND: ${actionId} Pestaña bloqueada.`);
                    } else {
                        throw new Error("Falló el bloqueo en content script o respuesta inesperada.");
                    }
                }).catch(e => {
                    console.error(`BACKGROUND: ${actionId} Error al intentar bloquear:`, e);
                    delete lockedTabs[tabId]; // Revertir si falló
                    saveLockedTabs();
                    sendResponse({ status: 'error', message: `Error al bloquear: ${e.message || String(e)}` });
                });
            }
        }).catch(e => {
            console.error(`BACKGROUND: ${actionId} Error obteniendo info de pestaña:`, e);
            sendResponse({ status: 'error', message: `Error obteniendo info de pestaña: ${e.message || String(e)}` });
        });
        return true;

    } else if (message.action === 'checkPassword') {
        (async () => {
            const { password: enteredPassword } = message;
            const tabId = sender.tab ? sender.tab.id : null;
            const localActionId = `[checkPassword Tab ${tabId} TID ${Date.now() % 10000}]`;
            console.log(`BACKGROUND: ${localActionId} Procesando checkPassword.`);

            try {
                if (typeof tabId === 'undefined' || tabId === null) {
                    console.error(`BACKGROUND: ${localActionId} checkPassword sin tabId válido desde sender.`);
                    sendResponse({ isValid: false, error: 'ID de pestaña faltante para checkPassword.' });
                    return;
                }

                const result = await browser.storage.local.get('storedPasswordHash');
                const storedHash = result.storedPasswordHash;

                if (!storedHash) {
                    console.warn(`BACKGROUND: ${localActionId} No hay hash de contraseña configurado.`);
                    sendResponse({ isValid: false, error: 'No hay contraseña configurada en la extensión.' });
                    return;
                }

                const enteredPasswordTrimmed = enteredPassword.trim();
                if (!enteredPasswordTrimmed) {
                     console.warn(`BACKGROUND: ${localActionId} Contraseña ingresada está vacía.`);
                     sendResponse({ isValid: false, error: 'La contraseña ingresada está vacía.' });
                     return;
                }
                const enteredHash = await sha256(enteredPasswordTrimmed);
                console.log(`BACKGROUND: ${localActionId} Hash almacenado recuperado. Hash ingresado calculado.`);

                if (storedHash === enteredHash) {
                    console.log(`BACKGROUND: ${localActionId} Hashes coinciden. Contraseña correcta.`);
                    try {
                        await browser.scripting.executeScript({
                            target: { tabId: tabId },
                            func: (overlayId) => {
                                const overlay = document.getElementById(overlayId);
                                if (overlay) {
                                    overlay.remove();
                                    console.log('CONTENT (ejecutado por background): Overlay removido.');
                                }
                            },
                            args: ['tab-locker-overlay']
                        });
                    } catch (overlayError) {
                        console.warn(`BACKGROUND: ${localActionId} Error al remover overlay vía executeScript:`, overlayError);
                        // Fallback si executeScript falla, aunque debería funcionar.
                        await browser.tabs.sendMessage(tabId, { action: 'unlockTab' }).catch(msgErr => console.warn(`BACKGROUND: ${localActionId} Error en fallback unlockTab:`, msgErr));
                    }
                    delete lockedTabs[tabId];
                    saveLockedTabs();
                    sendResponse({ isValid: true, tabId: tabId });
                } else {
                    console.log(`BACKGROUND: ${localActionId} Hashes no coinciden. Contraseña incorrecta.`);
                    sendResponse({ isValid: false, error: 'Contraseña incorrecta.' });
                }
            } catch (e) {
                console.error(`BACKGROUND: ${localActionId} Error en checkPassword:`, e);
                sendResponse({ isValid: false, error: `Error interno en checkPassword: ${e.message || String(e)}` });
            }
        })();
        return true;
    } else {
        console.warn(`BACKGROUND: ${actionId} Acción desconocida o no manejada:`, message.action);
        sendResponse({ status: 'error', message: `Acción desconocida: ${message.action}` });
        return false;
    }
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (lockedTabs[tabId] && changeInfo.status === 'complete' && tab.url) {
        if (tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
            return;
        }
        console.log(`BACKGROUND: [onUpdated Tab ${tabId}] (${tab.url}) actualizada y bloqueada. Re-inyectando bloqueo.`);
        try {
            await browser.scripting.executeScript({
                target: { tabId: tabId },
                files: ['scripts/content.js']
            });
            await browser.tabs.sendMessage(tabId, { action: 'lockTab' });
        } catch (e) {
            console.error(`BACKGROUND: [onUpdated Tab ${tabId}] Error al re-bloquear:`, e);
        }
    }
});

browser.tabs.onRemoved.addListener((tabId) => {
    if (lockedTabs[tabId]) {
        delete lockedTabs[tabId];
        saveLockedTabs();
        console.log(`BACKGROUND: [onRemoved Tab ${tabId}] Eliminada del registro de bloqueo.`);
    }
});