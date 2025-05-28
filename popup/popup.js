// popup/popup.js

document.addEventListener('DOMContentLoaded', updateUI);
document.getElementById('toggleButton').addEventListener('click', toggleLock);
document.getElementById('optionsButton').addEventListener('click', openOptionsPage);

let currentTabId;

async function updateUI() {
    console.log("POPUP: updateUI llamado.");
    const statusText = document.getElementById('statusText');
    const toggleButton = document.getElementById('toggleButton');

    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            currentTabId = tabs[0].id;
            console.log("POPUP: Current Tab ID:", currentTabId);
        } else {
            console.warn("POPUP: No hay pestaña activa.");
            statusText.textContent = 'No hay pestaña activa.';
            toggleButton.disabled = true;
            toggleButton.textContent = 'No Disponible';
            toggleButton.style.backgroundColor = '#999';
            return;
        }

        const result = await browser.storage.local.get('lockedTabs');
        const lockedTabs = result.lockedTabs || {};
        console.log("POPUP: Estado de pestañas bloqueadas:", lockedTabs);

        if (lockedTabs[currentTabId]) {
            statusText.textContent = 'Esta pestaña está BLOQUEADA.';
            toggleButton.textContent = 'Desbloquear Pestaña';
            toggleButton.classList.remove('unlocked');
            toggleButton.classList.add('locked');
        } else {
            statusText.textContent = 'Esta pestaña está DESBLOQUEADA.';
            toggleButton.textContent = 'Bloquear Pestaña';
            toggleButton.classList.remove('locked');
            toggleButton.classList.add('unlocked');
        }
        toggleButton.disabled = false;
    } catch (error) {
        console.error("POPUP: Error en updateUI:", error);
        statusText.textContent = 'Error al cargar estado.';
        toggleButton.disabled = true;
    }
}

async function toggleLock() {
    console.log("POPUP: toggleLock llamado.");
    if (typeof currentTabId === 'undefined' || currentTabId === null) {
        console.error("POPUP: currentTabId es undefined. Recalculando.");
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                currentTabId = tabs[0].id;
            } else {
                console.error("POPUP: No se pudo obtener currentTabId (no hay pestaña activa).");
                document.getElementById('statusText').textContent = 'Error: No se pudo identificar la pestaña.';
                return;
            }
        } catch (error) {
            console.error("POPUP: No se pudo obtener currentTabId:", error);
            document.getElementById('statusText').textContent = 'Error: No se pudo identificar la pestaña.';
            return;
        }
    }
    console.log("POPUP: Enviando toggleLock para tabId:", currentTabId);

    const statusText = document.getElementById('statusText');
    const toggleButton = document.getElementById('toggleButton');

    try {
        const response = await browser.runtime.sendMessage({
            action: 'toggleLock',
            tabId: currentTabId
        });

        console.log("POPUP: Respuesta del background para toggleLock:", response);

        if (response && typeof response.status !== 'undefined') {
            if (response.status === 'locked') {
                statusText.textContent = 'Esta pestaña está BLOQUEADA.';
                toggleButton.textContent = 'Desbloquear Pestaña';
                toggleButton.classList.remove('unlocked');
                toggleButton.classList.add('locked');
                window.close();
            } else if (response.status === 'unlocked') {
                statusText.textContent = 'Esta pestaña está DESBLOQUEADA.';
                toggleButton.textContent = 'Bloquear Pestaña';
                toggleButton.classList.remove('locked');
                toggleButton.classList.add('unlocked');
                window.close();
            } else if (response.status === 'ignored') {
                statusText.textContent = 'No se puede bloquear esta pestaña interna.';
                toggleButton.disabled = true;
                toggleButton.textContent = 'No Disponible';
                toggleButton.style.backgroundColor = '#999';
            } else if (response.status === 'error') {
                statusText.textContent = `Error: ${response.message || 'Error desconocido desde el background.'}`;
                console.error('POPUP: Error reportado por el background script:', response.message);
            } else {
                statusText.textContent = `Error: Respuesta desconocida (${response.status})`;
                console.error('POPUP: Respuesta desconocida del background script:', response);
            }
        } else {
            statusText.textContent = 'Error: No se recibió respuesta válida del background.';
            console.error('POPUP: Respuesta inválida o nula del background script:', response);
        }
    } catch (error) {
        console.error("POPUP: Excepción al enviar/procesar mensaje toggleLock:", error);
        statusText.textContent = 'Error de comunicación con el background.';
    }
}

function openOptionsPage() {
    console.log("POPUP: Abriendo página de opciones.");
    browser.runtime.openOptionsPage();
    window.close();
}